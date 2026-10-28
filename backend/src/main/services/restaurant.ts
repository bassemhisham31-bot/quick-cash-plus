import { getDb } from '../db'
import { checkout } from './pos'
import { getCategoryPrinters, getPrintSettings, getRestaurantSettings, getTaxSettings } from './settings'
import { printKitchenTicket, printOrderCheck } from './print'
import { printCapture } from './printContext'
import { isActorMeta } from '../../shared/activityActor'
import { lineDiscountAmount } from '../../shared/types'
import type {
  CartLine,
  KitchenNotification,
  RestaurantSettings,
  CloseRestaurantOrderInput,
  CheckoutResult,
  OpenRestaurantOrderInput,
  RestaurantOrderItemInput,
  RestaurantOrderListItem,
  RestaurantOrderResult,
  RestaurantOrderType,
  RestaurantOrderView,
  RestaurantFloor,
  RestaurantFloorLine,
  RestaurantFloorLineInput,
  RestaurantFloorSettings,
  RestaurantTable,
  RestaurantTableInput,
  RestaurantTableShape
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
    `SELECT t.id, t.name, t.zone, t.pos_x AS posX, t.pos_y AS posY, t.seats, t.status, t.shape, t.size_scale AS sizeScale,
            t.current_order_id AS currentOrderId,
            ro.number AS orderNumber, ro.created_at AS orderOpenedAt, ro.guest_count AS orderGuestCount,
            ro.kitchen_status AS orderKitchenStatus, (ro.check_printed_at IS NOT NULL) AS orderCheckPrinted,
            (SELECT COUNT(*) FROM restaurant_order_items WHERE order_id = ro.id) AS orderItemsCount,
            (SELECT COALESCE(SUM(qty * unit_price - CASE WHEN discount_type = 'percent' THEN qty * unit_price * MIN(discount_value, 100) / 100 ELSE MIN(discount_value, qty * unit_price) END), 0) FROM restaurant_order_items WHERE order_id = ro.id) AS orderTotal
     FROM restaurant_tables t
     LEFT JOIN restaurant_orders ro ON ro.id = t.current_order_id AND ro.status = 'open'
     WHERE t.deleted_at IS NULL ORDER BY t.id`
  )
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    name: r.name,
    zone: r.zone ?? null,
    posX: Number(r.posX),
    posY: Number(r.posY),
    seats: Number(r.seats),
    status: r.status,
    shape: (r.shape as RestaurantTableShape) || 'auto',
    sizeScale: Number(r.sizeScale) > 0 ? Number(r.sizeScale) : 1,
    currentOrderId: r.currentOrderId != null ? Number(r.currentOrderId) : null,
    orderNumber: r.orderNumber ?? null,
    orderTotal: Number(r.orderTotal ?? 0),
    orderItemsCount: Number(r.orderItemsCount ?? 0),
    orderOpenedAt: r.orderOpenedAt ?? null,
    orderGuestCount: r.orderGuestCount != null ? Number(r.orderGuestCount) : null,
    orderKitchenStatus: r.orderKitchenStatus ?? null,
    orderCheckPrinted: Number(r.orderCheckPrinted ?? 0) === 1
  }))
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export async function upsertTable(input: RestaurantTableInput): Promise<RestaurantTable> {
  const db = getDb()
  const shape: RestaurantTableShape = input.shape ?? 'auto'
  const sizeScale = clampNum(input.sizeScale ?? 1, 0.4, 2.5, 1)
  const name = input.name.trim()
  const zone = input.zone.trim() || null
  let id = input.id
  if (id) {
    await db.execute({
      sql: 'UPDATE restaurant_tables SET name = ?, zone = ?, seats = ?, pos_x = ?, pos_y = ?, shape = ?, size_scale = ? WHERE id = ?',
      args: [name, zone, input.seats, input.posX, input.posY, shape, sizeScale, id]
    })
  } else {
    const info = await db.execute({
      sql: 'INSERT INTO restaurant_tables (name, zone, seats, pos_x, pos_y, shape, size_scale) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [name, zone, input.seats, input.posX, input.posY, shape, sizeScale]
    })
    id = Number(info.lastInsertRowid)
  }
  return { id, name, zone, posX: input.posX, posY: input.posY, seats: input.seats, shape, sizeScale, status: 'available', currentOrderId: null }
}

/* ------------------------------ مخطط الصالة ------------------------------ */

