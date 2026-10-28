import { getDb } from '../db'
import { getTempItemProductId, getWalkInCustomerId } from '../db/seed'
import { branchesEnabled, currentBranchId, requireBranchId } from './branchScope'
import { getOpenSession } from './cashSession'
import { getLoyaltySettings, getPosUiSettings, getTaxSettings } from './settings'
import { notifySaleByWhatsApp } from './whatsapp'
import { checkRecipeStock, deductRecipeIfAny } from './recipes'
import type { CheckoutInput, CheckoutResult } from '../../shared/types'

/**
 * بيرفض الخصم لو الكاشير مالوش صلاحية "pos.discount" أو الخصم عدّى أقصى نسبة في الإعدادات — نفس قواعد الشاشة بس هنا
 * مفيش طريقة للتحايل عليها (الأدمن مالوش حد). بيرجع رسالة الخطأ أو null لو كله تمام.
 */
async function validateDiscounts(input: CheckoutInput, cashierId: number, subtotal: number, discountTotal: number): Promise<string | null> {
  const lineDiscounts = input.lines.reduce((s, l) => s + (l.discount > 0 ? l.discount : 0), 0)
  if (lineDiscounts <= 0 && discountTotal <= 0) return null

  const db = getDb()
  const userRs = await db.execute({ sql: 'SELECT role FROM users WHERE id = ?', args: [cashierId] })
  const role = (userRs.rows[0] as any)?.role
  if (role === 'admin') return null

  const permRs = await db.execute({
    sql: "SELECT 1 FROM user_permissions WHERE user_id = ? AND permission_code = 'pos.discount'",
    args: [cashierId]
  })
  if (!permRs.rows.length) return 'مفيش عندك صلاحية عمل خصم'

  const { maxDiscountPercent } = await getPosUiSettings()
  if (maxDiscountPercent >= 100) return null
  const eps = 0.01
  for (const l of input.lines) {
    const gross = l.qty * l.unitPrice
    if (l.discount > gross * (maxDiscountPercent / 100) + eps) {
      return `خصم "${l.name}" أكبر من أقصى نسبة مسموحة (${maxDiscountPercent}%)`
    }
  }
  if (discountTotal > subtotal * (maxDiscountPercent / 100) + eps) {
    return `خصم الفاتورة أكبر من أقصى نسبة مسموحة (${maxDiscountPercent}%)`
  }
  return null
}

