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
