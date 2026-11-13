/**
 * اختبار تعديلات 2026-11-13 (طلبات عميل ElNASR) على قاعدة مؤقتة من غير سيرفر HTTP:
 * حفظ بدون ترحيل + حفظ نهائي، مرتجع بدون فاتورة، كارت حساب العميل الكامل، طباعة الكشف، تصميم الإيصال «مستند».
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { createCustomer, getCustomerLedger, getCustomerStatement, recordCustomerPayment } from '../src/main/services/customers'
import { getOpenSession, getShiftSummaryReport, openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { listSalesReturns, returnInvoiceLines, getInvoiceView } from '../src/main/services/invoices'
import { deleteHeldInvoice, holdInvoice, listHeldInvoices } from '../src/main/services/heldInvoices'
import { createDirectReturn, getDirectReturn } from '../src/main/services/directReturns'
import { buildCustomerStatementHtml, buildInvoiceHtml, printDirectReturn, printHeldInvoice } from '../src/main/services/print'
import { getPosUiSettings, getPrintSettings, updatePosUiSettings, updatePrintSettings, updateStoreSettings, getStoreSettings } from '../src/main/services/settings'
import { listTreasuries } from '../src/main/services/treasuries'
import { buildLedger } from '../src/main/services/ledger'
import { runAccountingReport } from '../src/main/services/accountingReports'
import { printCapture } from '../src/main/services/printContext'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'elnasr-test')
const DB_PATH = join(DATA_DIR, 'elnasr-test.sqlite')
process.env.QCP_DATA_DIR = DATA_DIR

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.011
const scalar = async (sql: string, args: unknown[] = []): Promise<any> => ((await getDb().execute({ sql, args: args as any })).rows[0] as any)?.v

function productInput(over: Partial<ProductInput>): ProductInput {
  return {
    name: 'صنف', barcode: '', categoryId: null, unitId: null, vendorId: null, costPrice: 0, retailPrice: 0,
    wholesalePrice: 0, wholesale2Price: 0, packPrice: 0, openingQuantity: 0, reorderPoint: 0, warehouseId: 1,
    expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null, ...over
  }
}
function sale(over: Partial<CheckoutInput>): CheckoutInput {
  return { customerId: null, warehouseId: 1, lines: [], discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: 0, redeemPoints: 0, ...over }
}
async function capture<T>(fn: () => Promise<T>): Promise<{ result: T; jobs: any[] }> {
  const printSettings = await getPrintSettings()
  const store = { profile: { printSettings, categoryPrinters: {} }, jobs: [] as any[] }
  const result = await printCapture.run(store as any, fn)
  return { result, jobs: store.jobs }
}
const cashBalance = async (): Promise<number> => (await listTreasuries()).reduce((s, t) => s + t.balance, 0)

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  await initDatabaseAtPath(DB_PATH)
  const warehouseId = Number(await scalar('SELECT id AS v FROM warehouses WHERE is_default = 1'))
  const adminId = Number(await scalar("SELECT id AS v FROM users WHERE username = 'admin'"))

  console.log('1) الإعدادات الافتراضية ما اتغيرتش')
  const ui0 = await getPosUiSettings()
  assert(ui0.unpostedMode === true && ui0.salesRepPosEnabled === true && ui0.receiptStyle === 'classic', 'الافتراضي: حفظ بدون ترحيل مفعّل + المحل المسوّق ظاهر + إيصال كلاسيك')
  await updateStoreSettings({ ...(await getStoreSettings()), name: 'شركة النصر', phone: '0227209168 / 01284664270 / 01286494202' })
  await updatePrintSettings({ ...(await getPrintSettings()), paperSize: '80mm' })

  const cust = await createCustomer({ name: 'عميل قطاعى', phone: '0100', address: 'شارع النصر', notes: '', openingBalance: 11196.21 } as any)
  const oil = await createProduct(productInput({ name: 'زيت اولين 1', costPrice: 60, retailPrice: 75, openingQuantity: 100, warehouseId }))
  const soy = await createProduct(productInput({ name: 'زيت صويا', costPrice: 60, retailPrice: 75, openingQuantity: 100, warehouseId }))
  const tah = await createProduct(productInput({ name: 'طحينة اللؤلؤه 1', costPrice: 100, retailPrice: 130, openingQuantity: 100, warehouseId }))
  await openDay(adminId, 0)
  const line = (p: { id: number; name: string; barcode: string }, qty: number, unitPrice: number, discount = 0) => ({
    productId: p.id, name: p.name, barcode: p.barcode, unitPrice, qty, discount
  })
  const cart = [line(oil, 3, 75), line(soy, 2.5, 75), line(tah, 3, 130)]

  console.log('\n2) الإيصال الكلاسيك لسه زي ما هو')
  const sClassic = await checkout(sale({ lines: [line(oil, 1, 75)], paid: 75 }), adminId)
  const classicHtml = (await buildInvoiceHtml(sClassic.invoiceId!))!.html
  assert(classicHtml.includes('رقم الفاتورة') && !classicHtml.includes('رقم المستند'), 'التصميم الكلاسيك بيتطبع لما الخيار مقفول')

  console.log('\n3) حفظ بدون ترحيل: مفيش أثر على المخزون/الرصيد + طباعة «لم يتم الترحيل»')
  await updatePosUiSettings({ ...ui0, unpostedMode: false, salesRepPosEnabled: false, receiptStyle: 'document' })
  const uiOff = await getPosUiSettings()
  assert(uiOff.unpostedMode === false && uiOff.salesRepPosEnabled === false, 'الخيارين بيتقفلوا من الإعدادات')
  await updatePosUiSettings({ ...uiOff, unpostedMode: true })
  const ui1 = await getPosUiSettings()
  assert(ui1.unpostedMode === true && ui1.receiptStyle === 'document' && ui1.salesRepPosEnabled === false, 'الإعدادات اتحفظت')
  const stockBefore = Number(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [oil.id]))
  const heldId = await holdInvoice(
    { payload: { lines: cart as any, discountType: 'value', discountValue: 2.5, customerId: cust.id, customerLabel: '', warehouseId }, total: 800 },
    adminId
  )
  assert(near(Number(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [oil.id])), stockBefore), 'المخزون ما اتأثرش')
  assert(near(Number(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id])), 11196.21), 'رصيد العميل ما اتأثرش')
  assert((await listHeldInvoices()).some((h) => h.id === heldId), 'الفاتورة ظاهرة في قايمة غير المرحّلة')
  const up = await capture(() => printHeldInvoice(heldId, false))
  const upHtml = String(up.jobs[0]?.html ?? '')
  assert(up.result.ok && up.jobs.length === 1 && up.jobs[0].kind === 'print', 'اتبعتت مهمة طباعة')
  assert(upHtml.includes('لم يتم الترحيل') && upHtml.includes('رقم المستند'), 'المطبوع بتصميم المستند وحالته «لم يتم الترحيل»')
  assert(upHtml.includes('802.50') && upHtml.includes('2.50') && upHtml.includes('800.00'), 'الإجمالي 802.50 / الخصم 2.50 / الصافي 800.00')
  assert(upHtml.includes('11,196.21') && upHtml.includes('11,996.21'), 'رصيد سابق 11,196.21 وإجمالي 11,996.21')
  writeFileSync(join(DATA_DIR, 'unposted.html'), upHtml)

  console.log('\n4) حفظ نهائي (آجل) → الفاتورة اترحّلت والقايمة فضيت')
  const fin = await checkout(sale({ customerId: cust.id, lines: cart, discountValue: 2.5, paymentMethod: 'credit', paid: 0 }), adminId)
  assert(fin.ok === true, `الحفظ النهائي نجح ${fin.error ?? ''}`)
  await deleteHeldInvoice(heldId)
  assert((await listHeldInvoices()).length === 0, 'قايمة غير المرحّلة فضيت')
  assert(near(Number(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [oil.id])), stockBefore - 3), 'المخزون نزل بعد الترحيل')
  assert(near(Number(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id])), 11996.21), 'رصيد العميل بقى 11,996.21')
  const docHtml = (await buildInvoiceHtml(fin.invoiceId!))!.html
  writeFileSync(join(DATA_DIR, 'posted.html'), docHtml)
  assert(docHtml.includes('تم ترحيله') && docHtml.includes('صافي الفاتورة') && docHtml.includes('خصم قيمة'), 'فاتورة مرحّلة بتصميم المستند')
  assert(docHtml.includes('11,196.21') && docHtml.includes('11,996.21') && docHtml.includes('شارع النصر'), 'الرصيد السابق/الإجمالي وعنوان العميل ظاهرين')
  assert(docHtml.includes('01286494202') && docHtml.includes('شركة النصر'), 'اسم الشركة والتليفونات في الذيل')
  const view = (await getInvoiceView(fin.invoiceId!))!
  assert(view.customerAddress === 'شارع النصر' && near(view.customerCurrentBalance ?? 0, 11996.21), 'InvoiceView فيه العنوان والرصيد')

  console.log('\n5) مرتجع بدون فاتورة — خصم من رصيد العميل')
  const cashBefore = await cashBalance()
  const bad = await createDirectReturn({ customerId: null, warehouseId, refundMethod: 'credit', lines: [{ productId: oil.id, qty: 1, unitPrice: 75 }] }, adminId)
  assert(bad.ok === false, 'خصم من الرصيد من غير عميل اترفض')
  const empty = await createDirectReturn({ customerId: cust.id, warehouseId, refundMethod: 'credit', lines: [] }, adminId)
  assert(empty.ok === false, 'مرتجع من غير أصناف اترفض')
  const dr1 = await createDirectReturn(
    { customerId: cust.id, warehouseId, refundMethod: 'credit', note: 'عبوة تالفة', lines: [{ productId: oil.id, qty: 2, unitPrice: 75 }] },
    adminId
  )
  assert(dr1.ok === true && near(dr1.amount ?? 0, 150), `المرتجع اتسجل بقيمة 150 ${dr1.error ?? ''}`)
  assert(near(Number(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [oil.id])), stockBefore - 1), 'المخزون رجع 2')
  assert(near(Number(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id])), 11846.21), 'رصيد العميل نزل 150')
  assert(near(await cashBalance(), cashBefore), 'الخزينة ما اتأثرتش (خصم من الرصيد)')
  const drv = (await getDirectReturn(dr1.returnId!))!
  assert(drv.lines.length === 1 && near(drv.balanceBefore ?? 0, 11996.21), 'تفاصيل المرتجع والرصيد قبله محفوظين')
  const dp = await capture(() => printDirectReturn(dr1.returnId!, false))
  const dpHtml = String(dp.jobs[0]?.html ?? '')
  writeFileSync(join(DATA_DIR, 'direct-return.html'), dpHtml)
  assert(dp.result.ok && dpHtml.includes('مرتجع مبيعات') && dpHtml.includes('صافي المرتجع') && dpHtml.includes('11,846.21'), 'طباعة المرتجع فيها الصافي والرصيد بعده')

  console.log('\n6) مرتجع بدون فاتورة — رد نقدي لعميل نقدي')
  const dr2 = await createDirectReturn(
    { customerId: null, customerLabel: 'زبون عابر', warehouseId, refundMethod: 'cash', lines: [{ productId: soy.id, qty: 1, unitPrice: 75 }] },
    adminId
  )
  assert(dr2.ok === true, `المرتجع النقدي اتسجل ${dr2.error ?? ''}`)
  assert(near(await cashBalance(), cashBefore - 75), 'الخزينة نقصت 75')
  const summary = await getShiftSummaryReport((await getOpenSession())!.id)
  assert(near(summary.totalReturns, 225) && summary.returnCount === 2, 'ملخص الوردية فيه المرتجعين (225)')

  console.log('\n7) القايمة والتقارير والدفتر')
  const list = await listSalesReturns({})
  assert(list.filter((r) => r.directReturnId).length === 2 && list.some((r) => r.invoiceNumber.includes('بدون فاتورة')), 'المرتجعات بدون فاتورة ظاهرة في قايمة المرتجعات')
  const rep = await runAccountingReport('sales_returns' as any, {} as any)
  assert(rep.rows.filter((r: any) => r.kind === 'بدون فاتورة').length === 2, 'تقرير مرتجعات المبيعات فيه المرتجعين')
  const ledger = await buildLedger()
  const drEntries = ledger.filter((e) => e.ref.startsWith('DR-'))
  assert(drEntries.length === 2, 'قيدين في دفتر اليومية')
  assert(
    drEntries.every((e) => near(e.lines.reduce((s, l) => s + l.debit, 0), e.lines.reduce((s, l) => s + l.credit, 0))),
    'القيود متوازنة (مدين = دائن)'
  )
  assert(ledger.every((e) => near(e.lines.reduce((s, l) => s + l.debit - l.credit, 0), 0)), 'كل قيود الدفتر متوازنة')

  console.log('\n8) كارت حساب العميل الكامل')
  // فاتورة نقدي + مرتجع عليها + سداد
  const cashInv = await checkout(sale({ customerId: cust.id, lines: [line(tah, 2, 130)], paid: 260 }), adminId)
  const cv = (await getInvoiceView(cashInv.invoiceId!))!
  await returnInvoiceLines(cashInv.invoiceId!, [{ salesItemId: cv.lines[0].salesItemId, qty: 1 } as any], adminId)
  await recordCustomerPayment(cust.id, 1000, 'cash', 'دفعة', adminId)
  const led = await getCustomerLedger(cust.id, {})
  const balanceNow = Number(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id]))
  assert(near(balanceNow, 10846.21), 'الرصيد الحالي 10,846.21')
  assert(near(led.openingBalance ?? 0, 11196.21), 'الرصيد السابق = رصيد أول المدة 11,196.21')
  assert(led.entries.filter((e) => e.type === 'invoice').length === 2, 'الفاتورتين (آجل ونقدي) ظاهرين')
  assert(led.entries.filter((e) => e.type === 'return').length === 2, 'المرتجعين (على فاتورة وبدون فاتورة) ظاهرين')
  assert(led.entries.filter((e) => e.type === 'payment').length === 1, 'السداد ظاهر')
  assert(near(led.entries[led.entries.length - 1].balance ?? 0, balanceNow), 'آخر رصيد جاري = رصيد العميل الحالي')
  assert(near((led.openingBalance ?? 0) + (led.totalDebit ?? 0) - (led.totalCredit ?? 0), balanceNow), 'سابق + مدين − دائن = الرصيد الحالي')
  const future = await getCustomerLedger(cust.id, { from: '2999-01-01' })
  assert(future.entries.length === 0 && near(future.openingBalance ?? 0, balanceNow), 'فلتر تاريخ بعد كل الحركات: مفيش حركات والسابق = الحالي')
  const old = await getCustomerStatement(cust.id)
  assert(old.entries.length > 0 && old.openingBalance === undefined, 'الكشف القديم (الموردين/التوافق) لسه شغال زي ما هو')

  console.log('\n9) طباعة كشف الحساب')
  const st = await buildCustomerStatementHtml(cust.id, {})
  writeFileSync(join(DATA_DIR, 'statement.html'), st.html ?? '')
  assert(st.ok && !!st.html && st.html.includes('كشف حساب عميل') && st.html.includes('عميل قطاعى') && st.html.includes('10,846.21'), 'HTML الكشف فيه العميل والرصيد النهائي')
  assert(st.html!.includes('رصيد سابق') && st.html!.includes('مرتجع بدون فاتورة'), 'الكشف فيه الرصيد السابق والمرتجعات')

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
