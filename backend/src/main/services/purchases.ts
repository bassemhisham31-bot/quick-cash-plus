import { getDb } from '../db'
import type {
  PurchaseInvoiceInput,
  PurchaseInvoiceListItem,
  PurchaseInvoiceResult,
  PurchaseInvoiceView,
  PurchaseReturnListRow,
  ReturnPurchaseLineInput,
  ReturnResult
} from '../../shared/types'

export async function createPurchaseInvoice(
  input: PurchaseInvoiceInput,
  userId: number
): Promise<PurchaseInvoiceResult> {
  if (!input.lines.length) return { ok: false, error: 'أضف صنف واحد على الأقل' }

  const db = getDb()
  const total = input.lines.reduce((sum, l) => sum + l.qty * l.purchasePrice, 0)

  const tx = await db.transaction('write')
  try {
    const info = await tx.execute({
      sql: `INSERT INTO purchase_invoices (number, vendor_id, warehouse_id, total, payment_method, paid, user_id)
            VALUES ('PENDING', ?, ?, ?, ?, ?, ?)`,
      args: [input.vendorId, input.warehouseId, total, input.paymentMethod, input.paid, userId]
    })
    const purchaseId = Number(info.lastInsertRowid)
    const number = `PUR-${String(purchaseId).padStart(6, '0')}`
    await tx.execute({ sql: 'UPDATE purchase_invoices SET number = ? WHERE id = ?', args: [number, purchaseId] })

    for (const line of input.lines) {
      const lineTotal = line.qty * line.purchasePrice
      await tx.execute({
        sql: `INSERT INTO purchase_items (purchase_invoice_id, product_id, product_name, qty, purchase_price, total)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [purchaseId, line.productId, line.name, line.qty, line.purchasePrice, lineTotal]
      })

      await tx.execute({
        sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
              ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
        args: [line.productId, input.warehouseId, line.qty]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'purchase', ?, 'purchase_invoice', ?, ?)`,
        args: [line.productId, input.warehouseId, line.qty, purchaseId, userId]
      })
      await tx.execute({
        sql: 'UPDATE products SET cost_price = ? WHERE id = ?',
        args: [line.purchasePrice, line.productId]
      })
    }

    if (input.vendorId && input.paymentMethod === 'credit') {
      const outstanding = total - input.paid
      if (outstanding !== 0) {
        await tx.execute({
          sql: 'UPDATE vendors SET balance = balance + ? WHERE id = ?',
          args: [outstanding, input.vendorId]
        })
      }
    }

    await tx.commit()
    return { ok: true, purchaseId, number, total }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء تسجيل فاتورة المشتريات' }
  }
}

export async function listPurchaseInvoices(): Promise<PurchaseInvoiceListItem[]> {
  const db = getDb()
  const rs = await db.execute(
    `SELECT pi.id, pi.number, pi.total, pi.paid, pi.payment_method AS paymentMethod, pi.created_at AS createdAt,
            COALESCE(v.name, 'مورد غير محدد') AS vendorName
     FROM purchase_invoices pi
     LEFT JOIN vendors v ON v.id = pi.vendor_id
     ORDER BY pi.id DESC
     LIMIT 300`
  )
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    number: r.number,
    vendorName: r.vendorName,
    total: Number(r.total),
    paid: Number(r.paid),
    paymentMethod: r.paymentMethod,
    createdAt: r.createdAt
  }))
}

export async function getPurchaseInvoiceView(purchaseId: number): Promise<PurchaseInvoiceView | null> {
  const db = getDb()
  const headerRs = await db.execute({
    sql: `SELECT pi.id, pi.number, pi.total, pi.paid, pi.payment_method AS paymentMethod, pi.note, pi.status,
                 pi.created_at AS createdAt, COALESCE(v.name, 'مورد غير محدد') AS vendorName,
                 w.name AS warehouseName, u.full_name AS cashierName
          FROM purchase_invoices pi
          LEFT JOIN vendors v ON v.id = pi.vendor_id
          JOIN warehouses w ON w.id = pi.warehouse_id
          JOIN users u ON u.id = pi.user_id
          WHERE pi.id = ?`,
    args: [purchaseId]
  })
  const header = headerRs.rows[0] as any
  if (!header) return null

  const linesRs = await db.execute({
    sql: `SELECT id AS purchaseItemId, product_name AS productName, qty, purchase_price AS purchasePrice, total,
                 COALESCE((SELECT SUM(ri.qty) FROM purchase_return_items ri WHERE ri.purchase_item_id = purchase_items.id), 0) AS returnedQty
          FROM purchase_items WHERE purchase_invoice_id = ?`,
    args: [purchaseId]
  })

  return {
    id: Number(header.id),
    number: header.number,
    vendorName: header.vendorName,
    warehouseName: header.warehouseName,
    total: Number(header.total),
    paid: Number(header.paid),
    paymentMethod: header.paymentMethod,
    status: header.status,
    note: header.note,
    createdAt: header.createdAt,
    cashierName: header.cashierName,
    lines: linesRs.rows.map((r: any) => ({
      purchaseItemId: Number(r.purchaseItemId),
      productName: r.productName,
      barcode: '',
      qty: Number(r.qty),
      purchasePrice: Number(r.purchasePrice),
      total: Number(r.total),
      returnedQty: Number(r.returnedQty)
    }))
  }
}

/** يسترجع أصناف من فاتورة مشتريات — عكس تام لـ`returnInvoiceLines` في invoices.ts: بيقلل المخزون
 * بدل ما يزوده (المشتريات أضافت مخزون، فالمرتجع بيشيله)، وبيقلل رصيد المورد المستحق بدل رصيد العميل. */
