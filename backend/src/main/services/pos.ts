import { getDb } from '../db'
import { getTempItemProductId, getWalkInCustomerId } from '../db/seed'
import { getOpenSession } from './cashSession'
import { getLoyaltySettings, getTaxSettings } from './settings'
import { notifySaleByWhatsApp } from './whatsapp'
import { checkRecipeStock, deductRecipeIfAny } from './recipes'
import type { CheckoutInput, CheckoutResult } from '../../shared/types'

export async function checkout(input: CheckoutInput, cashierId: number): Promise<CheckoutResult> {
  const db = getDb()

  if (!input.lines.length) return { ok: false, error: 'السلة فارغة' }

  const session = await getOpenSession()
  if (!session) return { ok: false, error: 'لازم تبدأ اليوم أول من لوحة التحكم قبل البيع' }

  const warehouseId = input.warehouseId
  const isWalkInSelection = input.customerId === null
  const customerId = input.customerId ?? (await getWalkInCustomerId(db))

  const subtotal = input.lines.reduce((sum, l) => sum + l.qty * l.unitPrice - l.discount, 0)
  const discountTotal =
    input.discountType === 'percent' ? subtotal * (input.discountValue / 100) : input.discountValue
  const preTaxTotal = Math.max(0, subtotal - discountTotal)

  const taxSettings = await getTaxSettings()
  const taxTotal = taxSettings.enabled ? preTaxTotal * (taxSettings.rate / 100) : 0

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
    for (const line of input.lines) {
      if (line.isTemp) continue
      const recipeCheck = await checkRecipeStock(tx, line.productId, line.qty, warehouseId)
      if (recipeCheck.hasRecipe) {
        if (recipeCheck.insufficientMaterial) {
          throw new Error(`الكمية غير كافية في المخزون للخامة: ${recipeCheck.insufficientMaterial}`)
        }
        continue
      }
      const stockRs = await tx.execute({
        sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        args: [line.productId, warehouseId]
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
               sales_rep_id, commission_amount, order_type, table_id, delivery_fee, delivery_driver_id, service_charge_total, captain_id)
            VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.captainId ?? null
      ]
    })
    const invoiceId = Number(info.lastInsertRowid)
    const number = `QCP-${String(invoiceId).padStart(6, '0')}`
    await tx.execute({ sql: 'UPDATE sales_invoices SET number = ? WHERE id = ?', args: [number, invoiceId] })

    for (const line of input.lines) {
      const lineTotal = line.qty * line.unitPrice - line.discount
      const lineProductId = line.isTemp ? tempItemProductId : line.productId
      await tx.execute({
        sql: `INSERT INTO sales_items (invoice_id, product_id, product_name, barcode, qty, unit_price, discount, total, serial_number, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          line.note?.trim() || null
        ]
      })
      if (line.isTemp) continue
      const deductedByRecipe = await deductRecipeIfAny(tx, line.productId, line.qty, warehouseId, invoiceId, cashierId)
      if (deductedByRecipe) continue
      await tx.execute({
        sql: 'UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND warehouse_id = ?',
        args: [line.qty, line.productId, warehouseId]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
              VALUES (?, ?, 'sale', ?, 'sales_invoice', ?, ?)`,
        args: [line.productId, warehouseId, -line.qty, invoiceId, cashierId]
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
