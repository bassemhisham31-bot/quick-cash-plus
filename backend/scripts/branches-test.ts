/**
 * اختبار ميزة الفروع (QCP_BRANCHES=on) على قاعدة مؤقتة وسيرفر حقيقي: عزل البيانات بين الفروع، يوم/خزنة لكل فرع،
 * وكاشف تسريب للتقارير (كل تقرير بنطاق فرع لازم مايظهرش فيه شغل فرع تاني، ومجموع الفروع = "كل الفروع").
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { initDatabaseAtPath } from '../src/main/db'
import { startHttpServer } from '../src/http/server'

const PORT = 4998
const BASE = `http://127.0.0.1:${PORT}`
const DB_PATH = join(process.cwd(), 'data', 'branches-test.sqlite')

process.env.QCP_BRANCHES = 'on'
process.env.QCP_INTERNAL_SECRET = 'test-internal-secret'
process.env.QCP_HEALTH_MAX_DISK_PCT = '100'

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

interface Reply {
  status: number
  body: any
}
async function call(token: string, channel: string, args: unknown[] = [], branch?: string): Promise<Reply> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  if (branch) headers['x-qcp-branch'] = branch
  const res = await fetch(`${BASE}/api/rpc/${channel}`, { method: 'POST', headers, body: JSON.stringify({ args }) })
  return { status: res.status, body: await res.json() }
}
const result = async (token: string, channel: string, args: unknown[] = [], branch?: string): Promise<any> => (await call(token, channel, args, branch)).body.result
async function login(username: string, password: string): Promise<{ token: string; user: any; ok: boolean; error?: string }> {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then((x) => x.json())
  return { token: r.token, user: r.user, ok: r.ok === true, error: r.error }
}

const PERMS = ['pos.sell', 'expenses.manage', 'invoices.manage', 'reports.view', 'treasury.manage', 'inventory.manage', 'shifts.view', 'dashboard.view']
const product = (name: string, barcode: string, warehouseId: number) => ({
  name, barcode, categoryId: null, unitId: null, vendorId: null, costPrice: 40, retailPrice: 100, wholesalePrice: 90, wholesale2Price: 80,
  packPrice: 0, openingQuantity: 10, reorderPoint: 1, warehouseId, expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null
})
const line = (productId: number, name: string, qty: number) => ({ productId, name, barcode: '', unitPrice: 100, qty, discount: 0 })
const checkout = (warehouseId: number, productId: number, name: string, qty: number) => [
  { customerId: null, warehouseId, lines: [line(productId, name, qty)], discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: qty * 100, redeemPoints: 0 }
]

async function main(): Promise<void> {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  await initDatabaseAtPath(DB_PATH)
  const server = startHttpServer(PORT)
  await new Promise((r) => setTimeout(r, 300))

  try {
    console.log('1) تفعيل الفروع وإنشاء فرع تاني...')
    const admin = await login('admin', 'admin123')
    const adminTok = admin.token
    const pub = await fetch(`${BASE}/api/rpc/license:getStatus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"args":[]}' }).then((r) => r.json())
    assert(pub.result?.branchesEnabled === true, 'حالة الترخيص العامة فيها branchesEnabled')
    assert(admin.user.branchId === 1 && admin.user.branchName === 'الفرع الرئيسي', 'الأدمن تابع للفرع الرئيسي')
    const created = await call(adminTok, 'branches:create', [{ name: 'فرع المعادي', code: 'MAADI', address: 'المعادي', phone: '0100' }])
    assert(created.body.ok === true && created.body.result.id > 1, 'branches:create عمل فرع جديد')
    const id2 = created.body.result.id as number
    const dup = await call(adminTok, 'branches:create', [{ name: 'فرع المعادي' }])
    assert(dup.body.ok === false, 'اسم فرع مكرر اتمنع')
    const branchesAll = await result(adminTok, 'branches:list')
    assert(branchesAll.length === 2, 'الأدمن بيشوف الفرعين')

    const allWh = await result(adminTok, 'catalog:listAllWarehouses')
    const wh1 = allWh.find((w: any) => w.branchId === 1)
    const wh2 = allWh.find((w: any) => w.branchId === id2)
    assert(!!wh1 && !!wh2 && wh2.isDefault, 'الفرع الجديد اتعمله مخزن افتراضي')
    const t1 = await result(adminTok, 'treasury:list', [], '1')
    const t2 = await result(adminTok, 'treasury:list', [], String(id2))
    assert(t1.length === 3 && t1.every((t: any) => t.branchId === 1), 'خزائن الفرع 1 (3) بس')
    assert(t2.length === 3 && t2.every((t: any) => t.branchId === id2), 'الفرع الجديد اتعمله 3 خزائن خاصة بيه')
    assert((await result(adminTok, 'catalog:listWarehouses', [], '1')).length === 1, 'مخازن الفرع 1 بس لما الأدمن يختار فرع 1')
    assert((await result(adminTok, 'catalog:listWarehouses', [], 'all')).length === 2, 'كل المخازن لما "كل الفروع"')

    console.log('\n2) مستخدمين لكل فرع + عزل الدخول...')
    const mk = async (username: string, branchId: number) => (await call(adminTok, 'users:create', [{ username, password: '1234', fullName: username, role: 'cashier', permissions: PERMS, branchId }])).body.result
    const uA = await mk('cashier_a', 1)
    const uB = await mk('cashier_b', id2)
    assert(uA.branchId === 1 && uB.branchId === id2, 'المستخدمين اتسجلوا على فروعهم')
    const A = await login('cashier_a', '1234')
    const B = await login('cashier_b', '1234')
    assert(A.user.branchId === 1 && B.user.branchId === id2 && B.user.branchName === 'فرع المعادي', 'الدخول بيرجّع فرع المستخدم')
    assert((await result(A.token, 'branches:list')).length === 1, 'الكاشير بيشوف فرعه بس')
    assert((await call(A.token, 'branches:create', [{ name: 'تسلل' }])).body.ok === false, 'الكاشير مايقدرش يعمل فرع')

    console.log('\n3) يوم/وردية مستقل لكل فرع...')
    const dayB = await call(B.token, 'cash:openDay', [B.user.id, 100])
    assert(dayB.body.ok && dayB.body.result.branchId === id2, 'فرع 2 فتح يومه')
    assert((await result(A.token, 'cash:getOpenSession')) === null, 'يوم فرع 2 مش ظاهر لفرع 1')
    const dayA = await call(A.token, 'cash:openDay', [A.user.id, 50])
    assert(dayA.body.ok && dayA.body.result.branchId === 1 && dayA.body.result.id !== dayB.body.result.id, 'فرع 1 فتح يوم تاني مستقل')
    assert((await result(adminTok, 'cash:getOpenSession', [], 'all')) === null, 'الأدمن على "كل الفروع" مالوش يوم')
    const allDay = await call(adminTok, 'cash:openDay', [admin.user.id, 0], 'all')
    assert(allDay.body.ok === false && String(allDay.body.error).includes('فرع'), 'مينفعش يفتح يوم على "كل الفروع"')

    console.log('\n4) أصناف مشتركة ومخزون لكل فرع...')
    const pA = (await call(adminTok, 'catalog:createProduct', [product('منتج-أ-فقط', 'BR-A', wh1.id)], '1')).body.result
    const pB = (await call(adminTok, 'catalog:createProduct', [product('منتج-ب-فقط', 'BR-B', wh1.id)], '1')).body.result
    for (const p of [pA, pB]) await call(adminTok, 'catalog:adjustStock', [p.id, wh2.id, 'set', 10, admin.user.id], String(id2))
    const stockA = await result(A.token, 'catalog:stockByWarehouse', [[pA.id, pB.id]])
    assert(stockA.every((s: any) => s.warehouseId === wh1.id), 'الكاشير أ بيشوف مخزون فرعه بس')
    assert((await result(adminTok, 'catalog:stockByWarehouse', [[pA.id]], 'all')).length === 2, 'الأدمن بيشوف مخزون الفرعين')
    assert((await call(A.token, 'catalog:listProducts', ['', wh2.id])).body.ok === false, 'الكاشير أ مايقدرش يعرض مخزن فرع 2')

    console.log('\n5) بيع في كل فرع + عزل الفواتير...')
    const saleA = (await call(A.token, 'pos:checkout', [...checkout(wh1.id, pA.id, 'منتج-أ-فقط', 1), A.user.id])).body.result
    const saleB = (await call(B.token, 'pos:checkout', [...checkout(wh2.id, pB.id, 'منتج-ب-فقط', 2), B.user.id])).body.result
    assert(saleA?.ok && saleB?.ok, 'بيع الفرعين نجح')
    const cross = (await call(A.token, 'pos:checkout', [...checkout(wh2.id, pA.id, 'منتج-أ-فقط', 1), A.user.id])).body.result
    assert(cross?.ok === false && String(cross.error).includes('فرع'), 'البيع من مخزن فرع تاني اتمنع')
    const allCheckout = (await call(adminTok, 'pos:checkout', [...checkout(wh1.id, pA.id, 'منتج-أ-فقط', 1), admin.user.id], 'all')).body.result
    assert(allCheckout?.ok === false && String(allCheckout.error).includes('فرع'), 'البيع على "كل الفروع" اتمنع')
    const flt = { search: '', paymentMethod: 'all', includeDeleted: false }
    const invA = await result(A.token, 'invoices:list', [flt])
    const invB = await result(B.token, 'invoices:list', [flt])
    assert(invA.length === 1 && invA[0].id === saleA.invoiceId, 'فواتير فرع 1 فاتورته بس')
    assert(invB.length === 1 && invB[0].id === saleB.invoiceId, 'فواتير فرع 2 فاتورته بس')
    assert((await result(adminTok, 'invoices:list', [flt], 'all')).length === 2, 'الأدمن على "كل الفروع" بيشوف الاتنين')
    assert((await result(adminTok, 'invoices:list', [flt], String(id2))).length === 1, 'الأدمن على فرع 2 بيشوف فاتورة فرع 2 بس')
    const peek = await call(A.token, 'invoices:getView', [saleB.invoiceId])
    assert(peek.body.ok === false && String(peek.body.error).includes('فرع'), 'فتح فاتورة فرع تاني بالـid اتمنع')
    assert((await call(adminTok, 'invoices:getView', [saleB.invoiceId], 'all')).body.ok === true, 'الأدمن على "كل الفروع" يفتحها')
    const spoof = await result(B.token, 'invoices:list', [flt], '1')
    assert(spoof.length === 1 && spoof[0].id === saleB.invoiceId, 'الكاشير مايقدرش يغيّر فرعه بالهيدر')

    console.log('\n6) مصروفات وخزن وكاش الوردية لكل فرع...')
    await call(A.token, 'expenses:create', [{ categoryId: null, amount: 5, method: 'cash', note: 'مصروف أ' }, A.user.id])
    await call(B.token, 'expenses:create', [{ categoryId: null, amount: 9, method: 'cash', note: 'مصروف ب' }, B.user.id])
    assert((await result(A.token, 'expenses:list', [50])).length === 1, 'مصروفات فرع 1 بس')
    assert((await result(adminTok, 'expenses:list', [50], 'all')).length === 2, 'الأدمن بيشوف كل المصروفات')
    assert(near((await result(B.token, 'expenses:byMethodSummary')).totalExpenses, 9), 'إجمالي مصروفات فرع 2 = 9')
    const cash = async (branch: string): Promise<number> => (await result(adminTok, 'treasury:list', [], branch)).find((t: any) => t.kind === 'cash').balance
    assert(near(await cash('1'), 95), 'خزينة كاش فرع 1 = 100 − 5')
    assert(near(await cash(String(id2)), 191), 'خزينة كاش فرع 2 = 200 − 9 (مبيعات فرع 1 مادخلتش فيها)')
    assert(near((await result(A.token, 'cash:getSummary')).expectedCash, 145), 'الكاش المتوقع لفرع 1 = 50 + 100 − 5')
    assert(near((await result(B.token, 'cash:getSummary')).expectedCash, 291), 'الكاش المتوقع لفرع 2 = 100 + 200 − 9')
    assert((await result(A.token, 'cash:listShifts', [{}])).length === 1, 'ورديات فرع 1 بس')
    assert((await result(adminTok, 'cash:listShifts', [{}], 'all')).length === 2, 'الأدمن بيشوف ورديات الفرعين')

    console.log('\n7) معلّقة وموظفين...')
    const held = await call(A.token, 'held:hold', [{ payload: { lines: [line(pA.id, 'منتج-أ-فقط', 1)], discountType: 'value', discountValue: 0, customerId: null, customerLabel: '', warehouseId: wh1.id }, total: 100 }, A.user.id])
    assert(held.body.ok === true, 'فرع 1 علّق فاتورة')
    assert((await result(B.token, 'held:list')).length === 0, 'المعلّقات مش بتظهر لفرع 2')
    assert((await call(B.token, 'held:get', [held.body.result])).body.ok === false, 'فتح معلّقة فرع تاني بالـid اتمنع')
    await call(adminTok, 'employees:create', [{ name: 'موظف فرع 1', phone: '', role: '', baseSalary: 1000 }], '1')
    await call(adminTok, 'employees:create', [{ name: 'موظف فرع 2', phone: '', role: '', baseSalary: 2000 }], String(id2))
    const empB = await result(B.token, 'employees:list')
    assert(empB.length === 1 && empB[0].name === 'موظف فرع 2', 'موظفو فرع 2 بس')
    assert((await result(adminTok, 'employees:list', [], 'all')).length === 2, 'الأدمن بيشوف كل الموظفين')

    console.log('\n8) تقارير: عزل ومجموع الفروع = "كل الفروع"...')
    const run = async (tok: string, type: string, branch?: string): Promise<any> => result(tok, 'reports:run', [type, {}], branch)
    const salesSummary = async (tok: string, branch?: string): Promise<number> => (await run(tok, 'sales_summary', branch)).totals.total
    assert(near(await salesSummary(A.token), 100) && near(await salesSummary(B.token), 200) && near(await salesSummary(adminTok, 'all'), 300), 'ملخص المبيعات: 100 / 200 / 300')
    const exp = async (tok: string, branch?: string): Promise<number> => (await run(tok, 'monthly_expenses', branch)).totals.amount
    assert(near(await exp(A.token), 5) && near(await exp(B.token), 9) && near(await exp(adminTok, 'all'), 14), 'المصروفات الشهرية: 5 / 9 / 14')
    const fin = async (tok: string, branch?: string): Promise<Record<string, number>> => {
      const r = await run(tok, 'financial_summary', branch)
      return Object.fromEntries(r.rows.map((x: any) => [x.metric, Number(x.value)]))
    }
    const fA = await fin(A.token)
    const fB = await fin(B.token)
    const fAll = await fin(adminTok, 'all')
    assert(near(fA['إجمالي المبيعات'], 100) && near(fB['إجمالي المبيعات'], 200) && near(fAll['إجمالي المبيعات'], 300), 'الملخص المالي: المبيعات 100 / 200 / 300')
    assert(near(fAll['إجمالي المصروفات'], fA['إجمالي المصروفات'] + fB['إجمالي المصروفات']), 'الملخص المالي: المصروفات = مجموع الفرعين')
    assert((await run(A.token, 'cash_drawer_sessions')).rows.length === 1 && (await run(adminTok, 'cash_drawer_sessions', 'all')).rows.length === 2, 'جلسات الخزنة: 1 للفرع / 2 للكل')
    const ov = async (tok: string, branch?: string): Promise<number> => (await result(tok, 'reports:overview', [{}], branch)).totalSales.value
    assert(near(await ov(A.token), 100) && near(await ov(B.token), 200) && near(await ov(adminTok, 'all'), 300), 'النظرة العامة: مبيعات 100 / 200 / 300')
    const dash = async (tok: string, branch?: string): Promise<number> => (await result(tok, 'dashboard:getSummary', [], branch)).todaySales
    assert(near(await dash(A.token), 100) && near(await dash(B.token), 200) && near(await dash(adminTok, 'all'), 300), 'لوحة التحكم: مبيعات اليوم 100 / 200 / 300')

    // كاشف التسريب: اسم صنف فرع ب مايظهرش في تقارير فرع أ والعكس، ومجموع أي إجمالي = مجموع الفرعين
    const LEAK_TYPES = ['sales_summary', 'sales_detailed', 'profit_loss', 'monthly_expenses', 'financial_summary', 'payment_methods', 'cash_drawer_sessions',
      'product_performance', 'item_sales', 'category_sales_daily', 'sales_by_employee', 'top_customers', 'tax_report', 'purchases_detailed', 'vendors_report', 'customers_analysis']
    let leaks = 0
    for (const type of LEAK_TYPES) {
      const rA = JSON.stringify(await run(A.token, type))
      const rB = JSON.stringify(await run(B.token, type))
      if (rA.includes('منتج-ب-فقط') || rB.includes('منتج-أ-فقط')) {
        leaks++
        console.error(`     تسريب في تقرير ${type}`)
      }
      const [oA, oB, oAll] = [await run(A.token, type), await run(B.token, type), await run(adminTok, type, 'all')]
      for (const key of Object.keys(oAll.totals ?? {})) {
        const a = Number(oA.totals?.[key] ?? 0)
        const b = Number(oB.totals?.[key] ?? 0)
        const all = Number(oAll.totals[key])
        if (Number.isFinite(all) && !near(all, a + b)) {
          leaks++
          console.error(`     إجمالي ${type}.${key} غير متسق: كل=${all} أ=${a} ب=${b}`)
        }
      }
    }
    assert(leaks === 0, `كاشف التسريب: ${LEAK_TYPES.length} تقرير بدون تسريب وإجمالياتها متسقة`)

    console.log('   - التقارير المحاسبية والإيصال...')
    const acc = async (tok: string, type: string, branch?: string): Promise<any> => result(tok, 'accounting:run', [type, {}], branch)
    const dailyTotal = async (tok: string, branch?: string): Promise<number> => (await acc(tok, 'daily_sales', branch)).totals.total
    assert(near(await dailyTotal(A.token), 100) && near(await dailyTotal(B.token), 200) && near(await dailyTotal(adminTok, 'all'), 300), 'يومية المبيعات المحاسبية: 100 / 200 / 300')
    const refsOf = async (tok: string, branch?: string): Promise<string> => JSON.stringify(await acc(tok, 'journal', branch))
    const jA = await refsOf(A.token)
    const jB = await refsOf(B.token)
    const jAll = await refsOf(adminTok, 'all')
    assert(jA.includes(saleA.invoiceNumber) && !jA.includes(saleB.invoiceNumber), 'دفتر اليومية: فرع 1 قيده بس')
    assert(jB.includes(saleB.invoiceNumber) && !jB.includes(saleA.invoiceNumber), 'دفتر اليومية: فرع 2 قيده بس')
    assert(jAll.includes(saleA.invoiceNumber) && jAll.includes(saleB.invoiceNumber), 'دفتر اليومية: "كل الفروع" فيه القيدين')
    const incomeSales = async (tok: string, branch?: string): Promise<string> => JSON.stringify(await acc(tok, 'income_statement', branch))
    assert((await incomeSales(A.token)) !== (await incomeSales(B.token)), 'قائمة الدخل مختلفة لكل فرع')
    const profile = {
      printSettings: { defaultPrinter: 'P', paperSize: '80mm', printMode: 'auto', showLogo: false, autoPrintAfterSale: false, copies: 1, thermalContentWidth80mm: 72, thermalContentWidth58mm: 48, thermalOffset80mm: 4, thermalOffset58mm: 2, thermalPageHeightMm: 1000 },
      categoryPrinters: {}
    }
    const rcpt = await fetch(`${BASE}/api/rpc/print:receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${B.token}` },
      body: JSON.stringify({ args: [saleB.invoiceId, false], printProfile: profile })
    }).then((r) => r.json())
    assert(String(rcpt.printJobs?.[0]?.html ?? '').includes('فرع المعادي'), 'إيصال فرع 2 عليه اسم الفرع')

    console.log('   - عمود الفرع على "كل الفروع"...')
    const hasBranchCol = (r: any): boolean => r.columns.some((c: any) => c.key === 'branch')
    const sdAll = await run(adminTok, 'sales_detailed', 'all')
    const sdA = await run(A.token, 'sales_detailed')
    assert(hasBranchCol(sdAll) && new Set(sdAll.rows.map((r: any) => r.branch)).size === 2, 'المبيعات التفصيلي على "كل الفروع": عمود الفرع وفيه الفرعين')
    assert(!hasBranchCol(sdA), 'المبيعات التفصيلي على فرع محدد: من غير عمود الفرع')
    const rowOf = (inv: string): any => sdAll.rows.find((r: any) => r.number === inv)
    assert(rowOf(saleA.invoiceNumber)?.branch === 'الفرع الرئيسي' && rowOf(saleB.invoiceNumber)?.branch === 'فرع المعادي', 'كل صف بيتسمّى بفرعه الصح')
    assert(hasBranchCol(await run(adminTok, 'cash_drawer_sessions', 'all')), 'جلسات الخزنة: عمود الفرع على "كل الفروع"')
    assert(hasBranchCol(await acc(adminTok, 'discounts', 'all')) && !hasBranchCol(await acc(A.token, 'discounts')), 'التقارير المحاسبية: عمود الفرع على "كل الفروع" بس')
    const invAllRows = await result(adminTok, 'invoices:list', [flt], 'all')
    assert(invAllRows.every((r: any) => r.branchName) && new Set(invAllRows.map((r: any) => r.branchName)).size === 2, 'قايمة الفواتير: اسم الفرع على كل صف')
    assert((await result(adminTok, 'expenses:list', [50], 'all')).every((r: any) => r.branchName), 'قايمة المصروفات: اسم الفرع على كل صف')
    assert((await result(adminTok, 'cash:listShifts', [{}], 'all')).every((r: any) => r.branchName), 'قايمة الورديات: اسم الفرع على كل صف')

    // المخزون: كل فرع بيشوف أرصدة مخزنه
    const inv = async (tok: string, branch?: string): Promise<Record<string, number>> =>
      Object.fromEntries((await run(tok, 'inventory_status', branch)).rows.map((r: any) => [r.name, r.qty]))
    const iA = await inv(A.token)
    const iB = await inv(B.token)
    const iAll = await inv(adminTok, 'all')
    assert(iA['منتج-أ-فقط'] === 9 && iA['منتج-ب-فقط'] === 10, 'حالة المخزون فرع 1: أ=9 ب=10')
    assert(iB['منتج-أ-فقط'] === 10 && iB['منتج-ب-فقط'] === 8, 'حالة المخزون فرع 2: أ=10 ب=8')
    assert(iAll['منتج-أ-فقط'] === 19 && iAll['منتج-ب-فقط'] === 18, 'حالة المخزون "كل الفروع" = مجموع الفرعين')

    console.log('\n9) مشتريات ونقل بضاعة بين الفروع...')
    const vendor = (await call(adminTok, 'vendors:create', [{ name: 'مورد الاختبار', phone: '', address: '', notes: '', openingBalance: 0 }])).body.result
    const purchase = (warehouseId: number) => [{ vendorId: vendor.id, warehouseId, lines: [{ productId: pA.id, name: 'منتج-أ-فقط', qty: 5, purchasePrice: 60 }], paymentMethod: 'cash', paid: 300, note: '' }, admin.user.id]
    assert((await call(adminTok, 'purchases:create', purchase(wh2.id), String(id2))).body.result?.ok === true, 'مشتريات فرع 2 نجحت')
    const badPur = (await call(adminTok, 'purchases:create', purchase(wh2.id), '1')).body.result
    assert(badPur?.ok === false && String(badPur.error).includes('فرع'), 'مشتريات على مخزن فرع تاني اتمنعت')
    assert((await result(A.token, 'purchases:list')).length === 0 && (await result(B.token, 'purchases:list')).length === 1, 'المشتريات لكل فرع لوحده')
    const [c2, c1] = [await cash(String(id2)), await cash('1')]
    assert(near(c2, 191 - 300) && near(c1, 95), `خزينة فرع 2 دفعت المشتريات وفرع 1 زي ما هو (فرع2=${c2} فرع1=${c1})`)
    const tr = (from: number, to: number) => [{ fromWarehouseId: from, toWarehouseId: to, note: '', lines: [{ productId: pB.id, qty: 3 }] }, admin.user.id]
    assert((await call(adminTok, 'stock:transfer', tr(wh1.id, wh2.id), '1')).body.result?.ok === true, 'نقل بضاعة من فرع 1 لفرع 2 نجح')
    const badTr = (await call(B.token, 'stock:transfer', tr(wh1.id, wh2.id))).body.result
    assert(badTr?.ok === false && String(badTr.error).includes('فرع'), 'الكاشير مايقدرش ينقل من مخزن فرع تاني')
    assert((await inv(B.token))['منتج-ب-فقط'] === 11 && (await inv(A.token))['منتج-ب-فقط'] === 7, 'أرصدة الفرعين بعد النقل: ب=11 / 7')

    console.log('\n10) مقارنة الفروع وإيقاف فرع...')
    const cmp = await result(adminTok, 'reports:run', ['branch_comparison', {}], 'all')
    const rowB = cmp.rows.find((r: any) => r.branch === 'فرع المعادي')
    const rowA = cmp.rows.find((r: any) => r.branch === 'الفرع الرئيسي')
    assert(near(rowA.sales, 100) && near(rowB.sales, 200) && near(rowB.expenses, 9) && near(rowB.purchases, 300), 'تقرير مقارنة الفروع أرقامه صح')
    assert((await call(A.token, 'reports:run', ['branch_comparison', {}])).body.ok === false, 'الكاشير مايقدرش يفتح مقارنة الفروع')
    const stopOpen = await call(adminTok, 'branches:update', [id2, { name: 'فرع المعادي', active: false }])
    assert(stopOpen.body.ok === false && String(stopOpen.body.error).includes('يوم مفتوح'), 'مينفعش يوقف فرع عليه يوم مفتوح')
    const closed = await call(B.token, 'cash:closeDay', [B.user.id, 291 - 300])
    assert(closed.body.ok === true, 'فرع 2 قفل يومه')
    assert((await result(A.token, 'cash:getOpenSession')) !== null, 'يوم فرع 1 لسه مفتوح')
    assert((await call(adminTok, 'branches:update', [id2, { name: 'فرع المعادي', active: false }])).body.ok === true, 'إيقاف الفرع بعد قفل اليوم نجح')
    const blocked = await login('cashier_b', '1234')
    assert(blocked.ok === false && String(blocked.error).includes('متوقف'), 'مستخدم فرع موقوف مايدخلش')
    await call(adminTok, 'branches:update', [id2, { name: 'فرع المعادي', active: true }])
    assert((await login('cashier_b', '1234')).ok === true, 'رجوع الفرع بيرجّع الدخول')
  } finally {
    server.close()
  }

  console.log(`\n=== النتيجة (الفروع): ${passed} نجح، ${failed} فشل ===`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('فشل اختبار الفروع:', err)
  process.exit(1)
})