export async function returnPurchaseLines(
  purchaseId: number,
  lines: ReturnPurchaseLineInput[],
  userId: number
): Promise<ReturnResult> {
  const db = getDb()

  if (!lines.length) return { ok: false, error: 'اختر صنف واحد على الأقل للاسترجاع' }

  const invoiceRs = await db.execute({ sql: 'SELECT * FROM purchase_invoices WHERE id = ?', args: [purchaseId] })
  const invoice = invoiceRs.rows[0] as any
  if (!invoice) return { ok: false, error: 'فاتورة المشتريات غير موجودة' }
  const warehouseId = Number(invoice.warehouse_id)

  const tx = await db.transaction('write')
  try {
    let totalRefund = 0

    const itemsRs = await tx.execute({ sql: 'SELECT * FROM purchase_items WHERE purchase_invoice_id = ?', args: [purchaseId] })
    const itemsById = new Map((itemsRs.rows as any[]).map((r) => [Number(r.id), r]))

    const returnInfo = await tx.execute({
      sql: `INSERT INTO purchase_returns (purchase_invoice_id, type, amount, note, user_id) VALUES (?, 'partial', 0, NULL, ?)`,
      args: [purchaseId, userId]
    })
    const returnId = Number(returnInfo.lastInsertRowid)

    for (const line of lines) {
      const item = itemsById.get(line.purchaseItemId)
      if (!item) throw new Error('صنف غير موجود في فاتورة المشتريات')

      const alreadyReturnedRs = await tx.execute({
        sql: 'SELECT COALESCE(SUM(qty), 0) AS q FROM purchase_return_items WHERE purchase_item_id = ?',
        args: [line.purchaseItemId]
      })
      const alreadyReturned = Number((alreadyReturnedRs.rows[0] as any).q)
      const remaining = Number(item.qty) - alreadyReturned
      if (line.qty <= 0 || line.qty > remaining) {
        throw new Error(`كمية الاسترجاع غير صحيحة للصنف: ${item.product_name}`)
      }

      const unitEffective = Number(item.total) / Number(item.qty)
      const refundAmount = line.qty * unitEffective
      totalRefund += refundAmount

      await tx.execute({
        sql: 'INSERT INTO purchase_return_items (return_id, purchase_item_id, qty, amount) VALUES (?, ?, ?, ?)',
        args: [returnId, line.purchaseItemId, line.qty, refundAmount]
      })

      const stockRs = await tx.execute({
        sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        args: [item.product_id, warehouseId]
      })
      const available = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
      if (available < line.qty) {
        throw new Error(`الكمية غير كافية في المخزون لاسترجاع الصنف: ${item.product_name}`)
      }
      await tx.execute({
        sql: 'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
        args: [line.qty, item.product_id, warehouseId]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'adjustment', ?, 'purchase_return', ?, ?)`,
        args: [item.product_id, warehouseId, -line.qty, returnId, userId]
      })
    }

    const fullyReturnedCheck = await tx.execute({
      sql: `SELECT COUNT(*) AS remaining FROM purchase_items pi
            WHERE pi.purchase_invoice_id = ?
              AND pi.qty > COALESCE((SELECT SUM(ri.qty) FROM purchase_return_items ri WHERE ri.purchase_item_id = pi.id), 0)`,
      args: [purchaseId]
    })
    const stillHasRemaining = Number((fullyReturnedCheck.rows[0] as any).remaining) > 0
    const newStatus: 'returned' | 'partial_return' = stillHasRemaining ? 'partial_return' : 'returned'

    await tx.execute({
      sql: `UPDATE purchase_returns SET type = ?, amount = ? WHERE id = ?`,
      args: [newStatus === 'returned' ? 'full' : 'partial', totalRefund, returnId]
    })
    await tx.execute({ sql: 'UPDATE purchase_invoices SET status = ? WHERE id = ?', args: [newStatus, purchaseId] })

    if (invoice.vendor_id && invoice.payment_method === 'credit' && totalRefund !== 0) {
      await tx.execute({
        sql: 'UPDATE vendors SET balance = balance - ? WHERE id = ?',
        args: [totalRefund, invoice.vendor_id]
      })
    }

    await tx.commit()
    return { ok: true, refundAmount: totalRefund, status: newStatus }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء استرجاع المشتريات' }
  }
}

export async function listPurchaseReturns(filter: { from?: string; to?: string } = {}): Promise<PurchaseReturnListRow[]> {
  const db = getDb()
  const conditions: string[] = []
  const args: unknown[] = []
  if (filter.from) {
    conditions.push('pr.created_at >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('pr.created_at <= ?')
    args.push(filter.to)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rs = await db.execute({
    sql: `SELECT pr.id, pr.purchase_invoice_id AS purchaseInvoiceId, pr.amount, pr.note, pr.created_at AS createdAt,
                 pi.number AS invoiceNumber, COALESCE(v.name, 'مورد غير محدد') AS vendorName
          FROM purchase_returns pr
          JOIN purchase_invoices pi ON pi.id = pr.purchase_invoice_id
          LEFT JOIN vendors v ON v.id = pi.vendor_id
          ${where}
          ORDER BY pr.id DESC`,
    args
  })

  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    purchaseInvoiceId: Number(r.purchaseInvoiceId),
    invoiceNumber: r.invoiceNumber,
    vendorName: r.vendorName,
    reasonNote: r.note ?? null,
    amount: Number(r.amount),
    createdAt: r.createdAt
  }))
}
