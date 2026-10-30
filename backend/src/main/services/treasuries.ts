import { getDb } from '../db'
import { assertBranchAccess, branchesEnabled, branchFilter, branchScope, currentBranchId, requireBranchId } from './branchScope'
import { SALE_PAY_LINES_SQL } from './salePayments'
import type {
  CashDifferenceRow,
  ReportResult,
  Treasury,
  TreasuryInput,
  TreasuryKind,
  TreasuryTransferInput,
  TreasuryTransferView,
  VoucherInput,
  VoucherView
} from '../../shared/types'

/* ------------------------------- الخزائن ------------------------------- */

interface TreasuryRow {
  id: number
  name: string
  kind: TreasuryKind
  openingBalance: number
  methods: string[]
  isDefault: boolean
  active: boolean
  branchId: number
  branchName: string
}

/** بيحمّل كل الخزائن (كل الفروع) — لأن كل حركة بتحتاج تلاقي خزينة فرعها؛ التصفية بالنطاق بتتم في الدوال اللي بتعرض للمستخدم */
export async function loadTreasuryRows(includeInactive = true): Promise<TreasuryRow[]> {
  const rs = await getDb().execute(
    `SELECT t.id, t.name, t.kind, t.opening_balance, t.methods, t.is_default, t.active, t.branch_id,
            COALESCE(b.name, 'الفرع الرئيسي') AS branchName
     FROM treasuries t LEFT JOIN branches b ON b.id = t.branch_id
     WHERE t.deleted_at IS NULL ${includeInactive ? '' : 'AND t.active = 1'} ORDER BY t.is_default DESC, t.id`
  )
  return (rs.rows as any[]).map((r) => ({
    id: Number(r.id),
    name: r.name,
    kind: r.kind,
    branchId: Number(r.branch_id) || 1,
    branchName: String(r.branchName),
    openingBalance: Number(r.opening_balance),
    methods: String(r.methods || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    isDefault: !!r.is_default,
    active: !!r.active
  }))
}

/**
 * الخزينة اللي بتستقبل حركة وسيلة دفع معيّنة (أو الخزينة المحددة صراحة، أو الافتراضية).
 * لو ميزة الفروع مفعّلة وعرفنا فرع الحركة: الاختيار من خزائن الفرع ده بس.
 */
export function resolveTreasury(
  treasuries: TreasuryRow[],
  method: string | null,
  explicitId?: number | null,
  branchId?: number | null
): number | null {
  if (explicitId && treasuries.some((t) => t.id === explicitId)) return explicitId
  const pool = branchesEnabled() && branchId != null ? treasuries.filter((t) => t.branchId === branchId) : treasuries
  const active = pool.filter((t) => t.active)
  const byMethod = method ? active.find((t) => t.methods.includes(method)) : undefined
  return (byMethod ?? active.find((t) => t.isDefault) ?? active[0])?.id ?? null
}

export interface TreasuryMovement {
  ts: string
  kind: string
  ref: string
  description: string
  inAmount: number
  outAmount: number
  treasuryId: number
}

const PAY_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  card: 'بنكي',
  wallet: 'محفظة',
  mixed: 'مختلط',
  vodafone_cash: 'فودافون كاش',
  instapay: 'InstaPay',
  transfer: 'تحويل'
}

