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
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { FIXED_ASSET_ROLE_BACKFILL_SQL } from '../src/main/db/migrations/074_fixed_assets'
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
const rowOf = (rep: any, item: string): number => Number(rep.rows.find((r: any) => String(r.item).trim() === item && r.amount !== '')?.amount ?? NaN)

async function figures(): Promise<{ profit: number; assets: number; liabilities: number; equity: number; trialD: number; trialC: number; journalD: number; journalC: number }> {
  const inc = await report('income_statement')
  const bs = await report('balance_sheet')
  const tb = await report('trial_balance')
  const jr = await report('journal')
  return {
    profit: rowOf(inc, 'صافي الربح'),
    assets: rowOf(bs, 'إجمالي الأصول'),
    liabilities: rowOf(bs, 'الخصوم المتداولة'),
    equity: rowOf(bs, 'حقوق الملكية'),
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
    const assetCat = (await result('expenses:listCategories')).find((c: any) => c.isFixedAsset)
    assert(assetCat?.name === 'شراء أصول ثابتة', 'تصنيف "شراء أصول ثابتة" جاهز في قايمة تصنيفات المصروفات (isFixedAsset)')
    assert((await result('expenses:listCategories')).filter((c: any) => !c.isFixedAsset).length === 1, 'التصنيفات العادية مش متعلّمة أصل ثابت')
    const assetExp = (await call('expenses:create', [{ categoryId: assetCat.id, amount: 30, method: 'cash', note: 'تلاجة' }, adminId])).body.result
    assert(assetExp?.ok && assetExp.expense.isFixedAsset === true, 'شراء أصل ثابت (30) اتسجل من شاشة المصروفات')

    const oldAccounts = await result('ledger:listAccounts')
    assert(oldAccounts.length > 18 && oldAccounts.some((a: any) => a.code === '4100') && oldAccounts.some((a: any) => a.code === `${6000 + cat.id}`), 'الشجرة القديمة: حسابات النظام + حساب لكل تصنيف مصروف')
    assert(oldAccounts.some((a: any) => a.code === '1500' && a.type === 'asset'), 'الشجرة القديمة: حساب نظام للأصول الثابتة (1500)')
    assert(!oldAccounts.some((a: any) => a.code === `${6000 + assetCat.id}`), 'الشجرة القديمة: تصنيف "شراء أصل" مالوش حساب مصروف')
    const legacyTb = await report('trial_balance')
    assert(near(Number(legacyTb.rows.find((r: any) => String(r.code) === '1500')?.cd ?? NaN), 30), 'الشجرة القديمة: شراء الأصل (30) اتسجل مدين على 1500')
    const legacyInc = await report('income_statement')
    assert(near(rowOf(legacyInc, 'المصروفات'), 90), `الشجرة القديمة: شراء الأصل مش داخل في المصروفات (${rowOf(legacyInc, 'المصروفات')} = 70 + 20)`)
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
    await getDb().execute(FIXED_ASSET_ROLE_BACKFILL_SQL)
    assert((await result('ledger:listAccountRoles')).custom === false, 'الوضع القديم: ترحيل ربط الأصول الثابتة مبيعملش حاجة لما الشجرة مش مبسّطة')
    const plRep = await result('reports:run', ['profit_loss', {}])
    assert(near(plRep.rows.reduce((s: number, r: any) => s + Number(r.expenses), 0), 90), `تقرير الأرباح والخسائر: شراء الأصل مش محسوب كمصروف (${plRep.rows.reduce((s: number, r: any) => s + Number(r.expenses), 0)})`)
    const catRep = await result('accounting:run', ['expenses_by_category', {}])
    assert(!catRep.rows.some((r: any) => String(r.category).includes('أصول')), 'المصروفات حسب التصنيف: مفيهاش شراء الأصول')

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
    assert(near(rowOf(bs2, 'النقدية والبنوك'), Number(row('5120').cd)), 'الميزانية: النقدية والبنوك = رصيد الحساب المربوط بالخزائن (5120)')
    // حركة جديدة بعد الربط تتسجل على الحساب الجديد
    const sale3 = (await call('pos:checkout', [{ customerId: null, warehouseId: wh, lines: [line(1)], discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: 100, redeemPoints: 0 }, adminId])).body.result
    assert(sale3?.ok, 'بيع جديد بعد الربط')
    const tb3 = await report('trial_balance')
    assert(Number(tb3.rows.find((r: any) => String(r.code) === '5120').cd) > Number(row('5120').cd), 'البيع الجديد دخل على حساب الخزائن المربوط (5120)')

    console.log('\n5ب) الأصول الثابتة: ربط بحركات النظام + تقسيم الميزانية...')
    const cdOf = (rep: any, code: string): number => Number(rep.rows.find((r: any) => String(r.code) === code)?.cd ?? 0)
    const fixedRole = (await result('ledger:listAccountRoles')).roles.find((r: any) => r.role === 'fixed_assets')
    assert(fixedRole?.accountCode === '4000' && fixedRole.type === 'asset', 'ربط الأصول الثابتة الافتراضي = 4000 (ظاهر في ربط حسابات النظام)')
    assert((await result('ledger:listAccounts')).find((a: any) => a.code === '4000')?.roles.includes('fixed_assets'), '4000 عليه ربط بحركات النظام (🔗) زي باقي الحسابات الأساسية')
    assert(await fails('ledger:deleteAccount', ['4000'], 'مربوط'), '4000 بقى مربوط فمينفعش يتحذف')
    assert(await fails('ledger:setAccountRoles', [{ fixed_assets: '1000' }], 'نوع'), 'ربط الأصول الثابتة بحساب إيرادات اتمنع (نوع غلط)')
    assert(near(cdOf(await report('trial_balance'), '4000'), 30), 'شراء الأصل القديم (30) انتقل مدين على 4000 بعد التحويل')
    const bsA = await report('balance_sheet')
    assert(['الأصول الثابتة', 'مجمع الإهلاك', 'صافي الأصول الثابتة', 'النقدية والبنوك', 'العملاء (المدينون)', 'ضريبة القيمة المضافة', 'المخزون', 'الأصول المتداولة'].every((t) => bsA.rows.some((r: any) => String(r.item).trim() === t)), 'الميزانية: كل بنود الأصول بترتيب العميل (الأصول الثابتة، مجمع الإهلاك، صافي الثابتة، النقدية والبنوك، العملاء، الضريبة، المخزون، المتداولة)')
    assert(
      near(rowOf(bsA, 'صافي الأصول الثابتة'), 30) && near(rowOf(bsA, 'صافي الأصول الثابتة') + rowOf(bsA, 'الأصول المتداولة'), rowOf(bsA, 'إجمالي الأصول')),
      `الميزانية: الأصول الثابتة 30 + المتداولة ${rowOf(bsA, 'الأصول المتداولة')} = إجمالي الأصول ${rowOf(bsA, 'إجمالي الأصول')}`
    )
    const car = (await call('expenses:createCategory', ['سيارة توصيل', true])).body.result
    assert(car?.isFixedAsset === true, 'إنشاء تصنيف جديد متعلّم "أصل ثابت" من الشاشة')
    const preBuy = await figures()
    const tbPre = await report('trial_balance')
    const buy = (await call('expenses:create', [{ categoryId: car.id, amount: 20, method: 'cash', note: 'عربية' }, adminId])).body.result
    assert(buy?.ok, 'شراء أصل جديد (20) اتسجل')
    const postBuy = await figures()
    const tbPost = await report('trial_balance')
    assert(near(cdOf(tbPost, '4000'), cdOf(tbPre, '4000') + 20), 'الشراء دخل مدين على حساب الأصول الثابتة 4000')
    assert(near(cdOf(tbPost, '5120'), cdOf(tbPre, '5120') - 20), 'والخزينة اتخصم منها نفس المبلغ')
    assert(near(postBuy.profit, preBuy.profit) && near(postBuy.assets, preBuy.assets) && near(postBuy.liabilities, preBuy.liabilities) && near(postBuy.equity, preBuy.equity), 'شراء الأصل ما غيّرش صافي الربح ولا إجمالي الأصول')
    assert(near(postBuy.trialD, postBuy.trialC) && near(postBuy.journalD, postBuy.journalC), 'ميزان المراجعة ودفتر اليومية متوازنين بعد شراء الأصل')
    const plAfter = await result('reports:run', ['profit_loss', {}])
    assert(near(plAfter.rows.reduce((s: number, r: any) => s + Number(r.expenses), 0), 90), 'الأرباح والخسائر: لسه المصروفات 90 بس بعد شراء الأصل')
    const treasuryNow = (await result('treasury:list')).find((t: any) => t.methods?.includes?.('cash')) ?? (await result('treasury:list'))[0]
    const pv = await call('treasury:createVoucher', [{ type: 'payment', treasuryId: treasuryNow.id, amount: 4, partyType: 'other', partyName: 'جهاز كاشير', categoryId: assetCat.id, note: '' }, adminId])
    assert(pv.body.ok, 'سند صرف بتصنيف "شراء أصول ثابتة" اتسجل')
    assert(near(cdOf(await report('trial_balance'), '4000'), cdOf(tbPost, '4000') + 4), 'سند الصرف دخل مدين على 4000 كمان')
    // حساب فرعي للأصول الثابتة (4100) بيظهر تحت "الأصول الثابتة" في الميزانية، والخزينة 5120 تفضل متداولة
    assert((await call('ledger:createAccount', [{ code: '4100', name: 'سيارات', type: 'asset' }])).body.ok, 'إضافة حساب فرعي 4100 للأصول الثابتة')
    assert((await call('ledger:createEntry', [{ date: '2026-10-30', description: 'سيارة بالأجل', lines: [{ code: '4100', debit: 50, credit: 0 }, { code: '7000', debit: 0, credit: 50 }] }, adminId])).body.ok, 'قيد يدوي 50 على 4100')
    const bsB = await report('balance_sheet')
    assert(near(rowOf(bsB, 'صافي الأصول الثابتة'), 30 + 20 + 4 + 50), `الميزانية: الأصول الثابتة (4000 + 4100) = ${rowOf(bsB, 'صافي الأصول الثابتة')}`)
    assert(near(rowOf(bsB, 'سيارات'), 50), 'الحساب الفرعي 4100 ظاهر في الميزانية')
    assert(near(rowOf(bsB, 'الأصول المتداولة'), rowOf(bsB, 'إجمالي الأصول') - rowOf(bsB, 'صافي الأصول الثابتة')) && rowOf(bsB, 'النقدية والبنوك') > 0, 'الخزينة (5120) فضلت في الأصول المتداولة')
    // إعادة ربط الدور بحساب فرعي: الشراء الجديد يروح عليه
    assert((await call('ledger:setAccountRoles', [{ fixed_assets: '4100' }])).body.ok, 'ربط الأصول الثابتة بـ4100')
    const tbMap = await report('trial_balance')
    await call('expenses:create', [{ categoryId: car.id, amount: 10, method: 'cash', note: 'ملحقات' }, adminId])
    assert(near(cdOf(await report('trial_balance'), '4100'), cdOf(tbMap, '4100') + 10), 'بعد إعادة الربط: شراء الأصل الجديد بيروح على 4100')
    assert((await call('ledger:setAccountRoles', [{ fixed_assets: '4000' }])).body.ok, 'رجّعت الربط على 4000')
    // ترحيل 074 على قاعدة فيها شجرة مبسّطة بدون الدور: بيضيف الربط 4000 (ومبيغيّرش ربط موجود)
    await getDb().execute("DELETE FROM account_roles WHERE role = 'fixed_assets'")
    await getDb().execute(FIXED_ASSET_ROLE_BACKFILL_SQL)
    assert((await result('ledger:listAccountRoles')).roles.find((r: any) => r.role === 'fixed_assets')?.accountCode === '4000', 'ترحيل 074: ربط fixed_assets → 4000 اتضاف لقاعدة محوّلة قبل كده')
    assert(Number((await getDb().execute("SELECT COUNT(*) AS c FROM account_roles WHERE role = 'fixed_assets'")).rows[0].c) === 1, 'والترحيل مبيكررش الربط')

    console.log('\n5ج) بنود الميزانية وقائمة الدخل (رقم الحساب + البند لكل حساب)...')
    const codeOf = (rep: any, item: string): string => String(rep.rows.find((r: any) => String(r.item).trim() === item && r.amount !== '')?.code ?? 'N/A')
    const stLines = await result('ledger:listStatementLines')
    assert(['fixed_assets', 'accumulated_depreciation', 'cash_bank', 'suppliers', 'accrued_expenses', 'advances', 'capital', 'partners_current', 'retained_earnings', 'selling_expenses', 'admin_expenses', 'income_tax'].every((k) => stLines.some((l: any) => l.key === k)), 'قايمة بنود القوائم فيها كل بنود العميل')
    assert(await fails('ledger:createAccount', [{ code: '4901', name: 'نوع غلط', type: 'asset', statementLine: 'selling_expenses' }], 'مش مناسب'), 'بند مصروفات على حساب أصول اتمنع')
    assert(await fails('ledger:createAccount', [{ code: '4901', name: 'بند مجهول', type: 'asset', statementLine: 'zzz' }], 'مش مناسب'), 'بند مجهول اتمنع')
    const mk = async (code: string, name: string, type: string, statementLine: string): Promise<boolean> => (await call('ledger:createAccount', [{ code, name, type, statementLine }])).body.ok === true
    assert(
      (await mk('4900', 'مجمع إهلاك السيارات', 'asset', 'accumulated_depreciation')) &&
        (await mk('6100', 'مصروفات مستحقة', 'liability', 'accrued_expenses')) &&
        (await mk('6200', 'مقدمات عملاء', 'liability', 'advances')) &&
        (await mk('7100', 'جاري الشركاء', 'equity', 'partners_current')) &&
        (await mk('7200', 'أرباح محتجزة', 'equity', 'retained_earnings')) &&
        (await mk('3100', 'مصروفات بيع وتسويق', 'expense', 'selling_expenses')) &&
        (await mk('3200', 'ضرائب الدخل', 'expense', 'income_tax')) &&
        (await mk('1100', 'إيرادات خدمات', 'revenue', 'service_revenue')),
      'إضافة 8 حسابات كل واحد ببنده (مجمع إهلاك، مستحقة، مقدمات، جاري شركاء، محتجزة، بيع وتسويق، ضرائب، خدمات)'
    )
    assert((await result('ledger:listAccounts')).find((a: any) => a.code === '4900')?.statementLine === 'accumulated_depreciation', 'البند ظاهر في قايمة الحسابات')
    assert((await result('ledger:listAccounts')).find((a: any) => a.code === '5000')?.statementLine === null, 'الحسابات الأساسية بنودها تلقائية (null)')
    const stBefore = await figures()
    const jv = async (desc: string, a: [string, number, number], b: [string, number, number]): Promise<boolean> =>
      (await call('ledger:createEntry', [{ date: '2026-10-30', description: desc, lines: [{ code: a[0], debit: a[1], credit: a[2] }, { code: b[0], debit: b[1], credit: b[2] }] }, adminId])).body.ok === true
    assert(
      (await jv('إهلاك', ['3000', 40, 0], ['4900', 0, 40])) &&
        (await jv('مستحق', ['3000', 25, 0], ['6100', 0, 25])) &&
        (await jv('مقدم من عميل', ['5120', 15, 0], ['6200', 0, 15])) &&
        (await jv('جاري شريك', ['5120', 60, 0], ['7100', 0, 60])) &&
        (await jv('أرباح مرحّلة', ['5120', 10, 0], ['7200', 0, 10])) &&
        (await jv('دعاية', ['3100', 12, 0], ['5120', 0, 12])) &&
        (await jv('ضريبة دخل', ['3200', 8, 0], ['5120', 0, 8])) &&
        (await jv('إيراد خدمة', ['5120', 33, 0], ['1100', 0, 33])),
      '8 قيود يدوية على الحسابات الجديدة'
    )
    const bsC = await report('balance_sheet')
    const incC = await report('income_statement')
    assert(near(rowOf(bsC, 'مجمع الإهلاك'), -40) && codeOf(bsC, 'مجمع الإهلاك') === '4900', `الميزانية: مجمع الإهلاك -40 ورقمه 4900 (${rowOf(bsC, 'مجمع الإهلاك')} / ${codeOf(bsC, 'مجمع الإهلاك')})`)
    assert(near(rowOf(bsC, 'صافي الأصول الثابتة'), rowOf(bsC, 'الأصول الثابتة') + rowOf(bsC, 'مجمع الإهلاك')), 'الميزانية: صافي الأصول الثابتة = الأصول الثابتة + (مجمع الإهلاك بالسالب)')
    assert(near(rowOf(bsC, 'مصروفات مستحقة'), 25) && codeOf(bsC, 'مصروفات مستحقة') === '6100', 'الميزانية: مصروفات مستحقة 25 (6100)')
    assert(near(rowOf(bsC, 'مقدمات'), 15) && codeOf(bsC, 'مقدمات') === '6200', 'الميزانية: مقدمات 15 (6200)')
    assert(near(rowOf(bsC, 'جاري الشركاء'), 60) && codeOf(bsC, 'جاري الشركاء') === '7100', 'الميزانية: جاري الشركاء 60 (7100)')
    assert(near(rowOf(bsC, 'أرباح محتجزة'), 10) && codeOf(bsC, 'أرباح محتجزة') === '7200', 'الميزانية: أرباح محتجزة 10 (7200)')
    assert(codeOf(bsC, 'النقدية والبنوك') === '5120' && codeOf(bsC, 'الأصول الثابتة') !== 'N/A', `الميزانية: رقم الحساب جنب البند (النقدية والبنوك = ${codeOf(bsC, 'النقدية والبنوك')})`)
    assert(near(rowOf(bsC, 'إجمالي الأصول'), rowOf(bsC, 'إجمالي الخصوم وحقوق الملكية')), `الميزانية متوازنة: الأصول ${rowOf(bsC, 'إجمالي الأصول')} = الخصوم + حقوق الملكية ${rowOf(bsC, 'إجمالي الخصوم وحقوق الملكية')}`)
    assert(near(rowOf(bsC, 'حقوق الملكية'), rowOf(bsC, 'رأس المال') + rowOf(bsC, 'جاري الشركاء') + rowOf(bsC, 'أرباح وخسائر الفترة') + rowOf(bsC, 'أرباح محتجزة')), 'حقوق الملكية = رأس المال + جاري الشركاء + أرباح الفترة + المحتجزة')
    assert(near(rowOf(bsC, 'أرباح وخسائر الفترة'), rowOf(incC, 'صافي الربح')), 'أرباح الفترة في الميزانية = صافي الربح في قائمة الدخل')
    const stAfter = await figures()
    assert(near(stAfter.profit, stBefore.profit - 40 - 25 - 12 - 8 + 33), `صافي الربح اتغيّر بالظبط بقيود المصروفات والإيراد (${stBefore.profit} → ${stAfter.profit})`)
    assert(near(rowOf(incC, 'مصروفات بيع وتسويق'), 12) && codeOf(incC, 'مصروفات بيع وتسويق') === '3100', 'قائمة الدخل: مصروفات بيع وتسويق 12 (3100)')
    assert(near(rowOf(incC, 'ضرائب الدخل'), 8) && codeOf(incC, 'ضرائب الدخل') === '3200', 'قائمة الدخل: ضرائب الدخل 8 (3200)')
    assert(near(rowOf(incC, 'إيرادات الخدمات'), 33) && codeOf(incC, 'إيرادات الخدمات') === '1100', 'قائمة الدخل: إيرادات الخدمات 33 (1100)')
    const optRow = (rep: any, item: string): number => (Number.isFinite(rowOf(rep, item)) ? rowOf(rep, item) : 0)
    assert(near(rowOf(incC, 'المبيعات') + rowOf(incC, 'مردودات المبيعات') + optRow(incC, 'خصومات المبيعات'), rowOf(incC, 'صافي المبيعات')) && rowOf(incC, 'المبيعات') > 0 && codeOf(incC, 'المبيعات') === '1000', `قائمة الدخل: المبيعات + المردودات والخصومات (بالسالب) = صافي المبيعات (${rowOf(incC, 'المبيعات')} / ${rowOf(incC, 'مردودات المبيعات')} / ${optRow(incC, 'خصومات المبيعات')} / ${rowOf(incC, 'صافي المبيعات')})`)
    assert(near(rowOf(incC, 'الإيرادات'), rowOf(incC, 'صافي المبيعات') + rowOf(incC, 'إيرادات الخدمات') + rowOf(incC, 'إيرادات الذمم') + rowOf(incC, 'إيرادات أخرى')), 'قائمة الدخل: الإيرادات = صافي المبيعات + الخدمات + الذمم + أخرى')
    assert(near(rowOf(incC, 'مجمل الربح'), rowOf(incC, 'الإيرادات') - rowOf(incC, 'تكلفة المبيعات')), 'قائمة الدخل: مجمل الربح = الإيرادات − تكلفة المبيعات')
    assert(near(rowOf(incC, 'المصروفات'), rowOf(incC, 'مصروفات بيع وتسويق') + rowOf(incC, 'مصروفات إدارية وعمومية')), 'قائمة الدخل: المصروفات = بيع وتسويق + إدارية وعمومية')
    assert(near(rowOf(incC, 'صافي الربح (الخسارة) قبل الضرائب'), rowOf(incC, 'مجمل الربح') - rowOf(incC, 'المصروفات')) && near(rowOf(incC, 'صافي الربح'), rowOf(incC, 'صافي الربح (الخسارة) قبل الضرائب') - 8), 'قائمة الدخل: صافي الربح قبل الضرائب ثم بعد ضرائب الدخل')
    assert(incC.rows.every((r: any) => ['item', 'code', 'amount'].every((k) => k in r)), 'كل صفوف القائمة فيها البند والرقم والمبلغ')
    // بداية الفترة: الأرباح اللي قبلها بتروح للأرباح المحتجزة والإجمالي ما يتغيّرش
    const bsFrom = await report('balance_sheet', { from: '2100-01-01' })
    assert(near(rowOf(bsFrom, 'أرباح وخسائر الفترة'), 0) && near(rowOf(bsFrom, 'أرباح محتجزة'), 10 + stAfter.profit), `ميزانية ببداية فترة: أرباح الفترة صفر والمحتجزة = 10 + الأرباح السابقة (${rowOf(bsFrom, 'أرباح محتجزة')})`)
    assert(near(rowOf(bsFrom, 'حقوق الملكية'), rowOf(bsC, 'حقوق الملكية')) && near(rowOf(bsFrom, 'إجمالي الأصول'), rowOf(bsFrom, 'إجمالي الخصوم وحقوق الملكية')), 'بداية الفترة مبتغيّرش إجمالي حقوق الملكية والميزانية فاضلة متوازنة')
    // تعديل بند الحساب: من غير بند مبعوت بيفضل، وفاضي = تلقائي
    assert((await call('ledger:updateAccount', ['3100', { name: 'مصروفات بيع وتسويق', type: 'expense' }])).body.ok && (await result('ledger:listAccounts')).find((a: any) => a.code === '3100')?.statementLine === 'selling_expenses', 'تعديل الاسم من غير بند بيسيب البند زي ما هو')
    assert((await call('ledger:updateAccount', ['3200', { name: 'ضرائب الدخل', type: 'expense', statementLine: '' }])).body.ok && (await result('ledger:listAccounts')).find((a: any) => a.code === '3200')?.statementLine === null, 'بند فاضي = تلقائي')
    const incNoTax = await report('income_statement')
    const taxLine = incNoTax.rows.find((r: any) => String(r.item) === 'ضرائب الدخل' && !r._detail)
    const adminLine = incNoTax.rows.find((r: any) => String(r.item) === 'مصروفات إدارية وعمومية')
    assert(near(Number(taxLine?.amount), 0) && incNoTax.rows.some((r: any) => r._detail && r.code === '3200' && near(Number(r.amount), 8)) && Number(adminLine?.amount) >= 8, 'من غير بند ضرائب الدخل: بند الضرائب صفر والحساب 3200 (8) راح تحت "مصروفات إدارية وعمومية" تلقائيًا')
    assert((await call('ledger:updateAccount', ['3200', { name: 'ضرائب الدخل', type: 'expense', statementLine: 'income_tax' }])).body.ok, 'رجّعت بند ضرائب الدخل')
    assert(await fails('ledger:updateAccount', ['3200', { name: 'ضرائب الدخل', type: 'asset', statementLine: 'income_tax' }], 'مش مناسب'), 'تغيير النوع مع بند مش مناسب اتمنع')

    console.log('\n5د) ربط تصنيف مصروف بحساب بعينه (بيع وتسويق)...')
    const mkt = (await call('expenses:createCategory', ['دعاية وإعلان'])).body.result
    const rolesNow = await result('ledger:listAccountRoles')
    assert(rolesNow.expenseCategories.some((c: any) => c.id === mkt.id && c.accountCode === '') && !rolesNow.expenseCategories.some((c: any) => c.name === 'شراء أصول ثابتة'), 'تصنيفات المصروفات في شاشة الربط (من غير "شراء أصول") وكلها على الحساب العام')
    assert(await fails('ledger:setAccountRoles', [{ [`expense:${mkt.id}`]: '5120' }], 'expense'), 'ربط تصنيف مصروف بحساب أصول اتمنع')
    assert(await fails('ledger:setAccountRoles', [{ [`expense:${assetCat.id}`]: '3100' }], 'أصل'), 'ربط تصنيف "شراء أصل" بحساب مصروفات اتمنع')
    assert(await fails('ledger:setAccountRoles', [{ 'expense:99999': '3100' }], 'مش موجود'), 'تصنيف مش موجود اتمنع')
    assert((await call('ledger:setAccountRoles', [{ [`expense:${mkt.id}`]: '3100' }])).body.ok, 'ربط تصنيف دعاية وإعلان بحساب 3100')
    assert((await result('ledger:listAccountRoles')).expenseCategories.find((c: any) => c.id === mkt.id)?.accountCode === '3100', 'الربط ظاهر في قايمة التصنيفات')
    assert(await fails('ledger:deleteAccount', ['3100'], 'مربوط'), '3100 مربوط بتصنيف فمينفعش يتحذف')
    const sellBefore = rowOf(await report('income_statement'), 'مصروفات بيع وتسويق')
    assert((await call('expenses:create', [{ categoryId: mkt.id, amount: 7, method: 'cash', note: 'إعلان' }, adminId])).body.result?.ok, 'مصروف بتصنيف دعاية وإعلان (7)')
    const incD = await report('income_statement')
    assert(near(rowOf(incD, 'مصروفات بيع وتسويق'), sellBefore + 7) && incD.rows.some((r: any) => String(r.item).trim() === 'مصروفات بيع وتسويق' && r.code === '3100'), 'المصروف الجديد دخل على "مصروفات بيع وتسويق" (3100)')
    assert(near((await figures()).profit, stAfter.profit - 7), 'صافي الربح نقص 7')
    assert((await call('ledger:setAccountRoles', [{ [`expense:${mkt.id}`]: '' }])).body.ok && (await result('ledger:listAccountRoles')).expenseCategories.find((c: any) => c.id === mkt.id)?.accountCode === '', 'فك ربط التصنيف بيرجّعه للحساب العام')

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
