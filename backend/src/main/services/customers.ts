import { getDb } from '../db'
import type { CustomerInput, CustomerView, PaymentMethod, StatementEntry, StatementView } from '../../shared/types'

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

export async function getCustomerStatement(customerId: number): Promise<StatementView> {
  const db = getDb()
  const customerRs = await db.execute({ sql: 'SELECT * FROM customers WHERE id = ?', args: [customerId] })
  const customer = customerRs.rows[0] as any
  if (!customer) throw new Error('العميل غير موجود')

  const invoicesRs = await db.execute({
    sql: `SELECT number, total, payment_method AS paymentMethod, created_at AS createdAt
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
      debit: r.paymentMethod === 'credit' ? Number(r.total) : 0,
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
