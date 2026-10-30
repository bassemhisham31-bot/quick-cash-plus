import { getDb } from '../db'
import { assertBranchAccess, branchesEnabled, branchFilter, currentBranchId, requireBranchId } from './branchScope'
import { computeExpectedCash, recordCashDifference } from './treasuries'
import { getSessionEventTotals } from './events'
import { SALE_PAY_LINES_SQL } from './salePayments'
import type { CashSessionSummary, ExpenseMethod, PaymentMethod, ShiftListRow, ShiftSummaryReport } from '../../shared/types'

export interface CashSessionView {
  id: number
  openedAt: string
  openingBalance: number
  status: 'open' | 'closed'
  branchId: number
}

/** اليوم المفتوح للفرع الحالي. الأدمن على "كل الفروع" مالوش يوم (اليوم تابع لفرع بعينه). */
export async function getOpenSession(): Promise<CashSessionView | null> {
  const db = getDb()
  if (branchesEnabled() && currentBranchId() == null) return null
  const bf = branchFilter('branch_id')
  const rs = await db.execute({
    sql: `SELECT id, opened_at AS openedAt, opening_balance AS openingBalance, status, branch_id AS branchId
          FROM cash_sessions WHERE status = 'open' AND ${bf.sql} ORDER BY id DESC LIMIT 1`,
    args: bf.args as any
  })
  const row = rs.rows[0] as any
  if (!row) return null
  return {
    id: Number(row.id),
    openedAt: row.openedAt,
    openingBalance: Number(row.openingBalance),
    status: row.status,
    branchId: Number(row.branchId) || 1
  }
}

export async function openDay(userId: number, openingBalance: number): Promise<CashSessionView> {
  const db = getDb()
  const branchId = requireBranchId()
  const existing = await getOpenSession()
  if (existing) return existing

  await db.execute({
    sql: 'INSERT INTO cash_sessions (opened_by, opening_balance, branch_id) VALUES (?, ?, ?)',
    args: [userId, openingBalance, branchId]
  })

  const created = await getOpenSession()
  if (!created) throw new Error('تعذر بدء اليوم')
  return created
}

async function computeCashTotals(
  sessionId: number
): Promise<{ cashSales: number; cashExpenses: number; tips: number; eventPayments: number; eventCashPayments: number }> {
  const db = getDb()

  const salesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(pl.amount), 0) AS totalPaid
          FROM (${SALE_PAY_LINES_SQL}) pl JOIN sales_invoices i ON i.id = pl.invoice_id
          WHERE i.session_id = ? AND pl.method = 'cash' AND i.deleted_at IS NULL`,
    args: [sessionId]
  })
  const expensesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS totalAmount
          FROM expenses WHERE session_id = ? AND method = 'cash' AND deleted_at IS NULL`,
    args: [sessionId]
  })
  const tipsRs = await db.execute({
    sql: 'SELECT COALESCE(SUM(tip_amount), 0) AS totalTips FROM sales_invoices WHERE session_id = ? AND deleted_at IS NULL',
    args: [sessionId]
  })
  const eventCashRs = await db.execute({
    sql: "SELECT COALESCE(SUM(amount), 0) AS total FROM event_booking_payments WHERE session_id = ? AND method = 'cash'",
    args: [sessionId]
  })

  return {
    cashSales: Number((salesRs.rows[0] as any).totalPaid),
    cashExpenses: Number((expensesRs.rows[0] as any).totalAmount),
    tips: Number((tipsRs.rows[0] as any).totalTips),
    eventPayments: (await getSessionEventTotals(sessionId)).total,
    eventCashPayments: Number((eventCashRs.rows[0] as any).total)
  }
}

export async function getCurrentSessionSummary(): Promise<CashSessionSummary | null> {
  const session = await getOpenSession()
  if (!session) return null

  const { cashSales, cashExpenses, tips, eventPayments, eventCashPayments } = await computeCashTotals(session.id)

  return {
    sessionId: session.id,
    openedAt: session.openedAt,
    openingBalance: session.openingBalance,
    cashSales,
    cashExpenses,
    tips,
    eventPayments,
    eventCashPayments,
    expectedCash: await computeExpectedCash(session.openedAt, session.openingBalance, session.branchId)
  }
}

