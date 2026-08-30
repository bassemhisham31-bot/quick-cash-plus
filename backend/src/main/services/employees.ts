import { getDb } from '../db'
import type {
  Employee,
  EmployeeInput,
  EmployeeLedger,
  EmployeePayPeriod,
  EmployeesSummary,
  EmployeeTransactionInput,
  EmployeeTransactionType,
  EmployeeTransactionView
} from '../../shared/types'

const EMPTY_TOTALS: Record<EmployeeTransactionType, number> = {
  salary: 0,
  bonus: 0,
  advance: 0,
  deduction: 0,
  damage: 0
}

function mapEmployee(r: any): Employee {
  return {
    id: Number(r.id),
    name: r.name,
    phone: r.phone,
    role: r.role,
    baseSalary: Number(r.base_salary),
    active: !!r.active
  }
}

function mapPeriod(r: any): EmployeePayPeriod {
  return {
    id: Number(r.id),
    employeeId: Number(r.employee_id),
    status: r.status,
    startedAt: r.started_at,
    closedAt: r.closed_at,
    note: r.note
  }
}

function mapTransaction(r: any): EmployeeTransactionView {
  return {
    id: Number(r.id),
    type: r.type,
    amount: Number(r.amount),
    note: r.note,
    createdAt: r.createdAt ?? r.created_at,
    periodId: r.periodId != null ? Number(r.periodId) : r.period_id != null ? Number(r.period_id) : null,
    attachmentPath: r.attachmentPath ?? r.attachment_path ?? null,
    attachmentName: r.attachmentName ?? r.attachment_name ?? null
  }
}

export async function listEmployees(): Promise<Employee[]> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM employees WHERE deleted_at IS NULL ORDER BY name')
  return rs.rows.map(mapEmployee)
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  const db = getDb()
  const rs = await db.execute({
    sql: 'INSERT INTO employees (name, phone, role, base_salary) VALUES (?, ?, ?, ?)',
    args: [input.name.trim(), input.phone.trim() || null, input.role.trim() || null, input.baseSalary || 0]
  })
  const created = await db.execute({ sql: 'SELECT * FROM employees WHERE id = ?', args: [rs.lastInsertRowid] })
  return mapEmployee(created.rows[0])
}

export async function getCurrentPeriod(employeeId: number): Promise<EmployeePayPeriod | null> {
  const db = getDb()
  const rs = await db.execute({
    sql: "SELECT * FROM employee_pay_periods WHERE employee_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
    args: [employeeId]
  })
  return rs.rows[0] ? mapPeriod(rs.rows[0]) : null
}

async function getOrCreateCurrentPeriod(employeeId: number): Promise<EmployeePayPeriod> {
  const existing = await getCurrentPeriod(employeeId)
  if (existing) return existing
  const db = getDb()
  const rs = await db.execute({ sql: 'INSERT INTO employee_pay_periods (employee_id) VALUES (?)', args: [employeeId] })
  const created = await db.execute({ sql: 'SELECT * FROM employee_pay_periods WHERE id = ?', args: [rs.lastInsertRowid] })
  return mapPeriod(created.rows[0])
}

export async function startNewPeriod(employeeId: number, note?: string): Promise<EmployeePayPeriod> {
  const db = getDb()
  await db.execute({
    sql: "UPDATE employee_pay_periods SET status = 'closed', closed_at = datetime('now') WHERE employee_id = ? AND status = 'open'",
    args: [employeeId]
  })
  const rs = await db.execute({
    sql: 'INSERT INTO employee_pay_periods (employee_id, note) VALUES (?, ?)',
    args: [employeeId, note?.trim() || null]
  })
  const created = await db.execute({ sql: 'SELECT * FROM employee_pay_periods WHERE id = ?', args: [rs.lastInsertRowid] })
  return mapPeriod(created.rows[0])
}

export async function listPeriods(employeeId: number): Promise<EmployeePayPeriod[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: 'SELECT * FROM employee_pay_periods WHERE employee_id = ? ORDER BY id DESC',
    args: [employeeId]
  })
  return rs.rows.map(mapPeriod)
}

