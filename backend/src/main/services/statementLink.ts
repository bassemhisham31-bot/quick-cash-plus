import { randomBytes } from 'crypto'
import { getDb } from '../db'
import { getCustomerLedger } from './customers'
import { getPosUiSettings, getStoreSettings } from './settings'
import type { StatementLinkInfo } from '../../shared/types'

/**
 * رابط كشف حساب العميل (ويب فقط) — بيتبعت على واتساب والعميل يفتحه من غير تسجيل دخول.
 * الأمان: التوكن عشوائي 192 بت (مفيش رقم عميل ظاهر)، الصفحة قراءة فقط، والرابط بيتلغي/يتجدّد بأي وقت.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/
/** أقصى عدد حركات بتتعرض في الصفحة — الأقدم بيتلخّص في «رصيد سابق». */
const PAGE_MAX_ENTRIES = 300

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

async function assertCustomer(customerId: number): Promise<void> {
  const rs = await getDb().execute({ sql: 'SELECT is_walk_in FROM customers WHERE id = ? AND deleted_at IS NULL', args: [customerId] })
  const row = rs.rows[0] as any
  if (!row) throw new Error('العميل غير موجود')
  if (row.is_walk_in) throw new Error('العميل النقدي الافتراضي ملوش كشف حساب')
}

export async function getStatementLinkInfo(customerId: number, origin?: string): Promise<StatementLinkInfo> {
  await assertCustomer(customerId)
  const rs = await getDb().execute({
    sql: 'SELECT token, created_at AS createdAt, last_viewed_at AS lastViewedAt, views FROM customer_statement_links WHERE customer_id = ?',
    args: [customerId]
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
export async function createStatementLink(customerId: number, origin?: string, regenerate = false): Promise<StatementLinkInfo> {
  await assertCustomer(customerId)
  const db = getDb()
  const existing = (await db.execute({ sql: 'SELECT 1 AS x FROM customer_statement_links WHERE customer_id = ?', args: [customerId] })).rows[0]
  if (!existing || regenerate) {
    const token = randomBytes(24).toString('base64url')
    await db.execute({
      sql: `INSERT INTO customer_statement_links (customer_id, token) VALUES (?, ?)
            ON CONFLICT(customer_id) DO UPDATE SET token = excluded.token, created_at = datetime('now'), last_viewed_at = NULL, views = 0`,
      args: [customerId, token]
    })
  }
  return getStatementLinkInfo(customerId, origin)
}

export async function revokeStatementLink(customerId: number): Promise<void> {
  await getDb().execute({ sql: 'DELETE FROM customer_statement_links WHERE customer_id = ?', args: [customerId] })
}

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
.ent .debit .n{color:#c0392b}.ent .credit .n{color:#1e8449}
.ent .bl{margin-inline-start:auto;color:#475467}
.ent.open{background:#f7f8fb;border-radius:8px;padding:11px 10px}
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

/**
 * صفحة الكشف العامة (HTML جاهز). بترجّع null لو التوكن مش صالح/اتلغى — الرد واحد في كل الحالات عشان مفيش تخمين.
 * countView=false لمعاينات الروبوتات: بنرد بنفس الصفحة بس من غير ما نزوّد عدّاد الفتح.
 */
export async function renderPublicStatementPage(token: string, countView = true): Promise<string | null> {
  if (!isValidStatementToken(token)) return null
  const db = getDb()
  const link = (
    await db.execute({
      sql: `SELECT l.customer_id AS customerId FROM customer_statement_links l
            JOIN customers c ON c.id = l.customer_id AND c.deleted_at IS NULL AND c.is_walk_in = 0
            WHERE l.token = ?`,
      args: [token]
    })
  ).rows[0] as any
  if (!link) return null
  const customerId = Number(link.customerId)
  if (countView) {
    await db.execute({ sql: "UPDATE customer_statement_links SET views = views + 1, last_viewed_at = datetime('now') WHERE customer_id = ?", args: [customerId] })
  }

  const [ledger, store, pos] = await Promise.all([getCustomerLedger(customerId, {}), getStoreSettings(), getPosUiSettings()])
  const entries = ledger.entries
  const shown = entries.slice(-PAGE_MAX_ENTRIES)
  const skipped = entries.length - shown.length
  const opening = skipped > 0 ? (entries[skipped - 1].balance ?? 0) : (ledger.openingBalance ?? 0)
  const closing = entries.length ? (entries[entries.length - 1].balance ?? 0) : (ledger.openingBalance ?? 0)
  const balance = ledger.balance
  const kind = balance > 0.005 ? 'due' : balance < -0.005 ? 'credit' : 'zero'
  const label = kind === 'due' ? 'المبلغ المستحق عليك' : kind === 'credit' ? 'رصيد لك عند المحل' : 'الحساب مسدّد — لا توجد مستحقات'
  const sym = esc(pos.currencySymbol || '')
  // الأحدث أولًا (أنسب للموبايل)، وكل حركة كارت فيه الأرقام تحت البيان — من غير جدول عريض يحتاج سحب جنب
  const rows = [...shown]
    .reverse()
    .map(
      (e) =>
        `<div class="ent"><div class="top"><span class="desc">${esc(e.description)}</span><span class="dt">${esc(String(e.date).slice(0, 10))}</span></div>` +
        `<div class="am">${e.debit ? `<span class="debit">عليك <span class="n">${numFmt.format(e.debit)}</span></span>` : ''}` +
        `${e.credit ? `<span class="credit">لك <span class="n">${numFmt.format(e.credit)}</span></span>` : ''}` +
        `<span class="bl">الرصيد <span class="n">${numFmt.format(e.balance ?? 0)}</span></span></div></div>`
    )
    .join('')
  const title = `كشف حساب — ${ledger.customerName}`
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
    <div class="muted">كشف حساب العميل</div>
    <div style="font-size:17px;font-weight:700">${esc(ledger.customerName)}</div>
  </div>
  <div class="card bal ${kind}">
    <div class="lbl">${label}</div>
    ${kind === 'zero' ? '' : `<div class="amt">${numFmt.format(Math.abs(balance))} <span style="font-size:16px">${sym}</span></div>`}
    <div class="muted" style="margin-top:6px">الكشف بيتحدّث تلقائيًا مع كل حركة جديدة — افتح الرابط تاني أو اعمل ريفرش (اسحب الصفحة لتحت) وهتشوف آخر رصيد.</div>
  </div>
  <div class="card">
    ${skipped > 0 ? `<div class="muted" style="margin-bottom:6px">بنعرض آخر ${shown.length} حركة من ${entries.length} — الحركات الأقدم متلخّصة في «رصيد سابق».</div>` : ''}
    <div class="muted" style="margin-bottom:4px">الحركات (الأحدث أولًا) — الرصيد الحالي: <b dir="ltr">${numFmt.format(closing)}</b></div>
    <div>
      ${rows || '<div class="muted" style="text-align:center;padding:10px">لا توجد حركات</div>'}
      <div class="ent open"><div class="top"><span class="desc">رصيد سابق</span></div><div class="am"><span class="bl" style="margin-inline-start:0">الرصيد <span class="n">${numFmt.format(opening)}</span></span></div></div>
    </div>
  </div>
  <div class="foot muted">آخر تحديث: ${nowText()}${contact ? `<br />للاستفسار: ${contact}` : ''}</div>
</div>
</body>
</html>`
}
