import { getDb } from '../db'
import { checkout } from './pos'
import { getCategoryPrinters, getPrintSettings, getRestaurantSettings } from './settings'
import { printKitchenTicket } from './print'
import type {
  CartLine,
  CloseRestaurantOrderInput,
  CheckoutResult,
  OpenRestaurantOrderInput,
  RestaurantOrderItemInput,
  RestaurantOrderListItem,
  RestaurantOrderResult,
  RestaurantOrderType,
  RestaurantOrderView,
  RestaurantTable
} from '../../shared/types'

const NUMBER_PREFIX: Record<RestaurantOrderType, string> = {
  dine_in: 'DI',
  takeaway: 'TA',
  delivery: 'DL'
}

/* ------------------------------- الترابيزات ------------------------------- */

export async function listTables(): Promise<RestaurantTable[]> {
  const db = getDb()
  const rs = await db.execute(
    `SELECT id, name, zone, pos_x AS posX, pos_y AS posY, seats, status, current_order_id AS currentOrderId
     FROM restaurant_tables WHERE deleted_at IS NULL ORDER BY id`
  )
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    name: r.name,
    zone: r.zone ?? null,
    posX: Number(r.posX),
    posY: Number(r.posY),
    seats: Number(r.seats),
    status: r.status,
    currentOrderId: r.currentOrderId != null ? Number(r.currentOrderId) : null
  }))
}

export async function upsertTable(input: {
  id?: number
  name: string
  zone: string
  seats: number
  posX: number
  posY: number
}): Promise<RestaurantTable> {
  const db = getDb()
  if (input.id) {
    await db.execute({
      sql: 'UPDATE restaurant_tables SET name = ?, zone = ?, seats = ?, pos_x = ?, pos_y = ? WHERE id = ?',
      args: [input.name.trim(), input.zone.trim() || null, input.seats, input.posX, input.posY, input.id]
    })
    return { id: input.id, name: input.name.trim(), zone: input.zone.trim() || null, posX: input.posX, posY: input.posY, seats: input.seats, status: 'available', currentOrderId: null }
  }
  const info = await db.execute({
    sql: 'INSERT INTO restaurant_tables (name, zone, seats, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)',
    args: [input.name.trim(), input.zone.trim() || null, input.seats, input.posX, input.posY]
  })
  const id = Number(info.lastInsertRowid)
  return { id, name: input.name.trim(), zone: input.zone.trim() || null, posX: input.posX, posY: input.posY, seats: input.seats, status: 'available', currentOrderId: null }
}

export async function deleteTable(id: number): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT status FROM restaurant_tables WHERE id = ?', args: [id] })
  if ((rs.rows[0] as any)?.status === 'occupied') return { ok: false, error: 'الترابيزة مشغولة حاليًا' }
  await db.execute({ sql: "UPDATE restaurant_tables SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
  return { ok: true }
}

/** يدمج مجموعة ترابيزات تحت نفس الطلب المفتوح — لازم كل ترابيزة تكون متاحة أو من غير طلب مفتوح مختلف. */
export async function mergeTables(orderId: number, tableIds: number[]): Promise<RestaurantOrderResult> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    for (const tableId of tableIds) {
      const rs = await tx.execute({ sql: 'SELECT status, current_order_id FROM restaurant_tables WHERE id = ?', args: [tableId] })
      const table = rs.rows[0] as any
      if (!table) throw new Error('ترابيزة غير موجودة')
      if (table.status === 'occupied' && Number(table.current_order_id) !== orderId) {
        throw new Error('في ترابيزة مشغولة بطلب تاني، لازم تنقل أو تقفل طلبها الأول')
      }
      await tx.execute({
        sql: `INSERT INTO restaurant_order_tables (order_id, table_id) VALUES (?, ?)
              ON CONFLICT(order_id, table_id) DO NOTHING`,
        args: [orderId, tableId]
      })
      await tx.execute({
        sql: "UPDATE restaurant_tables SET status = 'occupied', current_order_id = ? WHERE id = ?",
        args: [orderId, tableId]
      })
    }
    await tx.commit()
    return { ok: true, orderId }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'تعذر دمج الترابيزات' }
  }
}

