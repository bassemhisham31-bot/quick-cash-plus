import { getDb } from '../db'
import type { DeliveryOrderListRow, DeliveryStatus, DeliveryZone, DeliveryZoneInput } from '../../shared/types'

/* -------------------------------- مناطق التوصيل -------------------------------- */

export async function listDeliveryZones(includeInactive = false): Promise<DeliveryZone[]> {
  const db = getDb()
  const rs = await db.execute(
    `SELECT id, name, fee, active FROM delivery_zones
     WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND active = 1'}
     ORDER BY name`
  )
  return rs.rows.map((r: any) => ({ id: Number(r.id), name: r.name, fee: Number(r.fee), active: !!r.active }))
}

export async function upsertDeliveryZone(input: DeliveryZoneInput): Promise<DeliveryZone> {
  const db = getDb()
  if (input.id) {
    await db.execute({
      sql: 'UPDATE delivery_zones SET name = ?, fee = ?, active = ? WHERE id = ?',
      args: [input.name.trim(), input.fee, input.active ? 1 : 0, input.id]
    })
    return { id: input.id, name: input.name.trim(), fee: input.fee, active: input.active }
  }
  const info = await db.execute({
    sql: 'INSERT INTO delivery_zones (name, fee, active) VALUES (?, ?, ?)',
    args: [input.name.trim(), input.fee, input.active ? 1 : 0]
  })
  return { id: Number(info.lastInsertRowid), name: input.name.trim(), fee: input.fee, active: input.active }
}

export async function deleteDeliveryZone(id: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: "UPDATE delivery_zones SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

/* ----------------------------- طلبات التوصيل والتسوية ----------------------------- */

export async function listDeliveryOrders(filter: { from?: string; to?: string } = {}): Promise<DeliveryOrderListRow[]> {
  const db = getDb()
  const conditions = [`i.order_type = 'delivery'`, 'i.deleted_at IS NULL']
  const args: unknown[] = []
  if (filter.from) {
    conditions.push('i.created_at >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('i.created_at <= ?')
    args.push(filter.to)
  }

  const rs = await db.execute({
    sql: `SELECT i.id AS invoiceId, i.number AS invoiceNumber, c.name AS customerName, c.phone AS customerPhone,
                 ro.delivery_address AS deliveryAddress, d.id AS driverId, d.name AS driverName,
                 i.delivery_fee AS deliveryFee, i.total, i.delivery_status AS deliveryStatus, i.created_at AS createdAt
          FROM sales_invoices i
          JOIN customers c ON c.id = i.customer_id
          LEFT JOIN delivery_drivers d ON d.id = i.delivery_driver_id
          LEFT JOIN restaurant_orders ro ON ro.sales_invoice_id = i.id
          WHERE ${conditions.join(' AND ')}
          ORDER BY i.id DESC
          LIMIT 300`,
    args
  })

  return rs.rows.map((r: any) => ({
    invoiceId: Number(r.invoiceId),
    invoiceNumber: r.invoiceNumber,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? null,
    deliveryAddress: r.deliveryAddress ?? null,
    driverId: r.driverId != null ? Number(r.driverId) : null,
    driverName: r.driverName ?? null,
    deliveryFee: Number(r.deliveryFee),
    total: Number(r.total),
    deliveryStatus: r.deliveryStatus,
    createdAt: r.createdAt
  }))
}

export async function updateDeliveryStatus(invoiceId: number, status: DeliveryStatus): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE sales_invoices SET delivery_status = ? WHERE id = ?', args: [status, invoiceId] })
}

export async function reassignDeliveryDriver(invoiceId: number, driverId: number | null): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE sales_invoices SET delivery_driver_id = ? WHERE id = ?', args: [driverId, invoiceId] })
}
