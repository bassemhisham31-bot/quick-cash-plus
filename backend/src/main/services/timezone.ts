/**
 * توقيت العميل (QCP_TIMEZONE في .env العميل، مثلاً Africa/Cairo).
 *
 * القاعدة: قاعدة البيانات بتخزّن كل التواريخ بتوقيت UTC (datetime('now')) — وده ما بيتغيّرش أبدًا.
 * اللي بيتغيّر هو اللي المستخدم بيشوفه ويكتبه: كل تاريخ/وقت بيظهر ليه بتوقيت العميل المحلي (مع الصيفي والشتوي)،
 * وكل فترة بيختارها (من/إلى) بتتحسب على يوم العميل المحلي مش يوم UTC.
 *
 *  - العرض: ردود الـRPC بتتحوّل (convertTimestampsDeep) — أي نص بشكل «YYYY-MM-DD HH:MM:SS» بيتحوّل من UTC للمحلي.
 *  - الفلاتر والتجميع في SQL: date(col, 'localtime') بدل date(col) (السيرفر بيشتغل بنفس TZ — applyProcessTimezone).
 *  - اشتقاق اليوم في الـJS (كشوفات، قيود، رسائل): localDay() / utcToLocal() وليس .slice(0, 10) على القيمة الخام.
 *
 * لو QCP_TIMEZONE مش متحدد: كل الدوال هنا بتسيب القيم زي ما هي (سلوك UTC القديم) — فباقي العملاء ما بيتأثروش.
 */

const HOUR = 3600_000
const TS_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

let cachedRaw: string | undefined
let cachedTz: string | null = null
const formatters = new Map<string, Intl.DateTimeFormat>()
const offsets = new Map<string, number>()

/** اسم التوقيت (IANA) لو متحدد وصالح، وإلا null */
export function configuredTimezone(): string | null {
  const raw = (process.env.QCP_TIMEZONE ?? '').trim()
  if (raw === cachedRaw) return cachedTz
  cachedRaw = raw
  cachedTz = null
  if (raw) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: raw })
      cachedTz = raw
    } catch {
      console.warn(`⚠️  QCP_TIMEZONE="${raw}" توقيت غير معروف — بيتم استخدام UTC`)
    }
  }
  return cachedTz
}

/** بيخلّي العملية (و SQLite 'localtime') تشتغل بتوقيت العميل — لازم يتنادى قبل أول استعلام */
export function applyProcessTimezone(): void {
  const tz = configuredTimezone()
  // على ويندوز متغير TZ بصيغة POSIX بس (مش أسماء IANA زي Africa/Cairo) — الاسم بيتفهم غلط وبيخلّي 'localtime' = UTC،
  // فبنسيب ويندوز على توقيت الجهاز (السيرفر الحقيقي لينكس)
  if (tz && process.platform !== 'win32') process.env.TZ = tz
}

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatters.set(tz, f)
  }
  return f
}

/** فرق التوقيت (بالدقايق) عن UTC وقت لحظة معيّنة — بيراعي التوقيت الصيفي. بيتخزّن لكل ساعة (التحويل الصيفي بيحصل على ساعة كاملة). */
function offsetMinutes(tz: string, utcMs: number): number {
  const bucket = Math.floor(utcMs / HOUR)
  const key = `${tz}|${bucket}`
  const hit = offsets.get(key)
  if (hit !== undefined) return hit
  const parts = formatterFor(tz).formatToParts(new Date(bucket * HOUR))
  const num = (type: string): number => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(num('year'), num('month') - 1, num('day'), num('hour') % 24, num('minute'), num('second'))
  const off = Math.round((asUtc - bucket * HOUR) / 60_000)
  if (offsets.size > 20_000) offsets.clear()
  offsets.set(key, off)
  return off
}

const pad = (n: number): string => String(n).padStart(2, '0')

function convertWith(tz: string, s: string): string {
  const m = TS_RE.exec(s)
  if (!m) return s
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
  if (Number.isNaN(ms)) return s
  const d = new Date(ms + offsetMinutes(tz, ms) * 60_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/** «YYYY-MM-DD HH:MM:SS» (UTC من القاعدة) → توقيت العميل. أي نص تاني (تاريخ بس، ISO…) بيرجع زي ما هو. */
export function utcToLocal(s: string): string {
  const tz = configuredTimezone()
  return tz ? convertWith(tz, s) : s
}

/** يوم العميل (YYYY-MM-DD) للحظة مخزّنة بـUTC. القيم اللي مش وقت كامل (تاريخ بس) بترجع أول 10 حروف زي ما هي. */
export function localDay(s: string): string {
  return utcToLocal(s).slice(0, 10)
}

/** تاريخ النهاردة (YYYY-MM-DD) بتوقيت العميل (أو UTC لو مفيش توقيت متحدد) */
export function todayLocal(): string {
  const tz = configuredTimezone()
  if (!tz) return new Date().toISOString().slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** قنوات بترجّع قيم الواجهة بتحسب منها بـUTC (مدة الانتظار) أو أوقات من جهاز خارجي أصلاً محلية — مابنحوّلهاش */
const RAW_CHANNEL_PREFIXES = ['restaurant:', 'delivery:', 'attendance:']

export function shouldConvertChannel(channel: string): boolean {
  return !RAW_CHANNEL_PREFIXES.some((p) => channel.startsWith(p))
}

/** بيحوّل كل تواريخ UTC جوّه رد RPC (أي عمق) لتوقيت العميل. بيرجّع نسخة جديدة (مابيعدّلش الأصل). */
export function convertTimestampsDeep<T>(value: T): T {
  const tz = configuredTimezone()
  if (!tz) return value
  return walk(value, tz) as T
}

function walk(v: unknown, tz: string): unknown {
  if (typeof v === 'string') return v.length === 19 ? convertWith(tz, v) : v
  if (Array.isArray(v)) return v.map((x) => walk(x, tz))
  if (v && typeof v === 'object') {
    const proto = Object.getPrototypeOf(v)
    if (proto !== Object.prototype && proto !== null) return v
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x, tz)
    return out
  }
  return v
}