/** ينقل الطلب بالكامل لترابيزة تانية، وبيفرّغ كل الترابيزات القديمة المرتبطة بيه (بما فيها المدموجة). */
export async function transferTable(orderId: number, newTableId: number): Promise<RestaurantOrderResult> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    const newTableRs = await tx.execute({ sql: 'SELECT status FROM restaurant_tables WHERE id = ?', args: [newTableId] })
    if ((newTableRs.rows[0] as any)?.status === 'occupied') throw new Error('الترابيزة الجديدة مشغولة')

    const oldRs = await tx.execute({ sql: 'SELECT table_id FROM restaurant_order_tables WHERE order_id = ?', args: [orderId] })
    for (const row of oldRs.rows as any[]) {
      await tx.execute({
        sql: "UPDATE restaurant_tables SET status = 'available', current_order_id = NULL WHERE id = ?",
        args: [Number(row.table_id)]
      })
    }
    await tx.execute({ sql: 'DELETE FROM restaurant_order_tables WHERE order_id = ?', args: [orderId] })
    await tx.execute({ sql: 'INSERT INTO restaurant_order_tables (order_id, table_id) VALUES (?, ?)', args: [orderId, newTableId] })
    await tx.execute({
      sql: "UPDATE restaurant_tables SET status = 'occupied', current_order_id = ? WHERE id = ?",
      args: [orderId, newTableId]
    })
    await tx.execute({ sql: 'UPDATE restaurant_orders SET table_id = ? WHERE id = ?', args: [newTableId, orderId] })

    await tx.commit()
    return { ok: true, orderId }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'تعذر نقل الترابيزة' }
  }
}

/* --------------------------------- الطلبات --------------------------------- */

export async function openOrder(input: OpenRestaurantOrderInput, userId: number): Promise<RestaurantOrderResult> {
  const db = getDb()
  if (input.orderType === 'dine_in' && !(input.tableIds && input.tableIds.length)) {
    return { ok: false, error: 'اختار ترابيزة واحدة على الأقل لطلب الصالة' }
  }

  const tx = await db.transaction('write')
  try {
    const info = await tx.execute({
      sql: `INSERT INTO restaurant_orders
              (number, order_type, table_id, customer_id, delivery_address, delivery_driver_id, captain_id, user_id)
            VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.orderType,
        input.tableIds?.[0] ?? null,
        input.customerId ?? null,
        input.deliveryAddress ?? null,
        input.deliveryDriverId ?? null,
        input.captainId ?? null,
        userId
      ]
    })
    const orderId = Number(info.lastInsertRowid)
    const number = `${NUMBER_PREFIX[input.orderType]}-${String(orderId).padStart(6, '0')}`
    await tx.execute({ sql: 'UPDATE restaurant_orders SET number = ? WHERE id = ?', args: [number, orderId] })

    if (input.orderType === 'dine_in' && input.tableIds) {
      for (const tableId of input.tableIds) {
        const tRs = await tx.execute({ sql: 'SELECT status FROM restaurant_tables WHERE id = ?', args: [tableId] })
        if ((tRs.rows[0] as any)?.status === 'occupied') throw new Error('في ترابيزة مختارة مشغولة بالفعل')
        await tx.execute({ sql: 'INSERT INTO restaurant_order_tables (order_id, table_id) VALUES (?, ?)', args: [orderId, tableId] })
        await tx.execute({
          sql: "UPDATE restaurant_tables SET status = 'occupied', current_order_id = ? WHERE id = ?",
          args: [orderId, tableId]
        })
      }
    }

    await tx.commit()
    return { ok: true, orderId, number }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'تعذر فتح الطلب' }
  }
}

export async function addItemsToOrder(orderId: number, items: RestaurantOrderItemInput[]): Promise<RestaurantOrderResult> {
  const db = getDb()
  const orderRs = await db.execute({ sql: "SELECT status FROM restaurant_orders WHERE id = ?", args: [orderId] })
  const order = orderRs.rows[0] as any
  if (!order) return { ok: false, error: 'الطلب غير موجود' }
  if (order.status !== 'open') return { ok: false, error: 'الطلب مقفول بالفعل' }

  for (const item of items) {
    await db.execute({
      sql: `INSERT INTO restaurant_order_items (order_id, product_id, product_name, qty, unit_price, note, split_group)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [orderId, item.productId, item.name, item.qty, item.unitPrice, item.note?.trim() || null, item.splitGroup ?? 1]
    })
  }
  return { ok: true, orderId }
}

