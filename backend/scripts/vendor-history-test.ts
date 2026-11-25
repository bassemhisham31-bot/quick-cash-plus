/**
 * اختبار حركات حساب المورد التاريخية (أرقام فقط) + كشف حساب المورد الكامل (2026-11-25):
 *  - الحركات التاريخية بتتحسب على رصيد المورد وتظهر في الكشف برصيد جاري، من غير أي أثر على المخزون/الخزن/المدفوعات/الفواتير.
 *  - الفواتير والمرتجعات والسداد الحقيقية بتظهر في نفس الكشف وبيفضل «رصيد سابق» = 0.
 *  - القيود المحاسبية فضلت متوازنة ورصيد الموردين في الحسابات = مجموع أرصدتهم.
 *   npx tsx scripts/vendor-history-test.ts
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data', 'vendor-history-test')
process.env.QCP_DATA_DIR = DATA_DIR

import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { createVendor, addVendorAccountEntries, getVendorStatement, recordVendorPayment } from '../src/main/services/vendors'
import { createPurchaseInvoice, returnPurchaseLines } from '../src/main/services/purchases'
import { buildLedger } from '../src/main/services/ledger'
import type { ProductInput } from '../src/shared/types'

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
const productInput = (over: Partial<ProductInput>): ProductInput =>
  ({
    name: 'صنف', barcode: '', categoryId: null, unitId: null, vendorId: null, costPrice: 0, retailPrice: 0,
    wholesalePrice: 0, wholesale2Price: 0, packPrice: 0, openingQuantity: 0, reorderPoint: 0, warehouseId: 1,
    expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null, ...over
  }) as ProductInput

async function count(sql: string): Promise<number> {
  return Number(((await getDb().execute(sql)).rows[0] as any).n)
}
async function snapshot(): Promise<Record<string, number>> {
  return {
    stock: await count('SELECT COUNT(*) n FROM stock'),
    stockQty: await count('SELECT COALESCE(SUM(quantity),0) n FROM stock'),
    movements: await count('SELECT COUNT(*) n FROM stock_movements'),
    purchases: await count('SELECT COUNT(*) n FROM purchase_invoices'),
    payments: await count('SELECT COUNT(*) n FROM payments'),
    journal: await count('SELECT COUNT(*) n FROM journal_entries'),
    treasuries: await count('SELECT COALESCE(SUM(opening_balance),0) n FROM treasuries'),
    products: await count('SELECT COUNT(*) n FROM products')
  }
}

async function main(): Promise<void> {
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true })
  mkdirSync(DATA_DIR, { recursive: true })
  await initDatabaseAtPath(join(DATA_DIR, 'vendor-history-test.sqlite'))

  const product = await createProduct(productInput({ name: 'زيت للتجربة', costPrice: 10, retailPrice: 15, openingQuantity: 0 }))
  const vendor = await createVendor({ name: 'مورد تجريبي', phone: '', address: '', notes: '', openingBalance: 0 })
  const other = await createVendor({ name: 'مورد فاضي', phone: '', address: '', notes: '', openingBalance: 0 })

  console.log('1) حركات تاريخية (أرقام فقط)')
  const before = await snapshot()
  const r = await addVendorAccountEntries(vendor.id, [
    { date: '2026-01-05', kind: 'opening', description: 'رصيد أول المدة', debit: 1000, credit: 0 },
    { date: '2026-01-10', kind: 'purchase', description: 'مشتريات صويا — 7545 كجم × 63.8', debit: 5000, credit: 0 },
    { date: '2026-01-10', kind: 'payment', description: 'سداد — بنك مصر', debit: 0, credit: 3000 },
    { date: '2026-01-20', kind: 'return', description: 'مرتجع', debit: 0, credit: 200 }
  ])
  assert(r.inserted === 4 && r.net === 2800 && r.balance === 2800, 'اتسجّلت 4 حركات وصافيها 2800 على رصيد المورد')
  const after = await snapshot()
  assert(JSON.stringify(before) === JSON.stringify(after), 'مفيش أي أثر على المخزون/حركات المخزن/الفواتير/المدفوعات/القيود/الخزن')

  const st1 = await getVendorStatement(vendor.id)
  assert(st1.balance === 2800 && st1.openingBalance === 0, 'الرصيد 2800 و«رصيد سابق» = 0')
  assert(st1.entries.length === 4 && st1.entries[0].type === 'opening' && st1.entries[0].balance === 1000, 'الأولى رصيد أول المدة (1000)')
  assert(
    st1.entries.map((e) => e.balance).join(',') === '1000,6000,3000,2800',
    'الرصيد الجاري بعد كل حركة: 1000 ← 6000 ← 3000 ← 2800 (نفس ترتيب الإدخال في نفس اليوم)'
  )
  assert(st1.totalDebit === 6000 && st1.totalCredit === 3200, 'إجمالي مدين 6000 ودائن 3200')
  assert(st1.entries[1].description.includes('7545') && st1.entries[1].type === 'invoice', 'البيان محفوظ ونوع الحركة مشتريات')

  console.log('2) تحقّق من المدخلات')
  const bad1 = await addVendorAccountEntries(vendor.id, [{ date: '5/1/2026', kind: 'purchase', description: 'x', debit: 1, credit: 0 }]).catch((e) => e)
  const bad2 = await addVendorAccountEntries(vendor.id, [{ date: '2026-01-05', kind: 'weird' as any, description: 'x', debit: 1, credit: 0 }]).catch((e) => e)
  const bad3 = await addVendorAccountEntries(vendor.id, [{ date: '2026-01-05', kind: 'purchase', description: 'x', debit: 0, credit: 0 }]).catch((e) => e)
  const bad4 = await addVendorAccountEntries(99999, [{ date: '2026-01-05', kind: 'purchase', description: 'x', debit: 5, credit: 0 }]).catch((e) => e)
  assert(bad1 instanceof Error && bad2 instanceof Error && bad3 instanceof Error && bad4 instanceof Error, 'تاريخ غلط / نوع غلط / مبلغ صفر / مورد مش موجود → خطأ')
  const stillOk = await getVendorStatement(vendor.id)
  assert(stillOk.balance === 2800 && stillOk.entries.length === 4, 'المحاولات الغلط ما غيّرتش حاجة')

  console.log('3) حركات حقيقية بعد النقل بتظهر في نفس الكشف')
  const inv = await createPurchaseInvoice(
    { vendorId: vendor.id, warehouseId: 1, lines: [{ productId: product.id, name: product.name, barcode: product.barcode, qty: 100, purchasePrice: 10 }], paymentMethod: 'credit', paid: 0, note: '' },
    1
  )
  assert(inv.ok, 'فاتورة مشتريات آجل 1000 للمورد')
  const pay = await recordVendorPayment(vendor.id, 500, 'cash', 'دفعة', 1, inv.purchaseId!)
  assert(pay.balance === 3300, 'سداد 500 على الفاتورة → الرصيد 3300 (2800 + 1000 − 500)')
  const itemRow = (await getDb().execute({ sql: 'SELECT id FROM purchase_items WHERE purchase_invoice_id = ?', args: [inv.purchaseId!] })).rows[0] as any
  const ret = await returnPurchaseLines(inv.purchaseId!, [{ purchaseItemId: Number(itemRow.id), qty: 10 }], 1)
  assert(ret.ok, 'مرتجع 10 وحدات (100) على الفاتورة')
  const st2 = await getVendorStatement(vendor.id)
  assert(st2.balance === 3200 && st2.openingBalance === 0, 'الرصيد 3200 و«رصيد سابق» لسه 0 (الكشف بيغطي كل حاجة)')
  const types = st2.entries.map((e) => e.type).join(',')
  assert(types.endsWith('invoice,payment,return') || (types.includes('invoice') && types.includes('payment') && types.includes('return')), 'الفاتورة والسداد والمرتجع الحقيقيين ظاهرين مع التاريخيين')
  assert(st2.entries[st2.entries.length - 1].balance === 3200, 'الرصيد الجاري الأخير = رصيد المورد')
  const stockQty = await count('SELECT COALESCE(SUM(quantity),0) n FROM stock')
  assert(stockQty === 90, 'المخزون اتأثر بالفاتورة الحقيقية بس (100 − 10 مرتجع = 90)، مش بالحركات التاريخية')

  console.log('4) مورد من غير حركات')
  const empty = await getVendorStatement(other.id)
  assert(empty.balance === 0 && empty.entries.length === 0 && empty.openingBalance === 0, 'مورد فاضي: كشف فاضي ورصيد صفر')

  console.log('5) المحاسبة')
  const entries = await buildLedger()
  const lines = entries.flatMap((e) => e.lines)
  const debit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100
  const credit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100
  assert(debit === credit, `القيود متوازنة (مدين ${debit} = دائن ${credit})`)
  const apNet = Math.round(lines.filter((l) => l.role === 'ap').reduce((s, l) => s + l.credit - l.debit, 0) * 100) / 100
  const vendSum = await count('SELECT COALESCE(SUM(balance),0) n FROM vendors')
  assert(apNet === vendSum && vendSum === 3200, `رصيد الموردين في الحسابات (${apNet}) = مجموع أرصدة الموردين (${vendSum})`)

  console.log(`\n${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
