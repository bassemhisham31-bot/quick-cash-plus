import { getDb } from '../db'
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
  const rs = await db.execute({
    sql: `SELECT e.id, e.amount, e.method, e.note, e.created_at AS createdAt,
                 e.attachment_path AS attachmentPath, e.attachment_name AS attachmentName,
                 COALESCE(c.name, 'بدون تصنيف') AS categoryName, u.full_name AS cashierName
          FROM expenses e
          LEFT JOIN expense_categories c ON c.id = e.category_id
          JOIN users u ON u.id = e.user_id
          WHERE e.deleted_at IS NULL
          ORDER BY e.id DESC
          LIMIT ?`,
    args: [limit]
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

  const session = await getOpenSession()
  if (!session) return { ok: false, error: 'لازم تبدأ اليوم أول قبل تسجيل مصروفات' }

  const db = getDb()
  const info = await db.execute({
    sql: `INSERT INTO expenses (category_id, session_id, amount, method, note, user_id, attachment_path, attachment_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.categoryId,
      session.id,
      input.amount,
      input.method,
      input.note || null,
      userId,
      input.attachmentPath || null,
      input.attachmentName || null
    ]
  })

  const expenses = await listExpenses(1)
  const created = expenses.find((e) => e.id === Number(info.lastInsertRowid))
  return { ok: true, expense: created }
}

export async function getExpensesByMethodSummary(): Promise<ExpensesByMethodSummary> {
  const db = getDb()
  const rs = await db.execute(
    "SELECT method, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE deleted_at IS NULL GROUP BY method"
  )
  const byMethod = rs.rows.map((r: any) => ({ method: r.method, total: Number(r.total) }))
  const totalExpenses = byMethod.reduce((s, r) => s + r.total, 0)
  return { byMethod, totalExpenses }
}