export async function updateOrderMeta(
  orderId: number,
  patch: {
    customerId?: number | null
    deliveryDriverId?: number | null
    deliveryAddress?: string
    deliveryFee?: number
    specialMark?: string
    guestCount?: number | null
    orderNote?: string
    captainId?: number | null
  }
): Promise<void> {
  const db = getDb()
  if (patch.customerId !== undefined) {
    await db.execute({ sql: 'UPDATE restaurant_orders SET customer_id = ? WHERE id = ?', args: [patch.customerId, orderId] })
  }
  if (patch.deliveryDriverId !== undefined) {
    await db.execute({ sql: 'UPDATE restaurant_orders SET delivery_driver_id = ? WHERE id = ?', args: [patch.deliveryDriverId, orderId] })
  }
  if (patch.deliveryAddress !== undefined) {
    await db.execute({
      sql: 'UPDATE restaurant_orders SET delivery_address = ? WHERE id = ?',
      args: [patch.deliveryAddress.trim() || null, orderId]
    })
  }
  if (patch.deliveryFee !== undefined) {
    await db.execute({
      sql: 'UPDATE restaurant_orders SET delivery_fee = ? WHERE id = ?',
      args: [Number(patch.deliveryFee) || 0, orderId]
    })
  }
  if (patch.specialMark !== undefined) {
    await db.execute({
      sql: 'UPDATE restaurant_orders SET special_mark = ? WHERE id = ?',
      args: [patch.specialMark.trim() || null, orderId]
    })
  }
  if (patch.guestCount !== undefined) {
    await db.execute({ sql: 'UPDATE restaurant_orders SET guest_count = ? WHERE id = ?', args: [patch.guestCount, orderId] })
  }
  if (patch.orderNote !== undefined) {
    await db.execute({
      sql: 'UPDATE restaurant_orders SET order_note = ? WHERE id = ?',
      args: [patch.orderNote.trim() || null, orderId]
    })
  }
  if (patch.captainId !== undefined) {
    await db.execute({ sql: 'UPDATE restaurant_orders SET captain_id = ? WHERE id = ?', args: [patch.captainId, orderId] })
  }
}

export async function updateOrderItem(
  itemId: number,
  patch: { qty?: number; note?: string; splitGroup?: number }
): Promise<void> {
  const db = getDb()
  if (patch.qty !== undefined) {
    await db.execute({ sql: 'UPDATE restaurant_order_items SET qty = ? WHERE id = ?', args: [patch.qty, itemId] })
  }
  if (patch.note !== undefined) {
    await db.execute({ sql: 'UPDATE restaurant_order_items SET note = ? WHERE id = ?', args: [patch.note.trim() || null, itemId] })
  }
  if (patch.splitGroup !== undefined) {
    await db.execute({ sql: 'UPDATE restaurant_order_items SET split_group = ? WHERE id = ?', args: [patch.splitGroup, itemId] })
  }
}

export async function removeOrderItem(itemId: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM restaurant_order_items WHERE id = ?', args: [itemId] })
}