export async function closeDay(userId: number, actualCash: number): Promise<ShiftSummaryReport | null> {
  const db = getDb()
  const session = await getOpenSession()
  if (!session) return null

  const expected = await computeExpectedCash(session.openedAt, session.openingBalance, session.branchId)

  await db.execute({
    sql: `UPDATE cash_sessions
          SET status = 'closed', closed_by = ?, closed_at = datetime('now'), expected_cash = ?, actual_cash = ?
          WHERE id = ?`,
    args: [userId, expected, actualCash, session.id]
  })

  // فرق الجرد (عجز/زيادة) بيتسجّل على الخزينة الافتراضية وبيظهر في فروقات الخزينة
  await recordCashDifference(session.id, expected, actualCash, userId).catch((err) => console.error('[cash difference]', err))

  return getShiftSummaryReport(session.id)
}

/** قائمة كل الورديات (مفتوحة ومقفولة) — لسجل/تقرير الورديات، بفلتر تاريخ اختياري على وقت الفتح. */
export async function listShifts(filter: { from?: string; to?: string } = {}): Promise<ShiftListRow[]> {
  const db = getDb()
  const bf = branchFilter('cs.branch_id')
  const conditions: string[] = [bf.sql]
  const args: unknown[] = [...bf.args]
  if (filter.from) {
    conditions.push('cs.opened_at >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('cs.opened_at <= ?')
    args.push(filter.to)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rs = await db.execute({
    sql: `SELECT cs.id, cs.opened_at AS openedAt, cs.closed_at AS closedAt, cs.opening_balance AS openingBalance,
                 cs.expected_cash AS expectedCash, cs.actual_cash AS actualCash, cs.status,
                 opener.full_name AS cashierName, closer.full_name AS closedByName, COALESCE(br.name, '') AS branchName
          FROM cash_sessions cs
          LEFT JOIN branches br ON br.id = cs.branch_id
          JOIN users opener ON opener.id = cs.opened_by
          LEFT JOIN users closer ON closer.id = cs.closed_by
          ${where}
          ORDER BY cs.id DESC`,
    args
  })

  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    cashierName: r.cashierName,
    closedByName: r.closedByName ?? null,
    openedAt: r.openedAt,
    closedAt: r.closedAt ?? null,
    openingBalance: Number(r.openingBalance),
    expectedCash: r.expectedCash != null ? Number(r.expectedCash) : null,
    actualCash: r.actualCash != null ? Number(r.actualCash) : null,
    cashDifference: r.actualCash != null && r.expectedCash != null ? Number(r.actualCash) - Number(r.expectedCash) : null,
    status: r.status,
    branchName: r.branchName
  }))
}

