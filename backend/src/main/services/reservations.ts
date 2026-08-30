import { getDb } from '../db'
import type { ReservationStatus, TableReservation, TableReservationInput } from '../../shared/types'

function mapRow(r: any): TableReservation {
  return {
    id: Number(r.id),
    tableId: r.tableId != null ? Number(r.tableId) : null,
    tableName: r.tableName ?? null,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? null,
    partySize: Number(r.partySize),
    reservationAt: r.reservationAt,
    note: r.note ?? null,
    status: r.status
  }
}

const RESERVATION_SELECT = `
  SELECT tr.id, tr.table_id AS tableId, t.name AS tableName, tr.customer_name AS customerName,
         tr.customer_phone AS customerPhone, tr.party_size AS partySize, tr.reservation_at AS reservationAt,
         tr.note, tr.status
  FROM table_reservations tr
  LEFT JOIN restaurant_tables t ON t.id = tr.table_id
`

export async function listReservations(filter: { from?: string; to?: string } = {}): Promise<TableReservation[]> {
  const db = getDb()
  const conditions: string[] = []
  const args: unknown[] = []
  if (filter.from) {
    conditions.push('tr.reservation_at >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('tr.reservation_at <= ?')
    args.push(filter.to)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rs = await db.execute({
    sql: `${RESERVATION_SELECT} ${where} ORDER BY tr.reservation_at`,
    args
  })
  return rs.rows.map(mapRow)
}

export async function createReservation(input: TableReservationInput): Promise<TableReservation> {
  const db = getDb()
  const info = await db.execute({
    sql: `INSERT INTO table_reservations (table_id, customer_name, customer_phone, party_size, reservation_at, note)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      input.tableId ?? null,
      input.customerName.trim(),
      input.customerPhone?.trim() || null,
      input.partySize,
      input.reservationAt,
      input.note?.trim() || null
    ]
  })
  const rs = await db.execute({ sql: `${RESERVATION_SELECT} WHERE tr.id = ?`, args: [Number(info.lastInsertRowid)] })
  return mapRow(rs.rows[0])
}

export async function updateReservationStatus(id: number, status: ReservationStatus): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE table_reservations SET status = ? WHERE id = ?', args: [status, id] })
}

export async function deleteReservation(id: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM table_reservations WHERE id = ?', args: [id] })
}