/** بيبعت للمطبخ الأصناف الجديدة بس (اللي لسه ما اتبعتتش)، مقسّمة على الطابعة المرتبطة بتصنيف كل صنف. */
export async function sendToKitchen(orderId: number): Promise<{ ok: boolean; printedCount: number; error?: string }> {
  const db = getDb()
  const orderRs = await db.execute({
    sql: `SELECT ro.number, ro.order_type, ro.kitchen_status, ro.delivery_address AS deliveryAddress,
                 c.name AS customerName, c.phone AS customerPhone, d.name AS driverName, cap.name AS captainName
          FROM restaurant_orders ro
          LEFT JOIN customers c ON c.id = ro.customer_id
          LEFT JOIN delivery_drivers d ON d.id = ro.delivery_driver_id
          LEFT JOIN captains cap ON cap.id = ro.captain_id
          WHERE ro.id = ?`,
    args: [orderId]
  })
  const order = orderRs.rows[0] as any
  if (!order) return { ok: false, printedCount: 0, error: 'الطلب غير موجود' }

  const itemsRs = await db.execute({
    sql: `SELECT roi.id, roi.product_name, roi.qty, roi.note, p.category_id AS categoryId
          FROM restaurant_order_items roi
          LEFT JOIN products p ON p.id = roi.product_id
          WHERE roi.order_id = ? AND roi.kitchen_sent = 0`,
    args: [orderId]
  })
  const items = itemsRs.rows as any[]
  if (!items.length) return { ok: true, printedCount: 0 }

  const [categoryPrinters, restaurantSettings, printSettings] = await Promise.all([
    getCategoryPrinters(),
    getRestaurantSettings(),
    getPrintSettings()
  ])
  const printerByCategory = new Map(categoryPrinters.map((cp) => [cp.categoryId, cp.printerName]))
  const fallbackPrinter = restaurantSettings.defaultKitchenPrinter || printSettings.defaultPrinter || null

  const groups = new Map<string, { name: string; qty: number; note: string | null }[]>()
  for (const item of items) {
    const printerName = (item.categoryId != null ? printerByCategory.get(Number(item.categoryId)) : null) ?? fallbackPrinter
    const key = printerName ?? '__none__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ name: item.product_name, qty: Number(item.qty), note: item.note ?? null })
  }

  const tableRs = await db.execute({
    sql: `SELECT t.name FROM restaurant_order_tables ot JOIN restaurant_tables t ON t.id = ot.table_id WHERE ot.order_id = ?`,
    args: [orderId]
  })
  const tableLabel = (tableRs.rows as any[]).map((r) => r.name).join(' + ') || null

  const meta = {
    orderNumber: order.number,
    orderType: order.order_type,
    tableLabel,
    customerName: order.customerName ?? null,
    customerPhone: order.customerPhone ?? null,
    driverName: order.driverName ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    captainName: order.captainName ?? null
  }

  for (const [printerKey, groupItems] of groups) {
    await printKitchenTicket(meta, printerKey === '__none__' ? null : printerKey, groupItems)
  }

  const ids = items.map((i) => Number(i.id))
  await db.execute({
    sql: `UPDATE restaurant_order_items SET kitchen_sent = 1, kitchen_sent_at = datetime('now')
          WHERE id IN (${ids.map(() => '?').join(',')})`,
    args: ids
  })
  if (order.kitchen_status === 'pending') {
    await db.execute({ sql: "UPDATE restaurant_orders SET kitchen_status = 'preparing' WHERE id = ?", args: [orderId] })
  }

  return { ok: true, printedCount: items.length }
}

export async function setKitchenStatus(orderId: number, status: string): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE restaurant_orders SET kitchen_status = ? WHERE id = ?', args: [status, orderId] })
}

export async function listOpenOrders(): Promise<RestaurantOrderListItem[]> {
  const db = getDb()
  const rs = await db.execute(`
    SELECT ro.id, ro.number, ro.order_type AS orderType, ro.status, ro.kitchen_status AS kitchenStatus, ro.created_at AS createdAt,
           (SELECT COUNT(*) FROM restaurant_order_items WHERE order_id = ro.id) AS itemsCount,
           (SELECT COALESCE(SUM(qty * unit_price), 0) FROM restaurant_order_items WHERE order_id = ro.id) AS total
    FROM restaurant_orders ro
    WHERE ro.status = 'open'
    ORDER BY ro.id DESC`)

  const orders = rs.rows as any[]
  const result: RestaurantOrderListItem[] = []
  for (const o of orders) {
    const tableRs = await db.execute({
      sql: `SELECT t.name FROM restaurant_order_tables ot JOIN restaurant_tables t ON t.id = ot.table_id WHERE ot.order_id = ?`,
      args: [o.id]
    })
    result.push({
      id: Number(o.id),
      number: o.number,
      orderType: o.orderType,
      status: o.status,
      kitchenStatus: o.kitchenStatus,
      tableNames: (tableRs.rows as any[]).map((r) => r.name),
      itemsCount: Number(o.itemsCount),
      total: Number(o.total),
      createdAt: o.createdAt
    })
  }
  return result
}

