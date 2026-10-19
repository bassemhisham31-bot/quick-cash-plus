import { getDb } from '../db'
import { loadTreasuryRows, resolveTreasury } from './treasuries'
import type { ReportResult } from '../../shared/types'

/* ------------------------------ شجرة الحسابات ------------------------------ */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense'

export interface AccountRow {
  code: string
  name: string
  type: AccountType
  isSystem: boolean
  active: boolean
}

export const AR = '1200'
export const INVENTORY = '1300'
export const AP = '2100'
export const VAT = '2200'
export const TIPS = '2300'
export const EVENT_DEPOSITS = '2400'
export const EVENT_REVENUE = '4600'
export const OPENING_EQUITY = '3100'
export const SALES = '4100'
export const SALES_RETURNS = '4200'
export const SALES_DISCOUNTS = '4300'
export const DELIVERY_REVENUE = '4400'
export const SERVICE_REVENUE = '4500'
export const CASH_SURPLUS = '4800'
export const OTHER_INCOME = '4900'
export const COGS = '5100'
export const CASH_SHORTAGE = '6800'
export const MISC_EXPENSE = '6900'

const SYSTEM_ACCOUNTS: [string, string, AccountType][] = [
  [AR, 'العملاء (المدينون)', 'asset'],
  [INVENTORY, 'المخزون', 'asset'],
  [AP, 'الموردون (الدائنون)', 'liability'],
  [VAT, 'ضريبة القيمة المضافة المستحقة', 'liability'],
  [TIPS, 'إكراميات مستحقة للعاملين', 'liability'],
  [EVENT_DEPOSITS, 'عربونات ومقدمات حجوزات المناسبات', 'liability'],
  [OPENING_EQUITY, 'رأس المال والأرصدة الافتتاحية', 'equity'],
  [SALES, 'المبيعات', 'revenue'],
  [SALES_RETURNS, 'مرتجعات المبيعات', 'revenue'],
  [SALES_DISCOUNTS, 'خصومات المبيعات', 'revenue'],
  [DELIVERY_REVENUE, 'إيراد رسوم التوصيل', 'revenue'],
  [SERVICE_REVENUE, 'إيراد رسوم الخدمة', 'revenue'],
  [EVENT_REVENUE, 'إيراد حجوزات المناسبات', 'revenue'],
  [CASH_SURPLUS, 'زيادة الخزينة', 'revenue'],
  [OTHER_INCOME, 'إيرادات أخرى', 'revenue'],
  [COGS, 'تكلفة البضاعة المباعة', 'cogs'],
  [CASH_SHORTAGE, 'عجز الخزينة', 'expense'],
  [MISC_EXPENSE, 'مصروفات متنوعة', 'expense']
]

export const treasuryCode = (id: number): string => String(1100 + id)
export const expenseCategoryCode = (id: number): string => String(6000 + id)

/** بيضمن إن حسابات النظام وحسابات الخزائن وتصنيفات المصروفات موجودة (وبيحدّث الأسماء لو اتغيّرت) */
export async function ensureAccounts(): Promise<void> {
  const db = getDb()
  const upsert = async (code: string, name: string, type: AccountType, system: number): Promise<void> => {
    await db.execute({
      sql: `INSERT INTO accounts (code, name, type, is_system) VALUES (?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET name = excluded.name WHERE is_system = 1`,
      args: [code, name, type, system]
    })
  }
  for (const [code, name, type] of SYSTEM_ACCOUNTS) await upsert(code, name, type, 1)
  const treasuries = await db.execute('SELECT id, name FROM treasuries WHERE deleted_at IS NULL')
  for (const t of treasuries.rows as any[]) await upsert(treasuryCode(Number(t.id)), `خزينة: ${t.name}`, 'asset', 1)
  const cats = await db.execute('SELECT id, name FROM expense_categories')
  for (const c of cats.rows as any[]) await upsert(expenseCategoryCode(Number(c.id)), `مصروف: ${c.name}`, 'expense', 1)
}

export async function listAccounts(): Promise<AccountRow[]> {
  await ensureAccounts()
  const rs = await getDb().execute('SELECT code, name, type, is_system, active FROM accounts ORDER BY code')
  return (rs.rows as any[]).map((r) => ({ code: r.code, name: r.name, type: r.type, isSystem: !!r.is_system, active: !!r.active }))
}

