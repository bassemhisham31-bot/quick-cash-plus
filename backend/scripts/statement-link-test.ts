/**
 * اختبار رابط كشف الحساب للعميل (2026-11-25): إنشاء/تجديد/إلغاء الرابط، الصفحة العامة عبر HTTP حقيقي (من غير تسجيل دخول)،
 * الهروب من HTML، 404 لأي توكن غلط، عدّاد الفتح، إرسال واتساب بجلسة وهمية، وحد المحاولات.
 *   npx tsx scripts/statement-link-test.ts
 */
import { createServer, type Server } from 'http'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data', 'statement-link-test')
process.env.QCP_DATA_DIR = DATA_DIR
process.env.QCP_WA_TEST = '1'
process.env.QCP_JWT_SECRET = 'statement-link-test-secret-statement-link-test-secret'
delete process.env.QCP_PUBLIC_URL

import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { createCustomer, recordCustomerPayment } from '../src/main/services/customers'
import { openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { createStatementLink, getStatementLinkInfo, revokeStatementLink } from '../src/main/services/statementLink'
import { __setFakeSocketForTests, sendCustomerStatementLinkByWhatsApp } from '../src/main/services/whatsapp'
import { createApp } from '../src/http/server'
import { buildHandlerMap, MUTATING_CHANNELS } from '../src/main/handlers'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

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

async function main(): Promise<void> {
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true })
  mkdirSync(DATA_DIR, { recursive: true })
  await initDatabaseAtPath(join(DATA_DIR, 'statement-link-test.sqlite'))

  const server: Server = createServer(createApp())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as any).port}`
  const get = (path: string) => fetch(base + path)
  const pathOf = (url: string): string => url.replace('https://shop.example.test', '')

  await openDay(1, 0)
  const product = await createProduct(productInput({ name: 'زيت', costPrice: 50, retailPrice: 80, openingQuantity: 100 }))
  const evil = await createCustomer({ name: 'محمد <script>alert(1)</script>', phone: '01012345678', address: '', notes: '', openingBalance: 200, loyaltyEnabled: true })
  const noPhone = await createCustomer({ name: 'بدون رقم', phone: '', address: '', notes: '', openingBalance: 0, loyaltyEnabled: true })
  const sale = await checkout(
    {
      customerId: evil.id, warehouseId: 1,
      lines: [{ productId: product.id, name: product.name, barcode: product.barcode, qty: 3, unitPrice: 80, discount: 0 }],
      discountType: 'value', discountValue: 0, paymentMethod: 'credit', paid: 0, redeemPoints: 0
    } as unknown as CheckoutInput,
    1
  )
  assert(sale.ok, 'بيع آجل للعميل (رصيد 200 + 240 = 440)')
  await recordCustomerPayment(evil.id, 100, 'cash', '', 1)

  console.log('1) إنشاء الرابط')
  const before = await getStatementLinkInfo(evil.id, 'https://shop.example.test')
  assert(!before.enabled && before.url === null, 'قبل التفعيل: مفيش رابط')
  const link = await createStatementLink(evil.id, 'https://shop.example.test')
  assert(link.enabled && !!link.url && /^https:\/\/shop\.example\.test\/api\/s\/[A-Za-z0-9_-]{32}$/.test(link.url), 'الرابط بعنوان الموقع + توكن عشوائي 32 حرف')
  const again = await createStatementLink(evil.id, 'https://shop.example.test')
  assert(again.url === link.url, 'استدعاء تاني بيرجّع نفس الرابط (مش بيغيّره)')
  const bad = await createStatementLink(evil.id, 'javascript:alert(1)').catch((e) => e)
  assert(bad instanceof Error || bad.url === link.url, 'عنوان موقع غير صالح مش بيتقبل لعمل رابط جديد')
  const walkIn = (await getDb().execute('SELECT id FROM customers WHERE is_walk_in = 1')).rows[0] as any
  const walkErr = await createStatementLink(Number(walkIn.id), 'https://shop.example.test').catch((e) => e)
  assert(walkErr instanceof Error, 'العميل النقدي الافتراضي ملوش رابط')
  const missingErr = await createStatementLink(99999, 'https://shop.example.test').catch((e) => e)
  assert(missingErr instanceof Error, 'عميل مش موجود → خطأ')

  console.log('2) الصفحة العامة (من غير تسجيل دخول)')
  const url1 = pathOf(link.url!)
  const r1 = await get(url1)
  const html1 = await r1.text()
  assert(r1.status === 200 && (r1.headers.get('content-type') ?? '').includes('text/html'), 'GET بدون توكن دخول → 200 HTML')
  assert(html1.includes('340.00') && html1.includes('المبلغ المستحق عليك'), 'الرصيد الحالي 340.00 ظاهر بصيغة «المبلغ المستحق عليك»')
  assert(html1.includes('فاتورة') && html1.includes('رصيد سابق'), 'الحركات + رصيد سابق ظاهرين')
  assert(!html1.includes('<script>alert(1)</script>') && html1.includes('&lt;script&gt;'), 'اسم العميل متهرّب منه (لا XSS)')
  assert((r1.headers.get('cache-control') ?? '').includes('no-store') && (r1.headers.get('x-robots-tag') ?? '').includes('noindex'), 'no-store + noindex')
  assert((r1.headers.get('content-security-policy') ?? '').includes("default-src 'none'"), 'CSP مقفولة (مفيش سكريبت)')
  assert(!html1.includes('<script'), 'مفيش أي سكريبت في الصفحة')
  const info1 = await getStatementLinkInfo(evil.id, 'https://shop.example.test')
  assert(info1.views === 1 && !!info1.lastViewedAt, 'عدّاد الفتح = 1')

  await recordCustomerPayment(evil.id, 40, 'cash', '', 1)
  const html1b = await (await get(url1)).text()
  assert(html1b.includes('300.00'), 'الكشف حيّ: بعد سداد 40 الرصيد 300.00')

  console.log('3) توكن غلط / مفيش')
  const r404a = await get('/api/s/' + 'A'.repeat(32))
  const r404b = await get('/api/s/short')
  const r404c = await get('/api/s/' + encodeURIComponent("' OR 1=1 --"))
  assert(r404a.status === 404 && r404b.status === 404 && r404c.status === 404, 'توكن غلط/قصير/حقن → 404')
  assert(!(await r404a.text()).includes('340'), 'صفحة 404 ما بتسرّبش أي بيانات')

  console.log('4) البوابة لسه مقفولة على باقي الـAPI')
  const rpc = await fetch(base + '/api/rpc/customers:list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"args":[""]}' })
  assert(rpc.status === 401, 'RPC من غير توكن → 401 (الصفحة العامة ما فتحتش حاجة تانية)')
  const rpc2 = await fetch(base + '/api/rpc/customers:getStatementLink', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"args":[1]}' })
  assert(rpc2.status === 401, 'قناة إدارة الرابط محتاجة تسجيل دخول')
  const handlers = buildHandlerMap()
  assert(
    ['customers:getStatementLink', 'customers:createStatementLink', 'customers:revokeStatementLink', 'customers:sendStatementLinkWhatsApp'].every((c) => !!handlers[c]),
    'القنوات الأربعة متسجّلة'
  )
  // مقصود: مش mutating — الـmutating بيبعت «تم التغيير» لكل الشاشات فتتعمل remount لشاشة العملاء وتتقفل نافذة الرابط المفتوحة
  assert(
    ['customers:createStatementLink', 'customers:revokeStatementLink', 'customers:sendStatementLinkWhatsApp'].every((c) => !MUTATING_CHANNELS.has(c)),
    'قنوات الرابط مش mutating (مفيش remount للشاشة وهي مفتوحة)'
  )

  console.log('5) واتساب')
  const sent: { jid: string; text: string }[] = []
  __setFakeSocketForTests({ sendMessage: async (jid, content) => void sent.push({ jid, text: content.text }) })
  const wa = await sendCustomerStatementLinkByWhatsApp(evil.id, 'https://shop.example.test')
  assert(wa.ok && sent.length === 1 && sent[0].jid === '201012345678@s.whatsapp.net', 'الرسالة اتبعتت لرقم العميل')
  assert(sent[0]?.text.includes(link.url!) && sent[0].text.includes('المبلغ المستحق عليك: 300.00'), 'فيها نفس الرابط والرصيد الحالي')
  console.log(sent[0].text.split('\n').map((l) => '     ' + l).join('\n'))
  const waNoPhone = await sendCustomerStatementLinkByWhatsApp(noPhone.id, 'https://shop.example.test')
  assert(!waNoPhone.ok && (waNoPhone.error ?? '').includes('رقم'), 'عميل من غير رقم → رسالة واضحة')
  assert((await getStatementLinkInfo(noPhone.id, 'https://shop.example.test')).enabled === false, 'فشل الإرسال ما عملش رابط للعميل من غير رقم')
  __setFakeSocketForTests(null)
  const waOff = await sendCustomerStatementLinkByWhatsApp(evil.id, 'https://shop.example.test')
  assert(!waOff.ok && (waOff.error ?? '').includes('غير متصل'), 'واتساب مش متصل → رسالة واضحة')

  console.log('6) تجديد وإلغاء')
  const renewed = await createStatementLink(evil.id, 'https://shop.example.test', true)
  assert(renewed.url !== link.url && renewed.views === 0, 'تجديد الرابط = توكن جديد وعدّاد صفر')
  assert((await get(url1)).status === 404, 'الرابط القديم بطل فورًا')
  const url2 = pathOf(renewed.url!)
  assert((await get(url2)).status === 200, 'الرابط الجديد شغال')
  await revokeStatementLink(evil.id)
  assert((await get(url2)).status === 404, 'بعد الإلغاء الرابط 404')
  assert((await getStatementLinkInfo(evil.id, 'https://shop.example.test')).enabled === false, 'حالة الرابط = مش مفعّل')

  console.log('7) عميل اتحذف')
  const l3 = await createStatementLink(evil.id, 'https://shop.example.test')
  await getDb().execute({ sql: "UPDATE customers SET deleted_at = datetime('now') WHERE id = ?", args: [evil.id] })
  assert((await get(pathOf(l3.url!))).status === 404, 'عميل محذوف → الرابط 404')

  console.log('8) حد المحاولات')
  let last = 0
  for (let i = 0; i < 70; i++) last = (await get('/api/s/' + 'B'.repeat(32))).status
  assert(last === 429, 'بعد 60 طلب في الدقيقة → 429')

  await new Promise<void>((r) => server.close(() => r()))
  console.log(`\n${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
