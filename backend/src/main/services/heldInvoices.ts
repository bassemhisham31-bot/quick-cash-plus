import { getDb } from '../db'
import { assertBranchAccess, branchFilter, requireBranchId } from './branchScope'
import type { HeldInvoice, HeldInvoiceInput } from '../../shared/types'

function mapRow(r: any): HeldInvoice {
  let payload: HeldInvoice['payload']
  try {
    payload = JSON.parse(r.payload)
  } catch {
    payload = { lines: [], discountType: 'value', discountValue: 0, customerId: null, customerLabel: '', warehouseId: null }
  }
  return {
    id: Number(r.id),
    userId: r.user_id != null ? Number(r.user_id) : null,
    userName: r.userName ?? null,
    customerLabel: r.customer_label ?? '',
    itemsCount: Number(r.items_count),
    total: Number(r.total),
    note: r.note ?? null,
    createdAt: r.created_at,
    payload
  }
}

export async function holdInvoice(input: HeldInvoiceInput, userId: number | null): Promise<number> {
  const db = getDb()
  const rs = await db.execute({
    sql: `INSERT INTO held_invoices (user_id, customer_id, customer_label, items_count, total, payload, note, branch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      input.payload.customerId,
      input.payload.customerLabel?.trim() || null,
      input.payload.lines.reduce((s, l) => s + l.qty, 0),
      input.total,
      JSON.stringify(input.payload),
      input.note?.trim() || null,
      requireBranchId()
    ]
  })
  return Number(rs.lastInsertRowid)
}

export async function listHeldInvoices(): Promise<HeldInvoice[]> {
  const db = getDb()
  const bf = branchFilter('h.branch_id')
  const rs = await db.execute({
    sql: `SELECT h.*, u.full_name AS userName FROM held_invoices h LEFT JOIN users u ON u.id = h.user_id WHERE ${bf.sql} ORDER BY h.id DESC`,
    args: bf.args as any
  })
  return rs.rows.map(mapRow)
}

export async function getHeldInvoice(id: number): Promise<HeldInvoice | null> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT h.*, u.full_name AS userName FROM held_invoices h LEFT JOIN users u ON u.id = h.user_id WHERE h.id = ?`,
    args: [id]
  })
  if (rs.rows[0]) assertBranchAccess((rs.rows[0] as any).branch_id, 'الفاتورة المعلّقة')
  return rs.rows[0] ? mapRow(rs.rows[0]) : null
}

export async function deleteHeldInvoice(id: number): Promise<void> {
  const row = (await getDb().execute({ sql: 'SELECT branch_id FROM held_invoices WHERE id = ?', args: [id] })).rows[0] as any
  assertBranchAccess(row?.branch_id, 'الفاتورة المعلّقة')
  await getDb().execute({ sql: 'DELETE FROM held_invoices WHERE id = ?', args: [id] })
}