const FLOOR_MIN = { w: 600, h: 400 }
const FLOOR_MAX = { w: 6000, h: 4000 }

async function readFloorSettings(): Promise<RestaurantFloorSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM restaurant_floor_settings WHERE id = 1')
  const r = rs.rows[0] as any
  return {
    floorWidth: r ? Number(r.floor_width) : 1200,
    floorHeight: r ? Number(r.floor_height) : 700,
    tableScale: r ? Number(r.table_scale) : 1,
    showLines: r ? Number(r.show_lines) === 1 : true
  }
}

function mapLine(r: any): RestaurantFloorLine {
  return {
    id: Number(r.id),
    zone: r.zone ?? null,
    orientation: r.orientation === 'v' ? 'v' : 'h',
    posX: Number(r.pos_x),
    posY: Number(r.pos_y),
    length: Number(r.line_length),
    style: r.style === 'dashed' ? 'dashed' : 'solid',
    label: r.label ?? null
  }
}

export async function getFloor(): Promise<RestaurantFloor> {
  const db = getDb()
  // "length" لازم يتسمّى باسم تاني: صفوف libsql شبه arrays فـ row.length بيرجع عدد الأعمدة
  const rs = await db.execute(
    'SELECT id, zone, orientation, pos_x, pos_y, length AS line_length, style, label FROM restaurant_floor_lines ORDER BY id'
  )
  return { settings: await readFloorSettings(), lines: rs.rows.map(mapLine) }
}

/**
 * يحفظ إعدادات الصالة. لو المساحة اتغيرت، أماكن الترابيزات والخطوط (المتخزنة كنسبة مئوية) بتتعدّل
 * عشان كل حاجة تفضل في مكانها الفعلي — والمساحة الجديدة تبان فاضية على الأطراف بدل ما الترابيزات تتمط معاها.
 */
