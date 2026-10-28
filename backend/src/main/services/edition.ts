/**
 * نسخة العميل — بتتحدد من QCP_EDITION في ملف .env الخاص بكل عميل (deploy/add-client.sh --edition):
 *  - full (الافتراضي): كل الميزات.
 *  - retail: من غير أي حاجة تخص المطاعم — الطاولات والمطبخ والكباتن والتوصيل والوصفات والحجوزات والمناسبات
 *    وتقاريرها وقسم إعداداتها وصلاحياتها.
 *
 * الإخفاء بيتم بنفس آلية الترخيص (disabledFeatures) اللي الواجهة بتطبقها أصلًا، لكن من .env عشان يفضل ثابت
 * حتى لو اتجدد الترخيص بـset-license.sh من غير ما نكتب الميزات الموقوفة تاني.
 * جداول المطاعم بتفضل موجودة في قاعدة العميل (فاضية) لأن الـmigrations ومنطق الفواتير واحد لكل العملاء.
 */
export type Edition = 'full' | 'retail'

export const EDITIONS: readonly Edition[] = ['full', 'retail']

export function getEdition(): Edition {
  const raw = (process.env.QCP_EDITION ?? 'full').trim().toLowerCase()
  if ((EDITIONS as readonly string[]).includes(raw)) return raw as Edition
  console.warn(`⚠️  QCP_EDITION="${process.env.QCP_EDITION}" قيمة غير معروفة — بيتم استخدام النسخة الكاملة (full). القيم المسموحة: ${EDITIONS.join(', ')}`)
  return 'full'
}

/** تقارير المطاعم (نفس مفاتيح REPORT_TYPES) */
const RESTAURANT_REPORT_TYPES: readonly string[] = [
  'restaurant_sales_by_order_type',
  'restaurant_recipe_consumption',
  'restaurant_table_activity',
  'sales_by_captain'
]

/** مفاتيح الميزات الموقوفة في نسخة retail — نفس تنسيق license.features (شاشة / settings:<قسم> / report:<نوع>) */
const RETAIL_DISABLED_FEATURES: readonly string[] = [
  'restaurant',
  'restaurantTables',
  'restaurantCaptains',
  'delivery',
  'events',
  'settings:restaurant',
  ...RESTAURANT_REPORT_TYPES.map((t) => `report:${t}`)
]

/** قنوات الـRPC اللي بتتمنع كلها في نسخة retail (بادئة اسم القناة) */
const RETAIL_BLOCKED_CHANNEL_PREFIXES: readonly string[] = ['restaurant:', 'recipes:', 'delivery:', 'reservations:', 'events:']

const NOT_IN_EDITION_MESSAGE = 'الميزة دي مش متاحة في النسخة الحالية'

/** الميزات اللي النسخة بتوقفها تلقائيًا (بتتدمج مع الميزات الموقوفة بالترخيص) */
export function editionDisabledFeatures(): string[] {
  return getEdition() === 'retail' ? [...RETAIL_DISABLED_FEATURES] : []
}

/** رسالة الخطأ لو القناة دي مش جزء من نسخة العميل، أو null لو متاحة */
export function editionBlockReason(channel: string): string | null {
  if (getEdition() !== 'retail') return null
  return RETAIL_BLOCKED_CHANNEL_PREFIXES.some((p) => channel.startsWith(p)) ? NOT_IN_EDITION_MESSAGE : null
}

/** نفس الفكرة لأنواع التقارير (القناة reports:run واحدة لكل الأنواع) */
export function assertReportInEdition(type: string): void {
  if (getEdition() === 'retail' && RESTAURANT_REPORT_TYPES.includes(type)) throw new Error(NOT_IN_EDITION_MESSAGE)
}
