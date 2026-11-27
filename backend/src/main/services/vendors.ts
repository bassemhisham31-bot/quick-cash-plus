import { getDb } from '../db'
import { localDay } from './timezone'
import { isActorMeta } from '../../shared/activityActor'
import type {
  PaymentMethod,
  PurchaseInvoiceListItem,
  StatementEntry,
  StatementFilter,
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
    linkedCustomerName: r.linkedCustomerName ?? null,
    vendorType: r.vendor_type ?? null,
    creditLimit: Number(r.credit_limit ?? 0)
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
    sql: `INSERT INTO vendors (name, phone, address, balance, notes, vendor_type, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.name.trim(),
      input.phone.trim() || null,
      input.address.trim() || null,
      input.openingBalance || 0,
      input.notes.trim() || null,
      input.vendorType?.trim() || null,
      Math.max(0, Number(input.creditLimit) || 0)
    ]
  })
  const created = await db.execute({ sql: `${VENDOR_SELECT} WHERE v.id = ?`, args: [rs.lastInsertRowid] })
  return mapRow(created.rows[0])
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/** تعديل بيانات المورد الأساسية (الاسم/الموبايل/العنوان/الملاحظات) — الرصيد والحركات مابتتأثرش. */
export async function updateVendor(
  vendorId: number,
  input: { name: string; phone: string; address?: string; notes?: string; vendorType?: string; creditLimit?: number }
): Promise<VendorView> {
  const db = getDb()
  const name = (input?.name ?? '').trim()
  if (!name) throw new Error('اسم المورد مطلوب')
  const exists = await db.execute({ sql: 'SELECT id FROM vendors WHERE id = ? AND deleted_at IS NULL', args: [vendorId] })
  if (!exists.rows[0]) throw new Error('المورد غير موجود')
  await db.execute({
    sql: 'UPDATE vendors SET name = ?, phone = ?, address = ?, notes = ?, vendor_type = ?, credit_limit = ? WHERE id = ?',
    args: [name, (input.phone ?? '').trim() || null, (input.address ?? '').trim() || null, (input.notes ?? '').trim() || null, (input.vendorType ?? '').trim() || null, Math.max(0, Number(input.creditLimit) || 0), vendorId]
  })
  const rs = await db.execute({ sql: `${VENDOR_SELECT} WHERE v.id = ?`, args: [vendorId] })
  return mapRow(rs.rows[0])
}

/**
 * كشف حساب المورد الكامل: فواتير المشتريات (مدين) والمرتجعات والسداد والتسويات (دائن) وحركات الحساب التاريخية (أرقام فقط)،
 * برصيد جاري بعد كل حركة. «رصيد سابق» = الرصيد الحالي − صافي كل الحركات (بيغطي أي رصيد افتتاحي/حركة مش متسجّلة هنا).
 * مدين = بيزوّد اللي علينا للمورد، دائن = بيقلّله.
 */
export async function getVendorStatement(vendorId: number, filter: StatementFilter = {}): Promise<StatementView> {
  const db = getDb()
  const vendorRs = await db.execute({ sql: 'SELECT * FROM vendors WHERE id = ?', args: [vendorId] })
  const vendor = vendorRs.rows[0] as any
  if (!vendor) throw new Error('المورد غير موجود')

  const all: StatementEntry[] = []

  // فواتير المشتريات: الآجل = مدين بالإجمالي ودائن بالمدفوع وقت الشراء (السداد اللاحق على الفاتورة بيظهر لوحده)، غير الآجل مدفوع بالكامل
  const invoicesRs = await db.execute({
    sql: `SELECT pi.id, pi.number, pi.total, pi.paid, pi.payment_method AS method, pi.created_at AS createdAt,
                 COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = pi.id AND p.party_type = 'vendor'), 0) AS linkedPaid
          FROM purchase_invoices pi WHERE pi.vendor_id = ?`,
    args: [vendorId]
  })
  for (const r of invoicesRs.rows as any[]) {
    const total = Number(r.total)
    const paidNow = r.method === 'credit' ? Math.max(0, Number(r.paid) - Number(r.linkedPaid)) : total
    all.push({
      type: 'invoice',
      id: Number(r.id),
      date: r.createdAt,
      description: `فاتورة مشتريات ${r.number} (${paymentMethodLabel(r.method)})`,
      debit: total,
      credit: paidNow
    })
  }

  // مرتجع المشتريات: على فاتورة آجل بينقص اللي علينا، وعلى فاتورة مدفوعة الرد نقدي (مدين ودائن بنفس القيمة)
  const returnsRs = await db.execute({
    sql: `SELECT r.id, r.amount, r.created_at AS createdAt, pi.number, pi.payment_method AS method
          FROM purchase_returns r JOIN purchase_invoices pi ON pi.id = r.purchase_invoice_id WHERE pi.vendor_id = ?`,
    args: [vendorId]
  })
  for (const r of returnsRs.rows as any[]) {
    const amount = Number(r.amount)
    const cashBack = r.method !== 'credit'
    all.push({
      type: 'return',
      id: Number(r.id),
      date: r.createdAt,
      description: `مرتجع على فاتورة ${r.number}${cashBack ? ' (رد نقدي)' : ''}`,
      debit: cashBack ? amount : 0,
      credit: amount
    })
  }

  const paymentsRs = await db.execute({
    sql: `SELECT p.id, p.amount, p.method, p.note, p.created_at AS createdAt, pi.number AS invoiceNumber
          FROM payments p
          LEFT JOIN purchase_invoices pi ON pi.id = p.invoice_id
          WHERE p.party_type = 'vendor' AND p.party_id = ?`,
    args: [vendorId]
  })
  for (const r of paymentsRs.rows as any[]) {
    all.push({
      type: 'payment',
      id: Number(r.id),
      date: r.createdAt,
      description: `سداد (${paymentMethodLabel(r.method)})${r.invoiceNumber ? ` — لفاتورة ${r.invoiceNumber}` : ''}${r.note ? ' — ' + r.note : ''}`,
      debit: 0,
      credit: Number(r.amount)
    })
  }

  const settlementsRs = await db.execute({
    sql: `SELECT s.id, s.amount, s.note, s.created_at AS createdAt, si.number AS invoiceNumber
          FROM party_settlements s
          LEFT JOIN sales_invoices si ON si.id = s.sales_invoice_id
          WHERE s.vendor_id = ?`,
    args: [vendorId]
  })
  for (const r of settlementsRs.rows as any[]) {
    all.push({
      type: 'payment',
      id: 1_000_000 + Number(r.id),
      date: r.createdAt,
      description: `تسوية مقابل بيع للعميل المرتبط${r.invoiceNumber ? ` — فاتورة ${r.invoiceNumber}` : ''}`,
      debit: 0,
      credit: Number(r.amount)
    })
  }

  // حركات الحساب التاريخية (أرقام فقط — منقولة من كشوف قديمة)
  const historyRs = await db.execute({
    sql: `SELECT id, entry_date AS date, kind, description, debit, credit FROM vendor_account_entries WHERE vendor_id = ? ORDER BY id`,
    args: [vendorId]
  })
  const historyType: Record<string, StatementEntry['type']> = { opening: 'opening', purchase: 'invoice', return: 'return', payment: 'payment' }
  for (const r of historyRs.rows as any[]) {
    all.push({
      type: historyType[r.kind] ?? 'invoice',
      id: 2_000_000 + Number(r.id),
      date: r.date,
      description: r.description,
      debit: Number(r.debit),
      credit: Number(r.credit),
      deletable: true // حركة حساب (يدوية أو منقولة) بس هي اللي ينفع تتحذف — الفواتير والسداد الحقيقيين لأ
    })
  }

  all.sort((a, b) => a.date.localeCompare(b.date)) // ثابت: الحركات في نفس اللحظة بتفضل بترتيب إدخالها

  const balance = Number(vendor.balance)
  const net = all.reduce((s, e) => s + e.debit - e.credit, 0)
  let running = balance - net // رصيد قبل أول حركة
  let openingBalance = r2(running)
  // فلتر التاريخ (من/إلى شاملين): بنقارن بالتاريخ بس (أول 10 حروف) لأن الحركات التاريخية تاريخها من غير وقت.
  // اللي قبل «من» بيتلخّص في «رصيد سابق»، واللي بعد «إلى» مابيتعرضش.
  const from = filter.from ?? null
  const to = filter.to ?? null
  const entries: StatementEntry[] = []
  for (const e of all) {
    running += e.debit - e.credit
    const day = localDay(e.date)
    if (from && day < from) {
      openingBalance = r2(running)
      continue
    }
    if (to && day > to) continue
    entries.push({ ...e, balance: r2(running) })
  }
  return {
    balance,
    openingBalance,
    entries,
    totalDebit: r2(entries.reduce((s, e) => s + e.debit, 0)),
    totalCredit: r2(entries.reduce((s, e) => s + e.credit, 0))
  }
}

export interface VendorAccountEntryInput {
  /** YYYY-MM-DD */
  date: string
  kind: 'opening' | 'purchase' | 'return' | 'payment'
  description: string
  debit: number
  credit: number
}

/**
 * نقل حركات حساب مورد قديمة كأرقام فقط (بيستخدمها سكريبت الاستيراد): بتتسجّل في كشف حساب المورد وبتتحسب على رصيده،
 * من غير أي أثر على المخزون أو الخزن أو القيود (رصيد المورد هو اللي بيدخل المحاسبة كرصيد أول المدة).
 */
export async function addVendorAccountEntries(vendorId: number, items: VendorAccountEntryInput[]): Promise<{ inserted: number; net: number; balance: number }> {
  const db = getDb()
  const vendor = (await db.execute({ sql: 'SELECT id FROM vendors WHERE id = ? AND deleted_at IS NULL', args: [vendorId] })).rows[0]
  if (!vendor) throw new Error('المورد غير موجود')
  for (const e of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error(`تاريخ غير صالح: ${e.date}`)
    if (!['opening', 'purchase', 'return', 'payment'].includes(e.kind)) throw new Error(`نوع حركة غير صالح: ${e.kind}`)
    if (!(e.debit >= 0) || !(e.credit >= 0) || (e.debit === 0 && e.credit === 0)) throw new Error('مبلغ الحركة لازم يكون رقم أكبر من صفر في مدين أو دائن')
  }
  const tx = await db.transaction('write')
  try {
    let net = 0
    for (const e of items) {
      await tx.execute({
        sql: 'INSERT INTO vendor_account_entries (vendor_id, entry_date, kind, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?)',
        // تاريخ من غير وقت (الكشوف القديمة مالهاش وقت): بيترتّب قبل أي حركة حقيقية في نفس اليوم، وترتيب الإدخال محفوظ للحركات التاريخية
        args: [vendorId, e.date, e.kind, e.description.trim(), r2(e.debit), r2(e.credit)]
      })
      net += r2(e.debit) - r2(e.credit)
    }
    net = r2(net)
    if (net !== 0) await tx.execute({ sql: 'UPDATE vendors SET balance = balance + ? WHERE id = ?', args: [net, vendorId] })
    await tx.commit()
    const balance = Number(((await db.execute({ sql: 'SELECT balance FROM vendors WHERE id = ?', args: [vendorId] })).rows[0] as any).balance)
    return { inserted: items.length, net, balance }
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

/** تاريخ YYYY-MM-DD حقيقي (مش 2026-02-31)؟ */
function isRealDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

const cairoToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export interface VendorManualEntryInput {
  /** YYYY-MM-DD (مش في المستقبل) */
  date: string
  /** purchase = بيزوّد اللي علينا للمورد | payment وreturn = بينقّصوه */
  kind: 'purchase' | 'payment' | 'return'
  amount: number
  description?: string
}

const MANUAL_LABELS: Record<VendorManualEntryInput['kind'], string> = {
  purchase: 'مشتريات (حركة يدوية)',
  payment: 'سداد (حركة يدوية)',
  return: 'مرتجع / خصم (حركة يدوية)'
}

/**
 * إضافة حركة يدوية على حساب المورد — مبلغ وتاريخ وبيان بس: من غير فاتورة ولا مخزون ولا خزنة ولا قيود
 * (لو الدفع فعلًا من الخزنة استخدم «تسجيل سداد»). بتظهر في كشف الحساب وفي رابط المورد، وبتتحسب على رصيده.
 */
export async function addVendorManualEntry(vendorId: number, input: VendorManualEntryInput): Promise<VendorView> {
  const kind = input?.kind
  if (kind !== 'purchase' && kind !== 'payment' && kind !== 'return') throw new Error('نوع الحركة غير صالح')
  const amount = Number(input?.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) throw new Error('اكتب مبلغ صحيح أكبر من صفر')
  if (!isRealDay(input?.date)) throw new Error('التاريخ غير صالح')
  if (input.date > cairoToday()) throw new Error('التاريخ مينفعش يكون في المستقبل')
  const description = (input.description ?? '').trim().slice(0, 300) || MANUAL_LABELS[kind]
  await addVendorAccountEntries(vendorId, [
    { date: input.date, kind, description, debit: kind === 'purchase' ? amount : 0, credit: kind === 'purchase' ? 0 : amount }
  ])
  const rs = await getDb().execute({ sql: `${VENDOR_SELECT} WHERE v.id = ?`, args: [vendorId] })
  return mapRow(rs.rows[0])
}

/**
 * حذف حركة حساب (يدوية أو منقولة من كشف قديم) — للأدمن بس، والصلاحية بتتراجع من القاعدة مش من الواجهة.
 * بيرجّع رصيد المورد لما كان قبل الحركة. الفواتير والسداد الحقيقيين مالهمش حذف من هنا.
 */
export async function deleteVendorAccountEntry(entryId: number, actor?: unknown): Promise<VendorView> {
  const db = getDb()
  const userId = isActorMeta(actor) ? actor.userId : null
  const role = userId ? ((await db.execute({ sql: 'SELECT role FROM users WHERE id = ?', args: [userId] })).rows[0] as any)?.role : null
  if (role !== 'admin') throw new Error('حذف حركة الحساب للأدمن فقط')
  const entry = (await db.execute({ sql: 'SELECT id, vendor_id, debit, credit FROM vendor_account_entries WHERE id = ?', args: [entryId] })).rows[0] as any
  if (!entry) throw new Error('الحركة غير موجودة')
  const vendorId = Number(entry.vendor_id)
  const net = r2(Number(entry.debit) - Number(entry.credit))
  const tx = await db.transaction('write')
  try {
    await tx.execute({ sql: 'DELETE FROM vendor_account_entries WHERE id = ?', args: [entryId] })
    if (net !== 0) await tx.execute({ sql: 'UPDATE vendors SET balance = balance - ? WHERE id = ?', args: [net, vendorId] })
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
  const rs = await db.execute({ sql: `${VENDOR_SELECT} WHERE v.id = ?`, args: [vendorId] })
  return mapRow(rs.rows[0])
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
    sql: `SELECT pi.id, pi.number, pi.total, pi.paid, pi.payment_method AS paymentMethod, pi.created_at AS createdAt, pi.due_date AS dueDate,
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
    createdAt: r.createdAt,
    dueDate: r.dueDate ?? null
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
