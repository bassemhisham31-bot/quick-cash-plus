/**
 * دفع الفاتورة المقسّم على أكتر من وسيلة (نسخة الويب فقط).
 *
 * الفاتورة المقسّمة payment_method = 'mixed' وليها صفوف في sales_invoice_payments (وسيلة + مبلغ لكل جزء، من غير الآجل).
 * الجزء الآجل مش بيتخزّن في الجدول — هو (الإجمالي - المدفوع) وبيتسجل على رصيد العميل زي أي فاتورة آجلة.
 * الفواتير القديمة (وفواتير "مختلط" القديمة) مالهاش صفوف، فبتتعامل بوسيلتها الواحدة زي ما كانت بالظبط.
 */
import type { Client, Transaction } from '@libsql/client'
import type { InvoicePaymentPart, PaymentMethod } from '../../shared/types'

/**
 * استعلام فرعي بيرجّع سطر لكل (فاتورة، وسيلة دفع):
 *  - amount        = المبلغ المحصّل بالوسيلة دي (للخزينة/الدرج) — صفر للآجل
 *  - total_amount  = حصة الوسيلة من إجمالي الفاتورة (للتقارير حسب طريقة الدفع) — الآجل = المتبقي على العميل
 * استخدمه كـ: FROM (${SALE_PAY_LINES_SQL}) pl JOIN sales_invoices i ON i.id = pl.invoice_id
 */
export const SALE_PAY_LINES_SQL = `
  SELECT p.invoice_id AS invoice_id, p.method AS method, p.amount AS amount, p.amount AS total_amount
    FROM sales_invoice_payments p
  UNION ALL
  SELECT i.id, 'credit', 0, i.total - i.paid
    FROM sales_invoices i
   WHERE i.payment_method = 'mixed'
     AND EXISTS (SELECT 1 FROM sales_invoice_payments p WHERE p.invoice_id = i.id)
     AND i.total - i.paid > 0.005
  UNION ALL
  SELECT i.id, i.payment_method, i.paid, i.total
    FROM sales_invoices i
   WHERE NOT EXISTS (SELECT 1 FROM sales_invoice_payments p WHERE p.invoice_id = i.id)`

/** نص SQL بيجمع حصة وسائل دفع معينة من إجمالي الفاتورة `alias` (للتقارير اليومية حسب النوع) */
export function salePayShareSql(invoiceAlias: string, methods: string[]): string {
  const list = methods.map((m) => `'${m}'`).join(',')
  return `COALESCE((SELECT SUM(pl.total_amount) FROM (${SALE_PAY_LINES_SQL}) pl WHERE pl.invoice_id = ${invoiceAlias}.id AND pl.method IN (${list})), 0)`
}

/** الفاتورة فيها جزء آجل ممكن يتسجل على العميل؟ (آجل كامل، أو مقسّم) */
export function hasCreditPart(paymentMethod: string): boolean {
  return paymentMethod === 'credit' || paymentMethod === 'mixed'
}

/** المتبقي على العميل من فاتورة بيع (للآجل والمقسّم) */
export function invoiceOutstanding(invoice: { payment_method: string; total: number | string; paid: number | string }): number {
  return hasCreditPart(invoice.payment_method) ? Number(invoice.total) - Number(invoice.paid) : 0
}

/** حصة الجزء الآجل من إجمالي الفاتورة (0..1) — لتوزيع المرتجع بين رصيد العميل والخزينة */
export function creditShare(invoice: { payment_method: string; total: number | string; paid: number | string }): number {
  const total = Number(invoice.total)
  if (invoice.payment_method === 'credit') return 1
  if (invoice.payment_method !== 'mixed' || total <= 0) return 0
  return Math.min(1, Math.max(0, (total - Number(invoice.paid)) / total))
}

export async function listInvoicePayments(db: Client | Transaction, invoiceId: number): Promise<InvoicePaymentPart[]> {
  const rs = await db.execute({
    sql: 'SELECT method, amount FROM sales_invoice_payments WHERE invoice_id = ? ORDER BY id',
    args: [invoiceId]
  })
  return rs.rows.map((r: any) => ({ method: r.method as PaymentMethod, amount: Number(r.amount) }))
}

/** YYYY-MM-DD صحيح؟ بيرجّع التاريخ كما هو أو null */
export function cleanDate(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}