export async function saveFloorSettings(input: RestaurantFloorSettings): Promise<RestaurantFloor> {
  const prev = await readFloorSettings()
  const next: RestaurantFloorSettings = {
    floorWidth: Math.round(clampNum(input.floorWidth, FLOOR_MIN.w, FLOOR_MAX.w, prev.floorWidth)),
    floorHeight: Math.round(clampNum(input.floorHeight, FLOOR_MIN.h, FLOOR_MAX.h, prev.floorHeight)),
    tableScale: clampNum(input.tableScale, 0.3, 2, prev.tableScale),
    showLines: !!input.showLines
  }
  const fx = prev.floorWidth / next.floorWidth
  const fy = prev.floorHeight / next.floorHeight
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    await tx.execute({
      sql: 'UPDATE restaurant_floor_settings SET floor_width = ?, floor_height = ?, table_scale = ?, show_lines = ? WHERE id = 1',
      args: [next.floorWidth, next.floorHeight, next.tableScale, next.showLines ? 1 : 0]
    })
    if (fx !== 1 || fy !== 1) {
      await tx.execute({
        sql: 'UPDATE restaurant_tables SET pos_x = MIN(97, pos_x * ?), pos_y = MIN(97, pos_y * ?) WHERE deleted_at IS NULL',
        args: [fx, fy]
      })
      // الطول بيتعدّل حسب اتجاه الخط (أفقي = من العرض، رأسي = من الارتفاع)
      await tx.execute({
        sql: `UPDATE restaurant_floor_lines
              SET pos_x = MIN(99, pos_x * ?), pos_y = MIN(99, pos_y * ?),
                  length = MIN(100, length * CASE WHEN orientation = 'v' THEN ? ELSE ? END)`,
        args: [fx, fy, fy, fx]
      })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
  return getFloor()
}

export async function upsertFloorLine(input: RestaurantFloorLineInput): Promise<RestaurantFloorLine> {
  const db = getDb()
  const orientation = input.orientation === 'v' ? 'v' : 'h'
  const style = input.style === 'dashed' ? 'dashed' : 'solid'
  const posX = clampNum(input.posX, 0, 100, 10)
  const posY = clampNum(input.posY, 0, 100, 50)
  const length = clampNum(input.length, 2, 100, 40)
  const label = input.label?.trim() || null
  const zone = input.zone?.trim() || null
  let id = input.id
  if (id) {
    await db.execute({
      sql: 'UPDATE restaurant_floor_lines SET zone = ?, orientation = ?, pos_x = ?, pos_y = ?, length = ?, style = ?, label = ? WHERE id = ?',
      args: [zone, orientation, posX, posY, length, style, label, id]
    })
  } else {
    const info = await db.execute({
      sql: 'INSERT INTO restaurant_floor_lines (zone, orientation, pos_x, pos_y, length, style, label) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [zone, orientation, posX, posY, length, style, label]
    })
    id = Number(info.lastInsertRowid)
  }
  return { id, zone, orientation, posX, posY, length, style, label }
}

/** ترتيب تلقائي: يحفظ أماكن مجموعة ترابيزات مرة واحدة */
export async function setTablePositions(positions: { id: number; posX: number; posY: number }[]): Promise<void> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    for (const p of positions) {
      await tx.execute({
        sql: 'UPDATE restaurant_tables SET pos_x = ?, pos_y = ? WHERE id = ?',
        args: [clampNum(p.posX, 0, 100, 0), clampNum(p.posY, 0, 100, 0), p.id]
      })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

export async function deleteFloorLine(id: number): Promise<void> {
  await getDb().execute({ sql: 'DELETE FROM restaurant_floor_lines WHERE id = ?', args: [id] })
}

export async function deleteTable(id: number): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT status FROM restaurant_tables WHERE id = ?', args: [id] })
  if ((rs.rows[0] as any)?.status === 'occupied') return { ok: false, error: 'الترابيزة مشغولة حاليًا' }
  await db.execute({ sql: "UPDATE restaurant_tables SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
  return { ok: true }
}

/** يضم طلب تاني (fromId) جوه الطلب keepId: الأصناف + الترابيزات + إشعارات المطبخ، ويلغي الطلب المضموم. */
async function absorbOrder(tx: any, keepId: number, fromId: number): Promise<void> {
  await tx.execute({ sql: 'UPDATE restaurant_order_items SET order_id = ? WHERE order_id = ?', args: [keepId, fromId] })
  await tx.execute({ sql: 'UPDATE kitchen_notifications SET order_id = ? WHERE order_id = ?', args: [keepId, fromId] })
  const tablesRs = await tx.execute({ sql: 'SELECT table_id FROM restaurant_order_tables WHERE order_id = ?', args: [fromId] })
  for (const row of tablesRs.rows as any[]) {
    await tx.execute({
      sql: `INSERT INTO restaurant_order_tables (order_id, table_id) VALUES (?, ?) ON CONFLICT(order_id, table_id) DO NOTHING`,
      args: [keepId, Number(row.table_id)]
    })
    await tx.execute({
      sql: "UPDATE restaurant_tables SET status = 'occupied', current_order_id = ? WHERE id = ?",
      args: [keepId, Number(row.table_id)]
    })
  }
  await tx.execute({ sql: 'DELETE FROM restaurant_order_tables WHERE order_id = ?', args: [fromId] })
  await tx.execute({
    sql: "UPDATE restaurant_orders SET status = 'cancelled', closed_at = datetime('now'), order_note = COALESCE(order_note || ' | ', '') || ? WHERE id = ?",
    args: [`اندمج في الطلب #${keepId}`, fromId]
  })
  // الإجمالي اتغيّر — الشيك اللي اتطبع قبل كده مابقاش صحيح
  await tx.execute({ sql: 'UPDATE restaurant_orders SET check_printed_at = NULL WHERE id = ?', args: [keepId] })
}

/** يدمج مجموعة ترابيزات تحت نفس الطلب المفتوح — لو الترابيزة مشغولة بطلب تاني، الطلبين بيتدمجوا في طلب واحد. */
export async function mergeTables(orderId: number, tableIds: number[]): Promise<RestaurantOrderResult> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    for (const tableId of tableIds) {
      const rs = await tx.execute({ sql: 'SELECT status, current_order_id FROM restaurant_tables WHERE id = ?', args: [tableId] })
      const table = rs.rows[0] as any
      if (!table) throw new Error('ترابيزة غير موجودة')
      if (table.status === 'occupied' && table.current_order_id != null && Number(table.current_order_id) !== orderId) {
        await absorbOrder(tx, orderId, Number(table.current_order_id))
        continue
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

/**
 * ينقل الطلب بالكامل لترابيزة تانية، وبيفرّغ كل الترابيزات القديمة المرتبطة بيه (بما فيها المدموجة).
 * لو الترابيزة الجديدة مشغولة بطلب تاني، الطلب بيتضم جوه طلبها (والنتيجة بترجّع رقم الطلب اللي فضل).
 */
export async function transferTable(orderId: number, newTableId: number): Promise<RestaurantOrderResult> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    const newTableRs = await tx.execute({ sql: 'SELECT status, current_order_id FROM restaurant_tables WHERE id = ?', args: [newTableId] })
    const target = newTableRs.rows[0] as any
    if (!target) throw new Error('ترابيزة غير موجودة')
    const targetOrderId = target.status === 'occupied' && target.current_order_id != null ? Number(target.current_order_id) : null

    if (targetOrderId != null && targetOrderId !== orderId) {
      await absorbOrder(tx, targetOrderId, orderId)
      await tx.commit()
      return { ok: true, orderId: targetOrderId }
    }
    if (targetOrderId === orderId) throw new Error('الطلب أصلاً على الترابيزة دي')

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
    discountType?: 'percent' | 'value'
    discountValue?: number
    customerLabel?: string
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
  if (patch.customerLabel !== undefined) {
    await db.execute({
      sql: 'UPDATE restaurant_orders SET customer_label = ? WHERE id = ?',
      args: [patch.customerLabel.trim().slice(0, 80) || null, orderId]
    })
  }
  if (patch.discountValue !== undefined) {
    const type = patch.discountType === 'percent' ? 'percent' : 'value'
    const value = Math.max(0, Number(patch.discountValue) || 0)
    await db.execute({
      sql: 'UPDATE restaurant_orders SET discount_type = ?, discount_value = ? WHERE id = ?',
      args: [type, type === 'percent' ? Math.min(value, 100) : value, orderId]
    })
  }
}

export async function updateOrderItem(
  itemId: number,
  patch: { qty?: number; note?: string; splitGroup?: number; discountType?: 'percent' | 'value'; discountValue?: number }
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
  if (patch.discountValue !== undefined) {
    const type = patch.discountType === 'percent' ? 'percent' : 'value'
    const value = Math.max(0, Number(patch.discountValue) || 0)
    await db.execute({
      sql: 'UPDATE restaurant_order_items SET discount_type = ?, discount_value = ? WHERE id = ?',
      args: [type, type === 'percent' ? Math.min(value, 100) : value, itemId]
    })
  }
}

/**
 * تقسيم الشيك: نقل الصنف (أو جزء من كميته) لفاتورة تانية.
 * لو qty أقل من كمية السطر بنقسم السطر: الباقي يفضل في فاتورته، والمنقول يتضاف لسطر مطابق في الفاتورة الجديدة (أو سطر جديد).
 * لو السطر كله اتنقل وفي سطر مطابق في الفاتورة الجديدة بيتدمجوا. خصم الصنف بالقيمة بيتوزع بالنسبة على الوحدات.
 */
export async function moveOrderItemToGroup(itemId: number, group: number, qty?: number): Promise<void> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    const itemRs = await tx.execute({
      sql: `SELECT id, order_id, product_id, product_name, qty, unit_price, note, split_group, kitchen_sent, kitchen_sent_at,
                   discount_type, discount_value
            FROM restaurant_order_items WHERE id = ?`,
      args: [itemId]
    })
    const item = itemRs.rows[0] as any
    const total = item ? Number(item.qty) : 0
    const moveQty = qty === undefined ? total : Math.min(Math.max(Number(qty) || 0, 0), total)
    if (!item || moveQty <= 0 || Number(item.split_group) === group) {
      await tx.rollback()
      return
    }

    const whole = moveQty >= total
    const discType: 'percent' | 'value' = item.discount_type === 'percent' ? 'percent' : 'value'
    const discValue = Number(item.discount_value) || 0
    const movedDisc = discType === 'percent' || whole ? discValue : Math.round(discValue * (moveQty / total) * 100) / 100

    const candidatesRs = await tx.execute({
      sql: `SELECT id, qty, discount_type, discount_value FROM restaurant_order_items
            WHERE order_id = ? AND id <> ? AND split_group = ? AND product_id = ? AND unit_price = ?
              AND kitchen_sent = ? AND COALESCE(note, '') = ?`,
      args: [item.order_id, itemId, group, item.product_id, item.unit_price, item.kitchen_sent, item.note ?? '']
    })
    const twin = (candidatesRs.rows as any[]).find((c) => {
      const cv = Number(c.discount_value) || 0
      if (cv <= 0 && movedDisc <= 0) return true
      if (c.discount_type !== discType) return false
      return discType === 'value' || cv === movedDisc
    })

    if (twin) {
      const twinDisc = Number(twin.discount_value) || 0
      const mergedDisc = discType === 'value' && movedDisc > 0 ? Math.round((twinDisc + movedDisc) * 100) / 100 : twinDisc
      await tx.execute({
        sql: 'UPDATE restaurant_order_items SET qty = ?, discount_value = ? WHERE id = ?',
        args: [Number(twin.qty) + moveQty, mergedDisc, twin.id]
      })
    } else if (!whole) {
      await tx.execute({
        sql: `INSERT INTO restaurant_order_items
                (order_id, product_id, product_name, qty, unit_price, note, split_group, kitchen_sent, kitchen_sent_at, discount_type, discount_value)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          item.order_id, item.product_id, item.product_name, moveQty, item.unit_price, item.note ?? null,
          group, item.kitchen_sent, item.kitchen_sent_at ?? null, discType, movedDisc
        ]
      })
    }

    if (!whole) {
      await tx.execute({
        sql: 'UPDATE restaurant_order_items SET qty = ?, discount_value = ? WHERE id = ?',
        args: [total - moveQty, discType === 'percent' ? discValue : Math.round((discValue - movedDisc) * 100) / 100, itemId]
      })
    } else if (twin) {
      await tx.execute({ sql: 'DELETE FROM restaurant_order_items WHERE id = ?', args: [itemId] })
    } else {
      await tx.execute({ sql: 'UPDATE restaurant_order_items SET split_group = ? WHERE id = ?', args: [group, itemId] })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

export async function removeOrderItem(itemId: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM restaurant_order_items WHERE id = ?', args: [itemId] })
}

/** بيبعت للمطبخ الأصناف الجديدة بس (اللي لسه ما اتبعتتش)، مقسّمة على الطابعة المرتبطة بتصنيف كل صنف. */
export async function sendToKitchen(
  orderId: number,
  actor?: unknown,
  reprint = false
): Promise<{ ok: boolean; printedCount: number; error?: string; printWarning?: string }> {
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
          WHERE roi.order_id = ? ${reprint ? '' : 'AND roi.kitchen_sent = 0'}`,
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
  // جهاز فرعي: طابعة المطبخ الافتراضية بتاعة الرئيسي مش موجودة على الفرعي — نرجع لطابعة الجهاز الفرعي
  const kitchenDefault = printCapture.getStore() ? null : restaurantSettings.defaultKitchenPrinter
  const fallbackPrinter = kitchenDefault || printSettings.defaultPrinter || null

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
    captainName: order.captainName ?? null,
    reprint
  }

  if (!reprint) {
  // بنعلّم الأصناف "اتبعتت" الأول، وبعدين نطبع — عشان لو الطابعة وقعت/مش متوصلة الطلب نفسه ما يقفش
  // (قبل كده أي خطأ في الطباعة كان بيوقف الإرسال كله والأصناف تفضل "لسه ما اتبعتتش" من غير ما حد يعرف ليه).
  const ids = items.map((i) => Number(i.id))
  await db.execute({
    sql: `UPDATE restaurant_order_items SET kitchen_sent = 1, kitchen_sent_at = datetime('now')
          WHERE id IN (${ids.map(() => '?').join(',')})`,
    args: ids
  })
  if (order.kitchen_status === 'pending') {
    await db.execute({ sql: "UPDATE restaurant_orders SET kitchen_status = 'preparing' WHERE id = ?", args: [orderId] })
  }

  // إشعار "طلب تجهيز" — بيظهر فورًا في زرار إشعارات المطبخ على كل الأجهزة (الرئيسي والفرعي)
  try {
    const sentBy = isActorMeta(actor) ? actor : null
    let sentByName: string | null = sentBy?.username ?? null
    if (sentBy?.userId) {
      const userRs = await db.execute({ sql: 'SELECT full_name FROM users WHERE id = ?', args: [sentBy.userId] })
      sentByName = ((userRs.rows[0] as any)?.full_name as string) || sentByName
    }
    await db.execute({
      sql: `INSERT INTO kitchen_notifications
              (order_id, order_number, order_type, table_label, captain_name, items_summary, items_count, sent_by_user_id, sent_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        orderId,
        order.number,
        order.order_type,
        tableLabel,
        order.captainName ?? null,
        items.map((i) => `${Number(i.qty)}× ${i.product_name}${i.note ? ` (${i.note})` : ''}`).join('، '),
        items.reduce((sum, i) => sum + Number(i.qty), 0),
        sentBy?.userId ?? null,
        sentByName
      ]
    })
  } catch (err) {
    // الإشعار إضافة — لو فشل لأي سبب ما يوقفش إرسال الطلب للمطبخ
    console.error('[kitchen notification]', err)
  }
  }

  const printErrors: string[] = []
  for (const [printerKey, groupItems] of groups) {
    try {
      const res = await printKitchenTicket(meta, printerKey === '__none__' ? null : printerKey, groupItems)
      if (res && res.ok === false) printErrors.push(res.error ?? printerKey)
    } catch (err: any) {
      printErrors.push(err?.message ?? String(err))
    }
  }

  return {
    ok: true,
    printedCount: items.length,
    printWarning: printErrors.length ? `الطلب اتبعت بس تذكرة المطبخ ما اتطبعتش: ${printErrors.join(' / ')}` : undefined
  }
}

export async function setKitchenStatus(orderId: number, status: string): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE restaurant_orders SET kitchen_status = ? WHERE id = ?', args: [status, orderId] })
}

export async function listOpenOrders(): Promise<RestaurantOrderListItem[]> {
  const db = getDb()
  const rs = await db.execute(`
    SELECT ro.id, ro.number, ro.order_type AS orderType, ro.status, ro.kitchen_status AS kitchenStatus, ro.created_at AS createdAt,
           ro.delivery_address AS deliveryAddress, ro.delivery_fee AS deliveryFee,
           c.name AS customerName, c.phone AS customerPhone, d.name AS driverName, cap.name AS captainName,
           (SELECT COUNT(*) FROM restaurant_order_items WHERE order_id = ro.id) AS itemsCount,
           (SELECT COALESCE(SUM(qty * unit_price - CASE WHEN discount_type = 'percent' THEN qty * unit_price * MIN(discount_value, 100) / 100 ELSE MIN(discount_value, qty * unit_price) END), 0) FROM restaurant_order_items WHERE order_id = ro.id) AS total
    FROM restaurant_orders ro
    LEFT JOIN customers c ON c.id = ro.customer_id
    LEFT JOIN delivery_drivers d ON d.id = ro.delivery_driver_id
    LEFT JOIN captains cap ON cap.id = ro.captain_id
    WHERE ro.status = 'open'
    ORDER BY ro.id DESC`)

  const orders = rs.rows as any[]
  const result: RestaurantOrderListItem[] = []
  for (const o of orders) {
    const tableRs = await db.execute({
      sql: `SELECT t.name FROM restaurant_order_tables ot JOIN restaurant_tables t ON t.id = ot.table_id WHERE ot.order_id = ?`,
      args: [o.id]
    })
    const itemsRs = await db.execute({
      sql: 'SELECT product_name AS name, SUM(qty) AS qty FROM restaurant_order_items WHERE order_id = ? GROUP BY product_id, product_name ORDER BY MIN(id)',
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
      createdAt: o.createdAt,
      customerName: o.customerName ?? null,
      customerPhone: o.customerPhone ?? null,
      deliveryAddress: o.deliveryAddress ?? null,
      deliveryFee: Number(o.deliveryFee ?? 0),
      driverName: o.driverName ?? null,
      captainName: o.captainName ?? null,
      itemsPreview: (itemsRs.rows as any[]).map((r) => ({ name: r.name, qty: Number(r.qty) }))
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
                 captain_id AS captainId, created_at AS createdAt, check_printed_at AS checkPrintedAt, customer_label AS customerLabel,
                 discount_type AS discountType, discount_value AS discountValue
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
                 split_group AS splitGroup, kitchen_sent AS kitchenSent,
                 discount_type AS discountType, discount_value AS discountValue
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
    customerLabel: head.customerLabel ?? null,
    discountType: head.discountType === 'percent' ? 'percent' : 'value',
    discountValue: Number(head.discountValue) || 0,
    checkPrintedAt: head.checkPrintedAt ?? null,
    items: (itemsRs.rows as any[]).map((r) => ({
      id: Number(r.id),
      productId: Number(r.productId),
      productName: r.productName,
      qty: Number(r.qty),
      unitPrice: Number(r.unitPrice),
      note: r.note ?? null,
      splitGroup: Number(r.splitGroup),
      kitchenSent: !!r.kitchenSent,
      discountType: r.discountType === 'percent' ? 'percent' : 'value',
      discountValue: Number(r.discountValue) || 0
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
    sql: `SELECT roi.id, roi.product_id AS productId, roi.product_name AS productName, roi.qty, roi.unit_price AS unitPrice, roi.note, roi.discount_type AS discountType, roi.discount_value AS discountValue, p.barcode
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
    discount: lineDiscountAmount(Number(i.qty), Number(i.unitPrice), i.discountType, Number(i.discountValue)),
    note: i.note ?? null
  }))

  const restaurantSettings = await getRestaurantSettings()
  const applyServiceCharge = isFinalSettlement && restaurantSettings.serviceChargeEnabled && order.orderType === 'dine_in'
  const taxOverride = restaurantTaxOverride(restaurantSettings, order.orderType, isFinalSettlement)

  const result = await checkout(
    {
      customerId: input.customerId,
      customerLabel: input.customerLabel,
      warehouseId: input.warehouseId,
      lines,
      discountType: input.discountType,
      discountValue: input.discountValue,
      paymentMethod: input.paymentMethod,
      paid: input.paid,
      tipAmount: input.tipAmount,
      redeemPoints: 0,
      orderType: order.orderType,
      allowNegativeStock: true,
      tableId: order.tableId ?? null,
      deliveryFee: isFinalSettlement ? Number(order.deliveryFee) : 0,
      deliveryDriverId: order.deliveryDriverId != null ? Number(order.deliveryDriverId) : null,
      captainId: order.captainId != null ? Number(order.captainId) : null,
      serviceChargeType: applyServiceCharge ? restaurantSettings.serviceChargeType : undefined,
      serviceChargeValue: applyServiceCharge ? restaurantSettings.serviceChargeValue : undefined,
      taxType: taxOverride?.type,
      taxValue: taxOverride?.value
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


/* ------------------------------ ضريبة المطعم ------------------------------ */

/**
 * ضريبة المطعم (زي الخدمة): لو مفعّلة بترجع النوع/القيمة اللي تحل محل ضريبة البرنامج العامة، ولو مش مفعّلة بترجع
 * undefined (يعني checkout يستخدم الضريبة العامة زي ما هو). نوع طلب مش مختار في الإعدادات = من غير ضريبة خالص.
 * القيمة الثابتة بتتحسب مرة واحدة بس في آخر دفعة (نفس منطق الخدمة ورسوم التوصيل مع تقسيم الفاتورة).
 */
export function restaurantTaxOverride(
  settings: RestaurantSettings,
  orderType: string,
  isFinalSettlement: boolean
): { type: 'percent' | 'value'; value: number } | undefined {
  if (!settings.taxEnabled) return undefined
  const applies =
    (orderType === 'dine_in' && settings.taxDineIn) ||
    (orderType === 'takeaway' && settings.taxTakeaway) ||
    (orderType === 'delivery' && settings.taxDelivery)
  if (!applies) return { type: 'percent', value: 0 }
  if (settings.taxType === 'value') return { type: 'value', value: isFinalSettlement ? settings.taxValue : 0 }
  return { type: 'percent', value: settings.taxValue }
}

/* ------------------------------ الشيك (قبل الدفع) ------------------------------ */

/** بيطبع شيك الحساب للزبون قبل الدفع (بنفس حسبة الدفع بالظبط، من غير خصم) ويعلّم الطلب إن الشيك اتطبع. */
export async function printCheck(
  orderId: number,
  preview = false,
  splitGroup?: number
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const fullView = await getOrderView(orderId)
  if (!fullView) return { ok: false, error: 'الطلب غير موجود' }
  if (!fullView.items.length) return { ok: false, error: 'الطلب فاضي' }
  // شيك مجموعة تقسيم واحدة: نفس منطق closeOrder — الخدمة/التوصيل/الضريبة الثابتة بس على آخر مجموعة
  const groupItems = splitGroup === undefined ? fullView.items : fullView.items.filter((i) => i.splitGroup === splitGroup)
  if (!groupItems.length) return { ok: false, error: 'المجموعة فاضية' }
  const isFinal = groupItems.length === fullView.items.length
  const view = { ...fullView, items: groupItems }

  const extraRs = await db.execute({
    sql: `SELECT c.name AS customerName, cap.name AS captainName
          FROM restaurant_orders ro
          LEFT JOIN customers c ON c.id = ro.customer_id
          LEFT JOIN captains cap ON cap.id = ro.captain_id
          WHERE ro.id = ?`,
    args: [orderId]
  })
  const extra = (extraRs.rows[0] as any) ?? {}
  const [restaurantSettings, taxSettings] = await Promise.all([getRestaurantSettings(), getTaxSettings()])

  const itemsGross = view.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
  const itemsNet = view.items.reduce(
    (sum, i) => sum + i.qty * i.unitPrice - lineDiscountAmount(i.qty, i.unitPrice, i.discountType, i.discountValue),
    0
  )
  const orderDiscount = Math.min(
    itemsNet,
    view.discountType === 'percent' ? itemsNet * (view.discountValue / 100) : view.discountValue
  )
  const subtotal = Math.max(0, itemsNet - orderDiscount)
  const override = restaurantTaxOverride(restaurantSettings, view.orderType, isFinal)
  const tax = override
    ? override.type === 'value'
      ? override.value
      : subtotal * (override.value / 100)
    : taxSettings.enabled
      ? subtotal * (taxSettings.rate / 100)
      : 0
  const taxName = override
    ? override.type === 'percent'
      ? `${restaurantSettings.taxName} (${override.value}%)`
      : restaurantSettings.taxName
    : `${taxSettings.taxName} (${taxSettings.rate}%)`
  const service =
    isFinal && view.orderType === 'dine_in' && restaurantSettings.serviceChargeEnabled && restaurantSettings.serviceChargeValue
      ? restaurantSettings.serviceChargeType === 'percent'
        ? subtotal * (restaurantSettings.serviceChargeValue / 100)
        : restaurantSettings.serviceChargeValue
      : 0
  const delivery = isFinal && view.orderType === 'delivery' ? view.deliveryFee : 0

  // نفس الصنف بنفس السعر بيتجمع في سطر واحد في الشيك
  const grouped = new Map<string, { name: string; qty: number; unitPrice: number; discount: number }>()
  for (const i of view.items) {
    const itemDiscount = lineDiscountAmount(i.qty, i.unitPrice, i.discountType, i.discountValue)
    const key = `${i.productId}|${i.unitPrice}`
    const g = grouped.get(key)
    if (g) {
      g.qty += i.qty
      g.discount += itemDiscount
    } else grouped.set(key, { name: i.productName, qty: i.qty, unitPrice: i.unitPrice, discount: itemDiscount })
  }

  const result = await printOrderCheck(
    {
      orderNumber: view.number,
      orderType: view.orderType,
      tableLabel: view.tableNames.join(' + ') || null,
      splitLabel: splitGroup !== undefined && !isFinal ? `فاتورة ${splitGroup}` : null,
      captainName: extra.captainName ?? null,
      guestCount: view.guestCount,
      customerName: view.customerLabel || extra.customerName || null,
      items: Array.from(grouped.values()),
      subtotal: itemsGross,
      itemsDiscount: itemsGross - itemsNet,
      orderDiscount,
      taxName,
      tax,
      service,
      delivery,
      total: subtotal + tax + service + delivery
    },
    preview
  )
  if (result.ok && !preview) {
    await db.execute({ sql: "UPDATE restaurant_orders SET check_printed_at = datetime('now', 'localtime') WHERE id = ?", args: [orderId] })
  }
  return result
}

/* ------------------------------ إشعارات المطبخ ------------------------------ */

export async function listKitchenNotifications(limit = 30): Promise<KitchenNotification[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT id, order_id AS orderId, order_number AS orderNumber, order_type AS orderType, table_label AS tableLabel,
                 captain_name AS captainName, items_summary AS itemsSummary, items_count AS itemsCount,
                 sent_by_name AS sentByName, created_at AS createdAt
          FROM kitchen_notifications
          ORDER BY id DESC
          LIMIT ?`,
    args: [limit]
  })
  return (rs.rows as any[]).map((r) => ({
    id: Number(r.id),
    orderId: Number(r.orderId),
    orderNumber: r.orderNumber,
    orderType: r.orderType,
    tableLabel: r.tableLabel ?? null,
    captainName: r.captainName ?? null,
    itemsSummary: r.itemsSummary,
    itemsCount: Number(r.itemsCount),
    sentByName: r.sentByName ?? null,
    createdAt: r.createdAt
  }))
}
