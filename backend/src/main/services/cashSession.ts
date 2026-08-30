import { getDb } from '../db'
import type { CashSessionSummary, ExpenseMethod, PaymentMethod, ShiftListRow, ShiftSummaryReport } from '../../shared/types'

export interface CashSessionView {
  id: number
  openedAt: string
  openingBalance: number
  status: 'open' | 'closed'
}

export async function getOpenSession(): Promise<CashSessionView | null> {
  const db = getDb()
  const rs = await db.execute(
    `SELECT id, opened_at AS openedAt, opening_balance AS openingBalance, status
     FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1`
  )
  const row = rs.rows[0] as any
  if (!row) return null
  return {
    id: Number(row.id),
    openedAt: row.openedAt,
    openingBalance: Number(row.openingBalance),
    status: row.status
  }
}

export async function openDay(userId: number, openingBalance: number): Promise<CashSessionView> {
  const db = getDb()
  const existing = await getOpenSession()
  if (existing) return existing

  await db.execute({
    sql: 'INSERT INTO cash_sessions (opened_by, opening_balance) VALUES (?, ?)',
    args: [userId, openingBalance]
  })

  const created = await getOpenSession()
  if (!created) throw new Error('تعذر بدء اليوم')
  return created
}

async function computeCashTotals(sessionId: number): Promise<{ cashSales: number; cashExpenses: number }> {
  const db = getDb()

  const salesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(paid), 0) AS totalPaid
          FROM sales_invoices WHERE session_id = ? AND payment_method = 'cash' AND deleted_at IS NULL`,
    args: [sessionId]
  })
  const expensesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS totalAmount
          FROM expenses WHERE session_id = ? AND method = 'cash' AND deleted_at IS NULL`,
    args: [sessionId]
  })

  return {
    cashSales: Number((salesRs.rows[0] as any).totalPaid),
    cashExpenses: Number((expensesRs.rows[0] as any).totalAmount)
  }
}

export async function getCurrentSessionSummary(): Promise<CashSessionSummary | null> {
  const session = await getOpenSession()
  if (!session) return null

  const { cashSales, cashExpenses } = await computeCashTotals(session.id)

  return {
    sessionId: session.id,
    openedAt: session.openedAt,
    openingBalance: session.openingBalance,
    cashSales,
    cashExpenses,
    expectedCash: session.openingBalance + cashSales - cashExpenses
  }
}

export async function closeDay(userId: number, actualCash: number): Promise<ShiftSummaryReport | null> {
  const db = getDb()
  const session = await getOpenSession()
  if (!session) return null

  const { cashSales, cashExpenses } = await computeCashTotals(session.id)
  const expected = session.openingBalance + cashSales - cashExpenses

  await db.execute({
    sql: `UPDATE cash_sessions
          SET status = 'closed', closed_by = ?, closed_at = datetime('now'), expected_cash = ?, actual_cash = ?
          WHERE id = ?`,
    args: [userId, expected, actualCash, session.id]
  })

  return getShiftSummaryReport(session.id)
}

/** قائمة كل الورديات (مفتوحة ومقفولة) — لسجل/تقرير الورديات، بفلتر تاريخ اختياري على وقت الفتح. */
export async function listShifts(filter: { from?: string; to?: string } = {}): Promise<ShiftListRow[]> {
  const db = getDb()
  const conditions: string[] = []
  const args: unknown[] = []
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
                 opener.full_name AS cashierName, closer.full_name AS closedByName
          FROM cash_sessions cs
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
    status: r.status
  }))
}

export async function getShiftSummaryReport(sessionId: number): Promise<ShiftSummaryReport> {
  const db = getDb()

  const sessionRs = await db.execute({
    sql: `SELECT cs.opened_at AS openedAt, cs.closed_at AS closedAt, cs.opening_balance AS openingBalance,
                 cs.expected_cash AS expectedCash, cs.actual_cash AS actualCash,
                 opener.full_name AS cashierName, closer.full_name AS closedByName
          FROM cash_sessions cs
          JOIN users opener ON opener.id = cs.opened_by
          LEFT JOIN users closer ON closer.id = cs.closed_by
          WHERE cs.id = ?`,
    args: [sessionId]
  })
  const session = sessionRs.rows[0] as any
  if (!session) throw new Error('الوردية غير موجودة')

  const salesRs = await db.execute({
    sql: `SELECT payment_method AS method, COUNT(*) AS invoiceCount, COALESCE(SUM(total), 0) AS total
          FROM sales_invoices WHERE session_id = ? AND deleted_at IS NULL
          GROUP BY payment_method`,
    args: [sessionId]
  })
  const salesByMethod = salesRs.rows.map((r: any) => ({ method: r.method as PaymentMethod, total: Number(r.total) }))
  const invoiceCount = salesRs.rows.reduce((s, r: any) => s + Number(r.invoiceCount), 0)
  const totalSales = salesByMethod.reduce((s, r) => s + r.total, 0)

  const itemsRs = await db.execute({
    sql: `SELECT COALESCE(SUM(si.qty), 0) AS totalQty
          FROM sales_items si JOIN sales_invoices i ON i.id = si.invoice_id
          WHERE i.session_id = ? AND i.deleted_at IS NULL`,
    args: [sessionId]
  })
  const totalItemsSold = Number((itemsRs.rows[0] as any).totalQty)

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
          FROM purchase_invoices WHERE created_at >= ? AND created_at <= ${session.closedAt ? '?' : rangeEnd}`,
    args: session.closedAt ? [session.openedAt, session.closedAt] : [session.openedAt]
  })
  const totalPurchases = Number((purchasesRs.rows[0] as any).total)
  const purchaseInvoiceCount = Number((purchasesRs.rows[0] as any).cnt)

  // المرتجعات كمان بنفس المنطق: مرتجعات حصلت فعليًا خلال وقت الوردية، بغض النظر عن وردية الفاتورة الأصلية
  const returnsRs = await db.execute({
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
          FROM sales_returns WHERE created_at >= ? AND created_at <= ${session.closedAt ? '?' : rangeEnd}`,
    args: session.closedAt ? [session.openedAt, session.closedAt] : [session.openedAt]
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
    totalSales,
    salesByMethod,
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
