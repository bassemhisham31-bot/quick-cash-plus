import { randomBytes } from 'crypto'
import { getDb } from '../db'
import { getCustomerLedger } from './customers'
import { getVendorStatement } from './vendors'
import { getPosUiSettings, getStoreSettings } from './settings'
import type { StatementEntry, StatementLinkInfo } from '../../shared/types'

/**
 * رابط كشف الحساب (ويب فقط) — للعميل وللمورد: بيتبعت على واتساب ويتفتح من غير تسجيل دخول.
 * الأمان: التوكن عشوائي 192 بت (مفيش رقم ظاهر في الرابط)، الصفحة قراءة فقط، والرابط بيتلغي/يتجدّد بأي وقت.
 * نفس المسار /api/s/<token> بيخدم الاتنين (العميل في customer_statement_links والمورد في vendor_statement_links).
 */

export type PartyKind = 'customer' | 'vendor'

const PARTY = {
  customer: { table: 'customer_statement_links', idCol: 'customer_id' },
  vendor: { table: 'vendor_statement_links', idCol: 'vendor_id' }
} as const

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/
/** فترة العرض (من/إلى شاملين) — اختيارية للاتنين. */
export interface StatementRange {
  from?: string
  to?: string
}

/** تاريخ YYYY-MM-DD حقيقي (مش 2026-02-31 مثلًا)؟ */
function validDay(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined
}

/** بيحوّل باراميترات الرابط (?from=&to=) لفترة صالحة: أي قيمة غلط بتتجاهل، ولو من > إلى بيتبدلوا. */
export function parseStatementRange(from: unknown, to: unknown): StatementRange {
  let f = validDay(from)
  let t = validDay(to)
  if (f && t && f > t) [f, t] = [t, f]
  return { ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) }
}

const cairoDay = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** اختصارات الفترة في الصفحة (بتوقيت القاهرة). */
function presetRanges(): Array<{ label: string; from: string; to: string }> {
  const today = cairoDay()
  const [y, m] = today.split('-').map(Number)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const ymd = (yy: number, mm: number, dd: number): string => `${yy}-${pad(mm)}-${pad(dd)}`
  const prevStart = new Date(Date.UTC(y, m - 2, 1))
  const prevEndDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
  const threeStart = new Date(Date.UTC(y, m - 3, 1))
  return [
    { label: 'الشهر ده', from: ymd(y, m, 1), to: today },
    { label: 'الشهر اللي فات', from: ymd(prevStart.getUTCFullYear(), prevStart.getUTCMonth() + 1, 1), to: ymd(prevStart.getUTCFullYear(), prevStart.getUTCMonth() + 1, prevEndDay) },
    { label: 'آخر 3 شهور', from: ymd(threeStart.getUTCFullYear(), threeStart.getUTCMonth() + 1, 1), to: today },
    { label: 'السنة دي', from: ymd(y, 1, 1), to: today }
  ]
}

export function isValidStatementToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

/** عنوان الموقع: QCP_PUBLIC_URL لو متضبط، وإلا العنوان اللي بعتته الواجهة (window.location.origin) بعد التحقق من شكله. */
function siteOrigin(origin?: string): string {
  const candidates = [process.env.QCP_PUBLIC_URL ?? '', origin ?? '']
  for (const c of candidates) {
    const v = c.trim().replace(/\/+$/, '')
    if (/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(v)) return v
  }
  throw new Error('تعذر تحديد عنوان الموقع لعمل الرابط')
}

export function statementLinkUrl(origin: string | undefined, token: string): string {
  return `${siteOrigin(origin)}/api/s/${token}`
}

async function assertParty(kind: PartyKind, id: number): Promise<void> {
  if (kind === 'customer') {
    const rs = await getDb().execute({ sql: 'SELECT is_walk_in FROM customers WHERE id = ? AND deleted_at IS NULL', args: [id] })
    const row = rs.rows[0] as any
    if (!row) throw new Error('العميل غير موجود')
    if (row.is_walk_in) throw new Error('العميل النقدي الافتراضي ملوش كشف حساب')
    return
  }
  const rs = await getDb().execute({ sql: 'SELECT id FROM vendors WHERE id = ? AND deleted_at IS NULL', args: [id] })
  if (!rs.rows[0]) throw new Error('المورد غير موجود')
}

