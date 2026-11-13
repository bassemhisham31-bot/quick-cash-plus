import { getDb } from '../db'
import type { CustomerInput, CustomerView, PaymentMethod, StatementEntry, StatementFilter, StatementView } from '../../shared/types'

const CUSTOMER_SELECT = `
  SELECT c.*, v.name AS linkedVendorName, v.balance AS linkedVendorBalance
  FROM customers c
  LEFT JOIN vendors v ON v.id = c.linked_vendor_id
`

function mapRow(r: any): CustomerView {
  return {
    id: Number(r.id),
    name: r.name,
    phone: r.phone,
    address: r.address ?? null,
    balance: Number(r.balance),
    loyaltyPoints: Number(r.loyalty_points),
    loyaltyEnabled: !!r.loyalty_enabled,
    notes: r.notes,
    isWalkIn: !!r.is_walk_in,
    createdAt: r.created_at,
    linkedVendorId: r.linked_vendor_id != null ? Number(r.linked_vendor_id) : null,
    linkedVendorName: r.linkedVendorName ?? null,
    linkedVendorBalance: r.linkedVendorBalance != null ? Number(r.linkedVendorBalance) : null
  }
}

export async function getCustomerPhoneAndName(customerId: number): Promise<{ name: string; phone: string | null } | null> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT name, phone FROM customers WHERE id = ?', args: [customerId] })
  const row = rs.rows[0] as any
  if (!row) return null
  return { name: row.name, phone: row.phone }
}

async function fetchCustomerView(customerId: number): Promise<CustomerView> {
  const db = getDb()
  const rs = await db.execute({ sql: `${CUSTOMER_SELECT} WHERE c.id = ?`, args: [customerId] })
  if (!rs.rows[0]) throw new Error('العميل غير موجود')
  return mapRow(rs.rows[0])
}

export async function listCustomers(search = ''): Promise<CustomerView[]> {
  const db = getDb()
  const term = `%${search.trim()}%`
  const rs = await db.execute({
    sql: `${CUSTOMER_SELECT}
          WHERE c.deleted_at IS NULL AND c.is_walk_in = 0
            AND (? = '%%' OR c.name LIKE ? OR c.phone LIKE ?)
          ORDER BY c.name`,
    args: [term, term, term]
  })
  return rs.rows.map(mapRow)
}

export async function createCustomer(input: CustomerInput): Promise<CustomerView> {
  const db = getDb()
  const rs = await db.execute({
    sql: `INSERT INTO customers (name, phone, address, balance, loyalty_points, notes, loyalty_enabled)
          VALUES (?, ?, ?, ?, 0, ?, ?)`,
    args: [
      input.name.trim(),
      input.phone.trim() || null,
      input.address?.trim() || null,
      input.openingBalance || 0,
      input.notes.trim() || null,
      input.loyaltyEnabled === false ? 0 : 1
    ]
  })
  return fetchCustomerView(Number(rs.lastInsertRowid))
}

export async function updateCustomerLoyaltyEnabled(customerId: number, enabled: boolean): Promise<CustomerView> {
  const db = getDb()
  await db.execute({
    sql: 'UPDATE customers SET loyalty_enabled = ? WHERE id = ?',
    args: [enabled ? 1 : 0, customerId]
  })
  return fetchCustomerView(customerId)
}

/** يربط عميل بمورد باعتبارهما نفس الشخص — للعرض/التقارير وتفعيل خيار التسوية وقت البيع فقط، بدون أي خصم تلقائي بين الرصيدين. */
export async function linkCustomerVendor(customerId: number, vendorId: number): Promise<CustomerView> {
  const db = getDb()
  const conflictRs = await db.execute({
    sql: 'SELECT id FROM customers WHERE linked_vendor_id = ? AND id != ? AND deleted_at IS NULL',
    args: [vendorId, customerId]
  })
  if (conflictRs.rows[0]) throw new Error('المورد ده مرتبط بعميل تاني بالفعل')

  await db.execute({ sql: 'UPDATE customers SET linked_vendor_id = ? WHERE id = ?', args: [vendorId, customerId] })
  return fetchCustomerView(customerId)
}

