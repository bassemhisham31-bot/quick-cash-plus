import { getDb } from '../db'
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
    sql: `INSERT INTO held_invoices (user_id, customer_id, customer_label, items_count, total, payload, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      input.payload.customerId,
      input.payload.customerLabel?.trim() || null,
      input.payload.lines.reduce((s, l) => s + l.qty, 0),
      input.total,
      JSON.stringify(input.payload),
      input.note?.trim() || null
    ]
  })
  return Number(rs.lastInsertRowid)
}

export async function listHeldInvoices(): Promise<HeldInvoice[]> {
  const db = getDb()
  const rs = await db.execute(
    `SELECT h.*, u.full_name AS userName FROM held_invoices h LEFT JOIN users u ON u.id = h.user_id ORDER BY h.id DESC`
  )
  return rs.rows.map(mapRow)
}

export async function getHeldInvoice(id: number): Promise<HeldInvoice | null> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT h.*, u.full_name AS userName FROM held_invoices h LEFT JOIN users u ON u.id = h.user_id WHERE h.id = ?`,
    args: [id]
  })
  return rs.rows[0] ? mapRow(rs.rows[0]) : null
}

export async function deleteHeldInvoice(id: number): Promise<void> {
  await getDb().execute({ sql: 'DELETE FROM held_invoices WHERE id = ?', args: [id] })
}