/** كل حركات الخزائن (داخل/خارج) متجمّعة من الجداول الأصلية */
async function collectMovements(treasuries: TreasuryRow[]): Promise<TreasuryMovement[]> {
  const db = getDb()
  const out: TreasuryMovement[] = []
  const push = (m: Omit<TreasuryMovement, 'treasuryId'>, method: string | null, explicitId?: number | null, branchId?: number | null): void => {
    const treasuryId = resolveTreasury(treasuries, method, explicitId, branchId)
    if (treasuryId != null && (m.inAmount !== 0 || m.outAmount !== 0)) out.push({ ...m, treasuryId })
  }

  // مبيعات محصّلة (الآجل مالوش حركة خزينة)
  // الفاتورة المقسّمة بتطلع حركة لكل وسيلة دفع (الإكرامية مرة واحدة بس)
  const sales = await db.execute(
    `SELECT pl.invoice_id, i.number, i.created_at, pl.amount AS paid, i.total, pl.method AS payment_method, i.tip_amount, i.branch_id, c.name AS customerName
     FROM (${SALE_PAY_LINES_SQL}) pl JOIN sales_invoices i ON i.id = pl.invoice_id JOIN customers c ON c.id = i.customer_id
     WHERE i.deleted_at IS NULL AND pl.method != 'credit'`
  )
  const tipDone = new Set<number>()
  for (const r of sales.rows as any[]) {
    push(
      { ts: r.created_at, kind: 'مبيعات', ref: r.number, description: `فاتورة بيع — ${r.customerName} (${PAY_LABELS[r.payment_method] ?? r.payment_method})`, inAmount: Math.min(Number(r.paid), Number(r.total)), outAmount: 0 },
      r.payment_method,
      null,
      Number(r.branch_id)
    )
    if (Number(r.tip_amount) > 0 && !tipDone.has(Number(r.invoice_id))) {
      tipDone.add(Number(r.invoice_id))
      push(
        { ts: r.created_at, kind: 'إكرامية', ref: r.number, description: `إكرامية (تيبس) — فاتورة ${r.number}`, inAmount: Number(r.tip_amount), outAmount: 0 },
        r.payment_method,
        null,
        Number(r.branch_id)
      )
    }
  }

  // عربون/دفعات حجوزات المناسبات (والاسترداد بقيمة سالبة)
  const eventPays = await db.execute(
    `SELECT p.created_at, p.amount, p.method, p.note, b.number, b.customer_name
     FROM event_booking_payments p JOIN event_bookings b ON b.id = p.booking_id`
  )
  for (const r of eventPays.rows as any[]) {
    const amt = Number(r.amount)
    push(
      {
        ts: r.created_at,
        kind: amt >= 0 ? 'عربون حجز' : 'استرداد حجز',
        ref: r.number,
        description: `${amt >= 0 ? 'دفعة حجز' : 'استرداد حجز'} — ${r.customer_name} (${PAY_LABELS[r.method] ?? r.method})`,
        inAmount: amt > 0 ? amt : 0,
        outAmount: amt < 0 ? -amt : 0
      },
      r.method
    )
  }

  // مرتجعات المبيعات المدفوعة (غير الآجل) بتتصرف من نفس خزينة وسيلة الدفع
  const returns = await db.execute(
    `SELECT r.id, r.created_at,
            CASE WHEN i.payment_method = 'mixed' AND i.total > 0 THEN r.amount * pl.amount / i.total ELSE r.amount END AS amount,
            r.branch_id, i.number, pl.method AS payment_method
     FROM sales_returns r JOIN sales_invoices i ON i.id = r.invoice_id JOIN (${SALE_PAY_LINES_SQL}) pl ON pl.invoice_id = i.id
     WHERE pl.method != 'credit'`
  )
  for (const r of returns.rows as any[]) {
    push(
      { ts: r.created_at, kind: 'مرتجع مبيعات', ref: r.number, description: 'مرتجع على فاتورة بيع', inAmount: 0, outAmount: Number(r.amount) },
      r.payment_method,
      null,
      Number(r.branch_id)
    )
  }

  // تحصيل من عملاء / سداد لموردين
  const payments = await db.execute(
    `SELECT p.id, p.party_type, p.amount, p.method, p.treasury_id, p.branch_id, p.created_at, p.note,
            COALESCE(c.name, v.name, '') AS partyName
     FROM payments p
     LEFT JOIN customers c ON p.party_type = 'customer' AND c.id = p.party_id
     LEFT JOIN vendors v ON p.party_type = 'vendor' AND v.id = p.party_id`
  )
  for (const r of payments.rows as any[]) {
    const isCustomer = r.party_type === 'customer'
    push(
      {
        ts: r.created_at,
        kind: isCustomer ? 'تحصيل عميل' : 'سداد مورد',
        ref: `P-${r.id}`,
        description: `${isCustomer ? 'من' : 'إلى'} ${r.partyName}${r.note ? ` — ${r.note}` : ''}`,
        inAmount: isCustomer ? Number(r.amount) : 0,
        outAmount: isCustomer ? 0 : Number(r.amount)
      },
      r.method,
      r.treasury_id != null ? Number(r.treasury_id) : null,
      Number(r.branch_id)
    )
  }

  // مشتريات مدفوعة وقت الفاتورة (اللي اتدفع بعد كده بيجي من جدول المدفوعات فمش بيتكرر)
  const purchases = await db.execute(
    `SELECT pi.number, pi.created_at, pi.payment_method, pi.branch_id, v.name AS vendorName,
            pi.paid - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = pi.id AND p.party_type = 'vendor'), 0) AS paidNow
     FROM purchase_invoices pi JOIN vendors v ON v.id = pi.vendor_id
     WHERE pi.payment_method != 'credit'`
  )
  for (const r of purchases.rows as any[]) {
    push(
      { ts: r.created_at, kind: 'مشتريات', ref: r.number, description: `فاتورة شراء — ${r.vendorName}`, inAmount: 0, outAmount: Math.max(0, Number(r.paidNow)) },
      r.payment_method,
      null,
      Number(r.branch_id)
    )
  }

  // مرتجعات المشتريات المدفوعة (غير الآجل): الفلوس بترجع من المورد لنفس خزينة وسيلة دفع الفاتورة
  const purchaseReturns = await db.execute(
    `SELECT r.id, r.created_at, r.amount, r.branch_id, pi.number, pi.payment_method, v.name AS vendorName
     FROM purchase_returns r JOIN purchase_invoices pi ON pi.id = r.purchase_invoice_id LEFT JOIN vendors v ON v.id = pi.vendor_id
     WHERE pi.payment_method != 'credit'`
  )
  for (const r of purchaseReturns.rows as any[]) {
    push(
      { ts: r.created_at, kind: 'مرتجع مشتريات', ref: r.number, description: `مرتجع للمورد ${r.vendorName ?? ''}`.trim(), inAmount: Number(r.amount), outAmount: 0 },
      r.payment_method,
      null,
      Number(r.branch_id)
    )
  }

  const expenses = await db.execute(
    `SELECT e.id, e.created_at, e.amount, e.method, e.treasury_id, e.branch_id, e.note, ec.name AS categoryName
     FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id WHERE e.deleted_at IS NULL`
  )
  for (const r of expenses.rows as any[]) {
    push(
      { ts: r.created_at, kind: 'مصروف', ref: `E-${r.id}`, description: `${r.categoryName ?? 'مصروف'}${r.note ? ` — ${r.note}` : ''}`, inAmount: 0, outAmount: Number(r.amount) },
      r.method,
      r.treasury_id != null ? Number(r.treasury_id) : null,
      Number(r.branch_id)
    )
  }

  // إيرادات أخرى (سندات قبض من غير عميل) — باقي السندات بتتحسب من المدفوعات/المصروفات
  const otherReceipts = await db.execute(
    `SELECT id, created_at, amount, treasury_id, party_name, note FROM vouchers
     WHERE deleted_at IS NULL AND type = 'receipt' AND payment_id IS NULL`
  )
  for (const r of otherReceipts.rows as any[]) {
    push(
      { ts: r.created_at, kind: 'سند قبض', ref: `RV-${String(r.id).padStart(6, '0')}`, description: `${r.party_name ?? 'إيراد'}${r.note ? ` — ${r.note}` : ''}`, inAmount: Number(r.amount), outAmount: 0 },
      null,
      Number(r.treasury_id)
    )
  }

  const transfers = await db.execute(
    `SELECT t.id, t.created_at, t.amount, t.from_treasury_id, t.to_treasury_id, f.name AS fromName, tt.name AS toName
     FROM treasury_transfers t JOIN treasuries f ON f.id = t.from_treasury_id JOIN treasuries tt ON tt.id = t.to_treasury_id
     WHERE t.deleted_at IS NULL`
  )
  for (const r of transfers.rows as any[]) {
    const ref = `T-${r.id}`
    out.push({ ts: r.created_at, kind: 'تحويل', ref, description: `تحويل إلى ${r.toName}`, inAmount: 0, outAmount: Number(r.amount), treasuryId: Number(r.from_treasury_id) })
    out.push({ ts: r.created_at, kind: 'تحويل', ref, description: `تحويل من ${r.fromName}`, inAmount: Number(r.amount), outAmount: 0, treasuryId: Number(r.to_treasury_id) })
  }

  const diffs = await db.execute(`SELECT id, session_id, created_at, difference, treasury_id FROM cash_differences WHERE difference != 0`)
  for (const r of diffs.rows as any[]) {
    const diff = Number(r.difference)
    out.push({
      ts: r.created_at,
      kind: diff < 0 ? 'عجز خزينة' : 'زيادة خزينة',
      ref: `S-${r.session_id}`,
      description: `فرق جرد الوردية #${r.session_id}`,
      inAmount: diff > 0 ? diff : 0,
      outAmount: diff < 0 ? -diff : 0,
      treasuryId: Number(r.treasury_id)
    })
  }

  out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  return out
}