export async function getShiftSummaryReport(sessionId: number): Promise<ShiftSummaryReport> {
  const db = getDb()

  const sessionRs = await db.execute({
    sql: `SELECT cs.opened_at AS openedAt, cs.closed_at AS closedAt, cs.opening_balance AS openingBalance,
                 cs.expected_cash AS expectedCash, cs.actual_cash AS actualCash, cs.branch_id AS branchId,
                 opener.full_name AS cashierName, closer.full_name AS closedByName
          FROM cash_sessions cs
          JOIN users opener ON opener.id = cs.opened_by
          LEFT JOIN users closer ON closer.id = cs.closed_by
          WHERE cs.id = ?`,
    args: [sessionId]
  })
  const session = sessionRs.rows[0] as any
  if (!session) throw new Error('الوردية غير موجودة')
  assertBranchAccess(session.branchId, 'الوردية')
  // المشتريات والمرتجعات مالهاش session_id، فبنحسبها بالوقت — وبنفلترها بفرع الوردية لو الفروع مفعّلة
  const brSql = branchesEnabled() ? ' AND branch_id = ?' : ''
  const brArgs = branchesEnabled() ? [Number(session.branchId) || 1] : []

  const salesRs = await db.execute({
    sql: `SELECT pl.method AS method, COUNT(DISTINCT pl.invoice_id) AS invoiceCount, COALESCE(SUM(pl.total_amount), 0) AS total
          FROM (${SALE_PAY_LINES_SQL}) pl JOIN sales_invoices i ON i.id = pl.invoice_id
          WHERE i.session_id = ? AND i.deleted_at IS NULL
          GROUP BY pl.method`,
    args: [sessionId]
  })
  const salesByMethod = salesRs.rows.map((r: any) => ({ method: r.method as PaymentMethod, total: Number(r.total) }))
  const invoiceCount = Number(
    (
      (await db.execute({ sql: 'SELECT COUNT(*) AS c FROM sales_invoices WHERE session_id = ? AND deleted_at IS NULL', args: [sessionId] })).rows[0] as any
    ).c
  )
  const totalSales = salesByMethod.reduce((s, r) => s + r.total, 0)
  const tipsRs = await db.execute({
    sql: 'SELECT COALESCE(SUM(tip_amount), 0) AS totalTips FROM sales_invoices WHERE session_id = ? AND deleted_at IS NULL',
    args: [sessionId]
  })
  const totalTips = Number((tipsRs.rows[0] as any).totalTips)
  const eventTotals = await getSessionEventTotals(sessionId)

  const itemsRs = await db.execute({
    sql: `SELECT COALESCE(SUM(si.qty), 0) AS totalQty
          FROM sales_items si JOIN sales_invoices i ON i.id = si.invoice_id
          WHERE i.session_id = ? AND i.deleted_at IS NULL`,
    args: [sessionId]
  })
  const totalItemsSold = Number((itemsRs.rows[0] as any).totalQty)

  const itemsSoldRs = await db.execute({
    sql: `SELECT si.product_name AS name, COALESCE(SUM(si.qty), 0) AS qty, COALESCE(SUM(si.total), 0) AS total
          FROM sales_items si JOIN sales_invoices i ON i.id = si.invoice_id
          WHERE i.session_id = ? AND i.deleted_at IS NULL
          GROUP BY si.product_id, si.product_name
          ORDER BY qty DESC, si.product_name`,
    args: [sessionId]
  })
  const itemsSold = itemsSoldRs.rows.map((r: any) => ({ name: String(r.name), qty: Number(r.qty), total: Number(r.total) }))

  const expensesRs = await db.execute({
    sql: `SELECT method, COALESCE(SUM(amount), 0) AS total
          FROM expenses WHERE session_id = ? AND deleted_at IS NULL
          GROUP BY method`,
    args: [sessionId]
  })
  const expensesByMethod = expensesRs.rows.map((r: any) => ({ method: r.method as ExpenseMethod, total: Number(r.total) }))
  const totalExpenses = expensesByMethod.reduce((s, r) => s + r.total, 0)

  // المشتريات مالهاش session_id في الجدول، فبنحسبها بمدى وقت الوردية (من فتحها لحد إغلاقها أو الآن لو لسه مفتوحة)
  const rangeEnd = session.closedAt ?? "datetime('now')"
  const purchasesRs = await db.execute({
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS total
          FROM purchase_invoices WHERE created_at >= ? AND created_at <= ${session.closedAt ? '?' : rangeEnd}${brSql}`,
    args: [...(session.closedAt ? [session.openedAt, session.closedAt] : [session.openedAt]), ...brArgs]
  })
  const totalPurchases = Number((purchasesRs.rows[0] as any).total)
  const purchaseInvoiceCount = Number((purchasesRs.rows[0] as any).cnt)

  // المرتجعات كمان بنفس المنطق: مرتجعات حصلت فعليًا خلال وقت الوردية، بغض النظر عن وردية الفاتورة الأصلية
  const returnsRs = await db.execute({
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
          FROM sales_returns WHERE created_at >= ? AND created_at <= ${session.closedAt ? '?' : rangeEnd}${brSql}`,
    args: [...(session.closedAt ? [session.openedAt, session.closedAt] : [session.openedAt]), ...brArgs]
  })
  const totalReturns = Number((returnsRs.rows[0] as any).total)
  const returnCount = Number((returnsRs.rows[0] as any).cnt)

  return {
    sessionId,
    openedAt: session.openedAt,
    closedAt: session.closedAt ?? null,
    cashierName: session.cashierName,
    closedByName: session.closedByName ?? null,
    openingBalance: Number(session.openingBalance),
    invoiceCount,
    totalItemsSold,
    itemsSold,
    totalSales,
    salesByMethod,
    totalTips,
    totalEventPayments: eventTotals.total,
    eventPaymentCount: eventTotals.count,
    totalExpenses,
    expensesByMethod,
    totalPurchases,
    purchaseInvoiceCount,
    totalReturns,
    returnCount,
    expectedCash: session.expectedCash != null ? Number(session.expectedCash) : null,
    actualCash: session.actualCash != null ? Number(session.actualCash) : null,
    cashDifference:
      session.actualCash != null && session.expectedCash != null
        ? Number(session.actualCash) - Number(session.expectedCash)
        : null
  }
}