export async function recordEmployeeTransaction(
  input: EmployeeTransactionInput,
  userId: number
): Promise<EmployeeTransactionView> {
  if (!input.amount || input.amount <= 0) throw new Error('أدخل مبلغ صحيح')
  const db = getDb()
  const periodId = input.periodId ?? (await getOrCreateCurrentPeriod(input.employeeId)).id
  const rs = await db.execute({
    sql: `INSERT INTO employee_transactions
            (employee_id, type, amount, note, user_id, period_id, attachment_path, attachment_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.employeeId,
      input.type,
      input.amount,
      input.note || null,
      userId,
      periodId,
      input.attachmentPath || null,
      input.attachmentName || null
    ]
  })
  const created = await db.execute({
    sql: `SELECT id, type, amount, note, created_at AS createdAt, period_id AS periodId,
                 attachment_path AS attachmentPath, attachment_name AS attachmentName
          FROM employee_transactions WHERE id = ?`,
    args: [rs.lastInsertRowid]
  })
  return mapTransaction(created.rows[0])
}

export async function updateEmployeeTransaction(
  transactionId: number,
  input: { amount: number; note: string }
): Promise<EmployeeTransactionView> {
  if (!input.amount || input.amount <= 0) throw new Error('أدخل مبلغ صحيح')
  const db = getDb()
  await db.execute({
    sql: 'UPDATE employee_transactions SET amount = ?, note = ? WHERE id = ?',
    args: [input.amount, input.note || null, transactionId]
  })
  const rs = await db.execute({
    sql: `SELECT id, type, amount, note, created_at AS createdAt, period_id AS periodId,
                 attachment_path AS attachmentPath, attachment_name AS attachmentName
          FROM employee_transactions WHERE id = ?`,
    args: [transactionId]
  })
  if (!rs.rows[0]) throw new Error('الحركة غير موجودة')
  return mapTransaction(rs.rows[0])
}

export async function deleteEmployeeTransaction(transactionId: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM employee_transactions WHERE id = ?', args: [transactionId] })
}

export async function getEmployeeLedger(employeeId: number): Promise<EmployeeLedger> {
  const db = getDb()
  const employeeRs = await db.execute({ sql: 'SELECT * FROM employees WHERE id = ?', args: [employeeId] })
  const employeeRow = employeeRs.rows[0] as any
  if (!employeeRow) throw new Error('الموظف غير موجود')

  const txRs = await db.execute({
    sql: `SELECT id, type, amount, note, created_at AS createdAt, period_id AS periodId,
                 attachment_path AS attachmentPath, attachment_name AS attachmentName
          FROM employee_transactions WHERE employee_id = ? ORDER BY created_at DESC`,
    args: [employeeId]
  })

  const transactions: EmployeeTransactionView[] = txRs.rows.map(mapTransaction)

  const totals: Record<EmployeeTransactionType, number> = { ...EMPTY_TOTALS }
  for (const tx of transactions) totals[tx.type] += tx.amount

  const currentPeriod = await getCurrentPeriod(employeeId)
  const currentPeriodTotals: Record<EmployeeTransactionType, number> = { ...EMPTY_TOTALS }
  if (currentPeriod) {
    for (const tx of transactions) {
      if (tx.periodId === currentPeriod.id) currentPeriodTotals[tx.type] += tx.amount
    }
  }

  const periods = await listPeriods(employeeId)

  return { employee: mapEmployee(employeeRow), totals, currentPeriod, currentPeriodTotals, periods, transactions }
}

/** ملخص إجمالي عبر كل الموظفين — "المرتبات الأساسية لكل الفترات" بتحسب أساسي الموظف × عدد فتراته (بحد أدنى فترة واحدة
 * حتى لو لسه ما بدأش فترة رسمية)، و"المتبقي" ممكن يبقى سالب لو المدفوع فعليًا أكتر من الأساسي المتوقع. */
export async function getEmployeesSummary(): Promise<EmployeesSummary> {
  const db = getDb()
  const periodsRs = await db.execute(`
    SELECT e.id, e.base_salary AS baseSalary, COUNT(p.id) AS periodCount
    FROM employees e
    LEFT JOIN employee_pay_periods p ON p.employee_id = e.id
    WHERE e.deleted_at IS NULL
    GROUP BY e.id
  `)
  let totalBaseSalaryAllPeriods = 0
  for (const r of periodsRs.rows as any[]) {
    totalBaseSalaryAllPeriods += Number(r.baseSalary) * Math.max(1, Number(r.periodCount))
  }

  const txRs = await db.execute('SELECT type, COALESCE(SUM(amount), 0) AS total FROM employee_transactions GROUP BY type')
  const totals: Record<string, number> = {}
  for (const r of txRs.rows as any[]) totals[r.type] = Number(r.total)

  const totalPaid = (totals.salary ?? 0) + (totals.bonus ?? 0)
  const totalWithdrawalsDeductionsDamage = (totals.advance ?? 0) + (totals.deduction ?? 0) + (totals.damage ?? 0)
  const totalRemaining = totalBaseSalaryAllPeriods - totalPaid - totalWithdrawalsDeductionsDamage

  return { totalBaseSalaryAllPeriods, totalPaid, totalWithdrawalsDeductionsDamage, totalRemaining }
}