export async function createAccount(input: { code: string; name: string; type: AccountType }): Promise<void> {
  const code = input.code.trim()
  if (!/^\d{3,10}$/.test(code)) throw new Error('كود الحساب أرقام فقط (3 إلى 10 أرقام)')
  if (!input.name.trim()) throw new Error('اسم الحساب مطلوب')
  const exists = await getDb().execute({ sql: 'SELECT 1 FROM accounts WHERE code = ?', args: [code] })
  if (exists.rows.length) throw new Error('الكود ده مستخدم قبل كده')
  await getDb().execute({ sql: 'INSERT INTO accounts (code, name, type, is_system) VALUES (?, ?, ?, 0)', args: [code, input.name.trim(), input.type] })
}

export async function setAccountActive(code: string, active: boolean): Promise<void> {
  await getDb().execute({ sql: 'UPDATE accounts SET active = ? WHERE code = ? AND is_system = 0', args: [active ? 1 : 0, code] })
}

/* ------------------------------ القيود ------------------------------ */

export interface LedgerLine {
  code: string
  debit: number
  credit: number
  memo?: string
}

export interface LedgerEntry {
  date: string
  ref: string
  description: string
  source: string
  lines: LedgerLine[]
}

const r2 = (v: number): number => Math.round(v * 100) / 100

/** بيحوّل أجزاء قيد لسطور متوازنة (فرق التقريب بيتحط على الحساب المحدد) */
function balanced(lines: LedgerLine[], plugCode: string): LedgerLine[] {
  const out = lines.filter((l) => r2(l.debit) !== 0 || r2(l.credit) !== 0).map((l) => ({ ...l, debit: r2(l.debit), credit: r2(l.credit) }))
  const diff = r2(out.reduce((s, l) => s + l.debit - l.credit, 0))
  if (diff !== 0) {
    const plug = out.find((l) => l.code === plugCode)
    if (plug) {
      if (diff > 0) plug.credit = r2(plug.credit + diff)
      else plug.debit = r2(plug.debit - diff)
    } else out.push({ code: plugCode, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0 })
  }
  return out
}

