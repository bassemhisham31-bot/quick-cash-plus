import { getDb } from '../db'
import { getTaxSettings } from './settings'
import { generateQrDataUrl } from './qrCode'
import type {
  InvoiceListFilter,
  InvoiceListItem,
  InvoiceView,
  ReturnLineInput,
  ReturnResult,
  SalesReturnListRow,
  UpdateInvoiceInput
} from '../../shared/types'

export async function getInvoiceView(invoiceId: number): Promise<InvoiceView | null> {
  const db = getDb()
  const headerRs = await db.execute({
    sql: `SELECT i.id, i.number, i.customer_id AS customerId, i.subtotal, i.discount_total AS discountTotal,
                 i.tax_total AS taxTotal, i.total, i.paid, i.payment_method AS paymentMethod, i.status, i.note,
                 i.created_at AS createdAt, c.name AS customerName, c.phone AS customerPhone, u.full_name AS cashierName,
                 i.loyalty_points_earned AS loyaltyPointsEarned, i.loyalty_points_redeemed AS loyaltyPointsRedeemed,
                 c.loyalty_points AS customerLoyaltyBalance, c.balance AS customerBalance, c.is_walk_in AS isWalkIn,
                 i.order_type AS orderType, t.name AS tableName, d.name AS deliveryDriverName,
                 ro.delivery_address AS deliveryAddress, i.delivery_fee AS deliveryFee, cap.name AS captainName
          FROM sales_invoices i
          JOIN customers c ON c.id = i.customer_id
          JOIN users u ON u.id = i.cashier_id
          LEFT JOIN restaurant_tables t ON t.id = i.table_id
          LEFT JOIN delivery_drivers d ON d.id = i.delivery_driver_id
          LEFT JOIN captains cap ON cap.id = i.captain_id
          LEFT JOIN restaurant_orders ro ON ro.sales_invoice_id = i.id
          WHERE i.id = ?`,
    args: [invoiceId]
  })
  const header = headerRs.rows[0] as any
  if (!header) return null

  const linesRs = await db.execute({
    sql: `SELECT si.id AS salesItemId, si.product_name AS productName, si.barcode, si.qty,
                 si.unit_price AS unitPrice, si.discount, si.total, si.serial_number AS serialNumber, si.note,
                 COALESCE((SELECT SUM(ri.qty) FROM sales_return_items ri WHERE ri.sales_item_id = si.id), 0) AS returnedQty
          FROM sales_items si WHERE si.invoice_id = ?`,
    args: [invoiceId]
  })

  return {
    id: Number(header.id),
    number: header.number,
    customerId: Number(header.customerId),
    customerName: header.customerName,
    customerPhone: header.customerPhone ?? null,
    subtotal: Number(header.subtotal),
    discountTotal: Number(header.discountTotal),
    taxTotal: Number(header.taxTotal),
    total: Number(header.total),
    paid: Number(header.paid),
    paymentMethod: header.paymentMethod,
    status: header.status,
    note: header.note,
    createdAt: header.createdAt,
    cashierName: header.cashierName,
    loyaltyPointsEarned: Number(header.loyaltyPointsEarned ?? 0),
    loyaltyPointsRedeemed: Number(header.loyaltyPointsRedeemed ?? 0),
    customerLoyaltyBalance: header.isWalkIn ? null : Number(header.customerLoyaltyBalance ?? 0),
    ...(header.isWalkIn || header.paymentMethod !== 'credit'
      ? { customerBalanceBefore: null, customerBalanceAfter: null }
      : (() => {
          const after = Number(header.customerBalance ?? 0)
          const before = after - (Number(header.total) - Number(header.paid))
          return { customerBalanceBefore: before, customerBalanceAfter: after }
        })()),
    orderType: header.orderType ?? 'retail',
    tableName: header.tableName ?? null,
    deliveryDriverName: header.deliveryDriverName ?? null,
    deliveryAddress: header.deliveryAddress ?? null,
    deliveryFee: Number(header.deliveryFee ?? 0),
    captainName: header.captainName ?? null,
    lines: linesRs.rows.map((r: any) => ({
      salesItemId: Number(r.salesItemId),
      productName: r.productName,
      barcode: r.barcode,
      qty: Number(r.qty),
      unitPrice: Number(r.unitPrice),
      discount: Number(r.discount),
      total: Number(r.total),
      serialNumber: r.serialNumber ?? null,
      note: r.note ?? null,
      returnedQty: Number(r.returnedQty)
    }))
  }
}

