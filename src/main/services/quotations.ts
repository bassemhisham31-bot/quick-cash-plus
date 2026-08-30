import { getDb } from '../db'
import { checkout } from './pos'
import type {
  CheckoutInput,
  PaymentMethod,
  QuotationConvertResult,
  QuotationInput,
  QuotationListItem,
  QuotationView
} from '../../shared/types'

export async function createQuotation(input: QuotationInput, userId: number): Promise<QuotationView> {
  if (!input.lines.length) throw new Error('أضف صنف واحد على الأقل')

  const db = getDb()
  const subtotal = input.lines.reduce((sum, l) => sum + l.qty * l.unitPrice - l.discount, 0)
  const discountTotal =
    input.discountType === 'percent' ? subtotal * (input.discountValue / 100) : input.discountValue
  const total = Math.max(0, subtotal - discountTotal)

  const tx = await db.transaction('write')
  try {
    const info = await tx.execute({
      sql: `INSERT INTO quotations
              (number, customer_id, customer_name, subtotal, discount_type, discount_value, discount_total, total,
               status, valid_until, note, user_id)
            VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      args: [
        input.customerId,
        input.customerName.trim() || null,
        subtotal,
        input.discountType,
        input.discountValue,
        discountTotal,
        total,
        input.validUntil || null,
        input.note.trim() || null,
        userId
      ]
    })
    const quotationId = Number(info.lastInsertRowid)
    const number = `QUO-${String(quotationId).padStart(6, '0')}`
    await tx.execute({ sql: 'UPDATE quotations SET number = ? WHERE id = ?', args: [number, quotationId] })

    for (const line of input.lines) {
      const lineTotal = line.qty * line.unitPrice - line.discount
      await tx.execute({
        sql: `INSERT INTO quotation_items (quotation_id, product_id, product_name, barcode, qty, unit_price, discount, total)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [quotationId, line.productId, line.name, line.barcode, line.qty, line.unitPrice, line.discount, lineTotal]
      })
    }

    await tx.commit()
    const view = await getQuotationView(quotationId)
    if (!view) throw new Error('تعذر إنشاء عرض السعر')
    return view
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

export async function listQuotations(): Promise<QuotationListItem[]> {
  const db = getDb()
  const rs = await db.execute(
    `SELECT q.id, q.number, q.total, q.status, q.valid_until AS validUntil, q.created_at AS createdAt,
            COALESCE(c.name, q.customer_name, 'بدون عميل') AS customerName
     FROM quotations q
     LEFT JOIN customers c ON c.id = q.customer_id
     ORDER BY q.id DESC
     LIMIT 300`
  )
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    number: r.number,
    customerName: r.customerName,
    total: Number(r.total),
    status: r.status,
    validUntil: r.validUntil,
    createdAt: r.createdAt
  }))
}

export async function getQuotationView(quotationId: number): Promise<QuotationView | null> {
  const db = getDb()
  const headerRs = await db.execute({
    sql: `SELECT q.id, q.number, q.customer_id AS customerId, q.subtotal, q.discount_total AS discountTotal,
                 q.total, q.status, q.valid_until AS validUntil, q.note, q.created_at AS createdAt,
                 q.converted_invoice_id AS convertedInvoiceId,
                 COALESCE(c.name, q.customer_name, 'بدون عميل') AS customerName, u.full_name AS cashierName
          FROM quotations q
          LEFT JOIN customers c ON c.id = q.customer_id
          JOIN users u ON u.id = q.user_id
          WHERE q.id = ?`,
    args: [quotationId]
  })
  const header = headerRs.rows[0] as any
  if (!header) return null

  const linesRs = await db.execute({
    sql: `SELECT product_name AS productName, barcode, qty, unit_price AS unitPrice, discount, total
          FROM quotation_items WHERE quotation_id = ?`,
    args: [quotationId]
  })

  return {
    id: Number(header.id),
    number: header.number,
    customerId: header.customerId != null ? Number(header.customerId) : null,
    customerName: header.customerName,
    subtotal: Number(header.subtotal),
    discountTotal: Number(header.discountTotal),
    total: Number(header.total),
    status: header.status,
    validUntil: header.validUntil,
    note: header.note,
    createdAt: header.createdAt,
    cashierName: header.cashierName,
    convertedInvoiceId: header.convertedInvoiceId != null ? Number(header.convertedInvoiceId) : null,
    lines: linesRs.rows.map((r: any) => ({
      productName: r.productName,
      barcode: r.barcode ?? '',
      qty: Number(r.qty),
      unitPrice: Number(r.unitPrice),
      discount: Number(r.discount),
      total: Number(r.total)
    }))
  }
}

export async function updateQuotationStatus(
  quotationId: number,
  status: 'draft' | 'sent' | 'expired'
): Promise<QuotationView | null> {
  const db = getDb()
  await db.execute({ sql: 'UPDATE quotations SET status = ? WHERE id = ?', args: [status, quotationId] })
  return getQuotationView(quotationId)
}

export async function convertQuotationToInvoice(
  quotationId: number,
  options: { warehouseId: number; paymentMethod: PaymentMethod; paid: number },
  userId: number
): Promise<QuotationConvertResult> {
  const db = getDb()
  const quoteRs = await db.execute({
    sql: `SELECT customer_id AS customerId, status, converted_invoice_id AS convertedInvoiceId,
                 discount_type AS discountType, discount_value AS discountValue
          FROM quotations WHERE id = ?`,
    args: [quotationId]
  })
  const quote = quoteRs.rows[0] as any
  if (!quote) return { ok: false, error: 'عرض السعر غير موجود' }
  if (quote.convertedInvoiceId) return { ok: false, error: 'عرض السعر ده اتحول لفاتورة قبل كده' }

  const itemsRs = await db.execute({
    sql: `SELECT product_id AS productId, product_name AS productName, barcode, qty, unit_price AS unitPrice, discount
          FROM quotation_items WHERE quotation_id = ?`,
    args: [quotationId]
  })
  const lines = itemsRs.rows.map((r: any) => ({
    productId: Number(r.productId),
    name: r.productName,
    barcode: r.barcode ?? '',
    unitPrice: Number(r.unitPrice),
    qty: Number(r.qty),
    discount: Number(r.discount)
  }))
  if (lines.some((l) => !l.productId)) {
    return { ok: false, error: 'مينفعش تحويل عرض سعر فيه أصناف بدون منتج مرتبط' }
  }

  const checkoutInput: CheckoutInput = {
    customerId: quote.customerId != null ? Number(quote.customerId) : null,
    warehouseId: options.warehouseId,
    lines,
    discountType: quote.discountType,
    discountValue: Number(quote.discountValue),
    paymentMethod: options.paymentMethod,
    paid: options.paid,
    redeemPoints: 0
  }

  const result = await checkout(checkoutInput, userId)
  if (!result.ok || !result.invoiceId) return { ok: false, error: result.error ?? 'تعذر إتمام البيع' }

  await db.execute({
    sql: "UPDATE quotations SET status = 'accepted', converted_invoice_id = ? WHERE id = ?",
    args: [result.invoiceId, quotationId]
  })

  return { ok: true, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber }
}
