import { getDb } from '../db'
import type { TransferInput, TransferResult } from '../../shared/types'

export async function transferStock(input: TransferInput, userId: number): Promise<TransferResult> {
  if (input.fromWarehouseId === input.toWarehouseId) {
    return { ok: false, error: 'اختر مخزنين مختلفين للنقل' }
  }
  if (!input.lines.length) {
    return { ok: false, error: 'أضف صنف واحد على الأقل للنقل' }
  }

  const db = getDb()
  const tx = await db.transaction('write')
  try {
    const productNames = new Map<number, string>()
    for (const line of input.lines) {
      if (line.qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')

      const nameRs = await tx.execute({ sql: 'SELECT name FROM products WHERE id = ?', args: [line.productId] })
      const name = (nameRs.rows[0] as any)?.name ?? `#${line.productId}`
      productNames.set(line.productId, name)

      const stockRs = await tx.execute({
        sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        args: [line.productId, input.fromWarehouseId]
      })
      const available = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
      if (available < line.qty) {
        throw new Error(`الكمية غير كافية بالمخزن المصدر للصنف: ${name}`)
      }
    }

    const transferInfo = await tx.execute({
      sql: 'INSERT INTO stock_transfers (from_warehouse_id, to_warehouse_id, note, user_id) VALUES (?, ?, ?, ?)',
      args: [input.fromWarehouseId, input.toWarehouseId, input.note || null, userId]
    })
    const transferId = Number(transferInfo.lastInsertRowid)

    for (const line of input.lines) {
      await tx.execute({
        sql: 'INSERT INTO stock_transfer_items (transfer_id, product_id, qty) VALUES (?, ?, ?)',
        args: [transferId, line.productId, line.qty]
      })

      await tx.execute({
        sql: 'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
        args: [line.qty, line.productId, input.fromWarehouseId]
      })
      await tx.execute({
        sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
              ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
        args: [line.productId, input.toWarehouseId, line.qty]
      })

      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'transfer', ?, 'stock_transfer', ?, ?)`,
        args: [line.productId, input.fromWarehouseId, -line.qty, transferId, userId]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'transfer', ?, 'stock_transfer', ?, ?)`,
        args: [line.productId, input.toWarehouseId, line.qty, transferId, userId]
      })
    }

    await tx.commit()
    return { ok: true }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء النقل' }
  }
}
