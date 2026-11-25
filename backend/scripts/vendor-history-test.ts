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
import {
  createVendor,
  addVendorAccountEntries,
  addVendorManualEntry,
  deleteVendorAccountEntry,
  getVendorStatement,
  recordVendorPayment
} from '../src/main/services/vendors'
import { ACTOR_META_KEY, type ActorMeta } from '../src/shared/activityActor'
import { buildHandlerMap, MUTATING_CHANNELS } from '../src/main/handlers'
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

  console.log('6) حركة يدوية على حساب المورد (مبلغ وتاريخ وبيان بس)')
  const man = await createVendor({ name: 'مورد الحركات اليدوية', phone: '', address: '', notes: '', openingBalance: 0 })
  const snapBefore = await snapshot()
  const v1 = await addVendorManualEntry(man.id, { date: '2026-02-01', kind: 'purchase', amount: 700, description: '  حاجة أمانة  ' })
  assert(v1.balance === 700, 'مشتريات 700 → اللي علينا للمورد 700')
  const v2 = await addVendorManualEntry(man.id, { date: '2026-02-05', kind: 'payment', amount: 200 })
  const v3 = await addVendorManualEntry(man.id, { date: '2026-02-03', kind: 'return', amount: 50, description: '' })
  assert(v2.balance === 500 && v3.balance === 450, 'سداد 200 ثم مرتجع 50 → الرصيد 450')
  assert(JSON.stringify(snapBefore) === JSON.stringify(await snapshot()), 'مفيش أي أثر على المخزون/الفواتير/المدفوعات/القيود/الخزن (حركة أرقام بس)')
  const ms = await getVendorStatement(man.id)
  assert(ms.entries.map((e) => e.date).join(',') === '2026-02-01,2026-02-03,2026-02-05', 'الكشف مرتّب بالتاريخ مش بترتيب الإدخال')
  assert(ms.entries.map((e) => e.balance).join(',') === '700,650,450' && ms.openingBalance === 0, 'الرصيد الجاري 700 ← 650 ← 450 و«رصيد سابق» 0')
  assert(ms.entries[0].description === 'حاجة أمانة' && ms.entries[1].description === 'مرتجع / خصم (حركة يدوية)' && ms.entries[2].description === 'سداد (حركة يدوية)', 'البيان بيتنضّف، والفاضي بياخد وصف افتراضي حسب النوع')
  assert(ms.entries.every((e) => e.deletable === true), 'حركات الحساب اليدوية قابلة للحذف')
  const realOnes = (await getVendorStatement(other.id)).entries.concat((await getVendorStatement(vendor.id)).entries.filter((e) => e.id < 2_000_000))
  assert(realOnes.length > 0 && realOnes.every((e) => !e.deletable), 'الفواتير والسداد والمرتجع الحقيقيين مش قابلين للحذف من هنا')

  const bad = async (input: any): Promise<boolean> => (await addVendorManualEntry(man.id, input).catch((e) => e)) instanceof Error
  assert(await bad({ date: '2026-02-01', kind: 'weird', amount: 5 }), 'نوع غلط → خطأ')
  assert((await bad({ date: '2026-02-01', kind: 'payment', amount: 0 })) && (await bad({ date: '2026-02-01', kind: 'payment', amount: -5 })) && (await bad({ date: '2026-02-01', kind: 'payment', amount: NaN })) && (await bad({ date: '2026-02-01', kind: 'payment', amount: 1e15 })), 'مبلغ صفر/سالب/مش رقم/ضخم → خطأ')
  assert((await bad({ date: '2026-02-30', kind: 'payment', amount: 5 })) && (await bad({ date: '1/2/2026', kind: 'payment', amount: 5 })) && (await bad({ date: '', kind: 'payment', amount: 5 })), 'تاريخ مش حقيقي/بصيغة غلط → خطأ')
  assert(await bad({ date: '2099-01-01', kind: 'purchase', amount: 5 }), 'تاريخ في المستقبل → خطأ')
  assert((await addVendorManualEntry(99999, { date: '2026-02-01', kind: 'payment', amount: 5 }).catch((e) => e)) instanceof Error, 'مورد مش موجود → خطأ')
  assert((await getVendorStatement(man.id)).balance === 450, 'المحاولات الغلط ما غيّرتش الرصيد')

  console.log('7) حذف حركة (للأدمن بس)')
  await getDb().execute({ sql: "INSERT INTO users (username, password_hash, full_name, role) VALUES ('cashier-x', 'x', 'كاشير', 'cashier')", args: [] })
  const cashierId = Number(((await getDb().execute("SELECT id FROM users WHERE username = 'cashier-x'")).rows[0] as any).id)
  const actor = (userId: number | null): ActorMeta => ({ [ACTOR_META_KEY]: true, userId, username: 't' })
  const target = ms.entries[0].id - 2_000_000
  const denied = [await deleteVendorAccountEntry(target).catch((e) => e), await deleteVendorAccountEntry(target, actor(cashierId)).catch((e) => e), await deleteVendorAccountEntry(target, actor(null)).catch((e) => e), await deleteVendorAccountEntry(target, actor(999999)).catch((e) => e), await deleteVendorAccountEntry(target, { userId: 1 }).catch((e) => e)]
  assert(denied.every((d) => d instanceof Error), 'بدون actor / كاشير / مجهول / actor مزوّر → مرفوض (الأدمن بس)')
  assert((await getVendorStatement(man.id)).entries.length === 3, 'المرفوض ما حذفش حاجة')
  const afterDel = await deleteVendorAccountEntry(target, actor(1))
  assert(afterDel.balance === -250, 'الأدمن حذف المشتريات (700): الرصيد 450 − 700 = −250 (رجّع أثرها بالظبط)')
  assert((await getVendorStatement(man.id)).entries.length === 2 && (await deleteVendorAccountEntry(target, actor(1)).catch((e) => e)) instanceof Error, 'الحركة اتشالت، وحذفها تاني → خطأ (مش موجودة)')
  assert(JSON.stringify(snapBefore) === JSON.stringify(await snapshot()), 'الحذف برضه من غير أي أثر على المخزون/الفواتير/المدفوعات/القيود/الخزن')
  const h = buildHandlerMap()
  assert(!!h['vendors:addAccountEntry'] && !!h['vendors:deleteAccountEntry'] && MUTATING_CHANNELS.has('vendors:addAccountEntry') && MUTATING_CHANNELS.has('vendors:deleteAccountEntry'), 'القناتين متسجّلين ومتعلّمين mutating (تسجيل نشاط + الـactor)')

  console.log(`\n${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
