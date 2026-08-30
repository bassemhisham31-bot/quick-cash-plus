import { getDb } from '../db'
import type { SalesRep, SalesRepInput } from '../../shared/types'

function mapRow(r: any): SalesRep {
  return {
    id: Number(r.id),
    name: r.name,
    phone: r.phone,
    commissionPercent: Number(r.commission_percent),
    active: !!r.active,
    createdAt: r.created_at
  }
}

export async function listSalesReps(includeInactive = true): Promise<SalesRep[]> {
  const db = getDb()
  const rs = await db.execute(
    `SELECT * FROM sales_reps WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND active = 1'} ORDER BY name`
  )
  return rs.rows.map(mapRow)
}

export async function createSalesRep(input: SalesRepInput): Promise<SalesRep> {
  const db = getDb()
  const rs = await db.execute({
    sql: `INSERT INTO sales_reps (name, phone, commission_percent) VALUES (?, ?, ?)`,
    args: [input.name.trim(), input.phone.trim() || null, input.commissionPercent || 0]
  })
  const created = await db.execute({ sql: 'SELECT * FROM sales_reps WHERE id = ?', args: [rs.lastInsertRowid] })
  return mapRow(created.rows[0])
}

export async function updateSalesRep(id: number, input: SalesRepInput): Promise<SalesRep> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE sales_reps SET name = ?, phone = ?, commission_percent = ? WHERE id = ?`,
    args: [input.name.trim(), input.phone.trim() || null, input.commissionPercent || 0, id]
  })
  const rs = await db.execute({ sql: 'SELECT * FROM sales_reps WHERE id = ?', args: [id] })
  if (!rs.rows[0]) throw new Error('المندوب غير موجود')
  return mapRow(rs.rows[0])
}

export async function setSalesRepActive(id: number, active: boolean): Promise<SalesRep> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE sales_reps SET active = ? WHERE id = ?', args: [active ? 1 : 0, id] })
  const rs = await db.execute({ sql: 'SELECT * FROM sales_reps WHERE id = ?', args: [id] })
  if (!rs.rows[0]) throw new Error('المندوب غير موجود')
  return mapRow(rs.rows[0])
}