export async function getOrderView(orderId: number): Promise<RestaurantOrderView | null> {
  const db = getDb()
  const headRs = await db.execute({
    sql: `SELECT id, number, order_type AS orderType, status, kitchen_status AS kitchenStatus, customer_id AS customerId,
                 delivery_address AS deliveryAddress, delivery_driver_id AS deliveryDriverId, delivery_fee AS deliveryFee,
                 special_mark AS specialMark, guest_count AS guestCount, order_note AS orderNote,
                 captain_id AS captainId, created_at AS createdAt
          FROM restaurant_orders WHERE id = ?`,
    args: [orderId]
  })
  const head = headRs.rows[0] as any
  if (!head) return null

  const tablesRs = await db.execute({
    sql: `SELECT t.id, t.name FROM restaurant_order_tables ot JOIN restaurant_tables t ON t.id = ot.table_id WHERE ot.order_id = ?`,
    args: [orderId]
  })

  const itemsRs = await db.execute({
    sql: `SELECT id, product_id AS productId, product_name AS productName, qty, unit_price AS unitPrice, note,
                 split_group AS splitGroup, kitchen_sent AS kitchenSent
          FROM restaurant_order_items WHERE order_id = ?`,
    args: [orderId]
  })

  return {
    id: Number(head.id),
    number: head.number,
    orderType: head.orderType,
    status: head.status,
    kitchenStatus: head.kitchenStatus,
    tableIds: (tablesRs.rows as any[]).map((r) => Number(r.id)),
    tableNames: (tablesRs.rows as any[]).map((r) => r.name),
    customerId: head.customerId != null ? Number(head.customerId) : null,
    deliveryAddress: head.deliveryAddress ?? null,
    deliveryDriverId: head.deliveryDriverId != null ? Number(head.deliveryDriverId) : null,
    deliveryFee: Number(head.deliveryFee),
    specialMark: head.specialMark ?? null,
    guestCount: head.guestCount != null ? Number(head.guestCount) : null,
    orderNote: head.orderNote ?? null,
    captainId: head.captainId != null ? Number(head.captainId) : null,
    items: (itemsRs.rows as any[]).map((r) => ({
      id: Number(r.id),
      productId: Number(r.productId),
      productName: r.productName,
      qty: Number(r.qty),
      unitPrice: Number(r.unitPrice),
      note: r.note ?? null,
      splitGroup: Number(r.splitGroup),
      kitchenSent: !!r.kitchenSent
    })),
    createdAt: head.createdAt
  }
}

export async function cancelOrder(orderId: number): Promise<RestaurantOrderResult> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    const tablesRs = await tx.execute({ sql: 'SELECT table_id FROM restaurant_order_tables WHERE order_id = ?', args: [orderId] })
    for (const row of tablesRs.rows as any[]) {
      await tx.execute({
        sql: "UPDATE restaurant_tables SET status = 'available', current_order_id = NULL WHERE id = ?",
        args: [Number(row.table_id)]
      })
    }
    await tx.execute({ sql: 'DELETE FROM restaurant_order_tables WHERE order_id = ?', args: [orderId] })
    await tx.execute({ sql: "UPDATE restaurant_orders SET status = 'cancelled', closed_at = datetime('now') WHERE id = ?", args: [orderId] })
    await tx.commit()
    return { ok: true, orderId }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'تعذر إلغاء الطلب' }
  }
}

/**
 * يقفل الطلب (أو مجموعة تقسيم فاتورة منه) ويدفعه — بينادي checkout() الأصلية بنفس منطق الخصم/الضريبة/
 * الولاء/خصم المخزون الموجود، عشان فاتورة البيع النهائية تتسجل بنفس الطريقة العادية. لو فيه مجموعات
 * تقسيم تانية لسه مفتوحة، الطلب فضل "open" وبس الأصناف المدفوعة بتتشال. رسوم التوصيل وضريبة الخدمة
 * بتتحسب مرة واحدة بس عند تسوية آخر مجموعة (عشان ما تتكررش لو الفاتورة اتقسمت).
 */
