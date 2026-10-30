/**
 * اختبار حقيقي لتعديلات 2026-10-30 على نسخة الويب (قاعدة بيانات مؤقتة، من غير سيرفر HTTP):
 * دفع مقسّم، تاريخ استحقاق/سداد، أصناف الخدمات بعمولة، قائمة "مطلوب شراؤه"، تقارير المواعيد، المرفقات.
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct, updateProduct } from '../src/main/services/catalog'
import { createVendor } from '../src/main/services/vendors'
import { createCustomer } from '../src/main/services/customers'
import { createSalesRep } from '../src/main/services/salesReps'
import { getCurrentSessionSummary, openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { deleteInvoice, getInvoiceView, returnInvoiceLines } from '../src/main/services/invoices'
import { createPurchaseInvoice, getPurchaseInvoiceView } from '../src/main/services/purchases'
import { listPurchaseRequests, setPurchaseRequestsStatus, updatePurchaseRequest } from '../src/main/services/purchaseRequests'
import { runReport } from '../src/main/services/reports'
import { listTreasuries } from '../src/main/services/treasuries'
import { buildLedger } from '../src/main/services/ledger'
import { getPaymentMethodsBreakdown } from '../src/main/services/dashboard'
import { readAttachment, uploadAttachment } from '../src/main/services/attachments'
import { runAccountingReport } from '../src/main/services/accountingReports'
import { createVerify, X509Certificate } from 'crypto'
import { getQzCredentials, signQzMessage } from '../src/main/services/qzSigning'
import { closeDay } from '../src/main/services/cashSession'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'features-test')
const DB_PATH = join(DATA_DIR, 'features-test.sqlite')
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
  return {
    customerId: null, warehouseId: 1, lines: [], discountType: 'value', discountValue: 0,
    paymentMethod: 'cash', paid: 0, redeemPoints: 0, ...over
  }
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  await initDatabaseAtPath(DB_PATH)
  const db = getDb()
  const warehouseId = Number(await scalar('SELECT id AS v FROM warehouses WHERE is_default = 1'))
  const adminId = Number(await scalar("SELECT id AS v FROM users WHERE username = 'admin'"))

  console.log('1) تجهيز البيانات')
  const vendor = await createVendor({ name: 'مورد الإكسسوارات', phone: '', address: '', notes: '', openingBalance: 0 })
  const cust = await createCustomer({ name: 'عميل آجل', phone: '010', notes: '', openingBalance: 0 })
  const rep = await createSalesRep({ name: 'محل النور', phone: '', commissionPercent: 10 })
  const itemA = await createProduct(productInput({ name: 'جراب موبايل', costPrice: 50, retailPrice: 100, openingQuantity: 10, vendorId: vendor.id, warehouseId }))
  const svcFixed = await createProduct(productInput({ name: 'تركيب فيميه', retailPrice: 50, isService: true }))
  const svcCommission = await createProduct(
    productInput({ name: 'سحب فودافون كاش', retailPrice: 0, isService: true, commissionEnabled: true, commissionPercent: 1, commissionMin: 5 })
  )
  assert(itemA.isService === false && svcFixed.isService === true, 'الصنف العادي والخدمة اتسجلوا بالنوع الصح')
  assert(svcCommission.commissionEnabled && svcCommission.commissionPercent === 1 && svcCommission.commissionMin === 5, 'إعدادات عمولة الخدمة اتحفظت')
  const fakeCommission = await createProduct(productInput({ name: 'صنف عادي وعمولة', commissionEnabled: true, commissionPercent: 5 }))
  assert(fakeCommission.commissionEnabled === false, 'العمولة ما بتتفعّلش على صنف مش خدمة')

  await openDay(adminId, 100)

  console.log('\n2) بيع بدفع مقسّم (كاش 60 + فودافون كاش 40)')
  const line = (p: { id: number; name: string; barcode: string }, qty: number, unitPrice: number, extra: Record<string, unknown> = {}) => ({
    productId: p.id, name: p.name, barcode: p.barcode, unitPrice, qty, discount: 0, ...extra
  })
  const s1 = await checkout(
    sale({
      lines: [line(itemA, 1, 100)],
      paymentMethod: 'mixed',
      salesRepId: rep.id,
      payments: [{ method: 'cash', amount: 60 }, { method: 'vodafone_cash', amount: 40 }]
    }),
    adminId
  )
  assert(s1.ok === true, `البيع المقسّم نجح ${s1.error ?? ''}`)
  const v1 = (await getInvoiceView(s1.invoiceId!))!
  assert(v1.paymentMethod === 'mixed' && near(v1.paid, 100), 'الفاتورة مختلطة والمدفوع 100')
  assert(v1.payments.length === 2 && v1.payments.some((p) => p.method === 'vodafone_cash' && near(p.amount, 40)), 'تفاصيل الدفع المقسّم ظاهرة في الفاتورة')
  assert(v1.salesRepName === 'محل النور' && near(v1.commissionAmount, 10), 'المحل المسوّق وعمولته (10%) ظاهرين في الفاتورة')
  assert(near(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [itemA.id]), 9), 'المخزون نزل 1')

  console.log('\n3) مجموع أكبر من المطلوب / باقي من غير عميل = رفض')
  const bad1 = await checkout(sale({ lines: [line(itemA, 1, 100)], paymentMethod: 'mixed', payments: [{ method: 'cash', amount: 120 }] }), adminId)
  assert(bad1.ok === false, 'مجموع المدفوع أكبر من الإجمالي اترفض')
  const bad2 = await checkout(sale({ lines: [line(itemA, 1, 100)], paymentMethod: 'mixed', payments: [{ method: 'cash', amount: 30 }] }), adminId)
  assert(bad2.ok === false, 'باقي آجل لعميل عابر اترفض')
  assert(near(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [itemA.id]), 9), 'الرفض ما خصمش مخزون')

  console.log('\n4) دفع مقسّم فيه باقي آجل + تاريخ استحقاق')
  const s2 = await checkout(
    sale({
      customerId: cust.id,
      lines: [line(itemA, 1, 100), line(svcFixed, 1, 50)],
      paymentMethod: 'mixed',
      payments: [{ method: 'cash', amount: 50 }],
      dueDate: '2026-11-15'
    }),
    adminId
  )
  assert(s2.ok === true, `بيع مقسّم بباقي آجل نجح ${s2.error ?? ''}`)
  const v2 = (await getInvoiceView(s2.invoiceId!))!
  assert(v2.paymentMethod === 'mixed' && near(v2.paid, 50) && near(v2.total, 150), 'مدفوع 50 من 150')
  assert(v2.dueDate === '2026-11-15', 'تاريخ الاستحقاق اتسجل على الفاتورة')
  assert(near(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id]), 100), 'الباقي الآجل (100) اتسجل على رصيد العميل')
  assert(near(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [itemA.id]), 8), 'المخزون 8 (الخدمة ما خصمتش حاجة)')

  console.log('\n5) بيع آجل كامل بتاريخ استحقاق')
  const s3 = await checkout(
    sale({ customerId: cust.id, lines: [line(itemA, 2, 100)], paymentMethod: 'credit', dueDate: '2026-12-01' }),
    adminId
  )
  assert(s3.ok === true, 'البيع الآجل نجح')
  assert(near(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id]), 300), 'رصيد العميل 300')
  const bad3 = await checkout(sale({ lines: [line(itemA, 1, 100)], paymentMethod: 'cash', paid: 100, dueDate: '2026-12-01' }), adminId)
  assert(bad3.ok === true && (await getInvoiceView(bad3.invoiceId!))!.dueDate === null, 'تاريخ الاستحقاق ما بيتسجلش على فاتورة مدفوعة بالكامل')

  console.log('\n6) خدمة بعمولة (سحب فودافون كاش 1000 → عمولة 10)')
  const reqBefore = (await listPurchaseRequests({ status: 'all' })).length
  const s4 = await checkout(
    sale({ lines: [line(svcCommission, 1, 10, { serviceAmount: 1000 })], paymentMethod: 'cash', paid: 10 }),
    adminId
  )
  assert(s4.ok === true, 'بيع الخدمة بعمولة نجح')
  const v4 = (await getInvoiceView(s4.invoiceId!))!
  assert(near(v4.total, 10) && v4.lines[0].serviceAmount === 1000, 'الإجمالي = العمولة والمبلغ الأساسي 1000 محفوظ')
  assert(Number(await scalar('SELECT COUNT(*) AS v FROM stock_movements WHERE product_id = ?', [svcCommission.id])) === 0, 'الخدمة ما اتعملهاش حركة مخزون')
  assert((await listPurchaseRequests({ status: 'all' })).length === reqBefore, 'الخدمة ما اتضافتش لقائمة مطلوب شراؤه')
  // خدمة بدون رصيد مخزون ما تتمنعش من البيع حتى مع إن الكمية صفر
  const s4b = await checkout(sale({ lines: [line(svcFixed, 3, 50)], paymentMethod: 'cash', paid: 150 }), adminId)
  assert(s4b.ok === true, 'بيع خدمة مفيهاش مخزون ما اترفضش')

  console.log('\n7) قائمة مطلوب شراؤه')
  const pending = await listPurchaseRequests({ status: 'pending' })
  const qtyA = pending.filter((p) => p.productId === itemA.id).reduce((s, p) => s + p.qty, 0)
  assert(near(qtyA, 5), `كل القطع المباعة (5) اتسجلت: ${qtyA}`)
  assert(pending.every((p) => p.vendorName === 'مورد الإكسسوارات' && near(p.unitCost, 50)), 'المورد وسعر الشراء من بيانات الصنف')
  assert(!pending.some((p) => p.productId === svcFixed.id), 'الخدمات مش في القائمة')

  const first = pending[pending.length - 1]
  await updatePurchaseRequest(first.id, { qty: first.qty + 1, unitCost: 55 })
  const edited = (await listPurchaseRequests({ status: 'pending' })).find((p) => p.id === first.id)!
  assert(edited.qty === first.qty + 1 && near(edited.unitCost, 55), 'تعديل الكمية والسعر اشتغل')

  const toCancel = pending.find((p) => p.id !== first.id)!
  await setPurchaseRequestsStatus([toCancel.id], 'cancelled')
  assert((await listPurchaseRequests({ status: 'cancelled' })).some((p) => p.id === toCancel.id), 'إلغاء بند اشتغل')
  await setPurchaseRequestsStatus([toCancel.id], 'pending')
  assert((await listPurchaseRequests({ status: 'pending' })).some((p) => p.id === toCancel.id), 'إرجاع البند الملغي للقائمة اشتغل')

  console.log('\n8) فاتورة شراء آجلة بتاريخ سداد + ربطها بالقائمة')
  const ids = (await listPurchaseRequests({ status: 'pending' })).map((p) => p.id)
  const pur = await createPurchaseInvoice(
    {
      vendorId: vendor.id,
      warehouseId,
      lines: [{ productId: itemA.id, name: itemA.name, barcode: itemA.barcode, qty: 5, purchasePrice: 52 }],
      paymentMethod: 'credit',
      paid: 0,
      note: 'اختبار',
      dueDate: '2026-11-20',
      purchaseRequestIds: ids
    },
    adminId
  )
  assert(pur.ok === true, `فاتورة الشراء نجحت ${pur.error ?? ''}`)
  const pv = (await getPurchaseInvoiceView(pur.purchaseId!))!
  assert(pv.dueDate === '2026-11-20' && pv.note === 'اختبار', 'تاريخ السداد والملاحظة ظاهرين في فاتورة الشراء')
  assert((await listPurchaseRequests({ status: 'pending' })).length === 0, 'كل البنود اتعلّمت "اتشترت"')
  const linked = (await listPurchaseRequests({ status: 'purchased' })).filter((p) => p.purchaseInvoiceId === pur.purchaseId)
  assert(linked.length === ids.length, 'البنود المشتراة اتربطت بفاتورة الشراء')
  assert(near(await scalar('SELECT balance AS v FROM vendors WHERE id = ?', [vendor.id]), 260), 'رصيد المورد 260')
  const paidPur = await createPurchaseInvoice(
    { vendorId: vendor.id, warehouseId, lines: [{ productId: itemA.id, name: itemA.name, barcode: itemA.barcode, qty: 1, purchasePrice: 50 }], paymentMethod: 'cash', paid: 50, note: '', dueDate: '2026-11-25' },
    adminId
  )
  assert((await getPurchaseInvoiceView(paidPur.purchaseId!))!.dueDate === null, 'فاتورة الشراء المدفوعة كاملة ما بتحفظش تاريخ سداد')

  console.log('\n9) التقارير')
  const dueC = await runReport('customer_due_dates', { dateFrom: '', dateTo: '', warehouseId: null })
  const dueRows = dueC.rows.filter((r) => !r._subtotal)
  assert(dueRows.length === 2, `تقرير استحقاق العملاء فيه فاتورتين: ${dueRows.length}`)
  assert(dueRows.some((r) => r.month === '2026-11' && near(Number(r.outstanding), 100)) && dueRows.some((r) => r.month === '2026-12' && near(Number(r.outstanding), 200)), 'الأشهر والمتبقي صح')
  assert(dueC.rows.filter((r) => r._subtotal).length === 2 && near(dueC.totals!.outstanding, 300), 'إجمالي لكل شهر + إجمالي عام 300')
  const dueNov = await runReport('customer_due_dates', { dateFrom: '2026-11-01', dateTo: '2026-11-30', warehouseId: null })
  assert(dueNov.rows.filter((r) => !r._subtotal).length === 1, 'فلتر الشهر اشتغل')
  const dueV = await runReport('vendor_due_dates', { dateFrom: '', dateTo: '', warehouseId: null })
  assert(dueV.rows.some((r) => r.month === '2026-11' && near(Number(r.outstanding), 260)), 'تقرير سداد الموردين فيه المتبقي 260 في 2026-11')
  const commDetail = await runReport('sales_rep_commission_detail', { dateFrom: '', dateTo: '', warehouseId: null })
  assert(commDetail.rows.some((r) => r.rep === 'محل النور' && near(Number(r.commission), 10)) && near(commDetail.totals!.commission, 10), 'تفصيل عمولات المحلات')
  const svcRep = await runReport('service_sales', { dateFrom: '', dateTo: '', warehouseId: null })
  const wd = svcRep.rows.find((r) => r.name === 'سحب فودافون كاش')
  assert(!!wd && near(Number(wd.principal), 1000) && near(Number(wd.revenue), 10), 'تقرير الخدمات: مبلغ 1000 وعمولة 10')
  const pm = await runReport('payment_methods', { dateFrom: '', dateTo: '', warehouseId: null })
  const pmGet = (label: string): number => Number(pm.rows.find((r) => r.method === label)?.total ?? 0)
  assert(near(pmGet('فودافون كاش'), 40), `طرق الدفع: فودافون 40 (${pmGet('فودافون كاش')})`)
  assert(near(pmGet('نقدًا'), 60 + 50 + 100 + 10 + 150), `طرق الدفع: نقدًا ${pmGet('نقدًا')} (60 + 50 + 100 + 10 + 150)`)
  assert(near(pmGet('آجل'), 300), `طرق الدفع: آجل ${pmGet('آجل')} (100 باقي + 200)`)
  const dash = await getPaymentMethodsBreakdown()
  assert(near(dash.find((d) => d.method === 'vodafone_cash')?.total ?? 0, 40), 'لوحة التحكم بتحسب حصة فودافون من الفاتورة المقسّمة')
  const aging = await runReport('customers_aging' as any, { dateFrom: '', dateTo: '', warehouseId: null }).catch(() => null)
  void aging

  console.log('\n10) الوردية والخزائن والقيود')
  const summary = await getCurrentSessionSummary()
  // كاش: افتتاحي 100 + 60 + 50 + (فاتورة 100 مدفوعة كاش) + 10 + 150
  assert(summary != null && near(summary.cashSales, 60 + 50 + 100 + 10 + 150), `كاش الوردية بيشمل الجزء النقدي من المقسّم: ${summary?.cashSales}`)
  const treasuries = await listTreasuries()
  const totalTreasuries = treasuries.reduce((s, t) => s + t.balance, 0)
  // مبيعات محصّلة 100 + 50 + 100 + 10 + 150 = 410 (الآجل بره) ناقص فاتورة الشراء المدفوعة نقدًا 50
  assert(near(totalTreasuries, 360), `مجموع الخزائن ${totalTreasuries} = 360 (الفودافون ضمنها)`)
  const ledger = await buildLedger()
  const unbalanced = ledger.filter((e) => Math.abs(e.lines.reduce((s, l) => s + l.debit - l.credit, 0)) > 0.011)
  assert(unbalanced.length === 0, `كل القيود متوازنة (${ledger.length} قيد)`)

  // يومية المبيعات (تقرير محاسبي): الأعمدة بتحسب حصة كل وسيلة من الفاتورة المقسّمة
  const daily = await runAccountingReport('daily_sales' as any, {} as any)
  const dayRow = daily.rows[0] as any
  assert(!!dayRow && near(Number(dayRow.wallet), 40), `يومية المبيعات: عمود المحافظ 40 (${dayRow?.wallet})`)
  assert(!!dayRow && near(Number(dayRow.credit), 300), `يومية المبيعات: عمود الآجل 300 (${dayRow?.credit})`)
  assert(!!dayRow && near(Number(dayRow.cash), 370), `يومية المبيعات: عمود النقدي 370 (${dayRow?.cash})`)

  console.log('\n11) مرتجع جزء من فاتورة مقسّمة (آجل) + حذف فاتورة آجلة')
  const ret = await returnInvoiceLines(s2.invoiceId!, [{ salesItemId: v2.lines.find((l) => l.productName === 'جراب موبايل')!.salesItemId, qty: 1 }], adminId)
  assert(ret.ok === true && near(ret.refundAmount ?? 0, 100), 'المرتجع 100')
  // الجزء الآجل = 100 من 150 → 66.67 بينزل من رصيد العميل
  assert(near(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id]), 300 - (100 * 100) / 150), 'المرتجع اتوزّع بنسبة الجزء الآجل على رصيد العميل')
  const retSvc = await returnInvoiceLines(s2.invoiceId!, [{ salesItemId: v2.lines.find((l) => l.productName === 'تركيب فيميه')!.salesItemId, qty: 1 }], adminId)
  assert(retSvc.ok === true, 'مرتجع خدمة نجح')
  assert(Number(await scalar('SELECT COUNT(*) AS v FROM stock_movements WHERE product_id = ?', [svcFixed.id])) === 0, 'الخدمة ما اتسجلش ليها أي حركة مخزون (بيع ولا مرتجع)')
  assert(near(Number(await scalar('SELECT quantity AS v FROM stock WHERE product_id = ?', [svcFixed.id])), 0), 'رصيد الخدمة فضل صفر')
  const balBefore = Number(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id]))
  await deleteInvoice(s3.invoiceId!, adminId)
  assert(near(Number(await scalar('SELECT balance AS v FROM customers WHERE id = ?', [cust.id])), balBefore - 200), 'حذف الفاتورة الآجلة رجّع 200 من الرصيد')

  console.log('\n11-ب) إقفال اليوم')
  const closed = await closeDay(adminId, 0)
  assert(closed != null, 'إقفال اليوم نجح')
  const cashRow = closed?.salesByMethod?.find((m: any) => m.method === 'cash')
  const vodaRow = closed?.salesByMethod?.find((m: any) => m.method === 'vodafone_cash')
  assert(!!vodaRow && near(vodaRow.total, 40), 'تقرير الوردية بيفصل فودافون كاش 40 من الفاتورة المقسّمة')
  assert(!!cashRow && cashRow.total > 0, 'وتقرير الوردية فيه نقدي')
  // 6 فواتير بيع اتعملت (منهم 2 مقسّمة بصفّين لكل واحدة) والمحذوفة مش محسوبة = 5 بالظبط
  assert(Number(closed?.invoiceCount) === 5, `عدد الفواتير في الوردية من غير تكرار الفاتورة المقسّمة (${closed?.invoiceCount})`)

  console.log('\n12) المرفقات')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const up = await uploadAttachment({ name: 'إيصال.png', mime: 'image/png', dataBase64: png.toString('base64') })
  assert(up.ok === true && /\.png$/.test(up.path ?? ''), 'رفع مرفق صورة نجح')
  const down = await readAttachment(up.path!)
  assert(down.ok === true && down.mime === 'image/png' && Buffer.from(down.dataBase64!, 'base64').equals(png), 'قراءة المرفق رجّعت نفس الملف')
  assert((await readAttachment('../../etc/passwd')).ok === false, 'مسار خارج المجلد اترفض')
  assert((await uploadAttachment({ name: 'virus.exe', mime: 'x', dataBase64: 'AAAA' })).ok === false, 'نوع ملف غير مدعوم اترفض')
  assert((await uploadAttachment({ name: 'big.pdf', mime: 'application/pdf', dataBase64: Buffer.alloc(11 * 1024 * 1024).toString('base64') })).ok === false, 'ملف أكبر من 10 ميجا اترفض')

  console.log('\n12-ب) مطلوب شراؤه حسب الحد الأدنى للصنف')
  await openDay(adminId, 0) // اليوم اتقفل في 11-ب
  // صنف طلبه بالحد الأدنى: رصيد 5 وحد 3 (الكمية المطلوبة فاضية = يكمّل لضعف الحد)
  const minItem = await createProduct(
    productInput({ name: 'شاحن سريع', costPrice: 80, retailPrice: 150, openingQuantity: 5, reorderPoint: 3, vendorId: vendor.id, warehouseId, purchaseMode: 'min_stock' })
  )
  assert(minItem.purchaseMode === 'min_stock' && minItem.reorderQty === 0, 'طريقة min_stock اتحفظت على الصنف')
  const sellOne = async (p: { id: number; name: string; barcode: string }, price: number): Promise<void> => {
    const r = await checkout(sale({ lines: [line(p, 1, price)], paymentMethod: 'cash', paid: price }), adminId)
    if (!r.ok) throw new Error(r.error)
  }
  const openFor = async (id: number): Promise<number> => (await listPurchaseRequests({ status: 'pending' })).filter((p) => p.productId === id).length
  await sellOne(minItem, 150) // الرصيد 4 (فوق الحد 3)
  assert((await openFor(minItem.id)) === 0, 'الرصيد 4 أعلى من الحد 3: مفيش طلب شراء')
  await sellOne(minItem, 150) // الرصيد 3 = الحد
  const reqMin = (await listPurchaseRequests({ status: 'pending' })).find((p) => p.productId === minItem.id)
  assert(!!reqMin && near(reqMin.qty, 3) /* 2*3 - 3 */ && /وصل للحد/.test(reqMin?.note ?? ''), 'الرصيد وصل للحد (3): اتفتح طلب شراء واحد بكمية 3 وملاحظة')
  assert(reqMin?.vendorName === 'مورد الإكسسوارات' && near(reqMin?.unitCost ?? 0, 80), 'الطلب واخد المورد وسعر الشراء من الصنف')
  await sellOne(minItem, 150) // الرصيد 2
  assert((await openFor(minItem.id)) === 1, 'بيع تاني تحت الحد ما كرّرش الطلب')
  // بعد الشراء والاستلام ورجوع الرصيد فوق الحد، ونزوله تاني = طلب جديد
  await createPurchaseInvoice(
    { vendorId: vendor.id, warehouseId, lines: [{ productId: minItem.id, name: minItem.name, barcode: minItem.barcode, qty: 6, purchasePrice: 80 }], paymentMethod: 'cash', paid: 480, note: '', purchaseRequestIds: [reqMin!.id] },
    adminId
  )
  assert((await openFor(minItem.id)) === 0, 'بعد فاتورة الشراء الطلب اتقفل')
  await sellOne(minItem, 150) // الرصيد 7
  assert((await openFor(minItem.id)) === 0, 'بعد الشراء الرصيد 7 فوق الحد: مفيش طلب')
  for (let i = 0; i < 4; i++) await sellOne(minItem, 150) // 6,5,4,3
  assert((await openFor(minItem.id)) === 1, 'نزل للحد تاني: اتفتح طلب جديد')

  // صنف بكمية شراء محددة
  const fixedQty = await createProduct(
    productInput({ name: 'كابل شحن', costPrice: 20, retailPrice: 40, openingQuantity: 3, reorderPoint: 2, warehouseId, purchaseMode: 'min_stock', reorderQty: 10 })
  )
  await sellOne(fixedQty, 40) // الرصيد 2 = الحد
  const reqFixed = (await listPurchaseRequests({ status: 'pending' })).find((p) => p.productId === fixedQty.id)
  assert(!!reqFixed && near(reqFixed.qty, 10), 'الكمية المحددة على الصنف (10) هي اللي اتطلبت')

  // صنف مايتسجلش
  const noneItem = await createProduct(productInput({ name: 'هدية', costPrice: 5, retailPrice: 10, openingQuantity: 5, reorderPoint: 1, warehouseId, purchaseMode: 'none' }))
  await sellOne(noneItem, 10)
  assert((await openFor(noneItem.id)) === 0, 'صنف "ماتتسجلش" ما دخلش القائمة')

  // التعديل بيتحفظ، والخدمة مالهاش مشتريات حتى لو اتحدد
  const upd = await updateProduct(noneItem.id, {
    name: noneItem.name, barcode: noneItem.barcode, categoryId: null, unitId: null, vendorId: null, costPrice: 5, retailPrice: 10, wholesalePrice: 0,
    wholesale2Price: 0, packPrice: 0, reorderPoint: 1, expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null,
    purchaseMode: 'min_stock', reorderQty: 7
  })
  assert(upd.purchaseMode === 'min_stock' && upd.reorderQty === 7, 'تعديل الصنف حفظ طريقة الشراء والكمية')
  const svcMode = await createProduct(productInput({ name: 'خدمة تجريبية', retailPrice: 10, isService: true, purchaseMode: 'min_stock' }))
  assert(svcMode.purchaseMode === 'none', 'الخدمة بتتحوّل لـ none تلقائيًا')

  console.log('\n13) توقيع QZ Tray')
  const qz = getQzCredentials()
  assert(qz.certificatePem.startsWith('-----BEGIN CERTIFICATE-----') && qz.privateKeyPem.includes('PRIVATE KEY'), 'اتولّدت شهادة ومفتاح')
  const x509 = new X509Certificate(qz.certificatePem)
  assert(x509.subject.includes('Quick Cash Plus') && new Date(x509.validTo).getTime() > Date.now() + 10 * 365 * 86400000, 'الشهادة صالحة لسنين طويلة')
  assert(x509.ca === true, 'الشهادة CA:TRUE (تنفع override.crt في QZ Tray) — والقديمة اتجدّدت تلقائيًا')
  const msg = '{"call":"printers.getDefault","timestamp":1793000000000}'
  const sig = signQzMessage(msg)
  const verifier = createVerify('RSA-SHA512')
  verifier.update(msg)
  assert(verifier.verify(x509.publicKey, sig, 'base64'), 'التوقيع بيتحقق بالمفتاح العام للشهادة (SHA512)')
  assert(existsSync(join(DATA_DIR, 'qz', 'private-key.pem')), 'المفتاح اتحفظ في مجلد بيانات العميل')

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