/** كل قيود النظام: متولّدة من المستندات + أرصدة أول المدة + القيود اليدوية، مرتّبة بالتاريخ */
export async function buildLedger(): Promise<LedgerEntry[]> {
  await ensureAccounts()
  const db = getDb()
  const treasuries = await loadTreasuryRows()
  const entries: LedgerEntry[] = []
  const tCode = (method: string | null, explicitId?: number | null): string => {
    const id = resolveTreasury(treasuries, method, explicitId)
    return id != null ? treasuryCode(id) : treasuryCode(treasuries[0]?.id ?? 1)
  }

  // ---------- المبيعات + تكلفتها ----------
  const sales = await db.execute(
    `SELECT i.id, i.number, i.created_at, i.subtotal, i.discount_total, i.tax_total, i.total, i.paid, i.payment_method,
            i.delivery_fee, i.service_charge_total, i.tip_amount, c.name AS customerName,
            COALESCE((SELECT SUM(si.discount) FROM sales_items si WHERE si.invoice_id = i.id), 0) AS itemsDiscount,
            COALESCE((SELECT SUM(si.qty * COALESCE(si.cost_price, p.cost_price, 0)) FROM sales_items si
                      LEFT JOIN products p ON p.id = si.product_id WHERE si.invoice_id = i.id), 0) AS cogs,
            COALESCE((SELECT SUM(ps.amount) FROM party_settlements ps WHERE ps.sales_invoice_id = i.id), 0) AS settled
     FROM sales_invoices i JOIN customers c ON c.id = i.customer_id WHERE i.deleted_at IS NULL`
  )
  for (const r of sales.rows as any[]) {
    const subtotal = Number(r.subtotal)
    const total = Number(r.total)
    const tax = Number(r.tax_total)
    const service = Number(r.service_charge_total)
    const delivery = Number(r.delivery_fee)
    const itemsDiscount = Number(r.itemsDiscount)
    const invoiceDiscount = Number(r.discount_total)
    const redeem = Math.max(0, subtotal - invoiceDiscount + tax + service + delivery - total)
    const gross = subtotal + itemsDiscount
    const settled = Math.min(Number(r.settled), total)
    const paid = Math.min(Number(r.paid), total)
    const cashPart = Math.max(0, paid - settled)
    const arPart = Math.max(0, total - paid)
    const lines: LedgerLine[] = [
      { code: tCode(r.payment_method), debit: cashPart, credit: 0 },
      { code: AR, debit: arPart, credit: 0, memo: r.customerName },
      { code: AP, debit: settled, credit: 0, memo: 'تسوية مع مورد مرتبط' },
      { code: SALES_DISCOUNTS, debit: itemsDiscount + invoiceDiscount + redeem, credit: 0 },
      { code: SALES, debit: 0, credit: gross },
      { code: VAT, debit: 0, credit: tax },
      { code: SERVICE_REVENUE, debit: 0, credit: service },
      { code: DELIVERY_REVENUE, debit: 0, credit: delivery },
      { code: COGS, debit: Number(r.cogs), credit: 0 },
      { code: INVENTORY, debit: 0, credit: Number(r.cogs) },
      { code: tCode(r.payment_method), debit: Number(r.tip_amount) || 0, credit: 0, memo: 'إكرامية' },
      { code: TIPS, debit: 0, credit: Number(r.tip_amount) || 0 }
    ]
    entries.push({ date: r.created_at, ref: r.number, description: `فاتورة بيع — ${r.customerName}`, source: 'مبيعات', lines: balanced(lines, SALES) })
  }

  // ---------- حجوزات المناسبات: الدفعات التزام (عربون) لحد ما الحجز يتنفّذ فيتحوّل لإيراد ----------
  const eventPays = await db.execute(
    `SELECT p.created_at, p.amount, p.method, b.number, b.customer_name
     FROM event_booking_payments p JOIN event_bookings b ON b.id = p.booking_id`
  )
  for (const r of eventPays.rows as any[]) {
    const amt = Number(r.amount)
    entries.push({
      date: r.created_at,
      ref: r.number,
      description: `${amt >= 0 ? 'دفعة حجز' : 'استرداد حجز'} — ${r.customer_name}`,
      source: 'حجوزات',
      lines: balanced(
        [
          { code: tCode(r.method), debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0 },
          { code: EVENT_DEPOSITS, debit: amt < 0 ? -amt : 0, credit: amt > 0 ? amt : 0 }
        ],
        EVENT_DEPOSITS
      )
    })
  }
  const doneEvents = await db.execute(
    `SELECT b.number, b.customer_name, b.completed_at,
            COALESCE((SELECT SUM(amount) FROM event_booking_payments WHERE booking_id = b.id), 0) AS paid
     FROM event_bookings b WHERE b.status = 'completed'`
  )
  for (const r of doneEvents.rows as any[]) {
    const paid = Number(r.paid)
    if (paid <= 0) continue
    entries.push({
      date: r.completed_at,
      ref: r.number,
      description: `تنفيذ حجز مناسبة — ${r.customer_name}`,
      source: 'حجوزات',
      lines: balanced(
        [
          { code: EVENT_DEPOSITS, debit: paid, credit: 0 },
          { code: EVENT_REVENUE, debit: 0, credit: paid }
        ],
        EVENT_REVENUE
      )
    })
  }

  // ---------- مرتجعات المبيعات ----------
  const salesReturns = await db.execute(
    `SELECT r.id, r.created_at, r.amount, i.number, i.payment_method, c.name AS customerName,
            COALESCE((SELECT SUM(ri.qty * COALESCE(si.cost_price, p.cost_price, 0)) FROM sales_return_items ri
                      JOIN sales_items si ON si.id = ri.sales_item_id LEFT JOIN products p ON p.id = si.product_id
                      WHERE ri.return_id = r.id), 0) AS cogs
     FROM sales_returns r JOIN sales_invoices i ON i.id = r.invoice_id JOIN customers c ON c.id = i.customer_id`
  )
  for (const r of salesReturns.rows as any[]) {
    const credit = r.payment_method === 'credit'
    entries.push({
      date: r.created_at,
      ref: `SR-${r.id}`,
      description: `مرتجع على فاتورة ${r.number} — ${r.customerName}`,
      source: 'مرتجع مبيعات',
      lines: balanced(
        [
          { code: SALES_RETURNS, debit: Number(r.amount), credit: 0 },
          { code: credit ? AR : tCode(r.payment_method), debit: 0, credit: Number(r.amount) },
          { code: INVENTORY, debit: Number(r.cogs), credit: 0 },
          { code: COGS, debit: 0, credit: Number(r.cogs) }
        ],
        SALES_RETURNS
      )
    })
  }

  // ---------- المشتريات ومرتجعاتها ----------
  const purchases = await db.execute(
    `SELECT pi.number, pi.created_at, pi.total, pi.payment_method, v.name AS vendorName,
            pi.paid - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = pi.id AND p.party_type = 'vendor'), 0) AS paidNow
     FROM purchase_invoices pi LEFT JOIN vendors v ON v.id = pi.vendor_id`
  )
  for (const r of purchases.rows as any[]) {
    const total = Number(r.total)
    const paidNow = r.payment_method === 'credit' ? 0 : Math.min(total, Math.max(0, Number(r.paidNow)))
    entries.push({
      date: r.created_at,
      ref: r.number,
      description: `فاتورة شراء — ${r.vendorName ?? ''}`.trim(),
      source: 'مشتريات',
      lines: balanced(
        [
          { code: INVENTORY, debit: total, credit: 0 },
          { code: tCode(r.payment_method), debit: 0, credit: paidNow },
          { code: AP, debit: 0, credit: total - paidNow, memo: r.vendorName ?? '' }
        ],
        INVENTORY
      )
    })
  }

  const purchaseReturns = await db.execute(
    `SELECT r.id, r.created_at, r.amount, pi.number, pi.payment_method, v.name AS vendorName
     FROM purchase_returns r JOIN purchase_invoices pi ON pi.id = r.purchase_invoice_id LEFT JOIN vendors v ON v.id = pi.vendor_id`
  )
  for (const r of purchaseReturns.rows as any[]) {
    const credit = r.payment_method === 'credit'
    entries.push({
      date: r.created_at,
      ref: `PR-${r.id}`,
      description: `مرتجع مشتريات على ${r.number} — ${r.vendorName ?? ''}`.trim(),
      source: 'مرتجع مشتريات',
      lines: balanced(
        [
          { code: credit ? AP : tCode(r.payment_method), debit: Number(r.amount), credit: 0 },
          { code: INVENTORY, debit: 0, credit: Number(r.amount) }
        ],
        INVENTORY
      )
    })
  }

  // ---------- تحصيل وسداد ----------
  const payments = await db.execute(
    `SELECT p.id, p.party_type, p.amount, p.method, p.treasury_id, p.created_at, COALESCE(c.name, v.name, '') AS partyName
     FROM payments p LEFT JOIN customers c ON p.party_type = 'customer' AND c.id = p.party_id
     LEFT JOIN vendors v ON p.party_type = 'vendor' AND v.id = p.party_id`
  )
  for (const r of payments.rows as any[]) {
    const isCustomer = r.party_type === 'customer'
    const cash = tCode(r.method, r.treasury_id != null ? Number(r.treasury_id) : null)
    entries.push({
      date: r.created_at,
      ref: `P-${r.id}`,
      description: `${isCustomer ? 'تحصيل من' : 'سداد إلى'} ${r.partyName}`,
      source: isCustomer ? 'تحصيل عميل' : 'سداد مورد',
      lines: isCustomer
        ? [{ code: cash, debit: Number(r.amount), credit: 0 }, { code: AR, debit: 0, credit: Number(r.amount), memo: r.partyName }]
        : [{ code: AP, debit: Number(r.amount), credit: 0, memo: r.partyName }, { code: cash, debit: 0, credit: Number(r.amount) }]
    })
  }

  // ---------- مصروفات ----------
  const expenses = await db.execute(
    `SELECT e.id, e.created_at, e.amount, e.method, e.treasury_id, e.category_id, e.note, ec.name AS categoryName
     FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id WHERE e.deleted_at IS NULL`
  )
  for (const r of expenses.rows as any[]) {
    entries.push({
      date: r.created_at,
      ref: `E-${r.id}`,
      description: `${r.categoryName ?? 'مصروف'}${r.note ? ` — ${r.note}` : ''}`,
      source: 'مصروف',
      lines: [
        { code: r.category_id != null ? expenseCategoryCode(Number(r.category_id)) : MISC_EXPENSE, debit: Number(r.amount), credit: 0 },
        { code: tCode(r.method, r.treasury_id != null ? Number(r.treasury_id) : null), debit: 0, credit: Number(r.amount) }
      ]
    })
  }

  // ---------- إيرادات أخرى / تحويلات / فروقات خزينة ----------
  const receipts = await db.execute(
    `SELECT id, created_at, amount, treasury_id, party_name, note FROM vouchers WHERE deleted_at IS NULL AND type = 'receipt' AND payment_id IS NULL`
  )
  for (const r of receipts.rows as any[]) {
    entries.push({
      date: r.created_at,
      ref: `RV-${String(r.id).padStart(6, '0')}`,
      description: `${r.party_name ?? 'إيراد'}${r.note ? ` — ${r.note}` : ''}`,
      source: 'سند قبض',
      lines: [
        { code: treasuryCode(Number(r.treasury_id)), debit: Number(r.amount), credit: 0 },
        { code: OTHER_INCOME, debit: 0, credit: Number(r.amount) }
      ]
    })
  }

  const transfers = await db.execute(
    'SELECT id, created_at, amount, from_treasury_id, to_treasury_id FROM treasury_transfers WHERE deleted_at IS NULL'
  )
  for (const r of transfers.rows as any[]) {
    entries.push({
      date: r.created_at,
      ref: `T-${r.id}`,
      description: 'تحويل بين الخزائن',
      source: 'تحويل',
      lines: [
        { code: treasuryCode(Number(r.to_treasury_id)), debit: Number(r.amount), credit: 0 },
        { code: treasuryCode(Number(r.from_treasury_id)), debit: 0, credit: Number(r.amount) }
      ]
    })
  }

  const diffs = await db.execute('SELECT session_id, created_at, difference, treasury_id FROM cash_differences WHERE difference != 0')
  for (const r of diffs.rows as any[]) {
    const diff = Number(r.difference)
    const t = treasuryCode(Number(r.treasury_id))
    entries.push({
      date: r.created_at,
      ref: `S-${r.session_id}`,
      description: `فرق جرد الوردية #${r.session_id} (${diff < 0 ? 'عجز' : 'زيادة'})`,
      source: 'فرق خزينة',
      lines:
        diff < 0
          ? [{ code: CASH_SHORTAGE, debit: -diff, credit: 0 }, { code: t, debit: 0, credit: -diff }]
          : [{ code: t, debit: diff, credit: 0 }, { code: CASH_SURPLUS, debit: 0, credit: diff }]
    })
  }

  // ---------- قيود يدوية ----------
  const manual = await db.execute(
    `SELECT e.id, e.entry_date, e.description, l.account_code, l.debit, l.credit, l.memo
     FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id WHERE e.deleted_at IS NULL ORDER BY e.id, l.id`
  )
  const manualById = new Map<number, LedgerEntry>()
  for (const r of manual.rows as any[]) {
    let e = manualById.get(Number(r.id))
    if (!e) {
      e = { date: r.entry_date, ref: `JV-${String(r.id).padStart(5, '0')}`, description: r.description, source: 'قيد يدوي', lines: [] }
      manualById.set(Number(r.id), e)
      entries.push(e)
    }
    e.lines.push({ code: r.account_code, debit: Number(r.debit), credit: Number(r.credit), memo: r.memo ?? undefined })
  }

  // ---------- أرصدة أول المدة (بتُحسب من الأرصدة الحالية عشان الأرصدة السابقة لتشغيل النظام ما تضيعش) ----------
  const generated = entries.filter((e) => e.source !== 'قيد يدوي')
  const net = (code: string): number => generated.reduce((s, e) => s + e.lines.filter((l) => l.code === code).reduce((a, l) => a + l.debit - l.credit, 0), 0)
  const minDate = generated.reduce((m, e) => (e.date < m ? e.date : m), '9999-12-31 00:00:00')
  const openDate = minDate === '9999-12-31 00:00:00' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : minDate

  const opening: LedgerLine[] = []
  for (const t of treasuries) {
    if (t.openingBalance !== 0) opening.push({ code: treasuryCode(t.id), debit: t.openingBalance > 0 ? t.openingBalance : 0, credit: t.openingBalance < 0 ? -t.openingBalance : 0 })
  }
  const custSum = Number(((await db.execute('SELECT COALESCE(SUM(balance), 0) AS s FROM customers WHERE deleted_at IS NULL')).rows[0] as any).s)
  const vendSum = Number(((await db.execute('SELECT COALESCE(SUM(balance), 0) AS s FROM vendors WHERE deleted_at IS NULL')).rows[0] as any).s)
  const stockVal = Number(
    ((await db.execute('SELECT COALESCE(SUM(s.quantity * p.cost_price), 0) AS s FROM stock s JOIN products p ON p.id = s.product_id WHERE p.deleted_at IS NULL')).rows[0] as any).s
  )
  const arGap = r2(custSum - net(AR))
  const apGap = r2(vendSum + net(AP)) // رصيد الموردين دائن: balance موجب = علينا
  const invGap = r2(stockVal - net(INVENTORY))
  if (arGap !== 0) opening.push({ code: AR, debit: arGap > 0 ? arGap : 0, credit: arGap < 0 ? -arGap : 0, memo: 'فرق أرصدة العملاء الافتتاحية' })
  if (apGap !== 0) opening.push({ code: AP, debit: apGap < 0 ? -apGap : 0, credit: apGap > 0 ? apGap : 0, memo: 'فرق أرصدة الموردين الافتتاحية' })
  if (invGap !== 0) opening.push({ code: INVENTORY, debit: invGap > 0 ? invGap : 0, credit: invGap < 0 ? -invGap : 0, memo: 'مخزون أول المدة وتسويات الجرد' })
  if (opening.length) {
    entries.push({ date: openDate, ref: 'OPEN', description: 'أرصدة أول المدة (خزائن، عملاء، موردين، مخزون)', source: 'رصيد افتتاحي', lines: balanced(opening, OPENING_EQUITY) })
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return entries
}

/* ------------------------------ القيود اليدوية ------------------------------ */

export interface ManualEntryInput {
  date: string
  description: string
  lines: { code: string; debit: number; credit: number; memo?: string }[]
}

export async function createManualEntry(input: ManualEntryInput, userId: number): Promise<number> {
  const lines = input.lines.filter((l) => (Number(l.debit) || 0) !== 0 || (Number(l.credit) || 0) !== 0)
  if (lines.length < 2) throw new Error('القيد لازم يكون فيه سطرين على الأقل')
  if (!input.description.trim()) throw new Error('اكتب بيان القيد')
  const debit = r2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0))
  const credit = r2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0))
  if (debit !== credit) throw new Error(`القيد مش متوازن: مدين ${debit} / دائن ${credit}`)
  await ensureAccounts()
  const codes = new Set(((await getDb().execute('SELECT code FROM accounts WHERE active = 1')).rows as any[]).map((r) => r.code))
  for (const l of lines) if (!codes.has(l.code)) throw new Error(`حساب غير موجود أو موقوف: ${l.code}`)
  if (lines.some((l) => (Number(l.debit) || 0) > 0 && (Number(l.credit) || 0) > 0)) throw new Error('السطر الواحد إما مدين أو دائن')

  const db = getDb()
  const tx = await db.transaction('write')
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? `${input.date} 12:00:00` : input.date
    const e = await tx.execute({ sql: 'INSERT INTO journal_entries (entry_date, description, user_id) VALUES (?, ?, ?)', args: [date, input.description.trim(), userId] })
    const id = Number(e.lastInsertRowid)
    for (const l of lines) {
      await tx.execute({
        sql: 'INSERT INTO journal_lines (entry_id, account_code, debit, credit, memo) VALUES (?, ?, ?, ?, ?)',
        args: [id, l.code, Number(l.debit) || 0, Number(l.credit) || 0, l.memo?.trim() || null]
      })
    }
    await tx.commit()
    return id
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