export async function listTreasuries(): Promise<Treasury[]> {
  const treasuries = await loadTreasuryRows()
  const movements = await collectMovements(treasuries)
  const cur = currentBranchId()
  return treasuries.filter((t) => cur == null || t.branchId === cur).map((t) => {
    const net = movements.filter((m) => m.treasuryId === t.id).reduce((s, m) => s + m.inAmount - m.outAmount, 0)
    return { ...t, balance: Math.round((t.openingBalance + net) * 100) / 100 }
  })
}

export async function createTreasury(input: TreasuryInput): Promise<void> {
  if (!input.name.trim()) throw new Error('اسم الخزينة مطلوب')
  await getDb().execute({
    sql: 'INSERT INTO treasuries (name, kind, opening_balance, methods, active, branch_id) VALUES (?, ?, ?, ?, ?, ?)',
    args: [input.name.trim(), input.kind, Number(input.openingBalance) || 0, input.methods.join(','), input.active ? 1 : 0, requireBranchId()]
  })
}

export async function updateTreasury(id: number, input: TreasuryInput): Promise<void> {
  if (!input.name.trim()) throw new Error('اسم الخزينة مطلوب')
  await getDb().execute({
    sql: 'UPDATE treasuries SET name = ?, kind = ?, opening_balance = ?, methods = ?, active = ? WHERE id = ?',
    args: [input.name.trim(), input.kind, Number(input.openingBalance) || 0, input.methods.join(','), input.active ? 1 : 0, id]
  })
}