async function linkInfo(kind: PartyKind, id: number, origin?: string): Promise<StatementLinkInfo> {
  await assertParty(kind, id)
  const { table, idCol } = PARTY[kind]
  const rs = await getDb().execute({
    sql: `SELECT token, created_at AS createdAt, last_viewed_at AS lastViewedAt, views FROM ${table} WHERE ${idCol} = ?`,
    args: [id]
  })
  const row = rs.rows[0] as any
  if (!row) return { enabled: false, url: null, createdAt: null, lastViewedAt: null, views: 0 }
  return {
    enabled: true,
    url: statementLinkUrl(origin, String(row.token)),
    createdAt: row.createdAt ?? null,
    lastViewedAt: row.lastViewedAt ?? null,
    views: Number(row.views) || 0
  }
}

/** بيرجّع الرابط الحالي أو يعمل واحد جديد. regenerate=true بيعمل توكن جديد والرابط القديم بيبطل فورًا. */
async function linkCreate(kind: PartyKind, id: number, origin?: string, regenerate = false): Promise<StatementLinkInfo> {
  await assertParty(kind, id)
  const { table, idCol } = PARTY[kind]
  const db = getDb()
  const existing = (await db.execute({ sql: `SELECT 1 AS x FROM ${table} WHERE ${idCol} = ?`, args: [id] })).rows[0]
  if (!existing || regenerate) {
    const token = randomBytes(24).toString('base64url')
    await db.execute({
      sql: `INSERT INTO ${table} (${idCol}, token) VALUES (?, ?)
            ON CONFLICT(${idCol}) DO UPDATE SET token = excluded.token, created_at = datetime('now'), last_viewed_at = NULL, views = 0`,
      args: [id, token]
    })
  }
  return linkInfo(kind, id, origin)
}

async function linkRevoke(kind: PartyKind, id: number): Promise<void> {
  const { table, idCol } = PARTY[kind]
  await getDb().execute({ sql: `DELETE FROM ${table} WHERE ${idCol} = ?`, args: [id] })
}

// ----- العميل -----
export const getStatementLinkInfo = (customerId: number, origin?: string): Promise<StatementLinkInfo> => linkInfo('customer', customerId, origin)
export const createStatementLink = (customerId: number, origin?: string, regenerate = false): Promise<StatementLinkInfo> =>
  linkCreate('customer', customerId, origin, regenerate)
export const revokeStatementLink = (customerId: number): Promise<void> => linkRevoke('customer', customerId)

// ----- المورد -----
export const getVendorStatementLinkInfo = (vendorId: number, origin?: string): Promise<StatementLinkInfo> => linkInfo('vendor', vendorId, origin)
export const createVendorStatementLink = (vendorId: number, origin?: string, regenerate = false): Promise<StatementLinkInfo> =>
  linkCreate('vendor', vendorId, origin, regenerate)
