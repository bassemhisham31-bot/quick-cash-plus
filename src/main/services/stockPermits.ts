import { getDb } from '../db'
import type { StockPermitInput, StockPermitListItem, StockPermitResult, StockPermitType, StockPermitView } from '../../shared/types'

const NUMBER_PREFIX: Record<StockPermitType, string> = {
  addition: 'ADD',
  deduction: 'DED'
}

export async function createStockPermit(input: StockPermitInput, userId: number): Promise<StockPermitResult> {
  if (!input.lines.length) return { ok: false, error: 'أضف صنف واحد على الأقل' }

  const db = getDb()

  if (input.type === 'deduction') {
    for (const line of input.lines) {
      const stockRs = await db.execute({
        sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        args: [line.productId, input.warehouseId]
      })
      const available = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
      if (available < line.qty) {
        return { ok: false, error: `الكمية غير كافية في المخزون للصنف: ${line.name}` }
      }
    }
  }

  const totalQty = input.lines.reduce((sum, l) => sum + l.qty, 0)
  const signedQty = input.type === 'addition' ? 1 : -1

  const tx = await db.transaction('write')
  try {
    const info = await tx.execute({
      sql: `INSERT INTO stock_permits (number, type, warehouse_id, reason, note, total_qty, user_id)
            VALUES ('PENDING', ?, ?, ?, ?, ?, ?)`,
      args: [input.type, input.warehouseId, input.reason, input.note, totalQty, userId]
    })
    const permitId = Number(info.lastInsertRowid)
    const number = `${NUMBER_PREFIX[input.type]}-${String(permitId).padStart(6, '0')}`
    await tx.execute({ sql: 'UPDATE stock_permits SET number = ? WHERE id = ?', args: [number, permitId] })

    for (const line of input.lines) {
      await tx.execute({
        sql: `INSERT INTO stock_permit_items (permit_id, product_id, product_name, qty, note)
              VALUES (?, ?, ?, ?, ?)`,
        args: [permitId, line.productId, line.name, line.qty, line.note]
      })

      await tx.execute({
        sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
              ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
        args: [line.productId, input.warehouseId, line.qty * signedQty]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'adjustment', ?, 'stock_permit', ?, ?)`,
        args: [line.productId, input.warehouseId, line.qty * signedQty, permitId, userId]
      })
    }

    await tx.commit()
    return { ok: true, permitId, number }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء تسجيل الإذن' }
  }
}

export async function deleteStockPermit(permitId: number, userId: number): Promise<StockPermitResult> {
  const db = getDb()

  const headRs = await db.execute({ sql: 'SELECT * FROM stock_permits WHERE id = ?', args: [permitId] })
  const permit = headRs.rows[0] as any
  if (!permit) return { ok: false, error: 'الإذن غير موجود' }
  if (permit.deleted_at) return { ok: true }

  const warehouseId = Number(permit.warehouse_id)
  const type = permit.type as StockPermitType
  const reverseSignedQty = type === 'addition' ? -1 : 1

  const linesRs = await db.execute({
    sql: 'SELECT product_id, product_name, qty FROM stock_permit_items WHERE permit_id = ?',
    args: [permitId]
  })
  const lines = linesRs.rows as any[]

  if (type === 'addition') {
    for (const line of lines) {
      const stockRs = await db.execute({
        sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        args: [line.product_id, warehouseId]
      })
      const available = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
      if (available < Number(line.qty)) {
        return { ok: false, error: `تعذّر حذف الإذن: جزء من كمية الصنف "${line.product_name}" تم بيعه/صرفه بالفعل` }
      }
    }
  }

  const tx = await db.transaction('write')
  try {
    for (const line of lines) {
      await tx.execute({
        sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
              ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
        args: [line.product_id, warehouseId, Number(line.qty) * reverseSignedQty]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'adjustment', ?, 'stock_permit_delete', ?, ?)`,
        args: [line.product_id, warehouseId, Number(line.qty) * reverseSignedQty, permitId, userId]
      })
    }

    await tx.execute({
      sql: "UPDATE stock_permits SET deleted_at = datetime('now') WHERE id = ?",
      args: [permitId]
    })

    await tx.commit()
    return { ok: true }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء حذف الإذن' }
  }
}

export async function listStockPermits(type?: StockPermitType): Promise<StockPermitListItem[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT sp.id, sp.number, sp.type, w.name AS warehouseName, sp.reason, sp.total_qty AS totalQty,
                 u.full_name AS userName, sp.created_at AS createdAt
          FROM stock_permits sp
          JOIN warehouses w ON w.id = sp.warehouse_id
          LEFT JOIN users u ON u.id = sp.user_id
          WHERE sp.deleted_at IS NULL ${type ? 'AND sp.type = ?' : ''}
          ORDER BY sp.id DESC
          LIMIT 500`,
    args: type ? [type] : []
  })
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    number: r.number,
    type: r.type,
    warehouseName: r.warehouseName,
    reason: r.reason ?? null,
    totalQty: Number(r.totalQty),
    userName: r.userName ?? '—',
    createdAt: r.createdAt
  }))
}

export async function getStockPermitView(permitId: number): Promise<StockPermitView | null> {
  const db = getDb()
  const headRs = await db.execute({
    sql: `SELECT sp.id, sp.number, sp.type, w.name AS warehouseName, sp.reason, sp.note, sp.total_qty AS totalQty,
                 u.full_name AS userName, sp.created_at AS createdAt
          FROM stock_permits sp
          JOIN warehouses w ON w.id = sp.warehouse_id
          LEFT JOIN users u ON u.id = sp.user_id
          WHERE sp.id = ? AND sp.deleted_at IS NULL`,
    args: [permitId]
  })
  const head = headRs.rows[0] as any
  if (!head) return null

  const linesRs = await db.execute({
    sql: `SELECT spi.product_name AS productName, p.barcode AS barcode, spi.qty, spi.note
          FROM stock_permit_items spi
          LEFT JOIN products p ON p.id = spi.product_id
          WHERE spi.permit_id = ?`,
    args: [permitId]
  })

  return {
    id: Number(head.id),
    number: head.number,
    type: head.type,
    warehouseName: head.warehouseName,
    reason: head.reason ?? null,
    note: head.note ?? null,
    totalQty: Number(head.totalQty),
    userName: head.userName ?? '—',
    createdAt: head.createdAt,
    lines: linesRs.rows.map((r: any) => ({
      productName: r.productName,
      barcode: r.barcode ?? '',
      qty: Number(r.qty),
      note: r.note ?? null
    }))
  }
}