export async function closeOrder(input: CloseRestaurantOrderInput, userId: number): Promise<CheckoutResult> {
  const db = getDb()
  const orderRs = await db.execute({
    sql: `SELECT id, number, order_type AS orderType, status, table_id AS tableId, delivery_fee AS deliveryFee,
                 delivery_driver_id AS deliveryDriverId, captain_id AS captainId
          FROM restaurant_orders WHERE id = ?`,
    args: [input.orderId]
  })
  const order = orderRs.rows[0] as any
  if (!order) return { ok: false, error: 'الطلب غير موجود' }
  if (order.status !== 'open') return { ok: false, error: 'الطلب مقفول بالفعل' }

  const groupFilter = input.splitGroup !== undefined ? 'AND roi.split_group = ?' : ''
  const groupArgs = input.splitGroup !== undefined ? [input.splitGroup] : []

  const itemsRs = await db.execute({
    sql: `SELECT roi.id, roi.product_id AS productId, roi.product_name AS productName, roi.qty, roi.unit_price AS unitPrice, roi.note, p.barcode
          FROM restaurant_order_items roi LEFT JOIN products p ON p.id = roi.product_id
          WHERE roi.order_id = ? ${groupFilter}`,
    args: [input.orderId, ...groupArgs]
  })
  const items = itemsRs.rows as any[]
  if (!items.length) return { ok: false, error: 'لا توجد أصناف لقفلها' }

  const remainingRs = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM restaurant_order_items WHERE order_id = ? AND id NOT IN (${items.map(() => '?').join(',')})`,
    args: [input.orderId, ...items.map((i) => Number(i.id))]
  })
  const isFinalSettlement = Number((remainingRs.rows[0] as any).c) === 0

  const lines: CartLine[] = items.map((i) => ({
    productId: Number(i.productId),
    name: i.productName,
    barcode: i.barcode ?? '',
    unitPrice: Number(i.unitPrice),
    qty: Number(i.qty),
    discount: 0,
    note: i.note ?? null
  }))

  const restaurantSettings = await getRestaurantSettings()
  const applyServiceCharge = isFinalSettlement && restaurantSettings.serviceChargeEnabled && order.orderType === 'dine_in'

  const result = await checkout(
    {
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      lines,
      discountType: input.discountType,
      discountValue: input.discountValue,
      paymentMethod: input.paymentMethod,
      paid: input.paid,
      redeemPoints: 0,
      orderType: order.orderType,
      tableId: order.tableId ?? null,
      deliveryFee: isFinalSettlement ? Number(order.deliveryFee) : 0,
      deliveryDriverId: order.deliveryDriverId != null ? Number(order.deliveryDriverId) : null,
      captainId: order.captainId != null ? Number(order.captainId) : null,
      serviceChargeType: applyServiceCharge ? restaurantSettings.serviceChargeType : undefined,
      serviceChargeValue: applyServiceCharge ? restaurantSettings.serviceChargeValue : undefined
    },
    userId
  )
  if (!result.ok) return result

  const ids = items.map((i) => Number(i.id))
  await db.execute({
    sql: `DELETE FROM restaurant_order_items WHERE id IN (${ids.map(() => '?').join(',')})`,
    args: ids
  })

  if (isFinalSettlement) {
    const tx = await db.transaction('write')
    try {
      const tablesRs = await tx.execute({ sql: 'SELECT table_id FROM restaurant_order_tables WHERE order_id = ?', args: [input.orderId] })
      for (const row of tablesRs.rows as any[]) {
        await tx.execute({
          sql: "UPDATE restaurant_tables SET status = 'available', current_order_id = NULL WHERE id = ?",
          args: [Number(row.table_id)]
        })
      }
      await tx.execute({ sql: 'DELETE FROM restaurant_order_tables WHERE order_id = ?', args: [input.orderId] })
      await tx.execute({
        sql: "UPDATE restaurant_orders SET status = 'closed', closed_at = datetime('now'), sales_invoice_id = ? WHERE id = ?",
        args: [result.invoiceId ?? null, input.orderId]
      })
      await tx.commit()
    } catch (err) {
      await tx.rollback()
      throw err
    }
  }

  return result
}