export async function listInvoices(filter: InvoiceListFilter): Promise<InvoiceListItem[]> {
  const db = getDb()
  const term = `%${filter.search.trim()}%`
  const conditions: string[] = []
  const args: unknown[] = []

  conditions.push(filter.includeDeleted ? '1=1' : 'i.deleted_at IS NULL')
  if (filter.search.trim()) {
    conditions.push('(i.number LIKE ? OR c.name LIKE ?)')
    args.push(term, term)
  }
  if (filter.dateFrom) {
    conditions.push('date(i.created_at) >= date(?)')
    args.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    conditions.push('date(i.created_at) <= date(?)')
    args.push(filter.dateTo)
  }
  if (filter.paymentMethod !== 'all') {
    conditions.push('i.payment_method = ?')
    args.push(filter.paymentMethod)
  }
  if (filter.serial?.trim()) {
    conditions.push('EXISTS (SELECT 1 FROM sales_items si WHERE si.invoice_id = i.id AND si.serial_number LIKE ?)')
    args.push(`%${filter.serial.trim()}%`)
  }

  const rs = await db.execute({
    sql: `SELECT i.id, i.number, i.total, i.paid, i.payment_method AS paymentMethod, i.status,
                 i.created_at AS createdAt, i.deleted_at AS deletedAt, c.name AS customerName
          FROM sales_invoices i
          JOIN customers c ON c.id = i.customer_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY i.id DESC
          LIMIT 300`,
    args
  })

  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    number: r.number,
    customerName: r.customerName,
    total: Number(r.total),
    paid: Number(r.paid),
    paymentMethod: r.paymentMethod,
    status: r.status,
    createdAt: r.createdAt,
    deletedAt: r.deletedAt
  }))
}