export async function unlinkCustomerVendor(customerId: number): Promise<CustomerView> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE customers SET linked_vendor_id = NULL WHERE id = ?', args: [customerId] })
  return fetchCustomerView(customerId)
}

/**
 * كارت حساب العميل الكامل (ويب): كل الفواتير (نقدي وآجل) + المرتجعات (على فاتورة وبدون فاتورة) + السداد،
 * برصيد جاري بعد كل حركة. الرصيد الافتتاحي = الرصيد الحالي − صافي كل الحركات (بيغطي رصيد أول المدة والأرصدة المنقولة).
 * الفلتر (من/إلى) بيعرض حركات الفترة بس، وكل اللي قبلها بيتجمع في «رصيد سابق».
 */
export async function getCustomerLedger(customerId: number, filter: StatementFilter = {}): Promise<StatementView & { customerName: string; customerPhone: string | null; customerAddress: string | null }> {
  const db = getDb()
  const customerRs = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [customerId] })
  const customer = customerRs.rows[0] as any
  if (!customer) throw new Error('العميل غير موجود')

  const all: StatementEntry[] = []
  const invoicesRs = await db.execute({
    sql: `SELECT id, number, total, paid, payment_method AS paymentMethod, created_at AS createdAt
          FROM sales_invoices WHERE customer_id = ? AND deleted_at IS NULL`,
    args: [customerId]
  })
  for (const r of invoicesRs.rows as any[]) {
    const total = Number(r.total)
    // المحصّل وقت البيع: الآجل = 0، المقسّم = المدفوع، غير كده الفاتورة مدفوعة بالكامل
    const paidNow = r.paymentMethod === 'credit' ? 0 : r.paymentMethod === 'mixed' ? Math.min(total, Number(r.paid)) : total
    all.push({
      type: 'invoice',
      id: Number(r.id),
      date: r.createdAt,
      description: `فاتورة ${r.number} (${paymentMethodLabel(r.paymentMethod)})`,
      debit: total,
      credit: paidNow
    })
  }
  const returnsRs = await db.execute({
    sql: `SELECT r.id, r.amount, r.created_at AS createdAt, i.number, i.payment_method AS paymentMethod, i.total, i.paid
          FROM sales_returns r JOIN sales_invoices i ON i.id = r.invoice_id WHERE i.customer_id = ?`,
    args: [customerId]
  })
  for (const r of returnsRs.rows as any[]) {
    const amount = Number(r.amount)
    // الجزء اللي اترد نقدًا (غير الآجل) مابيأثرش على الرصيد: بيظهر مدين ودائن بنفس القيمة
    const total = Number(r.total)
    const creditPart =
      r.paymentMethod === 'credit' ? 1 : r.paymentMethod === 'mixed' && total > 0 ? Math.min(1, Math.max(0, (total - Number(r.paid)) / total)) : 0
    const cashBack = amount * (1 - creditPart)
    all.push({
      type: 'return',
      id: Number(r.id),
      date: r.createdAt,
      description: `مرتجع على فاتورة ${r.number}${cashBack > 0.005 ? ' (رد نقدي)' : ''}`,
      debit: cashBack,
      credit: amount
    })
  }
  const directRs = await db.execute({
    sql: `SELECT id, number, amount, refund_method AS refundMethod, created_at AS createdAt FROM direct_sales_returns WHERE customer_id = ?`,
    args: [customerId]
  })
  for (const r of directRs.rows as any[]) {
    const amount = Number(r.amount)
    all.push({
      type: 'return',
      id: -Number(r.id),
      date: r.createdAt,
      description: `مرتجع بدون فاتورة ${r.number}${r.refundMethod === 'cash' ? ' (رد نقدي)' : ''}`,
      debit: r.refundMethod === 'cash' ? amount : 0,
      credit: amount
    })
  }
  const paymentsRs = await db.execute({
    sql: `SELECT id, amount, method, note, created_at AS createdAt FROM payments WHERE party_type = 'customer' AND party_id = ?`,
    args: [customerId]
  })
  for (const r of paymentsRs.rows as any[]) {
    all.push({
      type: 'payment',
      id: Number(r.id),
      date: r.createdAt,
      description: `سداد (${paymentMethodLabel(r.method)})${r.note ? ' — ' + r.note : ''}`,
      debit: 0,
      credit: Number(r.amount)
    })
  }
  all.sort((a, b) => a.date.localeCompare(b.date))

  const balance = Number(customer.balance)
  const net = all.reduce((s, e) => s + e.debit - e.credit, 0)
  const from = filter.from ? `${filter.from} 00:00:00` : null
  const to = filter.to ? `${filter.to} 23:59:59` : null
  let running = balance - net // رصيد أول المدة
  const entries: StatementEntry[] = []
  let openingBalance = running
  for (const e of all) {
    running += e.debit - e.credit
    if (from && e.date < from) {
      openingBalance = running
      continue
    }
    if (to && e.date > to) continue
    entries.push({ ...e, balance: Math.round(running * 100) / 100 })
  }
  openingBalance = Math.round(openingBalance * 100) / 100
  return {
    customerName: customer.name,
    customerPhone: customer.phone ?? null,
    customerAddress: customer.address ?? null,
    balance,
    openingBalance,
    entries,
    totalDebit: entries.reduce((s, e) => s + e.debit, 0),
    totalCredit: entries.reduce((s, e) => s + e.credit, 0)
  }
}