export async function deleteManualEntry(id: number): Promise<void> {
  await getDb().execute({ sql: "UPDATE journal_entries SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

/* ------------------------------ التقارير ------------------------------ */

const cur = (key: string, label: string): { key: string; label: string; align: 'end'; format: 'currency' } => ({ key, label, align: 'end', format: 'currency' })
const day = (ts: string): string => ts.slice(0, 10)

function inRange(date: string, from?: string, to?: string): boolean {
  const d = day(date)
  return (!from || d >= from) && (!to || d <= to)
}

async function accountMap(): Promise<Map<string, AccountRow>> {
  return new Map((await listAccounts()).map((a) => [a.code, a]))
}

export async function journalReport(from?: string, to?: string): Promise<ReportResult> {
  const accounts = await accountMap()
  const entries = (await buildLedger()).filter((e) => inRange(e.date, from, to))
  const rows: Record<string, string | number>[] = []
  let totalDebit = 0
  let totalCredit = 0
  for (const e of entries) {
    e.lines.forEach((l, i) => {
      rows.push({
        date: i === 0 ? e.date : '',
        ref: i === 0 ? e.ref : '',
        description: i === 0 ? `${e.source}: ${e.description}` : '',
        code: l.code,
        account: accounts.get(l.code)?.name ?? l.code,
        debit: l.debit,
        credit: l.credit
      })
      totalDebit += l.debit
      totalCredit += l.credit
    })
  }
  return {
    title: `دفتر اليومية ${from ?? ''} → ${to ?? ''}`,
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'ref', label: 'المرجع' },
      { key: 'description', label: 'البيان' },
      { key: 'code', label: 'كود' },
      { key: 'account', label: 'الحساب' },
      cur('debit', 'مدين'),
      cur('credit', 'دائن')
    ],
    rows,
    totals: { debit: r2(totalDebit), credit: r2(totalCredit) }
  }
}

export async function accountLedgerReport(code: string, from?: string, to?: string): Promise<ReportResult> {
  const accounts = await accountMap()
  const acc = accounts.get(code)
  const entries = await buildLedger()
  let balance = 0
  const rows: Record<string, string | number>[] = []
  let totalDebit = 0
  let totalCredit = 0
  for (const e of entries) {
    for (const l of e.lines.filter((x) => x.code === code)) {
      if (from && day(e.date) < from) {
        balance += l.debit - l.credit
        continue
      }
      if (to && day(e.date) > to) continue
      if (rows.length === 0) rows.push({ date: from ?? '', ref: '', description: 'رصيد أول المدة', debit: 0, credit: 0, balance })
      balance += l.debit - l.credit
      totalDebit += l.debit
      totalCredit += l.credit
      rows.push({ date: e.date, ref: e.ref, description: `${e.source}: ${e.description}${l.memo ? ` (${l.memo})` : ''}`, debit: l.debit, credit: l.credit, balance })
    }
  }
  if (rows.length === 0) rows.push({ date: from ?? '', ref: '', description: 'رصيد أول المدة', debit: 0, credit: 0, balance })
  return {
    title: `الأستاذ — ${acc ? `${acc.code} ${acc.name}` : code} ${from ?? ''} → ${to ?? ''}`,
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'ref', label: 'المرجع' },
      { key: 'description', label: 'البيان' },
      cur('debit', 'مدين'),
      cur('credit', 'دائن'),
      cur('balance', 'الرصيد (مدين +)')
    ],
    rows,
    totals: { debit: r2(totalDebit), credit: r2(totalCredit), balance: r2(balance) }
  }
}

