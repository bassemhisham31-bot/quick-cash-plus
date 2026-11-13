/**
 * مرتجع مبيعات بدون فاتورة (ويب) — أصناف بس، مع عميل اختياري.
 *  - المخزون بيرجع للمخزن المختار (الخدمات مالهاش مخزون).
 *  - refund_method = 'cash'   → الفلوس بتتصرف من خزينة النقدية (حركة خزينة + قيد).
 *  - refund_method = 'credit' → بيتخصم من رصيد العميل (لازم عميل مسجّل).
 * الجداول منفصلة عن sales_returns (اللي لازم لها فاتورة) — وكل التقارير/الدفتر/الخزائن بتضيفها جنب المرتجعات العادية.
 */
import { getDb } from '../db'
import { getWalkInCustomerId } from '../db/seed'
import { assertBranchAccess, branchesEnabled, currentBranchId, requireBranchId } from './branchScope'
import { getOpenSession } from './cashSession'
import type { DirectReturnInput, DirectReturnResult } from '../../shared/types'

export interface DirectReturnView {
  id: number
  number: string
  customerId: number
  customerName: string
  customerAddress: string | null
  isWalkIn: boolean
  refundMethod: 'cash' | 'credit'
  amount: number
  balanceBefore: number | null
  note: string | null
  userName: string
  createdAt: string
  branchId: number
  lines: { productName: string; qty: number; unitPrice: number; amount: number }[]
}

export async function createDirectReturn(input: DirectReturnInput, userId: number): Promise<DirectReturnResult> {
  const db = getDb()
  const lines = (input?.lines ?? []).filter((l) => Number(l.qty) > 0)
  if (!lines.length) return { ok: false, error: 'ضيف صنف واحد على الأقل للمرتجع' }
  if (lines.some((l) => !(Number(l.unitPrice) >= 0))) return { ok: false, error: 'سعر الصنف غير صحيح' }
  if (input.refundMethod !== 'cash' && input.refundMethod !== 'credit') return { ok: false, error: 'طريقة رد المرتجع غير صحيحة' }
  if (input.refundMethod === 'credit' && input.customerId == null) {
    return { ok: false, error: 'الخصم من الرصيد محتاج عميل مسجّل — اختار العميل أو خلّي الرد نقدي' }
  }
  if (branchesEnabled() && currentBranchId() == null) return { ok: false, error: 'اختار فرع محدد من أعلى الشاشة قبل تسجيل المرتجع' }
  if (input.refundMethod === 'cash' && !(await getOpenSession())) {
    return { ok: false, error: 'لازم تبدأ اليوم أول من لوحة التحكم قبل رد مرتجع نقدي' }
  }
  const branchId = requireBranchId()
  const warehouseId = Number(input.warehouseId)
  const whRs = await db.execute({ sql: 'SELECT id, branch_id FROM warehouses WHERE id = ?', args: [warehouseId] })
  const wh = whRs.rows[0] as any
  if (!wh) return { ok: false, error: 'المخزن غير موجود' }
  if (branchesEnabled() && Number(wh.branch_id) !== branchId) return { ok: false, error: 'المخزن تابع لفرع تاني' }

  const customerId = input.customerId ?? (await getWalkInCustomerId(db))
  const custRs = await db.execute({ sql: 'SELECT id, balance, is_walk_in FROM customers WHERE id = ? AND deleted_at IS NULL', args: [customerId] })
  const customer = custRs.rows[0] as any
  if (!customer) return { ok: false, error: 'العميل غير موجود' }

  const tx = await db.transaction('write')
  try {
    const head = await tx.execute({
      sql: `INSERT INTO direct_sales_returns (customer_id, customer_label, warehouse_id, refund_method, amount, balance_before, note, user_id, branch_id)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      args: [
        customerId,
        input.customerId == null ? input.customerLabel?.trim() || null : null,
        warehouseId,
        input.refundMethod,
        customer.is_walk_in ? null : Number(customer.balance),
        input.note?.trim() || null,
        userId,
        branchId
      ]
    })
    const returnId = Number(head.lastInsertRowid)
    const number = `DR-${String(returnId).padStart(6, '0')}`

    let total = 0
    for (const line of lines) {
      const prodRs = await tx.execute({
        sql: 'SELECT id, name, cost_price, is_service FROM products WHERE id = ? AND deleted_at IS NULL',
        args: [line.productId]
      })
      const product = prodRs.rows[0] as any
      if (!product) throw new Error('صنف غير موجود')
      const qty = Number(line.qty)
      const unitPrice = Number(line.unitPrice)
      const amount = Math.round(qty * unitPrice * 100) / 100
      total += amount
      await tx.execute({
        sql: `INSERT INTO direct_sales_return_items (return_id, product_id, product_name, qty, unit_price, amount, cost_price)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [returnId, product.id, product.name, qty, unitPrice, amount, Number(product.cost_price) || 0]
      })
      if (!Number(product.is_service)) {
        await tx.execute({
          sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
                ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity + ?`,
          args: [product.id, warehouseId, qty, qty]
        })
        await tx.execute({
          sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
                VALUES (?, ?, 'sale_return', ?, 'direct_sales_return', ?, ?)`,
          args: [product.id, warehouseId, qty, returnId, userId]
        })
      }
    }

    await tx.execute({ sql: 'UPDATE direct_sales_returns SET number = ?, amount = ? WHERE id = ?', args: [number, total, returnId] })
    if (input.refundMethod === 'credit') {
      await tx.execute({ sql: 'UPDATE customers SET balance = balance - ? WHERE id = ?', args: [total, customerId] })
    }
    await tx.commit()
    return { ok: true, returnId, number, amount: total }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء تسجيل المرتجع' }
  }
}

export async function getDirectReturn(id: number): Promise<DirectReturnView | null> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT r.*, c.name AS customerName, c.address AS customerAddress, c.is_walk_in AS isWalkIn, u.full_name AS userName
          FROM direct_sales_returns r JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.user_id
          WHERE r.id = ?`,
    args: [id]
  })
  const r = rs.rows[0] as any
  if (!r) return null
  assertBranchAccess(r.branch_id, 'المرتجع')
  const items = await db.execute({
    sql: 'SELECT product_name, qty, unit_price, amount FROM direct_sales_return_items WHERE return_id = ? ORDER BY id',
    args: [id]
  })
  return {
    id: Number(r.id),
    number: r.number ?? `DR-${r.id}`,
    customerId: Number(r.customer_id),
    customerName: r.isWalkIn && r.customer_label ? r.customer_label : r.customerName,
    customerAddress: r.customerAddress ?? null,
    isWalkIn: !!r.isWalkIn,
    refundMethod: r.refund_method === 'credit' ? 'credit' : 'cash',
    amount: Number(r.amount),
    balanceBefore: r.balance_before != null ? Number(r.balance_before) : null,
    note: r.note ?? null,
    userName: r.userName ?? '',
    createdAt: r.created_at,
    branchId: Number(r.branch_id),
    lines: (items.rows as any[]).map((i) => ({
      productName: i.product_name,
      qty: Number(i.qty),
      unitPrice: Number(i.unit_price),
      amount: Number(i.amount)
    }))
  }
}