export const revokeVendorStatementLink = (vendorId: number): Promise<void> => linkRevoke('vendor', vendorId)

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const numFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nowText = (): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#f3f5f9;color:#1b2430;font-family:Tahoma,"Segoe UI",Arial,sans-serif;font-size:14px;line-height:1.5}
.wrap{max-width:760px;margin:0 auto;padding:14px}
.card{background:#fff;border-radius:14px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 4px rgba(20,30,50,.08)}
.head{display:flex;align-items:center;gap:12px}
.head img{max-height:56px;max-width:110px;object-fit:contain}
.head h1{font-size:18px;margin:0}
.muted{color:#667085;font-size:12.5px}
.bal{text-align:center;padding:16px}
.bal .lbl{font-size:13px;color:#667085}
.bal .amt{font-size:28px;font-weight:700;margin-top:2px;direction:ltr}
.bal.due .amt{color:#c0392b}.bal.credit .amt{color:#1e8449}.bal.zero .amt{color:#1b2430}
.ent{padding:11px 2px;border-bottom:1px solid #e6e9ef}
.ent:last-child{border-bottom:0}
.ent .top{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.ent .desc{font-weight:600;font-size:13.5px}
.ent .dt{color:#667085;font-size:12px;white-space:nowrap}
.ent .am{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:5px;font-size:13px}
.ent .am>span{white-space:nowrap}
.ent .n{direction:ltr;unicode-bidi:isolate;font-weight:700}
.ent .debit .n{color:#c0392b}.ent .credit .n{color:#1e8449}.ent .paid .n{color:#475467}
.ent .bl{margin-inline-start:auto;color:#475467}
.ent.open{background:#f7f8fb;border-radius:8px;padding:11px 10px}
.flt label{display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:#475467;flex:1;min-width:130px}
.flt input{font:inherit;padding:8px 10px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#1b2430;width:100%}
.frow{display:flex;gap:10px;flex-wrap:wrap}
.fbtn{display:flex;align-items:center;gap:14px;margin-top:10px}
.fbtn button{font:inherit;font-weight:700;padding:9px 22px;border:0;border-radius:8px;background:#2f5bea;color:#fff;cursor:pointer}
.lnk{color:#2f5bea;text-decoration:none;font-size:13px}
.pre{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;padding-top:10px;border-top:1px solid #eef0f4}
.sum{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;margin-bottom:6px;padding:8px 10px;background:#f7f8fb;border-radius:8px}
.sum .n{direction:ltr;unicode-bidi:isolate}
.foot{text-align:center;margin:14px 0 4px}
@media print{body{background:#fff}.card{box-shadow:none;border:1px solid #ddd}}
`

/**
 * معاينة الرابط اللي واتساب/فيسبوك/تيليجرام وغيرهم بيجيبوها لوحدهم أول ما الرسالة تتبعت (روبوت مش العميل) —
 * مش بتتحسب «فتح» في عدّاد الفتح. بنفس المنطق: طلبات HEAD (مش بتعرض صفحة للإنسان).
 */
export function isPreviewFetch(userAgent: string | undefined, method = 'GET'): boolean {
  if (method.toUpperCase() === 'HEAD') return true
  return /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|linkedinbot|discordbot|skypeuripreview|googlebot|bingbot|\bbot\b|crawler|spider|preview/i.test(userAgent ?? '')
}

interface PageLabels {
  who: string
  /** رصيد موجب (مستحق على العميل / مستحق للمورد) */
  positive: string
  negative: string
  zero: string
  debitWord: string
  creditWord: string
  /** موجب = ممتاز للطرف ده؟ (المورد: اللي له عندنا) — بيحدد لون الرصيد */
  positiveIsGood: boolean
}

const CUSTOMER_LABELS: PageLabels = {
  who: 'كشف حساب العميل',
  positive: 'المبلغ المستحق عليك',
  negative: 'رصيد لك عند المحل',
  zero: 'الحساب مسدّد — لا توجد مستحقات',
  debitWord: 'عليك',
  creditWord: 'لك',
  positiveIsGood: false
}
const VENDOR_LABELS: PageLabels = {
  who: 'كشف حساب المورد',
  positive: 'المبلغ المستحق لك عندنا',
  negative: 'رصيد للمحل عندك (مدفوع زيادة)',
  zero: 'الحساب مسدّد — لا توجد مستحقات',
  debitWord: 'مستحق لك',
  creditWord: 'مسدّد / مخصوم',
  positiveIsGood: true
}

/** بيلاقي صاحب التوكن (عميل أو مورد) ويزوّد عدّاد الفتح لو مطلوب. بيرجّع null لأي توكن مش صالح/ملغي/لعميل أو مورد محذوف. */
async function resolveToken(token: string, countView: boolean): Promise<{ kind: PartyKind; id: number } | null> {
  const db = getDb()
  const cust = (
    await db.execute({
      sql: `SELECT l.customer_id AS id FROM customer_statement_links l
            JOIN customers c ON c.id = l.customer_id AND c.deleted_at IS NULL AND c.is_walk_in = 0
            WHERE l.token = ?`,
      args: [token]
    })
  ).rows[0] as any
  let found: { kind: PartyKind; id: number } | null = cust ? { kind: 'customer', id: Number(cust.id) } : null
  if (!found) {
    const vend = (
      await db.execute({
        sql: `SELECT l.vendor_id AS id FROM vendor_statement_links l
              JOIN vendors v ON v.id = l.vendor_id AND v.deleted_at IS NULL
              WHERE l.token = ?`,
        args: [token]
      })
    ).rows[0] as any
    if (vend) found = { kind: 'vendor', id: Number(vend.id) }
  }
  if (found && countView) {
    const { table, idCol } = PARTY[found.kind]
    await db.execute({ sql: `UPDATE ${table} SET views = views + 1, last_viewed_at = datetime('now') WHERE ${idCol} = ?`, args: [found.id] })
  }
  return found
}

/**
 * صفحة الكشف العامة (HTML جاهز) للعميل أو المورد. بترجّع null لو التوكن مش صالح/اتلغى — الرد واحد في كل الحالات عشان مفيش تخمين.
 * countView=false لمعاينات الروبوتات: بنرد بنفس الصفحة بس من غير ما نزوّد عدّاد الفتح.
 */
export async function renderPublicStatementPage(token: string, countView = true, range: StatementRange = {}): Promise<string | null> {
  if (!isValidStatementToken(token)) return null
  const filtered = !!(range.from || range.to)
  // عدّاد الفتح بيحسب أول فتح بس: تغيير فلتر الفترة جوه الصفحة مش «فتح» جديد
  const found = await resolveToken(token, countView && !filtered)
  if (!found) return null

  let name: string
  let balance: number
  let entries: StatementEntry[]
  let openingBalance: number
  let labels: PageLabels
  if (found.kind === 'customer') {
    const ledger = await getCustomerLedger(found.id, range)
    name = ledger.customerName
    balance = ledger.balance
    entries = ledger.entries
    openingBalance = ledger.openingBalance ?? 0
    labels = CUSTOMER_LABELS
  } else {
    const vendor = (await getDb().execute({ sql: 'SELECT name FROM vendors WHERE id = ?', args: [found.id] })).rows[0] as any
    const st = await getVendorStatement(found.id, range)
    name = String(vendor?.name ?? '')
    balance = st.balance
    entries = st.entries
    openingBalance = st.openingBalance ?? 0
    labels = VENDOR_LABELS
  }
  const [store, pos] = await Promise.all([getStoreSettings(), getPosUiSettings()])

  // كل الحركات من غير حد أقصى. مع فلتر الفترة: «رصيد سابق» = الرصيد قبل بداية الفترة، و«رصيد نهاية الفترة» = بعد آخر حركة فيها
  const shown = entries
  const opening = openingBalance
  const closing = entries.length ? (entries[entries.length - 1].balance ?? 0) : openingBalance
  const periodDebit = entries.reduce((s, e) => s + e.debit, 0)
  const periodCredit = entries.reduce((s, e) => s + e.credit, 0)
  const presets = presetRanges()
  // التواريخ جوه <bdi dir="ltr"> عشان ما تتعكسش بصريًا في الصفحة العربية (القيم متحقق منها قبل كده، فآمنة)
  const dayText = (v: string | undefined, fallback: string): string => (v ? `<bdi dir="ltr">${v}</bdi>` : fallback)
  const rangeText = `من ${dayText(range.from, 'أول حركة')} إلى ${dayText(range.to, 'النهاردة')}`
  const pos2 = balance > 0.005
  const neg2 = balance < -0.005
  // لون الرصيد: العميل المدين أحمر، والمورد اللي له فلوس عندنا أخضر
  const kind = pos2 ? (labels.positiveIsGood ? 'credit' : 'due') : neg2 ? (labels.positiveIsGood ? 'due' : 'credit') : 'zero'
  const label = pos2 ? labels.positive : neg2 ? labels.negative : labels.zero
  const sym = esc(pos.currencySymbol || '')
  const debitClass = labels.positiveIsGood ? 'credit' : 'debit'
  const creditClass = labels.positiveIsGood ? 'paid' : 'credit'
  // الأحدث أولًا (أنسب للموبايل)، وكل حركة كارت فيه الأرقام تحت البيان — من غير جدول عريض يحتاج سحب جنب
  const rows = [...shown]
    .reverse()
    .map(
      (e) =>
        `<div class="ent"><div class="top"><span class="desc">${esc(e.description)}</span><span class="dt">${esc(String(e.date).slice(0, 10))}</span></div>` +
        `<div class="am">${e.debit ? `<span class="${debitClass}">${labels.debitWord} <span class="n">${numFmt.format(e.debit)}</span></span>` : ''}` +
        `${e.credit ? `<span class="${creditClass}">${labels.creditWord} <span class="n">${numFmt.format(e.credit)}</span></span>` : ''}` +
        `<span class="bl">الرصيد <span class="n">${numFmt.format(e.balance ?? 0)}</span></span></div></div>`
    )
    .join('')
  const title = `كشف حساب — ${name}`
  const contact = [store.phone, store.address].filter(Boolean).map((v) => esc(v)).join(' — ')

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta name="referrer" content="no-referrer" />
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(store.name)}" />
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="card head">
    ${store.logoDataUrl && /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(store.logoDataUrl) ? `<img src="${store.logoDataUrl}" alt="" />` : ''}
    <div><h1>${esc(store.name)}</h1>${contact ? `<div class="muted">${contact}</div>` : ''}</div>
  </div>
  <div class="card">
    <div class="muted">${labels.who}</div>
    <div style="font-size:17px;font-weight:700">${esc(name)}</div>
  </div>
  <div class="card bal ${kind}">
    <div class="lbl">${label}</div>
    ${!pos2 && !neg2 ? '' : `<div class="amt">${numFmt.format(Math.abs(balance))} <span style="font-size:16px">${sym}</span></div>`}
    <div class="muted" style="margin-top:6px">الكشف بيتحدّث تلقائيًا مع كل حركة جديدة — افتح الرابط تاني أو اعمل ريفرش (اسحب الصفحة لتحت) وهتشوف آخر رصيد.</div>
  </div>
  <form class="card flt" method="get" action="">
    <div class="muted" style="margin-bottom:8px">عرض حركات فترة معيّنة</div>
    <div class="frow">
      <label>من<input type="date" name="from" value="${range.from ?? ''}" /></label>
      <label>إلى<input type="date" name="to" value="${range.to ?? ''}" /></label>
    </div>
    <div class="fbtn"><button type="submit">عرض</button>${filtered ? '<a class="lnk" href="?">كل الحركات</a>' : ''}</div>
    <div class="pre">${presets.map((p) => `<a class="lnk" href="?from=${p.from}&amp;to=${p.to}">${p.label}</a>`).join('')}</div>
  </form>
  <div class="card">
    ${
      filtered
        ? `<div class="muted" style="margin-bottom:4px">الحركات في الفترة <b>${rangeText}</b> (الأحدث أولًا)</div>` +
          `<div class="sum"><span>${labels.debitWord}: <b class="n">${numFmt.format(periodDebit)}</b></span><span>${labels.creditWord}: <b class="n">${numFmt.format(periodCredit)}</b></span><span>رصيد نهاية الفترة: <b class="n">${numFmt.format(closing)}</b></span></div>`
        : `<div class="muted" style="margin-bottom:4px">كل الحركات (${entries.length}) — الأحدث أولًا — الرصيد الحالي: <b dir="ltr">${numFmt.format(closing)}</b></div>`
    }
    <div>
      ${rows || '<div class="muted" style="text-align:center;padding:10px">لا توجد حركات في الفترة دي</div>'}
      <div class="ent open"><div class="top"><span class="desc">رصيد سابق${filtered ? ' (قبل الفترة)' : ''}</span></div><div class="am"><span class="bl" style="margin-inline-start:0">الرصيد <span class="n">${numFmt.format(opening)}</span></span></div></div>
    </div>
  </div>
  <div class="foot muted">آخر تحديث: ${nowText()}${contact ? `<br />للاستفسار: ${contact}` : ''}</div>
</div>
</body>
</html>`
}
