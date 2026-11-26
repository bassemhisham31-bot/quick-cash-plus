/**
 * اختبار تطابق أرقام قفل اليوم مع الخزينة وشاشة المصروفات ولوحة التحكم (طلب ElNASR 2026-11-26):
 *  - المتوقع بالخزنة = الافتتاحي + مجموع سطور الحركات (شاشة القفل) = رصيد الخزينة
 *  - شراء الأصول الثابتة منفصل عن المصروفات وجوّه اللي خرج من الخزينة
 *  - مرتجع فاتورة مشتريات نقدية مدفوعة جزئيًا مايرجّعش للخزينة أكتر من اللي اتدفع
 *  - «مبيعات اليوم» في اللوحة = مبيعات الوردية المفتوحة (حتى لو عدّت منتصف ليل UTC)
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { createCustomer, recordCustomerPayment } from '../src/main/services/customers'
import { createVendor, recordVendorPayment } from '../src/main/services/vendors'
import { closeDay, getCurrentSessionSummary, getShiftSummaryReport, openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { createExpense, createExpenseCategory, getExpensesByMethodSummary } from '../src/main/services/expenses'
import { createPurchaseInvoice, returnPurchaseLines } from '../src/main/services/purchases'
import { createVoucher, listTreasuries } from '../src/main/services/treasuries'
import { getDashboardSummary, getPaymentMethodsBreakdown, getTopSellingProducts } from '../src/main/services/dashboard'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'close-reconcile-test')
const DB_PATH = join(DATA_DIR, 'close-reconcile-test.sqlite')
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

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  await initDatabaseAtPath(DB_PATH)
  const warehouseId = Number(await scalar('SELECT id AS v FROM warehouses WHERE is_default = 1'))
  const adminId = Number(await scalar("SELECT id AS v FROM users WHERE username = 'admin'"))
  const mainTreasuryId = Number(await scalar('SELECT id AS v FROM treasuries WHERE is_default = 1'))

  const oil = await createProduct(productInput({ name: 'زيت', costPrice: 60, retailPrice: 100, openingQuantity: 1000, warehouseId }))
  const cust = await createCustomer({ name: 'عميل', phone: '0100', address: '', notes: '', openingBalance: 0 } as any)
  const vendor = await createVendor({ name: 'مورد', phone: '', address: '', notes: '', openingBalance: 0 })
  const line = (qty: number, unitPrice: number) => ({ productId: oil.id, name: oil.name, barcode: oil.barcode, unitPrice, qty, discount: 0 })

  await openDay(adminId, 100)

  console.log('1) حركات متنوعة في الوردية')
  const s1 = await checkout(sale({ lines: [line(5, 100)], paid: 500 }), adminId) // كاش 500
  const s2 = await checkout(sale({ customerId: cust.id, lines: [line(3, 100)], paymentMethod: 'credit', paid: 0 }), adminId) // آجل 300
  assert(s1.ok === true && s2.ok === true, 'بيع كاش 500 + بيع آجل 300')
  await recordCustomerPayment(cust.id, 200, 'cash', '', adminId) // تحصيل 200
  const assetCat = await createExpenseCategory('شراء أصول ثابتة', true)
  const rentCat = await createExpenseCategory('ايجار', false)
  assert((await createExpense({ categoryId: rentCat.id, amount: 50, method: 'cash', note: '' }, adminId)).ok === true, 'مصروف إيجار 50')
  assert((await createExpense({ categoryId: assetCat.id, amount: 30, method: 'cash', note: '' }, adminId)).ok === true, 'شراء أصل ثابت 30')
  await createVoucher({ type: 'receipt', treasuryId: mainTreasuryId, amount: 15, partyType: 'other', partyName: 'إيراد' }, adminId) // سند قبض 15
  await recordVendorPayment(vendor.id, 20, 'cash', '', adminId) // سداد مورد 20

  // فاتورة مشتريات نقدية 400 اتدفع منها 300 بس، وبعدين اتعملها مرتجع كامل
  const pur = await createPurchaseInvoice(
    { vendorId: vendor.id, warehouseId, lines: [{ productId: oil.id, name: oil.name, barcode: '', qty: 10, purchasePrice: 40 }], paymentMethod: 'cash', paid: 300, note: '' },
    adminId
  )
  assert(pur.ok === true && near(pur.total ?? 0, 400), 'فاتورة مشتريات 400 مدفوع منها 300')
  const itemId = Number(await scalar('SELECT id AS v FROM purchase_items WHERE purchase_invoice_id = ?', [pur.purchaseId]))
  const ret = await returnPurchaseLines(pur.purchaseId!, [{ purchaseItemId: itemId, qty: 10 }], adminId)
  assert(ret.ok === true && near(ret.refundAmount ?? 0, 400), 'مرتجع كامل للفاتورة (قيمته 400)')

  console.log('\n2) المتوقع بالخزنة = الافتتاحي + سطور الحركات = رصيد الخزينة')
  const summary = (await getCurrentSessionSummary(null))!
  const linesSum = summary.lines.reduce((s, l) => s + l.amount, 0)
  assert(near(summary.openingBalance + linesSum, summary.expectedCash), `الافتتاحي ${summary.openingBalance} + السطور ${linesSum} = المتوقع ${summary.expectedCash}`)
  const treasury = (await listTreasuries()).find((t) => t.id === mainTreasuryId)!
  assert(near(treasury.balance, summary.expectedCash - summary.openingBalance), `رصيد الخزينة ${treasury.balance} = حركات الوردية (المتوقع ${summary.expectedCash} − افتتاحي الدرج ${summary.openingBalance})`)
  const byKind = Object.fromEntries(summary.lines.map((l) => [l.kind, l.amount]))
  assert(near(byKind['مبيعات'] ?? 0, 500), 'مبيعات نقدية +500')
  assert(near(byKind['تحصيل عميل'] ?? 0, 200), 'تحصيل عميل +200')
  assert(near(byKind['سند قبض'] ?? 0, 15), 'سند قبض +15')
  assert(near(byKind['مصروف'] ?? 0, -50), 'مصروفات −50 (من غير الأصل)')
  assert(near(byKind['شراء أصول ثابتة'] ?? 0, -30), 'شراء أصول ثابتة −30 (سطر لوحده)')
  assert(near(byKind['سداد مورد'] ?? 0, -20), 'سداد مورد −20')
  assert(near((byKind['مشتريات'] ?? 0) + (byKind['مرتجع مشتريات'] ?? 0), 0), 'مشتريات −300 ومرتجعها +300 = صفر (مرتجع الفاتورة المدفوعة جزئيًا مايرجّعش أكتر من اللي اتدفع)')
  assert(near(summary.expectedCash, 100 + 500 + 200 + 15 - 50 - 30 - 20), `المتوقع = 100+500+200+15−50−30−20 = ${100 + 500 + 200 + 15 - 50 - 30 - 20}`)

  console.log('\n3) شاشة المصروفات مطابقة لقفل اليوم')
  const exp = await getExpensesByMethodSummary()
  assert(near(exp.totalExpenses, 80) && near(exp.fixedAssetsTotal, 30), 'المصروفات: خرج 80 منهم أصول 30 (يعني مصروفات 50)')
  assert(near(summary.cashExpenses, exp.totalExpenses), 'مصروفات القفل النقدية = اللي خرج في شاشة المصروفات')

  console.log('\n4) «مبيعات اليوم» في اللوحة = مبيعات الوردية حتى لو الوردية عدّت منتصف الليل')
  // الوردية بدأت من يومين وفاتورة البيع الكاش اتعملت إمبارح (زي وردية بدأت قبل منتصف الليل) — الوردية لسه مفتوحة
  await getDb().execute({ sql: "UPDATE cash_sessions SET opened_at = datetime('now', '-2 days') WHERE id = ?", args: [summary.sessionId] })
  await getDb().execute({ sql: "UPDATE sales_invoices SET created_at = datetime('now', '-1 day') WHERE id = ?", args: [s1.invoiceId!] })
  const dash = await getDashboardSummary()
  const report = await getShiftSummaryReport(summary.sessionId)
  assert(near(dash.todaySales, report.totalSales) && near(dash.todaySales, 800), `اللوحة ${dash.todaySales} = إجمالي الوردية ${report.totalSales} = 800`)
  assert(dash.todayInvoiceCount === report.invoiceCount && dash.todayInvoiceCount === 2, 'عدد الفواتير 2 في الاتنين')
  const pm = await getPaymentMethodsBreakdown()
  assert(near(pm.reduce((s, r) => s + r.total, 0), 800), 'وسائل الدفع في اللوحة بتجمع 800')
  const top = await getTopSellingProducts(5)
  assert(top.length === 1 && near(top[0].revenue, 800), 'أكتر الأصناف مبيعًا بيحسب مبيعات الوردية كلها')

  console.log('\n5) بعد قفل اليوم: التقرير بيفصل الأصول، واللوحة ماتقعش')
  const closed = (await closeDay(adminId, summary.expectedCash))!
  assert(near(closed.fixedAssetExpenses, 30) && near(closed.totalExpenses, 80), 'تقرير الوردية: مصروفات 80 منها أصول 30')
  assert(near(closed.expectedCash ?? -1, summary.expectedCash), 'المتوقع المحفوظ في القفل = اللي ظهر في الشاشة')
  const after = await getDashboardSummary()
  assert(after.dayIsOpen === false && Number.isFinite(after.todaySales), 'من غير وردية مفتوحة اللوحة بترجع لتاريخ النهاردة من غير خطأ')

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