export async function trialBalanceReport(from?: string, to?: string): Promise<ReportResult> {
  const accounts = await accountMap()
  const entries = await buildLedger()
  const sums = new Map<string, { od: number; oc: number; pd: number; pc: number }>()
  const bucket = (code: string): { od: number; oc: number; pd: number; pc: number } => {
    let b = sums.get(code)
    if (!b) sums.set(code, (b = { od: 0, oc: 0, pd: 0, pc: 0 }))
    return b
  }
  for (const e of entries) {
    const d = day(e.date)
    if (to && d > to) continue
    for (const l of e.lines) {
      const b = bucket(l.code)
      if (from && d < from) {
        b.od += l.debit
        b.oc += l.credit
      } else {
        b.pd += l.debit
        b.pc += l.credit
      }
    }
  }
  const rows: Record<string, string | number>[] = []
  const split = (net: number): [number, number] => (net >= 0 ? [r2(net), 0] : [0, r2(-net)])
  for (const [code, b] of [...sums.entries()].sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
    const [od, oc] = split(b.od - b.oc)
    const [cd, cc] = split(b.od - b.oc + b.pd - b.pc)
    if (od === 0 && oc === 0 && r2(b.pd) === 0 && r2(b.pc) === 0 && cd === 0 && cc === 0) continue
    rows.push({ code, account: accounts.get(code)?.name ?? code, od, oc, pd: r2(b.pd), pc: r2(b.pc), cd, cc })
  }
  const total = (k: string): number => r2(rows.reduce((s, r) => s + Number(r[k]), 0))
  return {
    title: `ميزان المراجعة ${from ?? ''} → ${to ?? ''}`,
    columns: [
      { key: 'code', label: 'كود' },
      { key: 'account', label: 'الحساب' },
      cur('od', 'رصيد أول مدين'),
      cur('oc', 'رصيد أول دائن'),
      cur('pd', 'حركة مدين'),
      cur('pc', 'حركة دائن'),
      cur('cd', 'رصيد آخر مدين'),
      cur('cc', 'رصيد آخر دائن')
    ],
    rows,
    totals: { od: total('od'), oc: total('oc'), pd: total('pd'), pc: total('pc'), cd: total('cd'), cc: total('cc') }
  }
}

