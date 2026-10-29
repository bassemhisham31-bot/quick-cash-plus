/**
 * اختبار شجرة الحسابات المبسّطة (7 حسابات أساسية) على قاعدة مؤقتة وسيرفر حقيقي:
 *  - الوضع القديم بيفضل زي ما هو (ما اتغيّرش حاجة قبل التحويل)
 *  - التحويل: 7 حسابات بس، القيود اليدوية بتتنقل، الأرقام الكلية (صافي الربح/الأصول/الخصوم/حقوق الملكية) ما بتتغيّرش
 *  - إضافة/تعديل/حذف الحسابات (مع منع حذف المربوط بالنظام أو اللي عليه قيود) وربط أدوار النظام بحسابات تانية
 *  - استيراد الأصناف من الإكسل من غير باركود
 *  - نسخة retail: قنوات المطاعم الفردية (settings:getRestaurant...) ممنوعة
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { initDatabaseAtPath } from '../src/main/db'
import { startHttpServer } from '../src/http/server'

const PORT = 4997
const BASE = `http://127.0.0.1:${PORT}`
const DB_PATH = join(process.cwd(), 'data', 'chart-test.sqlite')
const BACKUP_DIR = join(process.cwd(), 'data', 'chart-test-backups')

process.env.QCP_INTERNAL_SECRET = 'test-internal-secret'
process.env.QCP_HEALTH_MAX_DISK_PCT = '100'
process.env.QCP_BACKUP_DIR = BACKUP_DIR

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

let token = ''
async function call(channel: string, args: unknown[] = []): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}/api/rpc/${channel}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ args }) })
  return { status: res.status, body: await res.json() }
}
const result = async (channel: string, args: unknown[] = []): Promise<any> => (await call(channel, args)).body.result
const fails = async (channel: string, args: unknown[], text: string): Promise<boolean> => {
  const r = await call(channel, args)
  return r.body.ok === false && String(r.body.error).includes(text)
}
const internal = async (action: string): Promise<any> =>
  fetch(`${BASE}/internal/chart`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-qcp-internal': 'test-internal-secret' }, body: JSON.stringify({ action }) }).then((r) => r.json())

const report = (type: string, filter: Record<string, unknown> = {}): Promise<any> => result('accounting:run', [type, filter])
const rowOf = (rep: any, item: string): number => Number(rep.rows.find((r: any) => String(r.item).trim() === item)?.amount ?? NaN)

async function figures(): Promise<{ profit: number; assets: number; liabilities: number; equity: number; trialD: number; trialC: number; journalD: number; journalC: number }> {
  const inc = await report('income_statement')
  const bs = await report('balance_sheet')
  const tb = await report('trial_balance')
  const jr = await report('journal')
  return {
    profit: rowOf(inc, 'صافي الربح / (الخسارة)'),
    assets: rowOf(bs, 'إجمالي الأصول'),
    liabilities: rowOf(bs, 'إجمالي الخصوم'),
    equity: rowOf(bs, 'إجمالي حقوق الملكية'),
    trialD: tb.totals.cd,
    trialC: tb.totals.cc,
    journalD: jr.totals.debit,
    journalC: jr.totals.credit
  }
}

async function xlsxBase64(rows: (string | number)[][]): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('الأصناف')
  for (const r of rows) ws.addRow(r)
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
}

async function main(): Promise<void> {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  if (existsSync(BACKUP_DIR)) rmSync(BACKUP_DIR, { recursive: true })
  await initDatabaseAtPath(DB_PATH)
  const server = startHttpServer(PORT)
  await new Promise((r) => setTimeout(r, 300))

  try {
    const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) }).then((r) => r.json())
    token = login.token
    const adminId = login.user.id as number

    console.log('1) بيانات فعلية على الشجرة القديمة (بيع نقدي/آجل، شراء، مصروف، قيود يدوية)...')
    const wh = (await result('catalog:listWarehouses'))[0].id as number
    const prod = (
      await call('catalog:createProduct', [
        { name: 'صنف-اختبار', barcode: 'CH-1', categoryId: null, unitId: null, vendorId: null, costPrice: 40, retailPrice: 100, wholesalePrice: 90, wholesale2Price: 80, packPrice: 0, openingQuantity: 20, reorderPoint: 1, warehouseId: wh, expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null }
      ])
    ).body.result
    await call('cash:openDay', [adminId, 100])
    const cust = (await call('customers:create', [{ name: 'عميل آجل', phone: '0100', notes: '', openingBalance: 50 }])).body.result
    const vend = (await call('vendors:create', [{ name: 'مورد', phone: '0111', address: '', notes: '', openingBalance: 0 }])).body.result
    const line = (qty: number) => ({ productId: prod.id, name: 'صنف-اختبار', barcode: '', unitPrice: 100, qty, discount: 0 })
    const cash = (await call('pos:checkout', [{ customerId: null, warehouseId: wh, lines: [line(2)], discountType: 'value', discountValue: 10, paymentMethod: 'cash', paid: 190, redeemPoints: 0 }, adminId])).body.result
    const credit = (await call('pos:checkout', [{ customerId: cust.id, warehouseId: wh, lines: [line(3)], discountType: 'value', discountValue: 0, paymentMethod: 'credit', paid: 0, redeemPoints: 0 }, adminId])).body.result
    assert(cash?.ok && credit?.ok, 'بيع نقدي (بخصم) وبيع آجل نجحوا')
    const purchase = (await call('purchases:create', [{ vendorId: vend.id, warehouseId: wh, lines: [{ productId: prod.id, name: 'صنف-اختبار', barcode: '', qty: 5, purchasePrice: 40 }], paymentMethod: 'credit', paid: 0, note: '' }, adminId])).body.result
    assert(purchase?.ok, 'فاتورة شراء آجل نجحت')
    const cat = (await call('expenses:createCategory', ['إيجار'])).body.result
    const exp = (await call('expenses:create', [{ categoryId: cat.id, amount: 70, method: 'cash', note: 'إيجار' }, adminId])).body.result
    const exp2 = (await call('expenses:create', [{ categoryId: null, amount: 20, method: 'cash', note: 'متنوع' }, adminId])).body.result
    assert(exp?.ok && exp2?.ok, 'مصروفات بتصنيف وبدون تصنيف اتسجلت')

    const oldAccounts = await result('ledger:listAccounts')
    assert(oldAccounts.length > 18 && oldAccounts.some((a: any) => a.code === '4100') && oldAccounts.some((a: any) => a.code === `${6000 + cat.id}`), 'الشجرة القديمة: حسابات النظام + حساب لكل تصنيف مصروف')
    const treasuries = await result('treasury:list')
    const cashTreasury = treasuries.find((t: any) => t.methods?.includes?.('cash')) ?? treasuries[0]
    const tCode = String(1100 + cashTreasury.id)
    const e1 = await call('ledger:createEntry', [{ date: '2026-10-29', description: 'رأس مال', lines: [{ code: tCode, debit: 500, credit: 0 }, { code: '3100', debit: 0, credit: 500 }] }, adminId])
    const e2 = await call('ledger:createEntry', [{ date: '2026-10-29', description: 'مصروف يدوي', lines: [{ code: '6900', debit: 30, credit: 0 }, { code: tCode, debit: 0, credit: 30 }] }, adminId])
    const e3 = await call('ledger:createEntry', [{ date: '2026-10-29', description: 'إيراد يدوي', lines: [{ code: tCode, debit: 80, credit: 0 }, { code: '4200', debit: 0, credit: 80 }] }, adminId])
    assert(e1.body.ok && e2.body.ok && e3.body.ok, '3 قيود يدوية على حسابات النظام القديمة')
    assert((await call('ledger:setAccountActive', ['4100', false])).body.ok, 'إيقاف حساب نظام ما بيضرش (متجاهل)')
    const before = await figures()
    assert(near(before.trialD, before.trialC) && near(before.journalD, before.journalC), `قبل التحويل: ميزان المراجعة ودفتر اليومية متوازنين (${before.trialD})`)
    assert(Number.isFinite(before.profit) && before.assets > 0, `قبل التحويل: صافي الربح ${before.profit} / الأصول ${before.assets} / الخصوم ${before.liabilities} / حقوق الملكية ${before.equity}`)
    assert((await call('ledger:updateAccount', ['4100', { name: 'x', type: 'revenue' }])).body.ok === false, 'حساب النظام القديم مينفعش يتعدل')
    assert((await call('ledger:deleteAccount', ['4100'])).body.ok === false, 'حساب النظام القديم مينفعش يتحذف')
    assert((await result('ledger:listAccountRoles')).custom === false, 'الوضع القديم: مفيش ربط أدوار')

    console.log('\n2) خطة التحويل (من غير تغيير) + حماية endpoint الداخلي...')
    const noSecret = await fetch(`${BASE}/internal/chart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"plan"}' })
    assert(noSecret.status === 404, '/internal/chart من غير السر = 404')
    const plan = (await internal('plan')).plan
    assert(plan.alreadyConverted === false && plan.toDelete.length === oldAccounts.length && plan.toCreate.length === 7, `الخطة: هتمسح ${plan.toDelete.length} حساب وتعمل 7`)
    assert(plan.manualLinesToRemap === 6, `الخطة: 6 سطور قيود يدوية هتتنقل (${plan.manualLinesToRemap})`)
    assert((await result('ledger:listAccounts')).length === oldAccounts.length, 'الخطة ما غيّرتش حاجة')

    console.log('\n3) التحويل للـ7 حسابات الأساسية...')
    const applied = await internal('apply')
    assert(applied.ok === true && existsSync(applied.backup), 'التحويل نجح وعمل نسخة احتياطية قبله')
    const accounts = await result('ledger:listAccounts')
    const expected = ['1000', '2000', '3000', '4000', '5000', '6000', '7000']
    assert(JSON.stringify(accounts.map((a: any) => a.code)) === JSON.stringify(expected), 'الحسابات دلوقتي هي الـ7 الأساسية بالظبط')
    assert(
      JSON.stringify(accounts.map((a: any) => `${a.code} ${a.name}`)) ===
        JSON.stringify(['1000 الايرادات', '2000 تكلفة المبيعات', '3000 المصروفات', '4000 الأصول الثابتة', '5000 الأصول المتداولة', '6000 الخصوم', '7000 حقوق الملكية']),
      'الأسماء زي طلب العميل'
    )
    assert(JSON.stringify(accounts.map((a: any) => a.type)) === JSON.stringify(['revenue', 'cogs', 'expense', 'asset', 'asset', 'liability', 'equity']), 'أنواع الحسابات صح')
    const again = await internal('apply')
    assert(again.ok === false && String(again.error).includes('قبل كده'), 'تحويل تاني اتمنع')
    const after = await figures()
    assert(near(after.profit, before.profit), `صافي الربح ما اتغيّرش (${after.profit})`)
    assert(near(after.assets, before.assets) && near(after.liabilities, before.liabilities) && near(after.equity, before.equity), `الأصول/الخصوم/حقوق الملكية ما اتغيّرتش (${after.assets} / ${after.liabilities} / ${after.equity})`)
    assert(near(after.trialD, after.trialC) && near(after.journalD, after.journalC), 'ميزان المراجعة ودفتر اليومية متوازنين بعد التحويل')
    const tb = await report('trial_balance')
    assert(tb.rows.every((r: any) => expected.includes(String(r.code))) && tb.rows.length >= 4, `ميزان المراجعة فيه الحسابات الأساسية بس (${tb.rows.map((r: any) => r.code).join(',')})`)
    assert((await result('ledger:listAccounts')).length === 7, 'قراءة التقارير ما رجّعتش حسابات النظام القديمة')
    const jr = await report('journal')
    assert(jr.rows.every((r: any) => expected.includes(String(r.code))), 'دفتر اليومية كله على الحسابات الأساسية')
    const manualJournal = jr.rows.filter((r: any) => String(r.description).startsWith('قيد يدوي'))
    assert(manualJournal.length === 3, 'القيود اليدوية الـ3 لسه موجودة في دفتر اليومية')

    console.log('\n4) إضافة / تعديل / حذف حسابات...')
    assert((await call('ledger:createAccount', [{ code: '5100', name: 'الخزينة', type: 'asset' }])).body.ok, 'إضافة حساب 5100')
    assert(await fails('ledger:createAccount', [{ code: '5100', name: 'تاني', type: 'asset' }], 'مستخدم'), 'كود مكرر اتمنع')
    assert(await fails('ledger:createAccount', [{ code: '12', name: 'قصير', type: 'asset' }], 'أرقام'), 'كود قصير اتمنع')
    assert(await fails('ledger:createAccount', [{ code: '5200', name: 'نوع غلط', type: 'zzz' }], 'نوع'), 'نوع غير صحيح اتمنع بخطأ واضح')
    assert((await call('ledger:createAccount', [{ code: '5200', name: 'العملاء', type: 'asset' }])).body.ok, 'إضافة حساب 5200')
    assert((await call('ledger:createAccount', [{ code: '5300', name: 'المخزون', type: 'asset' }])).body.ok, 'إضافة حساب 5300')
    assert((await call('ledger:updateAccount', ['5100', { name: 'الخزينة والبنوك', type: 'asset' }])).body.ok, 'تعديل اسم حساب')
    assert((await call('ledger:updateAccount', ['5100', { code: '5110', name: 'الخزينة والبنوك', type: 'asset' }])).body.ok, 'تعديل كود حساب')
    assert((await result('ledger:listAccounts')).some((a: any) => a.code === '5110') && !(await result('ledger:listAccounts')).some((a: any) => a.code === '5100'), 'الكود الجديد ظهر والقديم اختفى')
    assert(await fails('ledger:updateAccount', ['5110', { code: '5000', name: 'x', type: 'asset' }], 'مستخدم'), 'تعديل الكود لكود مستخدم اتمنع')
    assert(await fails('ledger:deleteAccount', ['5000'], 'مربوط'), 'حذف حساب مربوط بحركات النظام اتمنع برسالة واضحة')
    assert(await fails('ledger:updateAccount', ['5000', { name: 'x', type: 'revenue' }], 'مربوط'), 'تغيير نوع حساب مربوط بحركات النظام اتمنع')
    assert((await call('ledger:updateAccount', ['4000', { name: 'الأصول الثابتة (معدّل)', type: 'asset' }])).body.ok, 'الحسابات الأساسية قابلة للتعديل')
    assert((await call('ledger:updateAccount', ['4000', { name: 'الأصول الثابتة', type: 'asset' }])).body.ok, 'رجّعت الاسم')
    assert((await call('ledger:deleteAccount', ['5300'])).body.ok, 'حذف حساب جديد من غير استخدام')
    assert(!(await result('ledger:listAccounts')).some((a: any) => a.code === '5300'), 'اتحذف فعلًا')
    assert(await fails('ledger:deleteAccount', ['9999'], 'مش موجود'), 'حذف حساب مش موجود = خطأ واضح')
    // قيد يدوي على حساب جديد → مينفعش يتحذف طول القيد موجود
    assert((await call('ledger:createEntry', [{ date: '2026-10-30', description: 'اختبار حذف', lines: [{ code: '5110', debit: 10, credit: 0 }, { code: '7000', debit: 0, credit: 10 }] }, adminId])).body.ok, 'قيد يدوي على 5110')
    assert(await fails('ledger:deleteAccount', ['5110'], 'قيود'), 'حذف حساب عليه قيود يدوية اتمنع')
    assert((await call('ledger:updateAccount', ['5110', { code: '5120', name: 'الخزينة والبنوك', type: 'asset' }])).body.ok, 'تغيير الكود نقل القيد اليدوي معاه')
    const lg = await report('account_ledger', { accountCode: '5120' })
    assert(lg.rows.some((r: any) => String(r.description).includes('اختبار حذف')), 'الأستاذ على الكود الجديد فيه القيد')

    console.log('\n5) ربط أدوار النظام بحسابات تانية...')
    const roles = await result('ledger:listAccountRoles')
    assert(roles.custom === true && roles.roles.find((r: any) => r.role === 'sales')?.accountCode === '1000', 'ربط المبيعات الافتراضي = 1000')
    assert(await fails('ledger:setAccountRoles', [{ sales: '5120' }], 'نوع'), 'ربط المبيعات بحساب أصول اتمنع (نوع غلط)')
    assert(await fails('ledger:setAccountRoles', [{ nope: '5120' }], 'غير معروف'), 'دور غير معروف اتمنع')
    assert(await fails('ledger:setAccountRoles', [{ treasury: '8888' }], 'مش موجود'), 'ربط بحساب مش موجود اتمنع')
    const preMap = await figures()
    assert(near(preMap.assets, before.assets + 10) && near(preMap.equity, before.equity + 10) && near(preMap.profit, before.profit), 'قبل إعادة الربط: الفرق عن البداية هو قيد الـ10 اليدوي بس')
    assert((await call('ledger:setAccountRoles', [{ treasury: '5120', ar: '5200' }])).body.ok, 'ربط الخزائن بـ5120 والعملاء بـ5200')
    assert(await fails('ledger:deleteAccount', ['5200'], 'مربوط'), '5200 بقى مربوط فمينفعش يتحذف')
    const afterMap = await figures()
    assert(
      near(afterMap.profit, preMap.profit) && near(afterMap.assets, preMap.assets) && near(afterMap.liabilities, preMap.liabilities) && near(afterMap.equity, preMap.equity),
      'إعادة الربط ما غيّرتش الأرقام الكلية'
    )
    const tb2 = await report('trial_balance')
    const row = (code: string): any => tb2.rows.find((r: any) => String(r.code) === code)
    assert(!!row('5120') && !!row('5200') && Number(row('5120').cd) > 0, `ميزان المراجعة بقى فيه الخزائن على 5120 (${row('5120')?.cd}) والعملاء على 5200 (${row('5200')?.cd})`)
    const bs2 = await report('balance_sheet')
    assert(near(rowOf(bs2, 'الخزينة والبنوك'), Number(row('5120').cd)), 'الميزانية بتظهر الحساب المربوط باسمه')
    // حركة جديدة بعد الربط تتسجل على الحساب الجديد
    const sale3 = (await call('pos:checkout', [{ customerId: null, warehouseId: wh, lines: [line(1)], discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: 100, redeemPoints: 0 }, adminId])).body.result
    assert(sale3?.ok, 'بيع جديد بعد الربط')
    const tb3 = await report('trial_balance')
    assert(Number(tb3.rows.find((r: any) => String(r.code) === '5120').cd) > Number(row('5120').cd), 'البيع الجديد دخل على حساب الخزائن المربوط (5120)')

    console.log('\n6) استيراد الأصناف من الإكسل من غير باركود...')
    const header = ['الاسم', 'الباركود', 'التصنيف', 'الوحدة', 'سعر الشراء', 'سعر البيع (قطاعي)', 'سعر الجملة', 'سعر جملة الجملة', 'سعر العبوة', 'حد التنبيه', 'الكمية الحالية', 'تاريخ الصلاحية', 'الرقم التسلسلي']
    const sheet = await xlsxBase64([
      header,
      ['بدون باركود 1', '', 'عام', 'قطعة', 10, 15, '', '', '', 2, 7, '', ''],
      ['بدون باركود 2', '', 'عام', 'قطعة', 20, 30, '', '', '', 2, 3, '', ''],
      ['بباركود', 'IMP-777', 'عام', 'قطعة', 5, 9, '', '', '', 1, 4, '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '']
    ])
    const imp1 = await result('catalog:importProducts', [sheet])
    assert(imp1.ok === true && imp1.created === 3 && imp1.updated === 0 && imp1.rowErrors.length === 0, `الاستيراد قبل الصفوف اللي من غير باركود (created=${imp1.created}, errors=${imp1.rowErrors?.length})`)
    const products = await result('catalog:listProducts', ['بدون باركود', wh])
    assert(products.length === 2 && products.every((p: any) => /^\d+$/.test(p.barcode)) && new Set(products.map((p: any) => p.barcode)).size === 2, 'الصفوف من غير باركود أخدت باركود تلقائي مختلف')
    const imp2 = await result('catalog:importProducts', [sheet])
    assert(imp2.ok && imp2.created === 0 && imp2.updated === 3, `إعادة استيراد نفس الملف بتعدّل مش بتكرّر (updated=${imp2.updated}, created=${imp2.created})`)
    assert((await result('catalog:listProducts', ['بدون باركود', wh])).length === 2, 'مفيش أصناف متكررة بعد إعادة الاستيراد')
    const dupSheet = await xlsxBase64([header, ['صنف مكرر', '', '', '', 1, 2, '', '', '', 1, 1, '', ''], ['صنف مكرر', '', '', '', 1, 2, '', '', '', 1, 1, '', '']])
    const imp3 = await result('catalog:importProducts', [dupSheet])
    assert(imp3.created === 2 && imp3.updated === 0, 'صفّين بنفس الاسم من غير باركود في نفس الملف = صنفين (مفيش دمج بالغلط)')
    const noNameSheet = await xlsxBase64([header, ['', 'ONLY-BC', '', '', 1, 2, '', '', '', 1, 1, '', '']])
    const imp4 = await result('catalog:importProducts', [noNameSheet])
    assert(imp4.ok && imp4.rowErrors.length === 1 && imp4.rowErrors[0].message.includes('اسم'), 'الاسم لسه إجباري (باركود من غير اسم = خطأ صف)')
    const noBarcodeColumn = await xlsxBase64([['الاسم', 'سعر البيع (قطاعي)'], ['من غير عمود باركود', 12]])
    const imp5 = await result('catalog:importProducts', [noBarcodeColumn])
    assert(imp5.ok && imp5.created === 1, 'قالب من غير عمود الباركود أصلًا اتقبل')
    const noNameColumn = await xlsxBase64([['الباركود'], ['X1']])
    assert((await result('catalog:importProducts', [noNameColumn])).ok === false, 'ملف من غير عمود الاسم اتمنع برسالة')

    console.log('\n7) نسخة retail: كل حاجة بتخص المطاعم ممنوعة ومخفية...')
    assert((await call('settings:getRestaurant')).body.ok === true, 'النسخة الكاملة: settings:getRestaurant شغالة')
    assert((await result('ledger:listAccountRoles')).roles.some((r: any) => r.role === 'tips'), 'النسخة الكاملة: أدوار المطاعم ظاهرة في ربط الحسابات')
    process.env.QCP_EDITION = 'retail'
    try {
      const blockedChannels: [string, unknown[]][] = [
        ['settings:getRestaurant', []],
        ['settings:updateRestaurant', [{}]],
        ['settings:listDeliveryDrivers', []],
        ['settings:upsertDeliveryDriver', [{ name: 'x', phone: '', active: true }]],
        ['settings:deleteDeliveryDriver', [1]],
        ['settings:listCaptains', []],
        ['settings:upsertCaptain', [{ name: 'x', phone: '', active: true }]],
        ['settings:deleteCaptain', [1]],
        ['print:kitchenTicket', [{}, null, []]],
        ['print:eventBooking', [1]],
        ['restaurant:listTables', []],
        ['recipes:get', [1]],
        ['delivery:listZones', []],
        ['reservations:list', []],
        ['events:listBookings', []]
      ]
      for (const [ch, args] of blockedChannels) {
        const r = await call(ch, args)
        assert(r.status === 403 && String(r.body.error).includes('مش متاحة'), `retail: ${ch} ممنوعة (403)`)
      }
      for (const type of ['restaurant_sales_by_order_type', 'restaurant_recipe_consumption', 'restaurant_table_activity', 'sales_by_captain']) {
        const r = await call('reports:run', [type, {}])
        assert(r.body.ok === false && String(r.body.error).includes('مش متاحة'), `retail: تقرير ${type} ممنوع`)
      }
      const lic = await fetch(`${BASE}/api/rpc/license:getStatus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"args":[]}' }).then((r) => r.json())
      const off: string[] = lic.result.disabledFeatures
      for (const k of ['restaurant', 'restaurantTables', 'restaurantCaptains', 'delivery', 'events', 'settings:restaurant', 'feature:tips', 'report:sales_by_captain', 'report:restaurant_table_activity']) {
        assert(off.includes(k), `retail: ${k} موقوفة في حالة الترخيص`)
      }
      assert((await call('catalog:listProducts', ['', wh])).body.ok === true, 'retail: البيع والمخزون شغالين عادي')
      assert(!(await result('ledger:listAccountRoles')).roles.some((r: any) => ['tips', 'event_deposits', 'delivery_revenue', 'service_revenue', 'event_revenue'].includes(r.role)), 'retail: أدوار المطاعم مخفية من ربط الحسابات')
    } finally {
      delete process.env.QCP_EDITION
    }
  } finally {
    server.close()
  }

  console.log(`\n=== النتيجة (شجرة الحسابات + الاستيراد): ${passed} نجح، ${failed} فشل ===`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
