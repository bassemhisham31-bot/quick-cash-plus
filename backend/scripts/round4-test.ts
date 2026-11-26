/**
 * اختبار جولة 2026-11-27 (ElNASR): سداد العميل على خزينة، اسم الفاتورة (غير المرحّلة والمرحّلة) والبحث بيه،
 * وأوامر المساعد الذكي (تحليل رد الـJSON + الإعدادات الجديدة + تسجيل نتيجة التنفيذ) — على قاعدة مؤقتة.
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { createCustomer, getCustomerLedger, getCustomerStatement, recordCustomerPayment } from '../src/main/services/customers'
import { checkout } from '../src/main/services/pos'
import { openDay } from '../src/main/services/cashSession'
import { listInvoices } from '../src/main/services/invoices'
import { holdInvoice, listHeldInvoices, getHeldInvoice } from '../src/main/services/heldInvoices'
import { createTreasury, listTreasuries } from '../src/main/services/treasuries'
import { getAssistantSettings, updateAssistantSettings } from '../src/main/services/settings'
import { getChatHistory, logAssistantNote, parseAssistantOutput, sanitizeAssistantActions } from '../src/main/services/assistantChat'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'round4-test')
const DB_PATH = join(DATA_DIR, 'round4-test.sqlite')
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
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.011
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
  mkdirSync(DATA_DIR, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix)
  await initDatabaseAtPath(DB_PATH)
  const warehouseId = Number(await scalar('SELECT id AS v FROM warehouses WHERE is_default = 1'))
  const adminId = Number(await scalar("SELECT id AS v FROM users WHERE username = 'admin'"))
  await openDay(adminId, 0)
  const oil = await createProduct(productInput({ name: 'زيت', barcode: 'R4-1', retailPrice: 100, costPrice: 60, openingQuantity: 50, warehouseId }))
  const line = (qty: number, price: number) => ({ productId: oil.id, name: oil.name, barcode: oil.barcode, unitPrice: price, qty, discount: 0 })

  console.log('1) سداد العميل على خزينة محددة')
  const cust = await createCustomer({ name: 'محمود أحمد', phone: '0100', address: '', notes: '', openingBalance: 1000 } as any)
  await createTreasury({ name: 'خزينة البنك', kind: 'bank', openingBalance: 0, methods: [], active: true })
  const bank = (await listTreasuries()).find((t) => t.name === 'خزينة البنك')!
  const main0 = (await listTreasuries()).find((t) => t.isDefault)!
  const afterBank = await recordCustomerPayment(cust.id, 400, 'cash', 'دفعة بنك', adminId, bank.id)
  assert(near(afterBank.balance, 600), 'الرصيد نزل 1000 → 600')
  const pay = (await getDb().execute({ sql: "SELECT * FROM payments WHERE party_type = 'customer' AND party_id = ? ORDER BY id DESC LIMIT 1", args: [cust.id] })).rows[0] as any
  assert(Number(pay.treasury_id) === bank.id && pay.method === 'card', 'الدفعة اتسجلت على الخزينة المختارة ووسيلتها بنكي (من نوع الخزينة)')
  const t1 = await listTreasuries()
  assert(near(t1.find((t) => t.id === bank.id)!.balance, 400), 'رصيد خزينة البنك زاد 400')
  assert(near(t1.find((t) => t.id === main0.id)!.balance, main0.balance), 'الخزينة الافتراضية ما اتأثرتش')
  const ledger = await getCustomerLedger(cust.id, {})
  assert(ledger.entries.some((e) => e.description.includes('خزينة البنك') && e.credit === 400), 'كشف الحساب بيكتب اسم الخزينة في السداد')
  const stmt = await getCustomerStatement(cust.id)
  assert(stmt.entries.some((e) => e.description.includes('خزينة البنك')), 'والكارت القديم كمان')
  await recordCustomerPayment(cust.id, 100, 'cash', '', adminId)
  const legacy = (await getDb().execute({ sql: "SELECT treasury_id, method FROM payments WHERE party_type = 'customer' AND party_id = ? ORDER BY id DESC LIMIT 1", args: [cust.id] })).rows[0] as any
  assert(legacy.treasury_id == null && legacy.method === 'cash', 'السداد من غير خزينة لسه شغال بوسيلة الدفع (التوافق القديم)')
  let rejected = false
  try {
    await recordCustomerPayment(cust.id, 10, 'cash', '', adminId, 999999)
  } catch {
    rejected = true
  }
  assert(rejected, 'خزينة مش موجودة = رفض')
  rejected = false
  try {
    await recordCustomerPayment(cust.id, 0, 'cash', '', adminId)
  } catch {
    rejected = true
  }
  assert(rejected, 'مبلغ صفر = رفض')

  console.log('\n2) اسم الفاتورة في المرحّلة وغير المرحّلة والبحث')
  const heldReal = await holdInvoice({ payload: { lines: [line(2, 100)] as any, discountType: 'value', discountValue: 0, customerId: cust.id, customerLabel: '', warehouseId }, total: 200 }, adminId)
  const heldWalk = await holdInvoice({ payload: { lines: [line(1, 100)] as any, discountType: 'value', discountValue: 0, customerId: null, customerLabel: 'أبو خالد', warehouseId }, total: 100 }, adminId)
  const held = await listHeldInvoices()
  assert(held.find((h) => h.id === heldReal)?.customerName === 'محمود أحمد', 'غير المرحّلة: اسم العميل المسجّل بيرجع')
  assert(held.find((h) => h.id === heldWalk)?.customerName == null && held.find((h) => h.id === heldWalk)?.customerLabel === 'أبو خالد', 'والعميل النقدي بيرجع بالاسم المكتوب (label)')
  assert((await getHeldInvoice(heldReal))?.customerName === 'محمود أحمد', 'getHeldInvoice كمان')
  const walkSale = await checkout(sale({ customerId: null, customerLabel: 'أبو خالد', lines: [line(1, 100)], paid: 100 }), adminId)
  const realSale = await checkout(sale({ customerId: cust.id, lines: [line(1, 100)], paymentMethod: 'credit', paid: 0 }), adminId)
  const filter = { search: '', dateFrom: '', dateTo: '', paymentMethod: 'all' as const, includeDeleted: false }
  const byLabel = await listInvoices({ ...filter, search: 'خالد' })
  assert(byLabel.length === 1 && byLabel[0].id === walkSale.invoiceId, 'المرحّلة: البحث بالاسم المكتوب بيلاقي فاتورة العميل النقدي')
  assert(byLabel[0].customerName === 'أبو خالد', 'وعمود العميل بيعرض الاسم المكتوب مش «عميل نقدي»')
  const byCustomer = await listInvoices({ ...filter, search: 'محمود' })
  assert(byCustomer.length === 1 && byCustomer[0].id === realSale.invoiceId && byCustomer[0].customerName === 'محمود أحمد', 'والبحث باسم العميل المسجّل لسه شغال')
  const realNumber = byCustomer[0]?.number ?? ''
  const byNumber = await listInvoices({ ...filter, search: realNumber })
  assert(realNumber !== '' && byNumber.length === 1, 'والبحث برقم الفاتورة لسه شغال')

  console.log('\n3) المساعد الذكي — إعدادات وتحليل الرد')
  const a0 = await getAssistantSettings()
  assert(a0.actionsEnabled === true && a0.confirmActions === true && a0.voiceEnabled === true && a0.voiceReplyEnabled === false, 'الافتراضي: أوامر مفعّلة + تأكيد مفعّل + مايك مفعّل + قراءة الرد مقفولة')
  const a1 = await updateAssistantSettings({ ...a0, actionsEnabled: false, confirmActions: false, voiceEnabled: false, voiceReplyEnabled: true, modelName: 'gemini-x' })
  assert(!a1.actionsEnabled && !a1.confirmActions && !a1.voiceEnabled && a1.voiceReplyEnabled && a1.modelName === 'gemini-x', 'الإعدادات الجديدة بتتحفظ وترجع')
  await updateAssistantSettings({ ...a1, actionsEnabled: true, confirmActions: true, voiceEnabled: true, voiceReplyEnabled: false })

  const p1 = parseAssistantOutput(
    '{"reply":"تمام","actions":[{"type":"pos_sale","customer":"أحمد","items":[{"name":"كولا","qty":2},{"name":"شيبسي","qty":"3","price":"5"}],"payment":"cash","finalize":true}]}'
  )
  const sale1 = p1.actions[0] as any
  assert(p1.reply === 'تمام' && sale1.type === 'pos_sale' && sale1.items.length === 2 && sale1.finalize === true, 'JSON سليم → رد + أمر بيع')
  assert(sale1.items[1].qty === 3 && sale1.items[1].price === 5 && sale1.items[0].price === null, 'الكمية والسعر النصّين بيتحوّلوا لأرقام، والسعر الفاضي = null')
  const p2 = parseAssistantOutput('```json\n{"reply":"فتحت","actions":[{"type":"navigate","view":"pos"}]}\n```')
  assert(p2.actions.length === 1 && (p2.actions[0] as any).view === 'pos', 'JSON جوه ```fence``` بيتقرا')
  const p3 = parseAssistantOutput('مبيعات النهارده 5000 جنيه')
  assert(p3.reply === 'مبيعات النهارده 5000 جنيه' && p3.actions.length === 0, 'نص عادي = رد من غير أوامر')
  const p4 = parseAssistantOutput('{"reply":"","actions":[{"type":"delete_everything"},{"type":"customer_payment","customer":"س","amount":-5},{"type":"customer_payment","customer":"س","amount":250,"treasury":"البنك"},{"type":"add_expense","category":"","amount":10}]}')
  assert(p4.actions.length === 1 && (p4.actions[0] as any).amount === 250, 'أنواع مجهولة ومبالغ سالبة ونواقص بتتشال')
  assert(p4.reply.length > 0, 'ورد فاضي مع أوامر → رد افتراضي')
  const p5 = parseAssistantOutput('{ "reply": "ده مش JSON سليم", ')
  assert(p5.actions.length === 0 && p5.reply.includes('مش JSON'), 'JSON مكسور = نص عادي')
  assert(sanitizeAssistantActions(Array.from({ length: 20 }, () => ({ type: 'navigate', view: 'pos' }))).length === 8, 'أقصى 8 أوامر في الرد الواحد')
  assert((sanitizeAssistantActions([{ type: 'pos_sale', items: [{ name: 'س', qty: 0 }, { name: '' }] }])[0] as any).items.length === 1, 'صنف بكمية صفر = كمية 1، واسم فاضي بيتشال')

  await logAssistantNote(adminId, '✅ فتحت الشاشة (pos)')
  const hist = await getChatHistory(adminId)
  assert(hist.length === 1 && hist[0].role === 'assistant' && hist[0].content.includes('فتحت'), 'نتيجة التنفيذ بتتسجل في المحادثة')

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