export async function getCustomerStatement(customerId: number): Promise<StatementView> {
  const db = getDb()
  const customerRs = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [customerId] })
  const customer = customerRs.rows[0] as any
  if (!customer) throw new Error('العميل غير موجود')

  const invoicesRs = await db.execute({
    sql: `SELECT number, total, paid, payment_method AS paymentMethod, created_at AS createdAt
          FROM sales_invoices WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    args: [customerId]
  })
  const paymentsRs = await db.execute({
    sql: `SELECT id, amount, method, note, created_at AS createdAt
          FROM payments WHERE party_type = 'customer' AND party_id = ? ORDER BY created_at`,
    args: [customerId]
  })

  const entries: StatementEntry[] = []
  invoicesRs.rows.forEach((r: any, idx) => {
    entries.push({
      type: 'invoice',
      id: idx,
      date: r.createdAt,
      description: `فاتورة ${r.number} (${paymentMethodLabel(r.paymentMethod)})`,
      debit: r.paymentMethod === 'credit' ? Number(r.total) : r.paymentMethod === 'mixed' ? Math.max(0, Number(r.total) - Number(r.paid)) : 0,
      credit: 0
    })
  })
  paymentsRs.rows.forEach((r: any) => {
    entries.push({
      type: 'payment',
      id: Number(r.id),
      date: r.createdAt,
      description: `سداد (${paymentMethodLabel(r.method)})${r.note ? ' — ' + r.note : ''}`,
      debit: 0,
      credit: Number(r.amount)
    })
  })
  entries.sort((a, b) => a.date.localeCompare(b.date))

  return { balance: Number(customer.balance), entries }
}

export async function recordCustomerPayment(
  customerId: number,
  amount: number,
  method: PaymentMethod,
  note: string,
  userId: number
): Promise<CustomerView> {
  const db = getDb()
  await db.execute({
    sql: `INSERT INTO payments (party_type, party_id, amount, method, note, user_id)
          VALUES ('customer', ?, ?, ?, ?, ?)`,
    args: [customerId, amount, method, note || null, userId]
  })
  await db.execute({
    sql: 'UPDATE customers SET balance = balance - ? WHERE id = ?',
    args: [amount, customerId]
  })
  return fetchCustomerView(customerId)
}

function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'نقدًا',
    credit: 'آجل',
    card: 'بنكي',
    wallet: 'محفظة',
    mixed: 'مختلط',
    vodafone_cash: 'فودافون كاش',
    instapay: 'InstaPay'
  }
  return labels[method] ?? method
}
