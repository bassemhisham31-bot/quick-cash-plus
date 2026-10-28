import { getDb } from '../db'
import { assertBranchAccess, branchesEnabled, branchFilter, currentBranchId } from './branchScope'
import { getOpenSession } from './cashSession'
import type { ExpenseCategory, ExpenseInput, ExpenseResult, ExpensesByMethodSummary, ExpenseView } from '../../shared/types'

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const db = getDb()
  const rs = await db.execute('SELECT id, name FROM expense_categories WHERE deleted_at IS NULL ORDER BY name')
  return rs.rows.map((r: any) => ({ id: Number(r.id), name: r.name }))
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  const db = getDb()
  const rs = await db.execute({ sql: 'INSERT INTO expense_categories (name) VALUES (?)', args: [name] })
  return { id: Number(rs.lastInsertRowid), name }
}

export async function listExpenses(limit = 200): Promise<ExpenseView[]> {
  const db = getDb()
  const bf = branchFilter('e.branch_id')
  const rs = await db.execute({
    sql: `SELECT e.id, e.amount, e.method, e.note, e.created_at AS createdAt,
                 e.attachment_path AS attachmentPath, e.attachment_name AS attachmentName,
                 COALESCE(c.name, 'بدون تصنيف') AS categoryName, u.full_name AS cashierName
          FROM expenses e
          LEFT JOIN expense_categories c ON c.id = e.category_id
          JOIN users u ON u.id = e.user_id
          WHERE e.deleted_at IS NULL AND ${bf.sql}
          ORDER BY e.id DESC
          LIMIT ?`,
    args: [...bf.args, limit] as any
  })
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    categoryName: r.categoryName,
    amount: Number(r.amount),
    method: r.method,
    note: r.note,
    cashierName: r.cashierName,
    createdAt: r.createdAt,
    attachmentPath: r.attachmentPath ?? null,
    attachmentName: r.attachmentName ?? null
  }))
}

export async function createExpense(input: ExpenseInput, userId: number): Promise<ExpenseResult> {
  if (!input.amount || input.amount <= 0) return { ok: false, error: 'أدخل مبلغ صحيح' }

  if (branchesEnabled() && currentBranchId() == null) return { ok: false, error: 'اختار فرع محدد من أعلى الشاشة الأول' }
  const session = await getOpenSession()
  if (!session) return { ok: false, error: 'لازم تبدأ اليوم أول قبل تسجيل مصروفات' }

  const db = getDb()
  const info = await db.execute({
    sql: `INSERT INTO expenses (category_id, session_id, amount, method, note, user_id, attachment_path, attachment_name, branch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.categoryId,
      session.id,
      input.amount,
      input.method,
      input.note || null,
      userId,
      input.attachmentPath || null,
      input.attachmentName || null,
      session.branchId
    ]
  })

  const expenses = await listExpenses(1)
  const created = expenses.find((e) => e.id === Number(info.lastInsertRowid))
  return { ok: true, expense: created }
}

export async function deleteExpense(expenseId: number): Promise<void> {
  const db = getDb()
  const row = (await db.execute({ sql: 'SELECT branch_id FROM expenses WHERE id = ?', args: [expenseId] })).rows[0] as any
  assertBranchAccess(row?.branch_id, 'المصروف')
  await db.execute({ sql: "UPDATE expenses SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL", args: [expenseId] })
}

export async function getExpensesByMethodSummary(): Promise<ExpensesByMethodSummary> {
  const db = getDb()
  const bf = branchFilter('branch_id')
  const rs = await db.execute({
    sql: `SELECT method, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE deleted_at IS NULL AND ${bf.sql} GROUP BY method`,
    args: bf.args as any
  })
  const byMethod = rs.rows.map((r: any) => ({ method: r.method, total: Number(r.total) }))
  const totalExpenses = byMethod.reduce((s, r) => s + r.total, 0)
  return { byMethod, totalExpenses }
}
