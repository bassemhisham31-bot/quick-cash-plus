import { getDb } from '../db'
import type {
  PaymentMethod,
  PurchaseInvoiceListItem,
  StatementEntry,
  StatementView,
  VendorInput,
  VendorView
} from '../../shared/types'

const VENDOR_SELECT = `
  SELECT v.*, c.id AS linkedCustomerId, c.name AS linkedCustomerName
  FROM vendors v
  LEFT JOIN customers c ON c.linked_vendor_id = v.id AND c.deleted_at IS NULL
`

function mapRow(r: any): VendorView {
  return {
    id: Number(r.id),
    name: r.name,
    phone: r.phone,
    address: r.address,
    balance: Number(r.balance),
    notes: r.notes,
    createdAt: r.created_at,
    linkedCustomerId: r.linkedCustomerId != null ? Number(r.linkedCustomerId) : null,
    linkedCustomerName: r.linkedCustomerName ?? null
  }
}

export async function listVendors(search = ''): Promise<VendorView[]> {
  const db = getDb()
  const term = `%${search.trim()}%`
  const rs = await db.execute({
    sql: `${VENDOR_SELECT}
          WHERE v.deleted_at IS NULL AND (? = '%%' OR v.name LIKE ? OR v.phone LIKE ?)
          ORDER BY v.name`,
    args: [term, term, term]
  })
  return rs.rows.map(mapRow)
}

export async function createVendor(input: VendorInput): Promise<VendorView> {
  const db = getDb()
  const rs = await db.execute({
    sql: `INSERT INTO vendors (name, phone, address, balance, notes) VALUES (?, ?, ?, ?, ?)`,
    args: [
      input.name.trim(),
      input.phone.trim() || null,
      input.address.trim() || null,
      input.openingBalance || 0,
      input.notes.trim() || null
    ]
  })
  const created = await db.execute({ sql: `${VENDOR_SELECT} WHERE v.id = ?`, args: [rs.lastInsertRowid] })
  return mapRow(created.rows[0])
}

export async function getVendorStatement(vendorId: number): Promise<StatementView> {
  const db = getDb()
  const vendorRs = await db.execute({ sql: 'SELECT * FROM vendors WHERE id = ?', args: [vendorId] })
  const vendor = vendorRs.rows[0] as any
  if (!vendor) throw new Error('المورد غير موجود')

  const paymentsRs = await db.execute({
    sql: `SELECT p.id, p.amount, p.method, p.note, p.created_at AS createdAt, pi.number AS invoiceNumber
          FROM payments p
          LEFT JOIN purchase_invoices pi ON pi.id = p.invoice_id
          WHERE p.party_type = 'vendor' AND p.party_id = ? ORDER BY p.created_at`,
    args: [vendorId]
  })

  const settlementsRs = await db.execute({
    sql: `SELECT s.id, s.amount, s.note, s.created_at AS createdAt, si.number AS invoiceNumber
          FROM party_settlements s
          LEFT JOIN sales_invoices si ON si.id = s.sales_invoice_id
          WHERE s.vendor_id = ? ORDER BY s.created_at`,
    args: [vendorId]
  })

  const entries: StatementEntry[] = paymentsRs.rows.map((r: any) => ({
    type: 'payment' as const,
    id: Number(r.id),
    date: r.createdAt,
    description: `سداد (${paymentMethodLabel(r.method)})${r.invoiceNumber ? ` — لفاتورة ${r.invoiceNumber}` : ''}${r.note ? ' — ' + r.note : ''}`,
    debit: 0,
    credit: Number(r.amount)
  }))

  settlementsRs.rows.forEach((r: any) => {
    entries.push({
      type: 'payment' as const,
      id: 1_000_000 + Number(r.id),
      date: r.createdAt,
      description: `تسوية مقابل بيع للعميل المرتبط${r.invoiceNumber ? ` — فاتورة ${r.invoiceNumber}` : ''}`,
      debit: 0,
      credit: Number(r.amount)
    })
  })

  entries.sort((a, b) => a.date.localeCompare(b.date))

  return { balance: Number(vendor.balance), entries }
}

export async function recordVendorPayment(
  vendorId: number,
  amount: number,
  method: PaymentMethod,
  note: string,
  userId: number,
  invoiceId?: number | null
): Promise<VendorView> {
  const db = getDb()

  if (invoiceId) {
    const invoiceRs = await db.execute({
      sql: 'SELECT id FROM purchase_invoices WHERE id = ? AND vendor_id = ?',
      args: [invoiceId, vendorId]
    })
    if (!invoiceRs.rows[0]) throw new Error('فاتورة المشتريات المحددة لا تخص هذا المورد')
  }

  await db.execute({
    sql: `INSERT INTO payments (party_type, party_id, amount, method, note, user_id, invoice_id)
          VALUES ('vendor', ?, ?, ?, ?, ?, ?)`,
    args: [vendorId, amount, method, note || null, userId, invoiceId || null]
  })
  if (invoiceId) {
    await db.execute({ sql: 'UPDATE purchase_invoices SET paid = paid + ? WHERE id = ?', args: [amount, invoiceId] })
  }
  await db.execute({ sql: 'UPDATE vendors SET balance = balance - ? WHERE id = ?', args: [amount, vendorId] })
  const rs = await db.execute({ sql: `${VENDOR_SELECT} WHERE v.id = ?`, args: [vendorId] })
  return mapRow(rs.rows[0])
}

export async function listUnpaidPurchaseInvoices(vendorId: number): Promise<PurchaseInvoiceListItem[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT pi.id, pi.number, pi.total, pi.paid, pi.payment_method AS paymentMethod, pi.created_at AS createdAt,
                 v.name AS vendorName
          FROM purchase_invoices pi
          JOIN vendors v ON v.id = pi.vendor_id
          WHERE pi.vendor_id = ? AND pi.paid < pi.total
          ORDER BY pi.created_at DESC`,
    args: [vendorId]
  })
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    number: r.number,
    vendorName: r.vendorName,
    total: Number(r.total),
    paid: Number(r.paid),
    paymentMethod: r.paymentMethod,
    createdAt: r.createdAt
  }))
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