export async function setDefaultTreasury(id: number): Promise<void> {
  const db = getDb()
  // الافتراضية لكل فرع على حدة: بنصفّر خزائن نفس فرع الخزينة دي بس
  await db.execute({ sql: 'UPDATE treasuries SET is_default = 0 WHERE branch_id = (SELECT branch_id FROM treasuries WHERE id = ?)', args: [id] })
  await db.execute({ sql: 'UPDATE treasuries SET is_default = 1, active = 1 WHERE id = ?', args: [id] })
}

export async function deleteTreasury(id: number): Promise<void> {
  const treasuries = await loadTreasuryRows()
  const t = treasuries.find((x) => x.id === id)
  if (!t) return
  if (t.isDefault) throw new Error('مينفعش تمسح الخزينة الافتراضية — اختار خزينة تانية كافتراضية الأول')
  const movements = (await collectMovements(treasuries)).filter((m) => m.treasuryId === id)
  if (movements.length) throw new Error('الخزينة عليها حركات — اقفلها (غير نشطة) بدل ما تمسحها')
  await getDb().execute({ sql: "UPDATE treasuries SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

/* ------------------------------- السندات ------------------------------- */

const voucherNumber = (type: string, id: number): string => `${type === 'receipt' ? 'RV' : 'PV'}-${String(id).padStart(6, '0')}`

export async function createVoucher(input: VoucherInput, userId: number): Promise<VoucherView> {
  const db = getDb()
  const amount = Number(input.amount)
  if (!(amount > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر')
  const treasuries = await loadTreasuryRows()
  const treasury = treasuries.find((t) => t.id === input.treasuryId)
  if (!treasury) throw new Error('الخزينة غير موجودة')
  assertBranchAccess(treasury.branchId, 'الخزينة')
  const method = treasury.methods[0] ?? (treasury.kind === 'cash' ? 'cash' : treasury.kind === 'bank' ? 'card' : 'wallet')
  const note = input.note?.trim() || null

  let partyName = input.partyName?.trim() || ''
  let paymentId: number | null = null
  let expenseId: number | null = null

  const tx = await db.transaction('write')
  try {
    if (input.type === 'receipt' && input.partyType === 'customer') {
      if (!input.partyId) throw new Error('اختار العميل')
      const c = await tx.execute({ sql: 'SELECT name FROM customers WHERE id = ?', args: [input.partyId] })
      if (!c.rows[0]) throw new Error('العميل غير موجود')
      partyName = (c.rows[0] as any).name
      const p = await tx.execute({
        sql: `INSERT INTO payments (party_type, party_id, amount, method, note, user_id, treasury_id, branch_id) VALUES ('customer', ?, ?, ?, ?, ?, ?, ?)`,
        args: [input.partyId, amount, method, note, userId, treasury.id, treasury.branchId]
      })
      paymentId = Number(p.lastInsertRowid)
      await tx.execute({ sql: 'UPDATE customers SET balance = balance - ? WHERE id = ?', args: [amount, input.partyId] })
    } else if (input.type === 'payment' && input.partyType === 'vendor') {
      if (!input.partyId) throw new Error('اختار المورد')
      const v = await tx.execute({ sql: 'SELECT name FROM vendors WHERE id = ?', args: [input.partyId] })
      if (!v.rows[0]) throw new Error('المورد غير موجود')
      partyName = (v.rows[0] as any).name
      const p = await tx.execute({
        sql: `INSERT INTO payments (party_type, party_id, amount, method, note, user_id, treasury_id, branch_id) VALUES ('vendor', ?, ?, ?, ?, ?, ?, ?)`,
        args: [input.partyId, amount, method, note, userId, treasury.id, treasury.branchId]
      })
      paymentId = Number(p.lastInsertRowid)
      await tx.execute({ sql: 'UPDATE vendors SET balance = balance - ? WHERE id = ?', args: [amount, input.partyId] })
    } else if (input.type === 'payment' && input.partyType === 'other') {
      // سند صرف "أخرى" = مصروف عادي (بيظهر في شاشة المصروفات والتقارير)
      const session = await tx.execute({
        sql: "SELECT id FROM cash_sessions WHERE status = 'open' AND branch_id = ? ORDER BY id DESC LIMIT 1",
        args: [treasury.branchId]
      })
      const e = await tx.execute({
        sql: `INSERT INTO expenses (category_id, session_id, amount, method, note, user_id, treasury_id, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          input.categoryId ?? null,
          session.rows[0] ? Number((session.rows[0] as any).id) : null,
          amount,
          treasury.kind === 'cash' ? 'cash' : treasury.kind === 'wallet' ? 'wallet' : 'card',
          [partyName, note].filter(Boolean).join(' — ') || null,
          userId,
          treasury.id,
          treasury.branchId
        ]
      })
      expenseId = Number(e.lastInsertRowid)
      if (!partyName) partyName = 'مصروف'
    } else if (input.type === 'receipt' && input.partyType === 'other') {
      if (!partyName) partyName = 'إيراد آخر'
    } else {
      throw new Error('نوع السند غير مدعوم')
    }

    const v = await tx.execute({
      sql: `INSERT INTO vouchers (type, treasury_id, amount, party_type, party_id, party_name, category_id, note, payment_id, expense_id, user_id, branch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [input.type, treasury.id, amount, input.partyType, input.partyId ?? null, partyName, input.categoryId ?? null, note, paymentId, expenseId, userId, treasury.branchId]
    })
    await tx.commit()
    const view = await getVoucher(Number(v.lastInsertRowid))
    if (!view) throw new Error('تعذر حفظ السند')
    return view
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

function mapVoucher(r: any): VoucherView {
  return {
    id: Number(r.id),
    number: voucherNumber(r.type, Number(r.id)),
    type: r.type,
    treasuryId: Number(r.treasury_id),
    treasuryName: r.treasuryName,
    amount: Number(r.amount),
    partyType: r.party_type,
    partyName: r.party_name ?? '',
    note: r.note ?? null,
    userName: r.userName ?? null,
    createdAt: r.created_at
  }
}

const VOUCHER_SELECT = `SELECT v.*, t.name AS treasuryName, u.full_name AS userName FROM vouchers v
  JOIN treasuries t ON t.id = v.treasury_id LEFT JOIN users u ON u.id = v.user_id`

export async function getVoucher(id: number): Promise<VoucherView | null> {
  const rs = await getDb().execute({ sql: `${VOUCHER_SELECT} WHERE v.id = ?`, args: [id] })
  return rs.rows[0] ? mapVoucher(rs.rows[0]) : null
}

export async function listVouchers(filter: { type?: 'receipt' | 'payment'; from?: string; to?: string } = {}): Promise<VoucherView[]> {
  const bf = branchFilter('v.branch_id')
  const conditions = ['v.deleted_at IS NULL', bf.sql]
  const args: unknown[] = [...bf.args]
  if (filter.type) {
    conditions.push('v.type = ?')
    args.push(filter.type)
  }
  if (filter.from) {
    conditions.push('v.created_at >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('v.created_at <= ?')
    args.push(filter.to)
  }
  const rs = await getDb().execute({ sql: `${VOUCHER_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY v.id DESC`, args: args as any })
  return rs.rows.map(mapVoucher)
}

/** إلغاء سند: بيرجّع أثره على رصيد العميل/المورد وبيلغي المصروف المرتبط */
export async function deleteVoucher(id: number): Promise<void> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT * FROM vouchers WHERE id = ? AND deleted_at IS NULL', args: [id] })
  const v = rs.rows[0] as any
  if (!v) return
  assertBranchAccess(v.branch_id, 'السند')
  const tx = await db.transaction('write')
  try {
    if (v.payment_id) {
      const p = await tx.execute({ sql: 'SELECT party_type, party_id, amount FROM payments WHERE id = ?', args: [v.payment_id] })
      const pay = p.rows[0] as any
      if (pay) {
        const table = pay.party_type === 'customer' ? 'customers' : 'vendors'
        await tx.execute({ sql: `UPDATE ${table} SET balance = balance + ? WHERE id = ?`, args: [Number(pay.amount), Number(pay.party_id)] })
        await tx.execute({ sql: 'DELETE FROM payments WHERE id = ?', args: [v.payment_id] })
      }
    }
    if (v.expense_id) {
      await tx.execute({ sql: "UPDATE expenses SET deleted_at = datetime('now') WHERE id = ?", args: [v.expense_id] })
    }
    await tx.execute({ sql: "UPDATE vouchers SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

/* ------------------------------- التحويلات ------------------------------- */

export async function createTransfer(input: TreasuryTransferInput, userId: number): Promise<void> {
  const amount = Number(input.amount)
  if (!(amount > 0)) throw new Error('المبلغ لازم يكون أكبر من صفر')
  if (input.fromTreasuryId === input.toTreasuryId) throw new Error('اختار خزينتين مختلفتين')
  // غير الأدمن مايحوّلش من/إلى خزينة فرع تاني
  const requester = branchScope.getStore()
  if (branchesEnabled() && requester && !requester.isAdmin) {
    const rows = await loadTreasuryRows()
    for (const id of [input.fromTreasuryId, input.toTreasuryId]) {
      if (rows.find((t) => t.id === id)?.branchId !== requester.homeBranchId) throw new Error('الخزينة دي تابعة لفرع تاني')
    }
  }
  await getDb().execute({
    sql: 'INSERT INTO treasury_transfers (from_treasury_id, to_treasury_id, amount, note, user_id) VALUES (?, ?, ?, ?, ?)',
    args: [input.fromTreasuryId, input.toTreasuryId, amount, input.note?.trim() || null, userId]
  })
}

export async function listTransfers(): Promise<TreasuryTransferView[]> {
  const cur = currentBranchId()
  const rs = await getDb().execute({
    sql: `SELECT t.id, t.amount, t.note, t.created_at, f.name AS fromName, tt.name AS toName, u.full_name AS userName
     FROM treasury_transfers t JOIN treasuries f ON f.id = t.from_treasury_id JOIN treasuries tt ON tt.id = t.to_treasury_id
     LEFT JOIN users u ON u.id = t.user_id WHERE t.deleted_at IS NULL
       ${cur == null ? '' : 'AND (f.branch_id = ? OR tt.branch_id = ?)'} ORDER BY t.id DESC`,
    args: cur == null ? [] : [cur, cur]
  })
  return (rs.rows as any[]).map((r) => ({
    id: Number(r.id),
    fromName: r.fromName,
    toName: r.toName,
    amount: Number(r.amount),
    note: r.note ?? null,
    userName: r.userName ?? null,
    createdAt: r.created_at
  }))
}

export async function deleteTransfer(id: number): Promise<void> {
  await getDb().execute({ sql: "UPDATE treasury_transfers SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

/* ------------------------------- فروقات الخزينة ------------------------------- */

/** بيتنادى عند قفل اليوم: فرق الجرد (الفعلي − المتوقع) بيتسجّل على الخزينة الافتراضية كعجز/زيادة */
export async function recordCashDifference(sessionId: number, expected: number, actual: number, userId: number): Promise<void> {
  const difference = Math.round((actual - expected) * 100) / 100
  if (difference === 0) return
  const treasuries = await loadTreasuryRows(false)
  const sessionRs = await getDb().execute({ sql: 'SELECT branch_id FROM cash_sessions WHERE id = ?', args: [sessionId] })
  const treasuryId = resolveTreasury(treasuries, 'cash', null, Number((sessionRs.rows[0] as any)?.branch_id) || 1)
  if (treasuryId == null) return
  await getDb().execute({
    sql: `INSERT OR REPLACE INTO cash_differences (session_id, treasury_id, expected, actual, difference, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [sessionId, treasuryId, expected, actual, difference, userId]
  })
}

export async function listCashDifferences(filter: { from?: string; to?: string } = {}): Promise<CashDifferenceRow[]> {
  const bf = branchFilter('t.branch_id')
  const conditions = [bf.sql]
  const args: unknown[] = [...bf.args]
  if (filter.from) {
    conditions.push('d.created_at >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('d.created_at <= ?')
    args.push(filter.to)
  }
  const rs = await getDb().execute({
    sql: `SELECT d.*, t.name AS treasuryName, u.full_name AS userName FROM cash_differences d
          JOIN treasuries t ON t.id = d.treasury_id LEFT JOIN users u ON u.id = d.user_id
          WHERE ${conditions.join(' AND ')} ORDER BY d.id DESC`,
    args: args as any
  })
  return (rs.rows as any[]).map((r) => ({
    id: Number(r.id),
    sessionId: Number(r.session_id),
    treasuryName: r.treasuryName,
    expected: Number(r.expected),
    actual: Number(r.actual),
    difference: Number(r.difference),
    userName: r.userName ?? null,
    createdAt: r.created_at
  }))
}

/**
 * الرصيد المتوقع في درج الخزينة النقدية الافتراضية لوردية: الافتتاحي + كل حركة نقدية من وقت فتح الوردية
 * (مبيعات، تحصيلات، سندات، مصروفات، مدفوعات موردين، مشتريات، مرتجعات، تحويلات) — مش بس المبيعات والمصروفات.
 */
export async function computeExpectedCash(openedAt: string, openingBalance: number, branchId?: number | null): Promise<number> {
  const treasuries = await loadTreasuryRows(false)
  const cashId = resolveTreasury(treasuries, 'cash', null, branchId)
  const movements = await collectMovements(treasuries)
  const net = movements
    .filter((m) => m.treasuryId === cashId && m.ts >= openedAt && !m.kind.includes('خزينة'))
    .reduce((s, m) => s + m.inAmount - m.outAmount, 0)
  return Math.round((openingBalance + net) * 100) / 100
}

/* ------------------------------- كشف حركة خزينة ------------------------------- */

/** كشف حساب خزينة (أو كل الخزائن لو treasuryId فاضي) في فترة، برصيد افتتاحي ورصيد متحرك */
export async function getTreasuryStatement(treasuryId: number | null, from?: string, to?: string): Promise<ReportResult> {
  const treasuries = await loadTreasuryRows()
  const cur = currentBranchId()
  const inScope = treasuries.filter((t) => cur == null || t.branchId === cur)
  const scopeIds = new Set(inScope.map((t) => t.id))
  if (treasuryId != null) assertBranchAccess(treasuries.find((t) => t.id === treasuryId)?.branchId, 'الخزينة')
  const movements = (await collectMovements(treasuries)).filter((m) => (treasuryId == null ? scopeIds.has(m.treasuryId) : m.treasuryId === treasuryId))
  const scope = treasuryId == null ? inScope : treasuries.filter((t) => t.id === treasuryId)
  const names = new Map(treasuries.map((t) => [t.id, t.name]))
  const fromTs = from ? `${from} 00:00:00` : null
  const toTs = to ? `${to} 23:59:59` : null

  const openingBase = scope.reduce((s, t) => s + t.openingBalance, 0)
  const before = fromTs ? movements.filter((m) => m.ts < fromTs) : []
  let balance = openingBase + before.reduce((s, m) => s + m.inAmount - m.outAmount, 0)
  const inRange = movements.filter((m) => (!fromTs || m.ts >= fromTs) && (!toTs || m.ts <= toTs))

  const rows: Record<string, string | number>[] = [
    { date: from ?? '', kind: 'رصيد أول المدة', ref: '', treasury: '', description: '', inAmount: 0, outAmount: 0, balance }
  ]
  let totalIn = 0
  let totalOut = 0
  for (const m of inRange) {
    balance += m.inAmount - m.outAmount
    totalIn += m.inAmount
    totalOut += m.outAmount
    rows.push({
      date: m.ts,
      kind: m.kind,
      ref: m.ref,
      treasury: names.get(m.treasuryId) ?? '',
      description: m.description,
      inAmount: m.inAmount,
      outAmount: m.outAmount,
      balance
    })
  }
  return {
    title: `كشف حركة ${treasuryId == null ? 'كل الخزائن' : (names.get(treasuryId) ?? 'الخزينة')} ${from ?? ''} → ${to ?? ''}`.trim(),
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'kind', label: 'النوع' },
      { key: 'ref', label: 'المرجع' },
      { key: 'treasury', label: 'الخزينة' },
      { key: 'description', label: 'البيان' },
      { key: 'inAmount', label: 'وارد', align: 'end', format: 'currency' },
      { key: 'outAmount', label: 'منصرف', align: 'end', format: 'currency' },
      { key: 'balance', label: 'الرصيد', align: 'end', format: 'currency' }
    ],
    rows,
    totals: { inAmount: totalIn, outAmount: totalOut, balance }
  }
}
