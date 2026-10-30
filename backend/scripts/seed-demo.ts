/**
 * بيانات النسخة التجريبية (demo.qcplus.app): سوبر ماركت + مطعم + كل ميزات النظام، بتتعمل من خلال دوال التطبيق نفسها
 * (دوال create وcheckout وcloseOrder) فكل الأرصدة والمخزون والقيود متسقة زي لو اتدخلت من الواجهة.
 *
 * التشغيل (والتطبيق مقفول تمامًا — ماتفتحش قاعدة حية من عملية تانية):
 *   QCP_DATA_DIR=<مجلد-القاعدة> QCP_ADMIN_PASSWORD=<باسورد-الأدمن> npx tsx scripts/seed-demo.ts
 * بيرفض يشتغل لو القاعدة فيها فواتير بيع بالفعل (علشان ما يتكررش) — deploy/reset-demo.sh بيمسح القاعدة قبله.
 */
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createCategory, createProduct, createWarehouse, listCategories, listUnits } from '../src/main/services/catalog'
import { createVendor, recordVendorPayment } from '../src/main/services/vendors'
import { createCustomer, recordCustomerPayment } from '../src/main/services/customers'
import { closeDay, getOpenSession, openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { createPurchaseInvoice } from '../src/main/services/purchases'
import { transferStock } from '../src/main/services/stockTransfer'
import { createExpense, createExpenseCategory } from '../src/main/services/expenses'
import { createTransfer, createVoucher, listTreasuries } from '../src/main/services/treasuries'
import { holdInvoice } from '../src/main/services/heldInvoices'
import { createSalesRep } from '../src/main/services/salesReps'
import { createEmployee, recordEmployeeTransaction } from '../src/main/services/employees'
import { createUser } from '../src/main/services/users'
import { updateRestaurantSettings, updateStoreSettings, upsertCaptain, upsertDeliveryDriver } from '../src/main/services/settings'
import { upsertDeliveryZone } from '../src/main/services/deliveryTracking'
import { addItemsToOrder, closeOrder, openOrder, upsertTable } from '../src/main/services/restaurant'
import { setRecipe } from '../src/main/services/recipes'
import { createReservation } from '../src/main/services/reservations'
import { saveBooking, upsertPackage } from '../src/main/services/events'
import type { CartLine, PaymentMethod, ProductInput, PurchaseLineInput } from '../src/shared/types'

const DATA_DIR = process.env.QCP_DATA_DIR ?? join(process.cwd(), 'data', 'demo-seed')
const DB_PATH = join(DATA_DIR, 'quick-cash-plus.sqlite')

// ---------- أدوات مساعدة ----------
const rnd = (min: number, max: number): number => Math.random() * (max - min) + min
const rndInt = (min: number, max: number): number => Math.floor(rnd(min, max + 1))
const pick = <T,>(arr: T[]): T => arr[rndInt(0, arr.length - 1)]
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(rndInt(0, copy.length - 1), 1)[0])
  return out
}
const pad = (x: number): string => String(x).padStart(2, '0')
const egyPhone = (): string => pick(['010', '011', '012', '015']) + Array.from({ length: 8 }, () => rndInt(0, 9)).join('')
function imageFor(color: string, letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" rx="28" fill="${color}"/><text x="120" y="150" font-size="100" font-family="Segoe UI, Tahoma, Arial, sans-serif" fill="#ffffff" text-anchor="middle">${letter}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}
function daysAgo(n: number, hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, rndInt(0, 59), 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
/** تاريخ (YYYY-MM-DD) بعد/قبل عدد أيام من النهارده */
function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const r2 = (n: number): number => Math.round(n * 100) / 100

// ---------- بيانات السوبر ماركت ----------
const CATEGORIES = [
  { name: 'مواد غذائية', color: '#c0392b', letter: 'غ', unit: 'قطعة', price: [15, 90], margin: [0.15, 0.3] },
  { name: 'ألبان وأجبان', color: '#2980b9', letter: 'ل', unit: 'قطعة', price: [20, 120], margin: [0.15, 0.28] },
  { name: 'مشروبات', color: '#16a085', letter: 'م', unit: 'قطعة', price: [10, 60], margin: [0.2, 0.35] },
  { name: 'منظفات ومنزلية', color: '#8e44ad', letter: 'ن', unit: 'قطعة', price: [15, 150], margin: [0.2, 0.4] },
  { name: 'عناية شخصية', color: '#d35400', letter: 'ع', unit: 'قطعة', price: [20, 200], margin: [0.2, 0.4] },
  { name: 'خضروات وفاكهة', color: '#27ae60', letter: 'خ', unit: 'كيلو', price: [8, 45], margin: [0.2, 0.4] },
  { name: 'لحوم ودواجن ومجمدات', color: '#7f1d1d', letter: 'ح', unit: 'كيلو', price: [80, 400], margin: [0.1, 0.2] },
  { name: 'مخبوزات', color: '#b7950b', letter: 'خب', unit: 'قطعة', price: [10, 60], margin: [0.2, 0.35] },
  { name: 'بقالة جافة', color: '#34495e', letter: 'ب', unit: 'قطعة', price: [15, 150], margin: [0.15, 0.3] },
  { name: 'حلويات وشيكولاتة', color: '#e67e22', letter: 'ح', unit: 'قطعة', price: [10, 100], margin: [0.2, 0.4] }
] as const

const PRODUCTS: Record<string, string[]> = {
  'مواد غذائية': ['أرز أبو كاس', 'سكر خشن', 'زيت عافية', 'مكرونة ريجينا', 'دقيق أطلس', 'عدس أصفر', 'فول مدمس', 'طحينة', 'صلصة طماطم', 'ملح طعام'],
  'ألبان وأجبان': ['لبن جهينة كامل الدسم', 'لبن المراعي', 'جبنة رومي', 'جبنة قريش', 'جبنة فيتا', 'زبادي طبيعي', 'زبدة بلدي', 'قشطة', 'جبنة شيدر', 'جبنة موزاريلا'],
  'مشروبات': ['مياه معدنية باراغوا', 'بيبسي', 'كوكاكولا', 'سفن أب', 'شاي ليبتون', 'نسكافيه', 'عصير جهينة', 'عصير روبي', 'شاي العروسة', 'مشروب طاقة'],
  'منظفات ومنزلية': ['صابون فيري', 'ديتول مطهر', 'برسيل غسيل', 'أومو غسيل', 'كلوركس', 'منظف أرضيات', 'فوط مطبخ', 'شامبو أطباق', 'كيس زبالة', 'اسفنجة جلي'],
  'عناية شخصية': ['شامبو هيد اند شولدرز', 'معجون سيجنال', 'فرشاة أسنان', 'صابون دوف', 'كريم نيفيا', 'ديودرانت ريكسونا', 'شفرات جيليت', 'مناديل ورقية', 'حفاضات بامبرز', 'كريم حلاقة'],
  'خضروات وفاكهة': ['طماطم', 'بطاطس', 'بصل', 'خيار', 'جزر', 'كوسة', 'باذنجان', 'فلفل ألوان', 'ثوم', 'موز'],
  'لحوم ودواجن ومجمدات': ['فراخ كاملة', 'صدور فراخ', 'لحم بقري مفروم', 'كبدة', 'لحم ضاني', 'سمك بلطي', 'جمبري مجمد', 'فراخ فيليه', 'سجق', 'لانشون'],
  'مخبوزات': ['عيش فينو', 'توست بيتي', 'كرواسون', 'خبز أسمر', 'كعك يابس', 'بسكويت شاي', 'دونات', 'بقسماط', 'كيك فانيليا', 'مافن'],
  'بقالة جافة': ['مكسرات مشكلة', 'بيض كرتونة', 'تونة معلبة', 'فول معلب', 'ذرة معلبة', 'زيتون معلب', 'مربى فراولة', 'كاتشب', 'مايونيز', 'شيبس'],
  'حلويات وشيكولاتة': ['شوكولاتة جالاكسي', 'شوكولاتة كيت كات', 'بسكويت أوريو', 'حلاوة طحينية', 'لدو', 'بونبون', 'جيلي', 'مارشميلو', 'ويفر', 'بسكويت محشي']
}

const VENDOR_NAMES = [
  'شركة الأغذية الحديثة - القاهرة', 'مؤسسة الألبان المتحدة - الجيزة', 'مجموعة المشروبات الوطنية - الإسكندرية', 'مصنع المنظفات الذهبي - المنصورة',
  'شركة مستلزمات التجميل - طنطا', 'مؤسسة الخضار والفاكهة - الزقازيق', 'شركة اللحوم والدواجن - أسيوط', 'مخابز النور للتوزيع - دمياط',
  'مجموعة البقالة الشاملة - بورسعيد', 'مصنع الحلويات الشرقية - الفيوم', 'شركة التوريدات العامة - القاهرة', 'مؤسسة الأمل للتجارة - الجيزة'
]
const FIRST = ['أحمد', 'محمد', 'محمود', 'مصطفى', 'عمر', 'يوسف', 'إبراهيم', 'خالد', 'طارق', 'هشام', 'كريم', 'وليد', 'فاطمة', 'مريم', 'سارة', 'نور', 'هبة', 'داليا', 'ياسمين', 'منى']
const LAST = ['السيد', 'عبد الرحمن', 'محمود', 'إبراهيم', 'حسن', 'علي', 'يوسف', 'عبد الله', 'سليمان', 'عبد العزيز', 'فتحي', 'رمضان', 'الشريف', 'البدوي']
const AREAS = ['وسط البلد', 'المعادي', 'المهندسين', 'مدينة نصر', 'الحي السابع', 'حدائق الأهرام', 'الدقي', 'مصر الجديدة']

// ---------- منيو المطعم ----------
const MENU: { cat: string; color: string; letter: string; items: [string, number][] }[] = [
  { cat: 'مقبلات', color: '#2e7d32', letter: 'م', items: [['حمص بالطحينة', 45], ['بابا غنوج', 50], ['سلطة خضراء', 40], ['سلطة تبولة', 55], ['ورق عنب', 70], ['كبة مقلية', 80]] },
  { cat: 'مشويات', color: '#b23a1e', letter: 'ش', items: [['كفتة مشوية', 180], ['كباب لحم', 220], ['نصف فرخة مشوية', 150], ['ريش ضاني', 320], ['شيش طاووق', 170], ['مشاوي مشكلة', 380]] },
  { cat: 'مشروبات ساخنة وباردة', color: '#0277bd', letter: 'ع', items: [['عصير برتقال', 40], ['ليمون بالنعناع', 35], ['قهوة تركي', 30], ['شاي', 20], ['مياه غازية', 25], ['مياه معدنية', 15]] },
  { cat: 'حلويات', color: '#ad1457', letter: 'ح', items: [['كنافة بالقشطة', 70], ['أم علي', 65], ['بسبوسة', 45], ['أرز بلبن', 40], ['جلاش بالمكسرات', 75], ['آيس كريم', 50]] }
]
/** وصفات: طبق ← مكونات من المخزن (الاسم، الكمية للطبق) */
const RECIPES: Record<string, [string, number][]> = {
  'كفتة مشوية': [['لحم بقري مفروم', 0.25], ['بصل', 0.05]],
  'كباب لحم': [['لحم بقري مفروم', 0.3]],
  'شيش طاووق': [['فراخ فيليه', 0.3]],
  'سلطة خضراء': [['طماطم', 0.1], ['خيار', 0.1]],
  'أم علي': [['لبن المراعي', 0.2]]
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  console.log('فتح قاعدة البيانات:', DB_PATH)
  await initDatabaseAtPath(DB_PATH)
  const db = getDb()

  const already = Number(((await db.execute('SELECT COUNT(*) AS c FROM sales_invoices')).rows[0] as any).c)
  if (already > 0) throw new Error('القاعدة فيها فواتير بيع بالفعل — امسحها الأول (deploy/reset-demo.sh) قبل ما تعمل بيانات الديمو')

  const adminId = Number(((await db.execute("SELECT id FROM users WHERE username = 'admin' LIMIT 1")).rows[0] as any).id)
  const warehouseId = Number(((await db.execute('SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1')).rows[0] as any).id)

  // رصيد افتتاحي للخزائن: مشتريات آخر 3 أسابيع أكبر من المبيعات النقدية فمن غيره الخزينة بتبان بالسالب
  const trs = (await db.execute('SELECT id FROM treasuries WHERE deleted_at IS NULL ORDER BY is_default DESC, id')).rows as any[]
  if (trs[0]) await db.execute({ sql: 'UPDATE treasuries SET opening_balance = 150000 WHERE id = ?', args: [Number(trs[0].id)] })
  if (trs[1]) await db.execute({ sql: 'UPDATE treasuries SET opening_balance = 60000 WHERE id = ?', args: [Number(trs[1].id)] })

  // ---------- إعدادات المتجر والمطعم ----------
  await updateStoreSettings({
    name: 'Quick Cash Plus — نسخة تجريبية',
    phone: '01000000000',
    address: 'القاهرة - مصر',
    website: 'https://demo.qcplus.app',
    thankYouMessage: 'شكرًا لزيارتكم — نسخة تجريبية من Quick Cash Plus',
    logoDataUrl: null
  })
  await updateRestaurantSettings({
    dineInEnabled: true,
    takeawayEnabled: true,
    deliveryEnabled: true,
    recipesEnabled: true,
    serviceChargeEnabled: true,
    serviceChargeType: 'percent',
    serviceChargeValue: 12,
    defaultKitchenPrinter: null,
    taxEnabled: false,
    taxName: 'ضريبة',
    taxType: 'percent',
    taxValue: 0,
    taxDineIn: false,
    taxTakeaway: false,
    taxDelivery: false,
    autoNewOrderAfterKitchen: true,
    kitchenNotifyMode: 'all'
  } as any)

  // ---------- مستخدم كاشير للتجربة ----------
  try {
    await createUser({
      username: 'cashier',
      password: 'cashier123',
      fullName: 'أحمد الكاشير',
      role: 'cashier',
      permissions: ['pos.sell', 'pos.discount', 'customers.manage', 'invoices.manage', 'shifts.view', 'restaurant.manage']
    })
  } catch (err: any) {
    console.warn('مستخدم الكاشير:', err?.message)
  }

  // ---------- التصنيفات والمنتجات ----------
  const units = await listUnits()
  const unitId = new Map(units.map((u) => [u.name, u.id]))
  const categoryId = new Map((await listCategories()).map((c) => [c.name, c.id]))
  for (const c of CATEGORIES) if (!categoryId.has(c.name)) categoryId.set(c.name, (await createCategory(c.name, null)).id)
  for (const name of ['خدمات', ...MENU.map((m) => m.cat)]) if (!categoryId.has(name)) categoryId.set(name, (await createCategory(name, null)).id)

  console.log('الموردين والعملاء والمحلات المسوّقة...')
  const vendorIds: number[] = []
  for (const name of VENDOR_NAMES) {
    vendorIds.push((await createVendor({ name, phone: egyPhone(), address: name.split(' - ')[1] ?? 'القاهرة', notes: '', openingBalance: 0 })).id)
  }
  const customerIds: number[] = []
  for (let i = 0; i < 30; i++) {
    const c = await createCustomer({
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
      phone: egyPhone(),
      address: pick(AREAS),
      notes: '',
      openingBalance: 0
    })
    customerIds.push(c.id)
  }
  const reps = [
    await createSalesRep({ name: 'محل النور للموبايلات', phone: egyPhone(), commissionPercent: 10 }),
    await createSalesRep({ name: 'محل الأمل', phone: egyPhone(), commissionPercent: 8 }),
    await createSalesRep({ name: 'مكتبة السلام', phone: egyPhone(), commissionPercent: 5 })
  ]

  console.log('المنتجات...')
  interface P { id: number; name: string; barcode: string; cost: number; retail: number }
  const products: P[] = []
  const byName = new Map<string, P>()
  const baseInput = (over: Partial<ProductInput>): ProductInput => ({
    name: '', barcode: '', categoryId: null, unitId: null, vendorId: null, costPrice: 0, retailPrice: 0, wholesalePrice: 0, wholesale2Price: 0,
    packPrice: 0, openingQuantity: 0, reorderPoint: 5, warehouseId, expiryDate: null, serialNumber: null, showInPos: true,
    serialTrackingEnabled: false, imageDataUrl: null, ...over
  })
  for (const c of CATEGORIES) {
    for (const name of PRODUCTS[c.name]) {
      const cost = r2(rnd(c.price[0], c.price[1]))
      const retail = r2(cost * (1 + rnd(c.margin[0], c.margin[1])))
      const low = Math.random() < 0.15
      const kg = c.unit === 'كيلو'
      const p = await createProduct(
        baseInput({
          name,
          categoryId: categoryId.get(c.name) ?? null,
          unitId: unitId.get(c.unit) ?? null,
          vendorId: pick(vendorIds),
          costPrice: cost,
          retailPrice: retail,
          openingQuantity: low ? rndInt(11, 16) : kg ? rndInt(20, 80) : rndInt(25, 160),
          reorderPoint: kg ? 5 : 10,
          imageDataUrl: imageFor(c.color, c.letter),
          // أغلب الأصناف بتتسجل في "مطلوب شراؤه" لما توصل للحد الأدنى، وقليل منها كل قطعة تتباع
          purchaseMode: Math.random() < 0.85 ? 'min_stock' : 'every_sale'
        })
      )
      const item = { id: p.id, name, barcode: p.barcode, cost, retail }
      products.push(item)
      byName.set(name, item)
    }
  }

  // خدمات (من غير مخزون): سعر ثابت + خدمة بعمولة بتتكتب وقت البيع
  const svcCat = categoryId.get('خدمات') ?? null
  const svcFixed1 = await createProduct(baseInput({ name: 'تركيب شاشة حماية', categoryId: svcCat, retailPrice: 50, isService: true, imageDataUrl: imageFor('#455a64', 'ت') }))
  const svcFixed2 = await createProduct(baseInput({ name: 'كشف أعطال', categoryId: svcCat, retailPrice: 100, isService: true, imageDataUrl: imageFor('#546e7a', 'ك') }))
  const svcCommission = await createProduct(
    baseInput({ name: 'سحب فودافون كاش', categoryId: svcCat, isService: true, commissionEnabled: true, commissionPercent: 1, commissionMin: 5, imageDataUrl: imageFor('#e53935', 'ف') })
  )

  // ---------- المطعم: ترابيزات، كباتن، سواقين، مناطق توصيل، منيو ووصفات ----------
  console.log('المطعم...')
  const tableIds: number[] = []
  const layout: [string, string, number, number, number][] = [
    ['1', 'الصالة', 4, 90, 90], ['2', 'الصالة', 4, 260, 90], ['3', 'الصالة', 2, 430, 90], ['4', 'الصالة', 6, 600, 90],
    ['5', 'الصالة', 4, 90, 260], ['6', 'الصالة', 4, 260, 260], ['7', 'الصالة', 8, 430, 260], ['8', 'الصالة', 2, 600, 260],
    ['T1', 'التراس', 4, 90, 450], ['T2', 'التراس', 4, 260, 450], ['T3', 'التراس', 6, 430, 450], ['T4', 'التراس', 2, 600, 450]
  ]
  for (const [name, zone, seats, x, y] of layout) {
    tableIds.push((await upsertTable({ name, zone, seats, posX: x, posY: y, shape: seats >= 6 ? 'rect' : seats <= 2 ? 'round' : 'square' })).id)
  }
  const captainIds = [
    (await upsertCaptain({ name: 'الكابتن محمد', phone: egyPhone(), active: true })).id,
    (await upsertCaptain({ name: 'الكابتن علي', phone: egyPhone(), active: true })).id,
    (await upsertCaptain({ name: 'الكابتن سارة', phone: egyPhone(), active: true })).id
  ]
  const driverIds = [
    (await upsertDeliveryDriver({ name: 'السواق حسن', phone: egyPhone(), active: true })).id,
    (await upsertDeliveryDriver({ name: 'السواق مصطفى', phone: egyPhone(), active: true })).id
  ]
  for (const [name, fee] of [['المنطقة القريبة', 15], ['وسط البلد', 25], ['المناطق البعيدة', 40]] as [string, number][]) {
    await upsertDeliveryZone({ name, fee, active: true })
  }
  const dishes: P[] = []
  for (const section of MENU) {
    for (const [name, price] of section.items) {
      const p = await createProduct(
        baseInput({
          name,
          categoryId: categoryId.get(section.cat) ?? null,
          costPrice: r2(price * 0.4),
          retailPrice: price,
          reorderPoint: 0,
          imageDataUrl: imageFor(section.color, section.letter),
          purchaseMode: 'none'
        })
      )
      dishes.push({ id: p.id, name, barcode: p.barcode, cost: r2(price * 0.4), retail: price })
    }
  }
  for (const [dish, ingredients] of Object.entries(RECIPES)) {
    const d = dishes.find((x) => x.name === dish)
    const items = ingredients.map(([n, q]) => ({ rawMaterialProductId: byName.get(n)?.id ?? 0, qtyPerUnit: q })).filter((i) => i.rawMaterialProductId)
    if (d && items.length) await setRecipe(d.id, items)
  }

  // ---------- الحسابات: موظفين ومصروفات ----------
  const expenseCategoryIds: number[] = []
  for (const name of ['كهرباء ومياه', 'إيجار', 'رواتب', 'صيانة', 'مواصلات', 'نظافة']) expenseCategoryIds.push((await createExpenseCategory(name)).id)
  const employees = [
    await createEmployee({ name: 'محمود السيد', phone: egyPhone(), role: 'كاشير', baseSalary: 5500 }),
    await createEmployee({ name: 'منى عبد الله', phone: egyPhone(), role: 'محاسبة', baseSalary: 7000 }),
    await createEmployee({ name: 'عمرو حسن', phone: egyPhone(), role: 'عامل مخزن', baseSalary: 4500 }),
    await createEmployee({ name: 'هبة إبراهيم', phone: egyPhone(), role: 'شيف', baseSalary: 9000 })
  ]
  await recordEmployeeTransaction({ employeeId: employees[0].id, type: 'advance', amount: 800, note: 'سلفة' }, adminId)
  await recordEmployeeTransaction({ employeeId: employees[1].id, type: 'bonus', amount: 500, note: 'مكافأة أداء' }, adminId)
  await recordEmployeeTransaction({ employeeId: employees[2].id, type: 'deduction', amount: 150, note: 'غياب' }, adminId)

  // ---------- الحركة: آخر 20 يوم ----------
  console.log('حركة البيع والشراء والمطعم...')
  const dayOffsets = pickN(Array.from({ length: 20 }, (_, i) => i + 1), 14).sort((a, b) => b - a)
  let nSales = 0
  let nPurchases = 0
  let nRestaurant = 0
  const cashMethods: PaymentMethod[] = ['cash', 'cash', 'cash', 'card', 'wallet', 'vodafone_cash']
  const line = (p: { id: number; name: string; barcode: string }, qty: number, unitPrice: number, discount = 0, extra: Partial<CartLine> = {}): CartLine => ({
    productId: p.id, name: p.name, barcode: p.barcode, unitPrice, qty, discount, ...extra
  })
  /** الفاتورة المدفوعة: المدفوع = الإجمالي بالظبط (الخصم/الخدمة/الإكرامية بتتحسب جوه checkout) */
  const settle = async (invoiceId: number): Promise<void> => {
    await db.execute({
      sql: "UPDATE sales_invoices SET paid = total WHERE id = ? AND payment_method NOT IN ('credit', 'mixed')",
      args: [invoiceId]
    })
  }
  const backdateInvoice = async (invoiceId: number, ts: string): Promise<void> => {
    await db.execute({ sql: 'UPDATE sales_invoices SET created_at = ? WHERE id = ?', args: [ts, invoiceId] })
    await db.execute({ sql: "UPDATE stock_movements SET created_at = ? WHERE ref_type = 'sales_invoice' AND ref_id = ?", args: [ts, invoiceId] })
    await db.execute({ sql: 'UPDATE purchase_requests SET created_at = ? WHERE sales_invoice_id = ?', args: [ts, invoiceId] })
  }

  for (const dayOffset of dayOffsets) {
    const session = await openDay(adminId, rndInt(300, 800))
    await db.execute({ sql: 'UPDATE cash_sessions SET opened_at = ? WHERE id = ?', args: [daysAgo(dayOffset, rndInt(9, 10), rndInt(0, 59)), session.id] })

    // مشتريات (0-2): جزء منها آجل بتاريخ سداد (قديم ومستقبلي) عشان تقرير مواعيد السداد يبان
    for (let p = 0; p < rndInt(0, 2); p++) {
      const lines: PurchaseLineInput[] = pickN(products, rndInt(3, 7)).map((x) => ({ productId: x.id, name: x.name, barcode: x.barcode, qty: rndInt(10, 60), purchasePrice: x.cost }))
      const method = pick(['cash', 'cash', 'credit', 'credit', 'card'] as const)
      const total = lines.reduce((s, l) => s + l.qty * l.purchasePrice, 0)
      const paid = method === 'credit' ? r2(total * pick([0, 0, 0.5])) : total
      const res = await createPurchaseInvoice(
        { vendorId: pick(vendorIds), warehouseId, lines, paymentMethod: method, paid, note: '', dueDate: method === 'credit' ? dateOffset(rndInt(-12, 35)) : null },
        adminId
      )
      if (res.ok && res.purchaseId) {
        const ts = daysAgo(dayOffset, rndInt(10, 16), rndInt(0, 59))
        await db.execute({ sql: 'UPDATE purchase_invoices SET created_at = ? WHERE id = ?', args: [ts, res.purchaseId] })
        await db.execute({ sql: "UPDATE stock_movements SET created_at = ? WHERE ref_type = 'purchase_invoice' AND ref_id = ?", args: [ts, res.purchaseId] })
        nPurchases++
      }
    }

    // مبيعات السوبر ماركت (3-6): نقدي/بنكي/محفظة، دفع مقسّم، آجل بتاريخ استحقاق، محل مسوّق، خدمات
    for (let s = 0; s < rndInt(3, 6); s++) {
      const customerId = Math.random() < 0.55 ? pick(customerIds) : null
      const lines = pickN(products, rndInt(1, 5)).map((x) => line(x, rndInt(1, 4), x.retail, Math.random() < 0.15 ? r2(x.retail * 0.05) : 0))
      const gross = lines.reduce((sum, l) => sum + l.qty * l.unitPrice - l.discount, 0)
      const salesRepId = Math.random() < 0.25 ? pick(reps).id : undefined
      const kind = customerId ? pick(['cash', 'cash', 'split', 'credit', 'credit']) : pick(['cash', 'cash', 'card', 'split'])
      let input: Parameters<typeof checkout>[0]
      const base = { customerId, warehouseId, lines, discountType: 'value' as const, discountValue: 0, redeemPoints: 0, salesRepId }
      if (kind === 'credit') {
        input = { ...base, paymentMethod: 'credit', paid: 0, dueDate: dateOffset(rndInt(-15, 40)) }
      } else if (kind === 'split') {
        const first = r2(gross * pick([0.4, 0.5, 0.6]))
        const second = r2((gross - first) * (customerId ? pick([0.5, 1]) : 1))
        input = { ...base, paymentMethod: 'mixed', paid: first + second, payments: [{ method: 'cash', amount: first }, { method: pick(['vodafone_cash', 'instapay', 'card'] as const), amount: second }], dueDate: dateOffset(rndInt(5, 30)) }
        if (!customerId && Math.abs(first + second - gross) > 0.01) input = { ...base, paymentMethod: 'cash', paid: gross }
      } else {
        input = { ...base, paymentMethod: kind === 'card' ? 'card' : pick(cashMethods), paid: r2(gross) }
      }
      const res = await checkout(input, adminId)
      if (res.ok && res.invoiceId) {
        await settle(res.invoiceId)
        await backdateInvoice(res.invoiceId, daysAgo(dayOffset, rndInt(10, 22), rndInt(0, 59)))
        nSales++
      } else if (!res.ok) console.warn('فاتورة بيع فشلت:', res.error)
    }

    // خدمات (0-2 في اليوم): تركيب/كشف بسعر ثابت، وسحب فودافون كاش بعمولة مكتوبة
    for (let s = 0; s < rndInt(0, 2); s++) {
      const kind = pick(['fixed', 'commission', 'commission'])
      const lines: CartLine[] =
        kind === 'fixed'
          ? [line(pick([svcFixed1, svcFixed2]) as any, 1, 0, 0)]
          : (() => {
              const amount = pick([500, 1000, 1500, 2000, 3000])
              const fee = pick([5, 7, 10, 15, 20, 30])
              return [line(svcCommission as any, 1, fee, 0, { isService: true, isCommission: true, serviceAmount: amount, note: `مبلغ العملية: ${amount}` })]
            })()
      if (kind === 'fixed') {
        const svc = lines[0].productId === svcFixed1.id ? svcFixed1 : svcFixed2
        lines[0] = line(svc as any, 1, svc.retailPrice, 0, { isService: true })
      }
      const total = lines[0].unitPrice
      const res = await checkout({ customerId: null, warehouseId, lines, discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: total, redeemPoints: 0 }, adminId)
      if (res.ok && res.invoiceId) {
        await settle(res.invoiceId)
        await backdateInvoice(res.invoiceId, daysAgo(dayOffset, rndInt(10, 22), rndInt(0, 59)))
        nSales++
      }
    }

    // المطعم (2-4 طلبات/يوم): صالة وتيك أواي وديلفري
    for (let o = 0; o < rndInt(2, 4); o++) {
      const orderType = pick(['dine_in', 'dine_in', 'dine_in', 'takeaway', 'delivery'] as const)
      const customerId = orderType === 'delivery' ? pick(customerIds) : null
      const opened = await openOrder(
        {
          orderType,
          tableIds: orderType === 'dine_in' ? [pick(tableIds)] : undefined,
          customerId,
          deliveryAddress: orderType === 'delivery' ? `${pick(AREAS)} - شارع ${rndInt(1, 40)}` : undefined,
          deliveryDriverId: orderType === 'delivery' ? pick(driverIds) : null,
          captainId: orderType === 'dine_in' ? pick(captainIds) : null
        },
        adminId
      )
      if (!opened.ok || !opened.orderId) continue
      const items = pickN(dishes, rndInt(2, 5)).map((d) => ({ productId: d.id, name: d.name, qty: rndInt(1, 3), unitPrice: d.retail, note: '' }))
      await addItemsToOrder(opened.orderId, items)
      const closed = await closeOrder(
        { orderId: opened.orderId, customerId, warehouseId, discountType: 'value', discountValue: 0, paymentMethod: pick(['cash', 'cash', 'card', 'vodafone_cash'] as PaymentMethod[]), paid: 0 },
        adminId
      )
      if (closed.ok && closed.invoiceId) {
        const ts = daysAgo(dayOffset, rndInt(12, 23), rndInt(0, 59))
        await settle(closed.invoiceId)
        await backdateInvoice(closed.invoiceId, ts)
        await db.execute({ sql: 'UPDATE restaurant_orders SET created_at = ? WHERE id = ?', args: [ts, opened.orderId] })
        nRestaurant++
      } else console.warn('قفل طلب مطعم فشل:', closed.error)
    }

    // مصروفات اليوم
    for (let e = 0; e < rndInt(1, 2); e++) {
      const res = await createExpense({ categoryId: pick(expenseCategoryIds), amount: rndInt(40, 700), method: pick(['cash', 'cash', 'card'] as const), note: 'مصروف تشغيل' }, adminId)
      if (res.ok && res.expense) await db.execute({ sql: 'UPDATE expenses SET created_at = ? WHERE id = ?', args: [daysAgo(dayOffset, rndInt(11, 20), rndInt(0, 59)), res.expense.id] })
    }

    const open = await getOpenSession()
    if (open) {
      await closeDay(adminId, rndInt(300, 800))
      await db.execute({ sql: 'UPDATE cash_sessions SET closed_at = ? WHERE id = ?', args: [daysAgo(dayOffset, 23, rndInt(0, 59)), open.id] })
    }
  }
  console.log(`فواتير بيع: ${nSales} | مشتريات: ${nPurchases} | طلبات مطعم: ${nRestaurant}`)

  // ---------- تحصيلات وسدادات ----------
  for (const row of (await db.execute('SELECT id, balance FROM customers WHERE balance > 0 ORDER BY balance DESC LIMIT 12')).rows as any[]) {
    if (Math.random() < 0.6) await recordCustomerPayment(Number(row.id), r2(Number(row.balance) * pick([0.3, 0.5])), 'cash', 'تحصيل جزئي', adminId)
  }
  for (const row of (await db.execute('SELECT id, balance FROM vendors WHERE balance > 0 ORDER BY balance DESC LIMIT 8')).rows as any[]) {
    if (Math.random() < 0.5) await recordVendorPayment(Number(row.id), r2(Number(row.balance) * pick([0.3, 0.5])), 'cash', 'سداد جزئي', adminId)
  }

  // ---------- مخزن تاني + نقل + سندات وتحويلات ----------
  const second = await createWarehouse('مخزن الفرع')
  await transferStock({ fromWarehouseId: warehouseId, toWarehouseId: second.id, note: 'نقل تجريبي', lines: pickN(products, 12).map((p) => ({ productId: p.id, qty: rndInt(2, 6) })) }, adminId)
  const treasuries = await listTreasuries()
  const cashT = treasuries[0].id
  const bankT = (treasuries[1] ?? treasuries[0]).id
  const backdateVoucher = async (voucherId: number, ts: string): Promise<void> => {
    const v = (await db.execute({ sql: 'SELECT payment_id, expense_id FROM vouchers WHERE id = ?', args: [voucherId] })).rows[0] as any
    await db.execute({ sql: 'UPDATE vouchers SET created_at = ? WHERE id = ?', args: [ts, voucherId] })
    if (v?.payment_id) await db.execute({ sql: 'UPDATE payments SET created_at = ? WHERE id = ?', args: [ts, v.payment_id] })
    if (v?.expense_id) await db.execute({ sql: 'UPDATE expenses SET created_at = ? WHERE id = ?', args: [ts, v.expense_id] })
  }
  try {
    for (const [name, amount] of [['إيراد إيجار رف', 500], ['بيع كراتين فاضية', 120]] as [string, number][]) {
      const v = await createVoucher({ type: 'receipt', treasuryId: cashT, amount, partyType: 'other', partyName: name }, adminId)
      await backdateVoucher(v.id, daysAgo(rndInt(1, 18), 12, rndInt(0, 59)))
    }
    for (const [name, amount] of [['إنترنت الشهر', 350], ['مستلزمات مكتب', 150]] as [string, number][]) {
      const v = await createVoucher({ type: 'payment', treasuryId: cashT, amount, partyType: 'other', partyName: name, categoryId: pick(expenseCategoryIds) }, adminId)
      await backdateVoucher(v.id, daysAgo(rndInt(1, 18), 16, rndInt(0, 59)))
    }
    if (bankT !== cashT) {
      for (const d of [15, 8]) {
        await createTransfer({ fromTreasuryId: cashT, toTreasuryId: bankT, amount: rndInt(1000, 3000), note: 'إيداع بنكي' }, adminId)
        await db.execute({ sql: 'UPDATE treasury_transfers SET created_at = ? WHERE id = (SELECT MAX(id) FROM treasury_transfers)', args: [daysAgo(d, 14, 0)] })
      }
    }
  } catch (err: any) {
    console.warn('سندات/تحويلات:', err?.message)
  }

  // ---------- مناسبات وحجوزات ----------
  try {
    await upsertPackage({ name: 'حفلة عيد ميلاد', description: 'تجهيز + تورتة + ضيافة', price: 3500, priceType: 'fixed', isActive: true })
    await upsertPackage({ name: 'عشاء عائلي', description: 'بوفيه مفتوح', price: 220, priceType: 'per_person', isActive: true })
  } catch (err: any) {
    console.warn('باقات المناسبات:', err?.message)
  }

  // ---------- اليوم: وردية مفتوحة + طلبات صالة شغالة + حجوزات + فاتورتين معلقتين ----------
  console.log('اليوم المفتوح...')
  await openDay(adminId, 500)
  for (let s = 0; s < 6; s++) {
    const kind = pick(['cash', 'cash', 'card', 'split', 'credit'])
    const customerId = kind === 'split' || kind === 'credit' ? pick(customerIds) : null
    const lines = pickN(products, rndInt(1, 4)).map((x) => line(x, rndInt(1, 3), x.retail))
    const gross = r2(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0))
    const base = { customerId, warehouseId, lines, discountType: 'value' as const, discountValue: 0, redeemPoints: 0, salesRepId: Math.random() < 0.3 ? pick(reps).id : undefined }
    const input =
      kind === 'credit'
        ? { ...base, paymentMethod: 'credit' as const, paid: 0, dueDate: dateOffset(rndInt(10, 30)) }
        : kind === 'split'
          ? { ...base, paymentMethod: 'mixed' as const, paid: gross, payments: [{ method: 'cash' as const, amount: r2(gross * 0.5) }, { method: 'vodafone_cash' as const, amount: r2(gross - r2(gross * 0.5)) }] }
          : { ...base, paymentMethod: kind as 'cash' | 'card', paid: gross }
    const res = await checkout(input, adminId)
    if (res.ok && res.invoiceId) await settle(res.invoiceId)
  }
  for (let o = 0; o < 3; o++) {
    const orderType = pick(['dine_in', 'takeaway', 'delivery'] as const)
    const opened = await openOrder(
      {
        orderType,
        tableIds: orderType === 'dine_in' ? [tableIds[8 + o]] : undefined,
        customerId: orderType === 'delivery' ? pick(customerIds) : null,
        deliveryAddress: orderType === 'delivery' ? `${pick(AREAS)} - شارع ${rndInt(1, 40)}` : undefined,
        deliveryDriverId: orderType === 'delivery' ? pick(driverIds) : null,
        captainId: orderType === 'dine_in' ? pick(captainIds) : null
      },
      adminId
    )
    if (!opened.ok || !opened.orderId) continue
    await addItemsToOrder(opened.orderId, pickN(dishes, rndInt(2, 4)).map((d) => ({ productId: d.id, name: d.name, qty: rndInt(1, 2), unitPrice: d.retail, note: '' })))
    const closed = await closeOrder(
      { orderId: opened.orderId, customerId: orderType === 'delivery' ? null : null, warehouseId, discountType: 'value', discountValue: 0, paymentMethod: 'cash', paid: 0 },
      adminId
    )
    if (closed.ok && closed.invoiceId) await settle(closed.invoiceId)
  }
  for (const t of pickN(tableIds.slice(0, 8), 3)) {
    const opened = await openOrder({ orderType: 'dine_in', tableIds: [t], captainId: pick(captainIds) }, adminId)
    if (opened.ok && opened.orderId) {
      await addItemsToOrder(opened.orderId, pickN(dishes, rndInt(2, 4)).map((d) => ({ productId: d.id, name: d.name, qty: rndInt(1, 2), unitPrice: d.retail, note: '' })))
    }
  }
  try {
    const today = dateOffset(0)
    const tomorrow = dateOffset(1)
    await createReservation({ tableId: tableIds[3], customerName: 'أ. كريم عبد الله', customerPhone: egyPhone(), partySize: 5, reservationAt: `${today}T21:00`, note: 'عيد ميلاد' })
    await createReservation({ tableId: tableIds[6], customerName: 'أ. مريم السيد', customerPhone: egyPhone(), partySize: 8, reservationAt: `${tomorrow}T20:30`, note: '' })
    await createReservation({ tableId: tableIds[9], customerName: 'أ. هشام فتحي', customerPhone: egyPhone(), partySize: 4, reservationAt: `${tomorrow}T19:00`, note: 'على التراس' })
    await saveBooking(
      { customerName: 'أ. دينا محمود', customerPhone: egyPhone(), eventType: 'عيد ميلاد', honoree: 'ليلى', eventDate: dateOffset(6), eventTime: '19:00', guests: 25, packageId: null, basePrice: 3500, discount: 0, depositAmount: 1000, depositMethod: 'cash' },
      adminId
    )
  } catch (err: any) {
    console.warn('حجوزات:', err?.message)
  }
  for (let h = 0; h < 2; h++) {
    const lines = pickN(products, 3).map((p) => line(p, rndInt(1, 3), p.retail))
    await holdInvoice(
      { payload: { lines, discountType: 'value', discountValue: 0, customerId: null, customerLabel: h === 0 ? 'أ. محمود' : '', warehouseId }, total: lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) },
      adminId
    )
  }

  const count = async (sql: string): Promise<number> => Number(((await db.execute(sql)).rows[0] as any).c)
  console.log('ملخص:', {
    products: await count('SELECT COUNT(*) AS c FROM products WHERE deleted_at IS NULL'),
    sales: await count('SELECT COUNT(*) AS c FROM sales_invoices'),
    purchases: await count('SELECT COUNT(*) AS c FROM purchase_invoices'),
    toBuyPending: await count("SELECT COUNT(*) AS c FROM purchase_requests WHERE status = 'pending'"),
    creditWithDue: await count("SELECT COUNT(*) AS c FROM sales_invoices WHERE due_date IS NOT NULL"),
    splitInvoices: await count("SELECT COUNT(*) AS c FROM sales_invoices WHERE payment_method = 'mixed'"),
    serviceLines: await count('SELECT COUNT(*) AS c FROM sales_items WHERE service_amount IS NOT NULL'),
    openRestaurantOrders: await count("SELECT COUNT(*) AS c FROM restaurant_orders WHERE status = 'open'")
  })
  console.log('تم بنجاح.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('حصل خطأ:', err)
    process.exit(1)
  })