async function periodNet(from?: string, to?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const e of await buildLedger()) {
    if (!inRange(e.date, from, to)) continue
    for (const l of e.lines) out.set(l.code, (out.get(l.code) ?? 0) + l.debit - l.credit)
  }
  return out
}

export async function incomeStatementReport(from?: string, to?: string): Promise<ReportResult> {
  const accounts = await accountMap()
  const net = await periodNet(from, to)
  const rows: Record<string, string | number>[] = []
  const section = (title: string): void => void rows.push({ item: title, amount: '' as any, bold: 1 })
  const sumType = (types: AccountType[], sign: 1 | -1): number => {
    let t = 0
    for (const [code, v] of net) if (types.includes(accounts.get(code)?.type as AccountType)) t += sign * v
    return r2(t)
  }
  const list = (types: AccountType[], sign: 1 | -1, only?: (code: string) => boolean): void => {
    for (const [code, v] of [...net.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const acc = accounts.get(code)
      if (!acc || !types.includes(acc.type) || (only && !only(code)) || r2(v) === 0) continue
      rows.push({ item: `   ${acc.name}`, amount: r2(sign * v) })
    }
  }
  section('الإيرادات')
  list(['revenue'], -1)
  const revenue = sumType(['revenue'], -1)
  rows.push({ item: 'صافي الإيرادات (بعد الخصومات والمرتجعات)', amount: revenue })
  section('تكلفة البضاعة المباعة')
  list(['cogs'], 1)
  const cogs = sumType(['cogs'], 1)
  rows.push({ item: 'مجمل الربح', amount: r2(revenue - cogs) })
  section('المصروفات')
  list(['expense'], 1)
  const expenses = sumType(['expense'], 1)
  rows.push({ item: 'إجمالي المصروفات', amount: expenses })
  rows.push({ item: 'صافي الربح / (الخسارة)', amount: r2(revenue - cogs - expenses) })
  return {
    title: `قائمة الدخل ${from ?? ''} → ${to ?? ''}`,
    columns: [{ key: 'item', label: 'البند' }, cur('amount', 'المبلغ')],
    rows: rows.map(({ item, amount }) => ({ item, amount }))
  }
}

export async function balanceSheetReport(to?: string): Promise<ReportResult> {
  const accounts = await accountMap()
  const net = await periodNet(undefined, to)
  const rows: Record<string, string | number>[] = []
  const block = (title: string, types: AccountType[], sign: 1 | -1): number => {
    rows.push({ item: title, amount: '' })
    let total = 0
    for (const [code, v] of [...net.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const acc = accounts.get(code)
      if (!acc || !types.includes(acc.type) || r2(v) === 0) continue
      rows.push({ item: `   ${acc.name}`, amount: r2(sign * v) })
      total += sign * v
    }
    return r2(total)
  }
  const assets = block('الأصول', ['asset'], 1)
  rows.push({ item: 'إجمالي الأصول', amount: assets })
  const liabilities = block('الخصوم', ['liability'], -1)
  rows.push({ item: 'إجمالي الخصوم', amount: liabilities })
  const equityBase = block('حقوق الملكية', ['equity'], -1)
  let profit = 0
  for (const [code, v] of net) if (['revenue', 'cogs', 'expense'].includes(accounts.get(code)?.type ?? '')) profit -= v
  profit = r2(profit)
  rows.push({ item: '   أرباح/خسائر الفترة (مرحّلة)', amount: profit })
  const equity = r2(equityBase + profit)
  rows.push({ item: 'إجمالي حقوق الملكية', amount: equity })
  rows.push({ item: 'إجمالي الخصوم وحقوق الملكية', amount: r2(liabilities + equity) })
  return {
    title: `الميزانية العمومية حتى ${to ?? 'اليوم'}`,
    columns: [{ key: 'item', label: 'البند' }, cur('amount', 'المبلغ')],
    rows,
    totals: undefined
  }
}

export async function listManualEntries(): Promise<{ id: number; date: string; description: string; debit: number }[]> {
  const rs = await getDb().execute(
    `SELECT e.id, e.entry_date, e.description, COALESCE(SUM(l.debit), 0) AS debit
     FROM journal_entries e LEFT JOIN journal_lines l ON l.entry_id = e.id WHERE e.deleted_at IS NULL GROUP BY e.id ORDER BY e.id DESC`
  )
  return (rs.rows as any[]).map((r) => ({ id: Number(r.id), date: r.entry_date, description: r.description, debit: Number(r.debit) }))
}
