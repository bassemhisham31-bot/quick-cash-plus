/**
 * قائمة "مطلوب شراؤه" (نسخة الويب فقط): كل قطعة بتتباع بتتسجل هنا تلقائيًا (من pos.ts) عشان تتشترى من المورد،
 * وبعد الشراء بتتعلّم "اتشترت" وتتربط بفاتورة المشتريات (من purchases.ts).
 */
import { getDb } from '../db'
import { branchFilter } from './branchScope'
import type { PurchaseRequestFilter, PurchaseRequestItem } from '../../shared/types'

export async function listPurchaseRequests(filter: PurchaseRequestFilter): Promise<PurchaseRequestItem[]> {
  const db = getDb()
  const bf = branchFilter('pr.branch_id')
  const conditions: string[] = [bf.sql]
  const args: unknown[] = [...bf.args]
  if (filter.status !== 'all') {
    conditions.push('pr.status = ?')
    args.push(filter.status)
  }
  if (filter.vendorId) {
    conditions.push('pr.vendor_id = ?')
    args.push(filter.vendorId)
  }
  if (filter.dateFrom) {
    conditions.push('date(pr.created_at) >= date(?)')
    args.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    conditions.push('date(pr.created_at) <= date(?)')
    args.push(filter.dateTo)
  }
  const rs = await db.execute({
    sql: `SELECT pr.id, pr.product_id AS productId, pr.product_name AS productName, pr.barcode, pr.qty, pr.unit_cost AS unitCost,
                 pr.vendor_id AS vendorId, v.name AS vendorName, pr.sales_invoice_id AS salesInvoiceId, i.number AS salesInvoiceNumber,
                 pr.status, pr.purchase_invoice_id AS purchaseInvoiceId, pr.note, pr.created_at AS createdAt, pr.purchased_at AS purchasedAt
          FROM purchase_requests pr
          LEFT JOIN vendors v ON v.id = pr.vendor_id
          LEFT JOIN sales_invoices i ON i.id = pr.sales_invoice_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY COALESCE(v.name, '~'), pr.created_at DESC, pr.id DESC
          LIMIT 1000`,
    args: args as any
  })
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    productId: Number(r.productId),
    productName: r.productName,
    barcode: r.barcode ?? null,
    qty: Number(r.qty),
    unitCost: Number(r.unitCost),
    vendorId: r.vendorId != null ? Number(r.vendorId) : null,
    vendorName: r.vendorName ?? null,
    salesInvoiceId: r.salesInvoiceId != null ? Number(r.salesInvoiceId) : null,
    salesInvoiceNumber: r.salesInvoiceNumber ?? null,
    status: r.status,
    purchaseInvoiceId: r.purchaseInvoiceId != null ? Number(r.purchaseInvoiceId) : null,
    note: r.note ?? null,
    createdAt: r.createdAt,
    purchasedAt: r.purchasedAt ?? null
  }))
}

export async function countPendingPurchaseRequests(): Promise<number> {
  const bf = branchFilter('branch_id')
  const rs = await getDb().execute({
    sql: `SELECT COUNT(*) AS c FROM purchase_requests WHERE status = 'pending' AND ${bf.sql}`,
    args: bf.args as any
  })
  return Number((rs.rows[0] as any).c)
}

/** تعديل بند لسه مطلوب (الكمية، سعر الشراء المتوقع، المورد، ملاحظة) */
export async function updatePurchaseRequest(
  id: number,
  patch: { qty?: number; unitCost?: number; vendorId?: number | null; note?: string | null }
): Promise<void> {
  const db = getDb()
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.qty !== undefined) {
    if (!(Number(patch.qty) > 0)) throw new Error('الكمية لازم تكون أكبر من صفر')
    sets.push('qty = ?')
    args.push(Number(patch.qty))
  }
  if (patch.unitCost !== undefined) {
    sets.push('unit_cost = ?')
    args.push(Math.max(0, Number(patch.unitCost) || 0))
  }
  if (patch.vendorId !== undefined) {
    sets.push('vendor_id = ?')
    args.push(patch.vendorId || null)
  }
  if (patch.note !== undefined) {
    sets.push('note = ?')
    args.push(patch.note?.trim() || null)
  }
  if (!sets.length) return
  await db.execute({
    sql: `UPDATE purchase_requests SET ${sets.join(', ')} WHERE id = ? AND status = 'pending'`,
    args: [...args, id] as any
  })
}

/** إلغاء بنود (مش محتاج شراؤها) أو إرجاعها للقائمة — البنود اللي اتشترت فعلًا مش بتتغيّر */
export async function setPurchaseRequestsStatus(ids: number[], status: 'pending' | 'cancelled'): Promise<void> {
  const clean = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
  if (!clean.length) return
  const from = status === 'cancelled' ? 'pending' : 'cancelled'
  await getDb().execute({
    sql: `UPDATE purchase_requests SET status = ? WHERE status = ? AND id IN (${clean.map(() => '?').join(',')})`,
    args: [status, from, ...clean] as any
  })
}
