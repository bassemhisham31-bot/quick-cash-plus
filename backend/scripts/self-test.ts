/**
 * اختبار حقيقي شامل (مش افتراضات): بيشغّل قاعدة بيانات مؤقتة + سيرفر HTTP حقيقي على منفذ اختبار،
 * وبعدين بيعمل نداءات fetch فعلية زي أي عميل ويب حقيقي، ويتأكد من النتائج الفعلية.
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { initDatabaseAtPath } from '../src/main/db'
import { startHttpServer } from '../src/http/server'

async function json(res: Response): Promise<any> {
  return res.json()
}

const TEST_DB_PATH = join(process.cwd(), 'data', 'self-test.sqlite')
const PORT = 4999
process.env.QCP_INTERNAL_SECRET = 'test-internal-secret'
process.env.QCP_HEALTH_MAX_DISK_PCT = '100' // جهاز التطوير ممكن قرصه شبه ممتلي — الاختبار مش بيفحص القرص
const BASE = `http://127.0.0.1:${PORT}`

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    console.error(`  ❌ ${message}`)
  }
}

async function main(): Promise<void> {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const p = TEST_DB_PATH + suffix
    if (existsSync(p)) rmSync(p)
  }

  console.log('1) تهيئة قاعدة بيانات مؤقتة (68 migration + seed)...')
  await initDatabaseAtPath(TEST_DB_PATH)
  console.log('   تم.\n')

  console.log('2) تشغيل السيرفر الحقيقي على المنفذ', PORT, '...')
  const server = startHttpServer(PORT)
  await new Promise((r) => setTimeout(r, 300))
  console.log('   تم.\n')

  try {
    console.log('3) فحص /api/health بدون تسجيل دخول...')
    const health = await fetch(`${BASE}/api/health`).then(json)
    assert(health.ok === true, 'health check رجع ok:true')

    console.log('\n4) محاولة الوصول لـ RPC بدون توكن (المفروض يترفض)...')
    const noAuth = await fetch(`${BASE}/api/rpc/catalog:listProducts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: ['', null] })
    })
    assert(noAuth.status === 401, 'الرد 401 من غير Authorization header')

    console.log('\n5) تسجيل دخول ببيانات غلط (المفروض يترفض)...')
    const badLogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' })
    }).then(json)
    assert(badLogin.ok === false, 'تسجيل الدخول ببيانات غلط اترفض')

    console.log('\n6) تسجيل دخول حقيقي (admin/admin123)...')
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    }).then(json)
    assert(login.ok === true, 'تسجيل الدخول الصحيح نجح')
    assert(typeof login.token === 'string' && login.token.length > 10, 'رجع JWT token حقيقي')
    assert(login.user?.username === 'admin' && login.user?.role === 'admin', 'بيانات المستخدم صحيحة')

    const token = login.token as string
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

    console.log('\n7) استدعاء /api/me بالتوكن...')
    const me = await fetch(`${BASE}/api/me`, { headers: authHeaders }).then(json)
    assert(me.ok === true && me.auth?.username === 'admin', '/api/me رجع بيانات المستخدم الموثّق')

    console.log('\n8) قناة غير موجودة (المفروض 404)...')
    const unknown = await fetch(`${BASE}/api/rpc/not:areal`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ args: [] })
    })
    assert(unknown.status === 404, 'قناة غير معروفة ترجع 404')

    console.log('\n9) قراءة بيانات حقيقية (catalog:listWarehouses من الـseed)...')
    const warehouses = await fetch(`${BASE}/api/rpc/catalog:listWarehouses`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ args: [] })
    }).then(json)
    assert(warehouses.ok === true, 'catalog:listWarehouses نجح')
    assert(
      Array.isArray(warehouses.result) && warehouses.result.some((w: any) => w.name === 'المخزن الرئيسي'),
      'المخزن الافتراضي من seed موجود فعليًا في الرد'
    )

    console.log('\n10) عملية "مُغيّرة للبيانات" حقيقية (إنشاء تصنيف) + التأكد إنها اتسجلت فعلاً في القاعدة...')
    const created = await fetch(`${BASE}/api/rpc/catalog:createCategory`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ args: ['فئة اختبار ذاتي', null] })
    }).then(json)
    assert(created.ok === true, 'catalog:createCategory نجح')

    const categories = await fetch(`${BASE}/api/rpc/catalog:listCategories`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ args: [] })
    }).then(json)
    assert(
      categories.result?.some((c: any) => c.name === 'فئة اختبار ذاتي'),
      'التصنيف الجديد فعليًا موجود في قاعدة البيانات بعد إعادة القراءة'
    )

    console.log('\n11) نشاط المستخدم اتسجل تلقائيًا بعد العملية المُغيّرة...')
    const activity = await fetch(`${BASE}/api/rpc/users:listActivity`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ args: [10] })
    }).then(json)
    assert(
      Array.isArray(activity.result) && activity.result.some((a: any) => a.action === 'catalog:createCategory'),
      'سجل النشاط فيه العملية اللي عملناها دلوقتي'
    )

    const rpc = async (channel: string, args: unknown[] = [], extra: Record<string, unknown> = {}): Promise<any> =>
      fetch(`${BASE}/api/rpc/${channel}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ args, ...extra })
      }).then(json)

    console.log('\n12) الموديولات الجديدة (خزائن، محاسبة، حضور، مناسبات، معلّقة، الأرضية)...')
    const treasuries = await rpc('treasury:list')
    assert(treasuries.ok === true && Array.isArray(treasuries.result), 'treasury:list اشتغل')
    const accReports = await rpc('accounting:listReports')
    assert(accReports.ok === true && Array.isArray(accReports.result) && accReports.result.length > 0, 'accounting:listReports رجع تقارير')
    const attSettings = await rpc('attendance:getSettings')
    assert(attSettings.ok === true, 'attendance:getSettings اشتغل')
    const packages = await rpc('events:listPackages')
    assert(packages.ok === true && Array.isArray(packages.result), 'events:listPackages اشتغل')
    const floor = await rpc('restaurant:getFloor')
    assert(floor.ok === true, 'restaurant:getFloor اشتغل')
    const lic = await rpc('license:getStatus')
    assert(lic.ok === true && lic.result?.status === 'trial' && lic.result?.daysRemaining === 30, 'الترخيص تجربة 30 يوم')

    console.log('\n13) الطباعة عبر printCapture: السيرفر يرجّع jobs بدل ما يطبع...')
    const printProfile = {
      printSettings: {
        defaultPrinter: 'TestPrinter', paperSize: '80mm', printMode: 'auto', showLogo: false, autoPrintAfterSale: false, copies: 1,
        thermalContentWidth80mm: 72, thermalContentWidth58mm: 48, thermalOffset80mm: 4, thermalOffset58mm: 2, thermalPageHeightMm: 1000
      },
      categoryPrinters: {}
    }
    const held = await rpc('held:hold', [{ payload: { lines: [{ productId: 1, name: 'صنف تجربة', qty: 2, unitPrice: 10, discount: 0 }], discountType: 'value', discountValue: 0, customerId: null, customerLabel: '', warehouseId: null }, total: 20 }, 1])
    assert(held.ok === true, 'held:hold اشتغل')
    const heldList = await rpc('held:list')
    const heldId = heldList.result?.[0]?.id
    assert(typeof heldId === 'number', 'الفاتورة المعلّقة اتسجلت')
    const printed = await rpc('print:heldInvoice', [heldId, false], { printProfile })
    assert(printed.ok === true && printed.result?.ok === true, 'print:heldInvoice نجح')
    assert(Array.isArray(printed.printJobs) && printed.printJobs.length === 1 && printed.printJobs[0].kind === 'print', 'رجع job طباعة واحد')
    assert(String(printed.printJobs?.[0]?.html).includes('صنف تجربة'), 'HTML الشيك فيه اسم الصنف')
    const noProfile = await rpc('print:heldInvoice', [heldId, false])
    assert(noProfile.ok === true && noProfile.result?.ok === false, 'بدون بروفايل طابعة السيرفر مش بيطبع (بيرجّع خطأ واضح)')
    const preview = await rpc('print:heldInvoice', [heldId, true], { printProfile })
    assert(preview.printJobs?.[0]?.kind === 'preview', 'المعاينة رجعت job من نوع preview')
    const drawer = await rpc('print:openDrawer', [], { printProfile })
    assert(drawer.printJobs?.[0]?.kind === 'drawer' && drawer.printJobs[0].printer === 'TestPrinter', 'فتح الدرج رجع job drawer')
    await rpc('held:delete', [heldId])

    console.log('\n14) تصدير/استيراد Excel وPDF...')
    await rpc('catalog:createProduct', [{ name: 'صنف للتصدير', barcode: 'EXP-1', categoryId: null, unitId: null, vendorId: null, costPrice: 5, retailPrice: 9, wholesalePrice: 8, wholesale2Price: 7, packPrice: 0, openingQuantity: 4, reorderPoint: 1, warehouseId: 1, expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null }])
    const exp = await rpc('catalog:exportProducts')
    assert(exp.ok && exp.result?.ok && String(exp.result.fileName).endsWith('.xlsx') && exp.result.dataBase64.length > 100, 'catalog:exportProducts رجع ملف xlsx')
    const tpl = await rpc('catalog:exportProductsTemplate')
    assert(tpl.result?.ok && tpl.result.dataBase64.length > 100, 'القالب اتولّد')
    const imp = await rpc('catalog:importProducts', [exp.result.dataBase64])
    assert(imp.result?.ok === true && imp.result.updated >= 1 && imp.result.rowErrors.length === 0, 'استيراد نفس الملف حدّث الأصناف بدون أخطاء: ' + JSON.stringify(imp.result))
    const bad = await rpc('catalog:importProducts', [Buffer.from('not an excel file').toString('base64')])
    assert(bad.result?.ok === false, 'ملف غير صالح اترفض برسالة خطأ')
    const rep = { title: 'تقرير تجربة', columns: [{ key: 'a', label: 'عمود' }], rows: [{ a: 'x<y' }], totals: { a: 1 } }
    const xl = await rpc('reports:exportExcel', [rep])
    assert(xl.result?.ok && xl.result.fileName === 'تقرير تجربة.xlsx' && xl.result.dataBase64.length > 100, 'reports:exportExcel رجع xlsx')
    const pdf = await rpc('reports:exportPdf', [rep])
    assert(pdf.result?.ok && String(pdf.result.html).includes('x&lt;y'), 'reports:exportPdf رجع HTML آمن للطباعة')

    console.log('\n15) نسخة احتياطية محلية (VACUUM INTO) وسلامتها...')
    const bk = await rpc('backup:runNow')
    assert(bk.ok === true && bk.result?.ok === true && typeof bk.result.filePath === 'string', 'backup:runNow نجح: ' + JSON.stringify(bk.result))
    if (bk.result?.filePath) {
      const { createClient } = await import('@libsql/client')
      const copyDb = createClient({ url: `file:${String(bk.result.filePath).split(String.fromCharCode(92)).join('/')}` })
      const integrity = await copyDb.execute('PRAGMA integrity_check')
      const users = await copyDb.execute('SELECT COUNT(*) n FROM users')
      assert(String((integrity.rows[0] as any)[0]) === 'ok', 'integrity_check على النسخة = ok')
      assert(Number((users.rows[0] as any).n) >= 1, 'النسخة فيها بيانات المستخدمين')
      copyDb.close()
    }

    console.log('\n16) الترخيص: تفعيل بأمر المالك، فترة السماح، والقفل...')
    const internal = (body: unknown, secret = 'test-internal-secret'): Promise<Response> =>
      fetch(`${BASE}/internal/license`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-qcp-internal': secret }, body: JSON.stringify(body) })
    assert((await internal({}, 'wrong')).status === 404, '/internal/license بسر غلط = 404')
    const paid = await (await internal({ plan: 'monthly', expiresAt: '2099-01-01' })).json()
    assert(paid.ok && paid.status.status === 'active' && paid.status.plan === 'monthly', 'تفعيل شهري بأمر المالك نجح')
    const pastTry = await (await internal({ plan: 'monthly', expiresAt: '2020-01-01' })).json()
    assert(pastTry.ok === false, 'تاريخ انتهاء في الماضي اترفض')
    const act = await rpc('license:activate', ['abc'])
    assert(act.result?.ok === false, 'التفعيل بكود من العميل مقفول على الويب')

    const { getDb: getTestDb } = await import('../src/main/db')
    const { invalidateWebLicenseCache } = await import('../src/main/services/licenseWeb')
    const daysAgo = (d: number): string => new Date(Date.now() - d * 86400000).toISOString()
    await getTestDb().execute({ sql: "UPDATE license SET status = 'active', plan = 'monthly', expires_at = ? WHERE id = 1", args: [daysAgo(3)] })
    invalidateWebLicenseCache()
    const grace = await rpc('license:getStatus')
    assert(grace.result?.status === 'active' && grace.result?.graceDaysLeft >= 1 && grace.result?.graceDaysLeft <= 7, 'بعد الانتهاء بـ3 أيام: شغال مع graceDaysLeft = ' + grace.result?.graceDaysLeft)
    const stillWorks = await rpc('catalog:listWarehouses')
    assert(stillWorks.ok === true, 'القنوات شغالة أثناء فترة السماح')

    await getTestDb().execute({ sql: "UPDATE license SET expires_at = ? WHERE id = 1", args: [daysAgo(10)] })
    invalidateWebLicenseCache()
    const locked = await rpc('license:getStatus')
    assert(locked.result?.status === 'expired', 'بعد السماح: الحالة expired')
    const blockedRes = await fetch(`${BASE}/api/rpc/catalog:listWarehouses`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ args: [] }) })
    assert(blockedRes.status === 500 || blockedRes.status === 403, 'القنوات العادية مقفولة بعد السماح (HTTP ' + blockedRes.status + ')')

    const renewed = await (await internal({ plan: 'yearly', expiresAt: '2099-01-01' })).json()
    assert(renewed.ok && renewed.status.status === 'active', 'تجديد بأمر المالك رجّع التشغيل')
    const unlocked = await rpc('catalog:listWarehouses')
    assert(unlocked.ok === true, 'القنوات رجعت تشتغل بعد التجديد')

    console.log('\n13) استعادة كلمة المرور بالإيميل...')
    const { setMailSenderForTests } = await import('../src/main/services/mailer')
    const sent: { to: string; subject: string; text: string }[] = []
    setMailSenderForTests(async (m) => {
      sent.push(m)
    })
    process.env.QCP_PUBLIC_URL = 'https://test.example.com/'
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const tokenOf = (text: string): string => /#reset=([0-9a-f]{64})/.exec(text)?.[1] ?? ''

    const badMail = await rpc('users:update', [1, { fullName: 'مدير النظام', role: 'admin', active: true, password: null, email: 'مش-إيميل', permissions: [] }])
    assert(badMail.ok === false, 'إيميل بشكل غلط اترفض')
    const setMail = await rpc('users:update', [1, { fullName: 'مدير النظام', role: 'admin', active: true, password: null, email: 'Owner@Example.com', permissions: [] }])
    assert(setMail.ok === true, 'حفظ إيميل الأدمن نجح')
    const listed = await rpc('users:list')
    assert(listed.result?.find((u: any) => u.id === 1)?.email === 'owner@example.com', 'الإيميل اتخزّن lowercase وظهر في قايمة المستخدمين')

    const f1 = await post('/api/auth/forgot-password', { identifier: 'admin' }).then(json)
    await wait(300)
    assert(f1.ok === true && sent.length === 1 && sent[0].to === 'owner@example.com', 'طلب الاستعادة بإسم المستخدم بعت إيميل للعنوان الصح')
    const tok1 = tokenOf(sent[0]?.text ?? '')
    assert(tok1.length === 64 && (sent[0]?.text ?? '').includes('https://test.example.com/#reset='), 'الرسالة فيها رابط بتوكن 64 حرف على الدومين المضبوط (بدون // مزدوجة)')

    const f2 = await post('/api/auth/forgot-password', { identifier: 'nobody-here' }).then(json)
    await wait(200)
    assert(f2.ok === true && f2.message === f1.message && sent.length === 1, 'مستخدم مش موجود: نفس الرد بالظبط ومفيش إيميل اتبعت')

    await post('/api/auth/forgot-password', { identifier: 'owner@example.com' })
    await wait(200)
    assert(sent.length === 1, 'طلب تاني خلال دقيقة اتجاهل (مفيش إغراق إيميلات)')

    const shortPw = await post('/api/auth/reset-password', { token: tok1, password: '123' })
    assert(shortPw.status === 400, 'كلمة مرور قصيرة اترفضت')
    const wrongTok = await post('/api/auth/reset-password', { token: 'a'.repeat(64), password: 'NewPass123' })
    assert(wrongTok.status === 400, 'توكن غلط اترفض')

    const resetOk = await post('/api/auth/reset-password', { token: tok1, password: 'NewPass123' }).then(json)
    assert(resetOk.ok === true, 'تعيين كلمة المرور بالرابط نجح')
    const newLogin = await post('/api/auth/login', { username: 'admin', password: 'NewPass123' }).then(json)
    assert(newLogin.ok === true, 'الدخول بكلمة المرور الجديدة نجح')
    const oldLogin = await post('/api/auth/login', { username: 'admin', password: 'admin123' }).then(json)
    assert(oldLogin.ok === false, 'كلمة المرور القديمة بطلت تشتغل')
    const reuse = await post('/api/auth/reset-password', { token: tok1, password: 'Another123' })
    assert(reuse.status === 400, 'نفس الرابط مايتستخدمش مرتين')

    const dbx = getTestDb()
    await dbx.execute("UPDATE password_resets SET created_at = datetime('now', '-5 minutes')")
    await post('/api/auth/forgot-password', { identifier: 'admin' })
    await wait(300)
    assert(sent.length === 2, 'بعد دقيقة طلب جديد بعت رسالة جديدة')
    const tok2 = tokenOf(sent[1]?.text ?? '')
    await dbx.execute({ sql: 'UPDATE password_resets SET expires_at = ? WHERE used_at IS NULL', args: [new Date(Date.now() - 1000).toISOString()] })
    const expired = await post('/api/auth/reset-password', { token: tok2, password: 'Another123' })
    assert(expired.status === 400, 'رابط منتهي الصلاحية اترفض')

    let limited = false
    for (let i = 0; i < 6 && !limited; i++) {
      limited = (await post('/api/auth/forgot-password', { identifier: 'x' + i })).status === 429
    }
    assert(limited, 'كتر الطلبات من نفس الـIP بيرجّع 429')
    setMailSenderForTests(null)

    console.log('\n17) نسخة retail (QCP_EDITION): من غير أي ميزة مطاعم...')
    const rawRpc = (channel: string, args: unknown[] = [], headers: Record<string, string> = authHeaders): Promise<Response> =>
      fetch(`${BASE}/api/rpc/${channel}`, { method: 'POST', headers, body: JSON.stringify({ args }) })
    const RESTAURANT_KEYS = ['restaurant', 'restaurantTables', 'restaurantCaptains', 'delivery', 'events', 'settings:restaurant',
      'report:restaurant_sales_by_order_type', 'report:restaurant_recipe_consumption', 'report:restaurant_table_activity', 'report:sales_by_captain']

    const fullLic = await rpc('license:getStatus')
    assert(RESTAURANT_KEYS.every((k) => !fullLic.result.disabledFeatures.includes(k)), 'النسخة الكاملة: مفيش ميزة مطاعم موقوفة')
    assert((await rawRpc('restaurant:listTables')).status === 200, 'النسخة الكاملة: restaurant:listTables شغالة')

    process.env.QCP_EDITION = ' Retail ' // المسافات وحالة الحروف مش بتفرق
    try {
      const retailLic = await rpc('license:getStatus')
      assert(RESTAURANT_KEYS.every((k) => retailLic.result.disabledFeatures.includes(k)), 'retail: كل مفاتيح المطاعم موقوفة في حالة الترخيص')
      assert(retailLic.result.status === 'active', 'retail: الترخيص نفسه لسه active')
      const publicLic = await fetch(`${BASE}/api/rpc/license:getStatus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"args":[]}' }).then(json)
      assert(publicLic.ok && publicLic.result.disabledFeatures.includes('restaurantTables'), 'retail: القناة العامة (قبل الدخول) كمان بترجّع الميزات الموقوفة')

      for (const [channel, args] of [['restaurant:listTables', []], ['restaurant:getFloor', []], ['delivery:listZones', []], ['recipes:get', [1]], ['reservations:list', []], ['events:listPackages', []]] as [string, unknown[]][]) {
        assert((await rawRpc(channel, args)).status === 403, `retail: ${channel} ممنوعة (403)`)
      }
      assert((await rpc('catalog:listWarehouses')).ok === true, 'retail: القنوات العادية شغالة')
      assert((await rpc('settings:getRestaurant')).ok === true, 'retail: settings:getRestaurant لسه شغالة (بتتقري جوه الفواتير)')
      assert((await rpc('reports:run', ['sales_summary', {}])).ok === true, 'retail: تقرير عادي شغال')
      for (const type of ['restaurant_sales_by_order_type', 'restaurant_recipe_consumption', 'restaurant_table_activity', 'sales_by_captain']) {
        assert((await rpc('reports:run', [type, {}])).ok === false, `retail: تقرير ${type} ممنوع`)
      }

      // الميزات الموقوفة بالنسخة ثابتة حتى لو الترخيص اتجدد من غير ميزات موقوفة
      const withFeature = await json(await internal({ plan: 'yearly', expiresAt: '2099-01-01', disabledFeatures: ['settings:backup'] }))
      assert(withFeature.status.disabledFeatures.includes('settings:backup') && withFeature.status.disabledFeatures.includes('restaurant'), 'retail: ميزات الترخيص بتتدمج مع ميزات النسخة')
      const renewedPlain = await json(await internal({ plan: 'yearly', expiresAt: '2099-02-01' }))
      assert(renewedPlain.status.disabledFeatures.includes('restaurant') && !renewedPlain.status.disabledFeatures.includes('settings:backup'), 'retail: تجديد من غير ميزات بيرجّع ميزات النسخة بس')

      process.env.QCP_EDITION = 'bogus'
      const bogus = await rpc('license:getStatus')
      assert(!bogus.result.disabledFeatures.includes('restaurant'), 'قيمة نسخة غلط بترجع للنسخة الكاملة (مع تحذير)')
    } finally {
      delete process.env.QCP_EDITION
    }
    assert((await rawRpc('restaurant:listTables')).status === 200, 'رجوع للنسخة الكاملة: القنوات رجعت تشتغل')
  } finally {
    server.close()
  }

  console.log(`\n=== النتيجة: ${passed} نجح، ${failed} فشل ===`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('فشل تشغيل الاختبار:', err)
  process.exit(1)
})
