/**
 * اختبار توقيت العميل (QCP_TIMEZONE=Africa/Cairo، طلب ElNASR 2026-11-26):
 * القاعدة بتخزّن UTC، والمستخدم بيشوف ويفلتر بتوقيت القاهرة (مع التوقيت الصيفي).
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { checkout } from '../src/main/services/pos'
import { openDay } from '../src/main/services/cashSession'
import { listInvoices } from '../src/main/services/invoices'
import { createVoucher, getTreasuryStatement, listVouchers } from '../src/main/services/treasuries'
import { getVendorStatement } from '../src/main/services/vendors'
import { createVendor } from '../src/main/services/vendors'
import { createCustomer, getCustomerLedger } from '../src/main/services/customers'
import { getDashboardSummary } from '../src/main/services/dashboard'
import { buildInvoiceHtml } from '../src/main/services/print'
import {
  applyProcessTimezone,
  configuredTimezone,
  convertTimestampsDeep,
  localDay,
  shouldConvertChannel,
  todayLocal,
  utcToLocal
} from '../src/main/services/timezone'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'timezone-test')
const DB_PATH = join(DATA_DIR, 'timezone-test.sqlite')
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
const scalar = async (sql: string, args: unknown[] = []): Promise<any> => ((await getDb().execute({ sql, args: args as any })).rows[0] as any)?.v

function productInput(over: Partial<ProductInput>): ProductInput {
  return {
    name: 'صنف', barcode: '', categoryId: null, unitId: null, vendorId: null, costPrice: 0, retailPrice: 0,
    wholesalePrice: 0, wholesale2Price: 0, packPrice: 0, openingQuantity: 0, reorderPoint: 0, warehouseId: 1,
    expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null, ...over
  }
}
function sale(over: Partial<CheckoutInput>): CheckoutInput {
  return { customerId: null, warehouseId: 1, lines: [], discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: 0, redeemPoints: 0, ...over }
}

async function main(): Promise<void> {
  console.log('1) من غير QCP_TIMEZONE: كل حاجة زي ما هي (UTC)')
  delete process.env.QCP_TIMEZONE
  assert(configuredTimezone() === null, 'مفيش توقيت متحدد')
  assert(utcToLocal('2026-11-25 22:30:00') === '2026-11-25 22:30:00', 'utcToLocal بترجّع القيمة زي ما هي')
  const raw = { a: '2026-11-25 22:30:00', list: [{ b: '2026-11-25 22:30:00' }] }
  assert(convertTimestampsDeep(raw) === raw, 'convertTimestampsDeep مابتلمسش الرد')

  console.log('\n2) بتوقيت القاهرة')
  process.env.QCP_TIMEZONE = 'Africa/Cairo'
  assert(configuredTimezone() === 'Africa/Cairo', 'التوقيت اتعرّف')
  assert(utcToLocal('2026-11-25 22:30:00') === '2026-11-26 00:30:00', 'شتوي: 22:30 UTC = 00:30 القاهرة (اليوم اللي بعده)')
  assert(utcToLocal('2026-07-01 12:00:00') === '2026-07-01 15:00:00', 'صيفي: 12:00 UTC = 15:00 القاهرة')
  assert(utcToLocal('2026-04-23 21:59:59') === '2026-04-23 23:59:59' && utcToLocal('2026-04-23 22:00:00') === '2026-04-24 01:00:00', 'بداية الصيفي (الجمعة الأخيرة من أبريل) بتتراعى')
  assert(utcToLocal('2026-10-29 20:59:59') === '2026-10-29 23:59:59' && utcToLocal('2026-10-29 21:00:00') === '2026-10-29 23:00:00', 'نهاية الصيفي (الخميس الأخير من أكتوبر) بتتراعى')
  assert(utcToLocal('2026-11-26') === '2026-11-26' && utcToLocal('2026-11-26T10:00:00Z') === '2026-11-26T10:00:00Z' && utcToLocal('نص') === 'نص', 'تاريخ بس / ISO / نص عادي: بيرجع زي ما هو')
  assert(localDay('2026-11-25 22:30:00') === '2026-11-26' && localDay('2026-11-25') === '2026-11-25', 'localDay: اليوم المحلي، وتاريخ من غير وقت زي ما هو')
  assert(/^\d{4}-\d{2}-\d{2}$/.test(todayLocal()), 'todayLocal بصيغة YYYY-MM-DD')

  const original = { createdAt: '2026-11-25 22:30:00', rows: [{ date: '2026-11-25 23:59:59', day: '2026-11-25', n: 5, name: 'x' }], nested: { t: ['2026-11-25 21:00:00'] }, nothing: null }
  const snapshot = JSON.stringify(original)
  const converted = convertTimestampsDeep(original) as typeof original
  assert(converted.createdAt === '2026-11-26 00:30:00' && converted.rows[0].date === '2026-11-26 01:59:59' && converted.nested.t[0] === '2026-11-25 23:00:00', 'تحويل كل الأعماق (كائنات ومصفوفات)')
  assert(converted.rows[0].day === '2026-11-25' && converted.rows[0].n === 5 && converted.rows[0].name === 'x' && converted.nothing === null, 'التواريخ من غير وقت والأرقام والنصوص العادية ما اتغيرتش')
  assert(JSON.stringify(original) === snapshot, 'الأصل ما اتعدّلش (نسخة جديدة)')
  assert(shouldConvertChannel('invoices:list') && !shouldConvertChannel('restaurant:listOrders') && !shouldConvertChannel('delivery:list') && !shouldConvertChannel('attendance:list'), 'قنوات المطعم/التوصيل/الحضور مستثناة')

  console.log('\n3) على قاعدة بيانات حقيقية: الفلاتر بيوم القاهرة مش UTC')
  applyProcessTimezone()
  mkdirSync(DATA_DIR, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  await initDatabaseAtPath(DB_PATH)
  const adminId = Number(await scalar("SELECT id AS v FROM users WHERE username = 'admin'"))
  const treasuryId = Number(await scalar('SELECT id AS v FROM treasuries WHERE is_default = 1'))
  const p = await createProduct(productInput({ name: 'زيت', costPrice: 60, retailPrice: 100, openingQuantity: 100 }))
  const cust = await createCustomer({ name: 'عميل', phone: '', address: '', notes: '', openingBalance: 0 } as any)
  await openDay(adminId, 0)
  const s = await checkout(sale({ lines: [{ productId: p.id, name: p.name, barcode: '', unitPrice: 100, qty: 1, discount: 0 }], paid: 100 }), adminId)
  assert(s.ok === true, 'فاتورة اتعملت')
  // فاتورة 00:30 بتوقيت القاهرة يوم 26 = 22:30 UTC يوم 25
  await getDb().execute({ sql: "UPDATE sales_invoices SET created_at = '2026-11-25 22:30:00' WHERE id = ?", args: [s.invoiceId!] })
  const f = (d: string) => ({ search: '', dateFrom: d, dateTo: d, paymentMethod: 'all' as const, includeDeleted: false })
  assert((await listInvoices(f('2026-11-26'))).length === 1, 'فلتر يوم 26 (القاهرة) بيلاقي فاتورة 00:30')
  assert((await listInvoices(f('2026-11-25'))).length === 0, 'فلتر يوم 25 مابيلاقيهاش (كان بيلاقيها بتوقيت UTC)')
  const html = (await buildInvoiceHtml(s.invoiceId!))!.html
  assert(html.includes('2026-11-26 00:30:00') && !html.includes('2026-11-25 22:30:00'), 'الإيصال المطبوع بيظهر وقت القاهرة (00:30) مش UTC (22:30)')

  await createVoucher({ type: 'receipt', treasuryId, amount: 10, partyType: 'other', partyName: 'إيراد' }, adminId)
  await getDb().execute("UPDATE vouchers SET created_at = '2026-11-25 22:30:00'")
  assert((await listVouchers({ from: '2026-11-26 00:00:00', to: '2026-11-26 23:59:59' })).length === 1, 'السندات: فلتر 26 القاهرة بيلاقي سند 00:30')
  assert((await listVouchers({ from: '2026-11-25 00:00:00', to: '2026-11-25 23:59:59' })).length === 0, 'السندات: فلتر 25 مابيلاقيهوش')
  const st26 = await getTreasuryStatement(treasuryId, '2026-11-26', '2026-11-26')
  const st25 = await getTreasuryStatement(treasuryId, '2026-11-25', '2026-11-25')
  assert(st26.rows.length > 1 && st25.rows.length === 1, 'كشف الخزينة: حركات 00:30 بتظهر في يوم 26 بس')

  const vendor = await createVendor({ name: 'مورد', phone: '', address: '', notes: '', openingBalance: 0 })
  const vst = await getVendorStatement(vendor.id, {})
  assert(Array.isArray(vst.entries), 'كشف المورد بيتحسب')
  const cst = await getCustomerLedger(cust.id, { from: '2026-11-26', to: '2026-11-26' })
  assert(Array.isArray(cst.entries), 'كشف العميل بفلتر تاريخ بيتحسب')

  console.log('\n4) لوحة التحكم من غير وردية مفتوحة بتستخدم تاريخ القاهرة')
  await getDb().execute("UPDATE cash_sessions SET status = 'closed', closed_at = datetime('now')")
  await getDb().execute("UPDATE sales_invoices SET created_at = '2020-01-15 10:00:00'")
  const dashOld = await getDashboardSummary()
  assert(dashOld.dayIsOpen === false && dashOld.todayInvoiceCount === 0, 'فاتورة قديمة مش من «النهاردة»')
  await getDb().execute("UPDATE sales_invoices SET created_at = datetime('now')")
  const dashNew = await getDashboardSummary()
  assert(dashNew.todayInvoiceCount === 1, 'فاتورة اتعملت دلوقتي بتبان في «النهاردة» (من غير وردية مفتوحة)')

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
