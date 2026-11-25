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
import {
  createStatementLink,
  createVendorStatementLink,
  getStatementLinkInfo,
  getVendorStatementLinkInfo,
  isPreviewFetch,
  revokeStatementLink,
  revokeVendorStatementLink
} from '../src/main/services/statementLink'
import { addVendorAccountEntries, createVendor, updateVendor } from '../src/main/services/vendors'
import { __setFakeSocketForTests, sendCustomerStatementLinkByWhatsApp, sendVendorStatementLinkByWhatsApp } from '../src/main/services/whatsapp'
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
  assert(html1.includes('بيتحدّث تلقائيًا'), 'الصفحة فيها سطر توضيحي إن الكشف بيتحدّث تلقائيًا')
  const info1 = await getStatementLinkInfo(evil.id, 'https://shop.example.test')
  assert(info1.views === 1 && !!info1.lastViewedAt, 'عدّاد الفتح = 1')

  console.log('2b) معاينات الروبوتات ما بتتحسبش فتح')
  const viewsNow = async (): Promise<number> => (await getStatementLinkInfo(evil.id, 'https://shop.example.test')).views
  const ua = (agent: string) => fetch(base + url1, { headers: { 'user-agent': agent } })
  const waPreview = await ua('WhatsApp/2.24.20.80 A')
  assert(waPreview.status === 200 && (await waPreview.text()).includes('340.00'), 'معاينة واتساب بتاخد الصفحة عادي')
  await ua('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')
  await ua('TelegramBot (like TwitterBot)')
  await fetch(base + url1, { method: 'HEAD' })
  assert((await viewsNow()) === 1, 'واتساب/فيسبوك/تيليجرام/HEAD ما زوّدوش عدّاد الفتح (لسه 1)')
  await ua('Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')
  assert((await viewsNow()) === 2, 'فتح العميل من موبايله (Chrome) اتحسب (بقى 2)')
  assert(isPreviewFetch('WhatsApp/2.23.1') && isPreviewFetch('Googlebot/2.1') && !isPreviewFetch('Mozilla/5.0 (iPhone) Safari/604.1') && !isPreviewFetch(undefined) && isPreviewFetch('Mozilla/5.0', 'HEAD'), 'isPreviewFetch بيفرّق بين الروبوت والمتصفح')

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
  assert(sent[0].text.includes('(وقت الإرسال)') && sent[0].text.includes('بيتحدّث تلقائيًا مع كل حركة جديدة'), 'الرسالة بتوضّح إن الرصيد وقت الإرسال وإن الرابط بيتحدّث تلقائيًا')
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

  console.log('7b) رابط كشف حساب المورد')
  const vend = await createVendor({ name: 'مورد <b>زيت</b>', phone: '01099998888', address: '', notes: '', openingBalance: 0 })
  const vendNoPhone = await createVendor({ name: 'مورد بدون رقم', phone: '', address: '', notes: '', openingBalance: 0 })
  await addVendorAccountEntries(vend.id, [
    { date: '2026-02-01', kind: 'opening', description: 'رصيد أول المدة', debit: 1000, credit: 0 },
    { date: '2026-02-10', kind: 'purchase', description: 'مشتريات صويا — 100 كجم × سعر 50', debit: 5000, credit: 0 },
    { date: '2026-02-12', kind: 'payment', description: 'سداد — بنك مصر', debit: 0, credit: 2000 }
  ])
  const vInfo0 = await getVendorStatementLinkInfo(vend.id, 'https://shop.example.test')
  assert(!vInfo0.enabled && vInfo0.url === null, 'المورد: قبل التفعيل مفيش رابط')
  const vLink = await createVendorStatementLink(vend.id, 'https://shop.example.test')
  assert(vLink.enabled && /^https:\/\/shop\.example\.test\/api\/s\/[A-Za-z0-9_-]{32}$/.test(vLink.url ?? ''), 'رابط المورد بتوكن عشوائي 32 حرف على نفس المسار العام')
  assert((await createVendorStatementLink(vend.id, 'https://shop.example.test')).url === vLink.url, 'استدعاء تاني بيرجّع نفس رابط المورد')
  const vWrong = await createVendorStatementLink(99999, 'https://shop.example.test').catch((e) => e)
  assert(vWrong instanceof Error, 'مورد مش موجود → خطأ')
  const vPath = pathOf(vLink.url!)
  const vRes = await get(vPath)
  const vHtml = await vRes.text()
  assert(vRes.status === 200 && vHtml.includes('كشف حساب المورد'), 'صفحة المورد 200 وعنوانها «كشف حساب المورد»')
  assert(vHtml.includes('المبلغ المستحق لك عندنا') && vHtml.includes('4,000.00'), 'الرصيد 4,000.00 بصيغة «المبلغ المستحق لك عندنا» (منظور المورد)')
  assert(!vHtml.includes('المبلغ المستحق عليك'), 'مفيش صيغة العميل في صفحة المورد')
  assert(vHtml.includes('سداد — بنك مصر') && vHtml.includes('مشتريات صويا') && vHtml.includes('رصيد سابق'), 'حركات المورد + رصيد سابق ظاهرين')
  assert(vHtml.includes('مستحق لك') && vHtml.includes('مسدّد / مخصوم'), 'أعمدة المورد: «مستحق لك» و«مسدّد / مخصوم»')
  assert(!vHtml.includes('<b>زيت</b>') && vHtml.includes('&lt;b&gt;'), 'اسم المورد متهرّب منه (لا XSS)')
  assert(!vHtml.includes('<script'), 'مفيش سكريبت في صفحة المورد')
  assert((await getVendorStatementLinkInfo(vend.id, 'https://shop.example.test')).views === 1, 'عدّاد فتح المورد = 1')
  await fetch(base + vPath, { headers: { 'user-agent': 'WhatsApp/2.24.20.80 A' } })
  assert((await getVendorStatementLinkInfo(vend.id, 'https://shop.example.test')).views === 1, 'معاينة واتساب ما زوّدتش عدّاد المورد')
  // الكشف حيّ: حركة جديدة (فاتورة مشتريات حقيقية) تظهر في نفس الرابط
  await addVendorAccountEntries(vend.id, [{ date: '2026-02-20', kind: 'payment', description: 'سداد تاني', debit: 0, credit: 4000 }])
  const vHtml2 = await (await get(vPath)).text()
  assert(vHtml2.includes('الحساب مسدّد') && vHtml2.includes('سداد تاني'), 'الكشف حيّ: بعد سداد 4000 الصفحة بتقول «الحساب مسدّد»')
  // رصيد بالسالب (مدفوع زيادة)
  await addVendorAccountEntries(vend.id, [{ date: '2026-02-21', kind: 'payment', description: 'دفعة زيادة', debit: 0, credit: 300 }])
  const vHtml3 = await (await get(vPath)).text()
  assert(vHtml3.includes('رصيد للمحل عندك') && vHtml3.includes('300.00'), 'رصيد سالب: «رصيد للمحل عندك (مدفوع زيادة)» 300.00')
  // الطرف التاني: توكن العميل مش بيفتح مورد والعكس بيتفرّق بالتوكن
  const custTokenPath = pathOf((await createStatementLink((await createCustomer({ name: 'عميل للتجربة', phone: '', address: '', notes: '', openingBalance: 50, loyaltyEnabled: true })).id, 'https://shop.example.test')).url!)
  const cHtml = await (await get(custTokenPath)).text()
  assert(cHtml.includes('كشف حساب العميل') && !cHtml.includes('كشف حساب المورد'), 'رابط العميل لسه بيفتح صفحة العميل')

  const vSent: { jid: string; text: string }[] = []
  __setFakeSocketForTests({ sendMessage: async (jid, content) => void vSent.push({ jid, text: content.text }) })
  await addVendorAccountEntries(vend.id, [{ date: '2026-02-22', kind: 'purchase', description: 'مشتريات', debit: 1300, credit: 0 }]) // رصيد 1000
  const vWa = await sendVendorStatementLinkByWhatsApp(vend.id, 'https://shop.example.test')
  assert(vWa.ok && vSent.length === 1 && vSent[0].jid === '201099998888@s.whatsapp.net', 'واتساب المورد اتبعت لرقمه')
  assert(
    vSent[0].text.includes('المبلغ المستحق لك عندنا: 1000.00 (وقت الإرسال)') && vSent[0].text.includes(vLink.url!) && vSent[0].text.includes('بيتحدّث تلقائيًا'),
    'الرسالة: الرصيد وقت الإرسال + نفس الرابط + «بيتحدّث تلقائيًا»'
  )
  console.log(vSent[0].text.split('\n').map((l) => '     ' + l).join('\n'))
  const vWaNoPhone = await sendVendorStatementLinkByWhatsApp(vendNoPhone.id, 'https://shop.example.test')
  assert(!vWaNoPhone.ok && (vWaNoPhone.error ?? '').includes('رقم'), 'مورد من غير رقم → رسالة واضحة')
  assert(!(await getVendorStatementLinkInfo(vendNoPhone.id, 'https://shop.example.test')).enabled, 'فشل الإرسال ما عملش رابط للمورد من غير رقم')
  const updated = await updateVendor(vendNoPhone.id, { name: ' مورد بدون رقم (اتعدّل) ', phone: ' 01011112222 ', address: 'العنوان', notes: 'ملاحظة' })
  assert(updated.name === 'مورد بدون رقم (اتعدّل)' && updated.phone === '01011112222' && updated.address === 'العنوان' && updated.notes === 'ملاحظة', 'تعديل المورد: الاسم والموبايل والعنوان والملاحظات (بعد تنظيف المسافات)')
  const emptyName = await updateVendor(vendNoPhone.id, { name: '  ', phone: '' }).catch((e) => e)
  assert(emptyName instanceof Error, 'تعديل المورد بدون اسم → خطأ')
  const vWa2 = await sendVendorStatementLinkByWhatsApp(vendNoPhone.id, 'https://shop.example.test')
  assert(vWa2.ok && vSent.length === 2 && vSent[1].jid === '201011112222@s.whatsapp.net' && vSent[1].text.includes('حسابك مسدّد'), 'بعد إضافة الرقم الإرسال اشتغل (حساب صفر → «حسابك مسدّد»)')
  __setFakeSocketForTests(null)
  const handlers2 = buildHandlerMap()
  assert(
    ['vendors:getStatementLink', 'vendors:createStatementLink', 'vendors:revokeStatementLink', 'vendors:sendStatementLinkWhatsApp', 'vendors:update'].every((c) => !!handlers2[c]),
    'قنوات المورد متسجّلة'
  )
  assert(
    ['vendors:getStatementLink', 'vendors:createStatementLink', 'vendors:revokeStatementLink', 'vendors:sendStatementLinkWhatsApp'].every((c) => !MUTATING_CHANNELS.has(c)) && MUTATING_CHANNELS.has('vendors:update'),
    'قنوات الرابط مش mutating (مفيش remount) وتعديل المورد mutating'
  )
  const vRenewed = await createVendorStatementLink(vend.id, 'https://shop.example.test', true)
  assert(vRenewed.url !== vLink.url && vRenewed.views === 0, 'تجديد رابط المورد = توكن جديد وعدّاد صفر')
  assert((await get(vPath)).status === 404 && (await get(pathOf(vRenewed.url!))).status === 200, 'رابط المورد القديم بطل والجديد شغال')
  await revokeVendorStatementLink(vend.id)
  assert((await get(pathOf(vRenewed.url!))).status === 404 && !(await getVendorStatementLinkInfo(vend.id, 'https://shop.example.test')).enabled, 'إلغاء رابط المورد → 404')
  const vLink3 = await createVendorStatementLink(vend.id, 'https://shop.example.test')
  await getDb().execute({ sql: "UPDATE vendors SET deleted_at = datetime('now') WHERE id = ?", args: [vend.id] })
  assert((await get(pathOf(vLink3.url!))).status === 404, 'مورد اتحذف → الرابط 404')

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