export async function checkout(
  input: CheckoutInput,
  cashierId: number,
  opts: { skipDiscountCheck?: boolean } = {}
): Promise<CheckoutResult> {
  const db = getDb()

  if (!input.lines.length) return { ok: false, error: 'السلة فارغة' }

  if (branchesEnabled() && currentBranchId() == null) return { ok: false, error: 'اختار فرع محدد من أعلى الشاشة قبل البيع' }
  const session = await getOpenSession()
  if (!session) return { ok: false, error: 'لازم تبدأ اليوم أول من لوحة التحكم قبل البيع' }
  const branchId = requireBranchId()

  const warehouseId = input.warehouseId
  if (branchesEnabled()) {
    // المخازن المستخدمة في الفاتورة لازم تكون تابعة لفرع البيع (مفيش بيع من مخزن فرع تاني)
    const used = [...new Set([warehouseId, ...input.lines.map((l) => l.warehouseId ?? warehouseId)])]
    const rs = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM warehouses WHERE branch_id = ? AND id IN (${used.map(() => '?').join(',')})`,
      args: [branchId, ...used]
    })
    if (Number((rs.rows[0] as any).c) !== used.length) return { ok: false, error: 'مخزن الصنف تابع لفرع تاني' }
  }
  const isWalkInSelection = input.customerId === null
  const customerId = input.customerId ?? (await getWalkInCustomerId(db))

  const subtotal = input.lines.reduce((sum, l) => sum + l.qty * l.unitPrice - l.discount, 0)
  const discountTotal =
    input.discountType === 'percent' ? subtotal * (input.discountValue / 100) : input.discountValue
  const preTaxTotal = Math.max(0, subtotal - discountTotal)

  if (!opts.skipDiscountCheck) {
    const discountError = await validateDiscounts(input, cashierId, subtotal, discountTotal)
    if (discountError) return { ok: false, error: discountError }
  }

  const taxSettings = await getTaxSettings()
  const taxTotal =
    input.taxValue !== undefined
      ? input.taxType === 'value'
        ? input.taxValue
        : preTaxTotal * (input.taxValue / 100)
      : taxSettings.enabled
        ? preTaxTotal * (taxSettings.rate / 100)
        : 0

  const serviceChargeTotal = input.serviceChargeValue
    ? input.serviceChargeType === 'percent'
      ? preTaxTotal * (input.serviceChargeValue / 100)
      : input.serviceChargeValue
    : 0
  const orderType = input.orderType ?? 'retail'
  const deliveryFee = input.deliveryFee ?? 0

  const loyaltySettings = await getLoyaltySettings()
  let customerLoyaltyEnabled = false
  let redeemPoints = 0
  let redeemDiscount = 0
  if (loyaltySettings.enabled && !isWalkInSelection) {
    const customerRs = await db.execute({
      sql: 'SELECT loyalty_enabled, loyalty_points FROM customers WHERE id = ?',
      args: [customerId]
    })
    const row = customerRs.rows[0] as any
    customerLoyaltyEnabled = !!row?.loyalty_enabled
    if (customerLoyaltyEnabled && input.redeemPoints > 0) {
      const available = Number(row?.loyalty_points ?? 0)
      redeemPoints = Math.min(input.redeemPoints, available)
      redeemDiscount = redeemPoints * loyaltySettings.redemptionValue
    }
  }

  const total = Math.max(0, preTaxTotal + taxTotal + serviceChargeTotal + deliveryFee - redeemDiscount)
  const earnedPoints = customerLoyaltyEnabled ? Math.floor(total * loyaltySettings.pointsPerCurrency) : 0

  let salesRepId: number | null = null
  let commissionAmount = 0
  if (input.salesRepId) {
    const repRs = await db.execute({
      sql: 'SELECT id, commission_percent FROM sales_reps WHERE id = ? AND active = 1 AND deleted_at IS NULL',
      args: [input.salesRepId]
    })
    const rep = repRs.rows[0] as any
    if (rep) {
      salesRepId = Number(rep.id)
      commissionAmount = total * (Number(rep.commission_percent) / 100)
    }
  }

  const tempItemProductId = input.lines.some((l) => l.isTemp) ? await getTempItemProductId(db) : null

  const tx = await db.transaction('write')
  try {
    // تأكيد كفاية المخزون قبل أي تعديل — الأصناف المؤقتة (خارج المخزون) مستثناة تمامًا.
    // الصنف اللي ليه وصفة (BOM) بيتفحص من كفاية خاماته، مش من مخزونه هو نفسه (غالبًا مالوش مخزون فعلي).
    // المطعم بيبعت allowNegativeStock بنفسه؛ البيع العادي بيسمح بالسالب بس لو الخيار مفعّل في الإعدادات (بيتفحص هنا مش في الواجهة)
    const allowNegative = input.allowNegativeStock === true || (await getPosUiSettings()).allowNegativeStock
    for (const line of input.lines) {
      if (line.isTemp || allowNegative) continue
      const lineWarehouseId = line.warehouseId ?? warehouseId
      const recipeCheck = await checkRecipeStock(tx, line.productId, line.qty, lineWarehouseId)
      if (recipeCheck.hasRecipe) {
        if (recipeCheck.insufficientMaterial) {
          throw new Error(`الكمية غير كافية في المخزون للخامة: ${recipeCheck.insufficientMaterial}`)
        }
        continue
      }
      const stockRs = await tx.execute({
        sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        args: [line.productId, lineWarehouseId]
      })
      const available = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
      if (available < line.qty) {
        throw new Error(`الكمية غير كافية في المخزون للصنف: ${line.name}`)
      }
    }

    // تسوية اختيارية: خصم قيمة من رصيد المورد المرتبط بنفس العميل بدل ما تتحسب دَين عليه
    let settledAmount = 0
    let settlementVendorId: number | null = null
    if (!isWalkInSelection && input.vendorSettlementAmount && input.vendorSettlementAmount > 0) {
      const custRs = await tx.execute({ sql: 'SELECT linked_vendor_id FROM customers WHERE id = ?', args: [customerId] })
      const linkedVendorId = (custRs.rows[0] as any)?.linked_vendor_id
      if (linkedVendorId) {
        const vendorRs = await tx.execute({ sql: 'SELECT balance FROM vendors WHERE id = ?', args: [linkedVendorId] })
        const vendorBalance = vendorRs.rows[0] ? Number((vendorRs.rows[0] as any).balance) : 0
        settledAmount = Math.min(input.vendorSettlementAmount, vendorBalance, total)
        if (settledAmount > 0) settlementVendorId = Number(linkedVendorId)
      }
    }

    const info = await tx.execute({
      sql: `INSERT INTO sales_invoices
              (number, customer_id, session_id, cashier_id, warehouse_id, subtotal, discount_type, discount_value,
               discount_total, tax_total, total, paid, payment_method, status, loyalty_points_earned, loyalty_points_redeemed,
               sales_rep_id, commission_amount, order_type, table_id, delivery_fee, delivery_driver_id, service_charge_total, captain_id,
               delivery_address, delivery_mark, customer_label, tip_amount, branch_id)
            VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        customerId,
        session.id,
        cashierId,
        warehouseId,
        subtotal,
        input.discountType,
        input.discountValue,
        discountTotal,
        taxTotal,
        total,
        input.paid + settledAmount,
        input.paymentMethod,
        earnedPoints,
        redeemPoints,
        salesRepId,
        commissionAmount,
        orderType,
        input.tableId ?? null,
        deliveryFee,
        input.deliveryDriverId ?? null,
        serviceChargeTotal,
        input.captainId ?? null,
        orderType === 'delivery' ? input.deliveryAddress?.trim() || null : null,
        orderType === 'delivery' ? input.deliveryMark?.trim() || null : null,
        isWalkInSelection ? input.customerLabel?.trim().slice(0, 80) || null : null,
        input.paymentMethod !== 'credit' ? Math.max(0, Math.round((Number(input.tipAmount) || 0) * 100) / 100) : 0,
        branchId
      ]
    })
    const invoiceId = Number(info.lastInsertRowid)
    const number = `QCP-${String(invoiceId).padStart(6, '0')}`
    await tx.execute({ sql: 'UPDATE sales_invoices SET number = ? WHERE id = ?', args: [number, invoiceId] })

    for (const line of input.lines) {
      const lineTotal = line.qty * line.unitPrice - line.discount
      const lineProductId = line.isTemp ? tempItemProductId : line.productId
      // تكلفة الوحدة وقت البيع — بتتسجّل عشان تكلفة البضاعة المباعة في القيود متتغيّرش لو التكلفة اتعدّلت بعد كده
      const costRs = line.isTemp ? null : await tx.execute({ sql: 'SELECT cost_price FROM products WHERE id = ?', args: [line.productId] })
      const lineCost = costRs?.rows[0] ? Number((costRs.rows[0] as any).cost_price) : 0
      await tx.execute({
        sql: `INSERT INTO sales_items (invoice_id, product_id, product_name, barcode, qty, unit_price, discount, total, serial_number, note, warehouse_id, cost_price)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          invoiceId,
          lineProductId,
          line.name,
          line.barcode,
          line.qty,
          line.unitPrice,
          line.discount,
          lineTotal,
          line.serialNumber?.trim() || null,
          line.note?.trim() || null,
          line.isTemp ? null : (line.warehouseId ?? null),
          lineCost
        ]
      })
      if (line.isTemp) continue
      const lineWarehouseId = line.warehouseId ?? warehouseId
      const deductedByRecipe = await deductRecipeIfAny(tx, line.productId, line.qty, lineWarehouseId, invoiceId, cashierId)
      if (deductedByRecipe) continue
      await tx.execute({
        // upsert بدل UPDATE: صنف مالوش صف مخزون في المخزن ده (ممكن في المطعم مع البيع بالسالب) لازم يتخصم برضه
        sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
              ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity - ?`,
        args: [line.productId, lineWarehouseId, -line.qty, line.qty]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'sale', ?, 'sales_invoice', ?, ?)`,
        args: [line.productId, lineWarehouseId, -line.qty, invoiceId, cashierId]
      })
    }

    if (input.paymentMethod === 'credit') {
      const creditAmount = total - settledAmount
      if (creditAmount !== 0) {
        await tx.execute({
          sql: 'UPDATE customers SET balance = balance + ? WHERE id = ?',
          args: [creditAmount, customerId]
        })
      }
    }

    if (settlementVendorId && settledAmount > 0) {
      await tx.execute({
        sql: 'UPDATE vendors SET balance = balance - ? WHERE id = ?',
        args: [settledAmount, settlementVendorId]
      })
      await tx.execute({
        sql: `INSERT INTO party_settlements (customer_id, vendor_id, amount, sales_invoice_id, user_id)
              VALUES (?, ?, ?, ?, ?)`,
        args: [customerId, settlementVendorId, settledAmount, invoiceId, cashierId]
      })
    }

    if (!isWalkInSelection && (redeemPoints > 0 || earnedPoints > 0)) {
      await tx.execute({
        sql: 'UPDATE customers SET loyalty_points = loyalty_points - ? + ? WHERE id = ?',
        args: [redeemPoints, earnedPoints, customerId]
      })
    }

    await tx.commit()

    if (!isWalkInSelection) {
      notifySaleByWhatsApp(customerId, invoiceId, number, total).catch(() => {})
    }

    return { ok: true, invoiceId, invoiceNumber: number, total }
  } catch (err: any) {
    await tx.rollback()
    return { ok: false, error: err?.message ?? 'حدث خطأ أثناء إتمام عملية البيع' }
  }
}