export async function deleteInvoice(invoiceId: number, userId: number): Promise<void> {
  const db = getDb()

  const invoiceRs = await db.execute({ sql: 'SELECT * FROM sales_invoices WHERE id = ?', args: [invoiceId] })
  const invoice = invoiceRs.rows[0] as any
  if (!invoice) throw new Error('الفاتورة غير موجودة')
  if (invoice.deleted_at) return
  const warehouseId = Number(invoice.warehouse_id)

  const linesRs = await db.execute({
    sql: `SELECT si.id, si.product_id, si.qty,
                 COALESCE((SELECT SUM(ri.qty) FROM sales_return_items ri WHERE ri.sales_item_id = si.id), 0) AS returnedQty
          FROM sales_items si WHERE si.invoice_id = ?`,
    args: [invoiceId]
  })

  const tx = await db.transaction('write')
  try {
    for (const line of linesRs.rows as any[]) {
      const remaining = Number(line.qty) - Number(line.returnedQty)
      if (remaining > 0) {
        await tx.execute({
          sql: 'UPDATE stock SET quantity = quantity + ? WHERE product_id = ? AND warehouse_id = ?',
          args: [remaining, line.product_id, warehouseId]
        })
        await tx.execute({
          sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
                VALUES (?, ?, 'sale_return', ?, 'invoice_delete', ?, ?)`,
          args: [line.product_id, warehouseId, remaining, invoiceId, userId]
        })
      }
    }

    if (invoice.payment_method === 'credit') {
      const outstanding = Number(invoice.total) - Number(invoice.paid)
      if (outstanding !== 0) {
        await tx.execute({
          sql: 'UPDATE customers SET balance = balance - ? WHERE id = ?',
          args: [outstanding, invoice.customer_id]
        })
      }
    }

    await tx.execute({
      sql: "UPDATE sales_invoices SET deleted_at = datetime('now') WHERE id = ?",
      args: [invoiceId]
    })

    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

export async function restoreInvoice(invoiceId: number, userId: number): Promise<void> {
  const db = getDb()

  const invoiceRs = await db.execute({ sql: 'SELECT * FROM sales_invoices WHERE id = ?', args: [invoiceId] })
  const invoice = invoiceRs.rows[0] as any
  if (!invoice) throw new Error('الفاتورة غير موجودة')
  if (!invoice.deleted_at) return
  const warehouseId = Number(invoice.warehouse_id)

  const linesRs = await db.execute({
    sql: `SELECT si.id, si.product_id, si.product_name, si.qty,
                 COALESCE((SELECT SUM(ri.qty) FROM sales_return_items ri WHERE ri.sales_item_id = si.id), 0) AS returnedQty
          FROM sales_items si WHERE si.invoice_id = ?`,
    args: [invoiceId]
  })

  const tx = await db.transaction('write')
  try {
    for (const line of linesRs.rows as any[]) {
      const remaining = Number(line.qty) - Number(line.returnedQty)
      if (remaining > 0) {
        const stockRs = await tx.execute({
          sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
          args: [line.product_id, warehouseId]
        })
        const available = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
        if (available < remaining) {
          throw new Error(`الكمية غير كافية في المخزون لاستعادة الفاتورة (الصنف: ${line.product_name})`)
        }
        await tx.execute({
          sql: 'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
          args: [remaining, line.product_id, warehouseId]
        })
        await tx.execute({
          sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
                VALUES (?, ?, 'sale', ?, 'invoice_restore', ?, ?)`,
          args: [line.product_id, warehouseId, -remaining, invoiceId, userId]
        })
      }
    }

    if (invoice.payment_method === 'credit') {
      const outstanding = Number(invoice.total) - Number(invoice.paid)
      if (outstanding !== 0) {
        await tx.execute({
          sql: 'UPDATE customers SET balance = balance + ? WHERE id = ?',
          args: [outstanding, invoice.customer_id]
        })
      }
    }

    await tx.execute({ sql: 'UPDATE sales_invoices SET deleted_at = NULL WHERE id = ?', args: [invoiceId] })

    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

export async function updateInvoice(
  invoiceId: number,
  input: UpdateInvoiceInput,
  _userId: number
): Promise<InvoiceView | null> {
  const db = getDb()
  const invoiceRs = await db.execute({ sql: 'SELECT * FROM sales_invoices WHERE id = ?', args: [invoiceId] })
  const invoice = invoiceRs.rows[0] as any
  if (!invoice) throw new Error('الفاتورة غير موجودة')

  const tx = await db.transaction('write')
  try {
    if (invoice.payment_method === 'credit') {
      const oldOutstanding = Number(invoice.total) - Number(invoice.paid)
      if (oldOutstanding !== 0) {
        await tx.execute({
          sql: 'UPDATE customers SET balance = balance - ? WHERE id = ?',
          args: [oldOutstanding, invoice.customer_id]
        })
      }
    }

    await tx.execute({
      sql: 'UPDATE sales_invoices SET payment_method = ?, paid = ?, note = ? WHERE id = ?',
      args: [input.paymentMethod, input.paid, input.note || null, invoiceId]
    })

    if (input.paymentMethod === 'credit') {
      const newOutstanding = Number(invoice.total) - input.paid
      if (newOutstanding !== 0) {
        await tx.execute({
          sql: 'UPDATE customers SET balance = balance + ? WHERE id = ?',
          args: [newOutstanding, invoice.customer_id]
        })
      }
    }

    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  return getInvoiceView(invoiceId)
}

export async function returnInvoiceLines(
  invoiceId: number,
  lines: ReturnLineInput[],
  userId: number
): Promise<ReturnResult> {
  const db = getDb()

  if (!lines.length) return { ok: false, error: 'اختر صنف واحد على الأقل للاسترجاع' }

  const invoiceRs = await db.execute({ sql: 'SELECT * FROM sales_invoices WHERE id = ?', args: [invoiceId] })
  const invoice = invoiceRs.rows[0] as any
  if (!invoice || invoice.deleted_at) return { ok: false, error: 'الفاتورة غير موجودة' }
  const warehouseId = Number(invoice.warehouse_id)

  const tx = await db.transaction('write')
  try {
    let totalRefund = 0

    const itemsRs = await tx.execute({ sql: 'SELECT * FROM sales_items WHERE invoice_id = ?', args: [invoiceId] })
    const itemsById = new Map((itemsRs.rows as any[]).map((r) => [Number(r.id), r]))

    const returnInfo = await tx.execute({
      sql: `INSERT INTO sales_returns (invoice_id, type, amount, note, user_id) VALUES (?, 'partial', 0, NULL, ?)`,
      args: [invoiceId, userId]
    })
    const returnId = Number(returnInfo.lastInsertRowid)

    for (const line of lines) {
      const item = itemsById.get(line.salesItemId)
      if (!item) throw new Error('صنف غير موجود في الفاتورة')

      const alreadyReturnedRs = await tx.execute({
        sql: 'SELECT COALESCE(SUM(qty), 0) AS q FROM sales_return_items WHERE sales_item_id = ?',
        args: [line.salesItemId]
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
        sql: 'INSERT INTO sales_return_items (return_id, sales_item_id, qty, amount) VALUES (?, ?, ?, ?)',
        args: [returnId, line.salesItemId, line.qty, refundAmount]
      })

      await tx.execute({
        sql: 'UPDATE stock SET quantity = quantity + ? WHERE product_id = ? AND warehouse_id = ?',
        args: [line.qty, item.product_id, warehouseId]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'sale_return', ?, 'sales_return', ?, ?)`,
        args: [item.product_id, warehouseId, line.qty, returnId, userId]
      })
    }

    // هل كل أصناف الفاتورة اتسترجعت بالكامل بعد العملية دي؟
    const fullyReturnedCheck = await tx.execute({
      sql: `SELECT COUNT(*) AS remaining FROM sales_items si
            WHERE si.invoice_id = ?
              AND si.qty > COALESCE((SELECT SUM(ri.qty) FROM sales_return_items ri WHERE ri.sales_item_id = si.id), 0)`,
      args: [invoiceId]
    })
    const stillHasRemaining = Number((fullyReturnedCheck.rows[0] as any).remaining) > 0
    const newStatus: 'returned' | 'partial_return' = stillHasRemaining ? 'partial_return' : 'returned'

    await tx.execute({
      sql: `UPDATE sales_returns SET type = ?, amount = ? WHERE id = ?`,
      args: [newStatus === 'returned' ? 'full' : 'partial', totalRefund, returnId]
    })
    await tx.execute({ sql: 'UPDATE sales_invoices SET status = ? WHERE id = ?', args: [newStatus, invoiceId] })

    if (invoice.payment_method === 'credit' && totalRefund !== 0) {
      await tx.execute({
        sql: 'UPDATE customers SET balance = balance - ? WHERE id = ?',
        args: [totalRefund, invoice.customer_id]
      })
    }

    await tx.commit()
    return { ok: true, refundAmount: totalRefund, status: newStatus }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء الاسترجاع' }
  }
}

export async function listSalesReturns(filter: { from?: string; to?: string } = {}): Promise<SalesReturnListRow[]> {
  const db = getDb()
  const conditions: string[] = []
  const args: unknown[] = []
  if (filter.from) {
    conditions.push('sr.created_at >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('sr.created_at <= ?')
    args.push(filter.to)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rs = await db.execute({
    sql: `SELECT sr.id, sr.invoice_id AS invoiceId, sr.amount, sr.note, sr.created_at AS createdAt,
                 i.number AS invoiceNumber, c.name AS customerName
          FROM sales_returns sr
          JOIN sales_invoices i ON i.id = sr.invoice_id
          JOIN customers c ON c.id = i.customer_id
          ${where}
          ORDER BY sr.id DESC`,
    args
  })

  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    invoiceId: Number(r.invoiceId),
    invoiceNumber: r.invoiceNumber,
    customerName: r.customerName,
    reasonNote: r.note ?? null,
    amount: Number(r.amount),
    createdAt: r.createdAt
  }))
}

export async function getReceiptQr(invoiceId: number): Promise<string | null> {
  const invoice = await getInvoiceView(invoiceId)
  if (!invoice) return null

  const taxSettings = await getTaxSettings()
  const payload = [
    `Quick Cash Plus`,
    `INV:${invoice.number}`,
    `DATE:${invoice.createdAt}`,
    `TOTAL:${invoice.total.toFixed(2)}`,
    `TAX:${invoice.taxTotal.toFixed(2)}`,
    taxSettings.taxNumber ? `TAXNO:${taxSettings.taxNumber}` : null
  ]
    .filter(Boolean)
    .join('|')

  return generateQrDataUrl(payload)
}
