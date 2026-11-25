/**
 * واتساب في نسخة الويب (Baileys) — منقول من نسخة الأوفلاين:
 *  - كل عميل له عملية سيرفر وقاعدة ومجلد بيانات خاص، فالجلسة بتتخزن في <QCP_DATA_DIR>/whatsapp-auth وحالة الاتصال في الذاكرة.
 *  - الربط بمسح QR من «الإعدادات ← واتساب»، وبعد كل بيع بتتبعت رسالة نصية للعميل (لو مفعّل).
 *  - إرسال الفاتورة PDF غير مدعوم هنا لسه (توليد الـPDF في الأوفلاين بيعتمد على Electron) — الرسالة النصية بس.
 */
import { join } from 'path'
import { existsSync, rmSync } from 'fs'
import QRCode from 'qrcode'
import { getDb } from '../db'
import { getCustomerLedger, getCustomerPhoneAndName } from './customers'
import { getStoreSettings, getWhatsAppSettings } from './settings'
import { getInvoiceView } from './invoices'
import { getHeldInvoice } from './heldInvoices'
import { createStatementLink } from './statementLink'
import type { StatementFilter, WhatsAppSendResult, WhatsAppStatus } from '../../shared/types'

let sock: any = null
let currentQr: string | null = null
let connecting = false
let connected = false
let connectedPhone: string | null = null
let lastError: string | null = null
let reconnectAttempts = 0
const MAX_AUTO_RECONNECT_ATTEMPTS = 3

function silentLogger(): any {
  const noop = (): void => {}
  const self: any = { level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop }
  self.child = () => self
  return self
}

function getAuthFolder(): string {
  return join(process.env.QCP_DATA_DIR ?? join(process.cwd(), 'data'), 'whatsapp-auth')
}

/** بتتنادى مرة عند إقلاع السيرفر — لو فيه جلسة محفوظة من قبل بتعيد الاتصال تلقائيًا من غير QR جديد. */
export async function initWhatsApp(): Promise<void> {
  if (!existsSync(getAuthFolder())) return
  await connectSocket().catch(() => {})
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  return { connected, connecting, qrDataUrl: currentQr, phoneNumber: connectedPhone, lastError }
}

/**
 * يبدأ اتصال جديد ويعرض QR للمسح — بضغطة المستخدم على "ربط واتساب".
 * بتمسح أي جلسة قديمة فاشلة/غير مكتملة أولًا عشان تضمن محاولة نضيفة تعرض QR فعليًا في كل مرة.
 */
export async function startWhatsAppPairing(): Promise<WhatsAppStatus> {
  if (!connected && !connecting) {
    reconnectAttempts = 0
    lastError = null
    const folder = getAuthFolder()
    if (existsSync(folder)) rmSync(folder, { recursive: true, force: true })
    await connectSocket()
  }
  return getWhatsAppStatus()
}

async function connectSocket(): Promise<void> {
  if (connecting || connected) return
  connecting = true
  currentQr = null
  try {
    const baileys: any = await import('@whiskeysockets/baileys')
    const makeWASocket = baileys.default?.default ?? baileys.default ?? baileys.makeWASocket
    const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys
    const { state, saveCreds } = await useMultiFileAuthState(getAuthFolder())
    const { version } = await fetchLatestBaileysVersion()

    const client = makeWASocket({ version, auth: state, logger: silentLogger(), printQRInTerminal: false })
    sock = client

    client.ev.on('creds.update', saveCreds)
    client.ev.on('connection.update', (update: any) => {
      const { connection, qr, lastDisconnect } = update
      if (qr) {
        currentQr = null
        QRCode.toDataURL(qr, { margin: 1, width: 260 })
          .then((dataUrl) => {
            currentQr = dataUrl
          })
          .catch(() => {})
      }
      if (connection === 'open') {
        connecting = false
        connected = true
        currentQr = null
        lastError = null
        reconnectAttempts = 0
        const jid: string | undefined = client.user?.id
        connectedPhone = jid ? jid.split(':')[0].split('@')[0] : null
      }
      if (connection === 'close') {
        connecting = false
        connected = false
        currentQr = null
        const statusCode = lastDisconnect?.error?.output?.statusCode
        if (statusCode === DisconnectReason.loggedOut) {
          sock = null
          connectedPhone = null
          lastError = null
          reconnectAttempts = 0
        } else if (reconnectAttempts < MAX_AUTO_RECONNECT_ATTEMPTS) {
          // باييز بتقفل الاتصال وتطلب إعادة محاولة في حالات كتير (خصوصًا بعد مسح QR لأول مرة — 515 restartRequired طبيعي)
          reconnectAttempts++
          sock = null
          setTimeout(() => {
            connectSocket().catch(() => {})
          }, 1500)
        } else {
          sock = null
          lastError = 'تعذر إتمام الاتصال بواتساب بعد عدة محاولات — اضغط "ربط واتساب" تاني للمحاولة من جديد'
        }
      }
    })
  } catch (err: any) {
    connecting = false
    lastError = err?.message ?? 'تعذر بدء الاتصال بواتساب'
  }
}

/** قطع الاتصال ومسح الجلسة المحفوظة عشان يتربط رقم تاني من الصفر. */
export async function logoutWhatsApp(): Promise<WhatsAppStatus> {
  try {
    await sock?.logout?.()
  } catch {
    // متوقع لو مفيش اتصال فعلي أصلاً
  }
  sock = null
  connected = false
  connecting = false
  currentQr = null
  connectedPhone = null
  const folder = getAuthFolder()
  if (existsSync(folder)) rmSync(folder, { recursive: true, force: true })
  return getWhatsAppStatus()
}

/** بيحوّل رقم موبايل مصري (01xxxxxxxxx) لصيغة JID اللي واتساب محتاجها. */
function phoneToJid(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '20' + digits.slice(1)
  else if (!digits.startsWith('20') && digits.length === 10) digits = '20' + digits
  return `${digits}@s.whatsapp.net`
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
  if (!connected || !sock) return { ok: false, error: 'واتساب غير متصل — اربط الجلسة من الإعدادات أولًا' }
  const trimmed = (phone ?? '').trim()
  if (!trimmed) return { ok: false, error: 'رقم الموبايل غير موجود' }
  try {
    await sock.sendMessage(phoneToJid(trimmed), { text: message })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر إرسال رسالة واتساب' }
  }
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match)
}

/** للاختبارات فقط (scripts/whatsapp-messages-test.ts): جلسة وهمية بتلقط الرسائل بدل الإرسال الفعلي. */
export function __setFakeSocketForTests(fake: { sendMessage: (jid: string, content: { text: string }) => Promise<void> } | null): void {
  if (process.env.QCP_WA_TEST !== '1') throw new Error('test hook only')
  sock = fake
  connected = !!fake
}

const qtyText = (n: number): string => String(Math.round(n * 1000) / 1000)
const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)

/** نفس شرط رسالة البيع: واتساب متصل + مفعّل + «إرسال بعد البيع» + العميل له رقم. */
async function autoNotifyTarget(customerId: number | null): Promise<{ name: string; phone: string; storeName: string } | null> {
  if (customerId == null || !connected) return null
  const settings = await getWhatsAppSettings()
  if (!settings.enabled || !settings.sendOnSale) return null
  const party = await getCustomerPhoneAndName(customerId)
  if (!party?.phone) return null
  const store = await getStoreSettings()
  return { name: party.name, phone: party.phone, storeName: store.name }
}

/** بعد مرتجع على فاتورة — رسالة للعميل بالأصناف المرتجعة والقيمة. اختياري بالكامل زي رسالة البيع. */
export async function notifySalesReturnByWhatsApp(
  invoiceId: number,
  lines: { salesItemId: number; qty: number }[],
  refundAmount: number
): Promise<void> {
  try {
    if (!connected) return
    const db = getDb()
    const inv = (await db.execute({
      sql: `SELECT i.number, i.customer_id AS customerId, c.is_walk_in AS isWalkIn
            FROM sales_invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = ?`,
      args: [invoiceId]
    })).rows[0] as any
    if (!inv || inv.isWalkIn) return
    const target = await autoNotifyTarget(Number(inv.customerId))
    if (!target) return
    const itemsRs = await db.execute({ sql: 'SELECT id, product_name AS name FROM sales_items WHERE invoice_id = ?', args: [invoiceId] })
    const names = new Map((itemsRs.rows as any[]).map((r) => [Number(r.id), String(r.name)]))
    const items = lines
      .filter((l) => Number(l.qty) > 0)
      .map((l) => `• ${names.get(Number(l.salesItemId)) ?? 'صنف'} × ${qtyText(Number(l.qty))}`)
      .join('\n')
    const balance = await customerBalance(Number(inv.customerId))
    const message = [
      `أهلاً ${target.name} 👋`,
      `تم تسجيل مرتجع على فاتورة رقم ${inv.number}`,
      items,
      `قيمة المرتجع: ${money(refundAmount)}`,
      balance != null ? `رصيد حسابك الحالي: ${money(balance)}` : '',
      target.storeName
    ]
      .filter(Boolean)
      .join('\n')
    await sendWhatsAppMessage(target.phone, message)
  } catch {
    // إشعار واتساب اختياري بالكامل
  }
}

/** بعد مرتجع بدون فاتورة — نفس رسالة المرتجع (لو المرتجع على عميل مسجّل). */
export async function notifyDirectReturnByWhatsApp(returnId: number): Promise<void> {
  try {
    if (!connected) return
    const db = getDb()
    const r = (await db.execute({
      sql: `SELECT r.number, r.amount, r.refund_method AS refundMethod, r.customer_id AS customerId, c.is_walk_in AS isWalkIn
            FROM direct_sales_returns r JOIN customers c ON c.id = r.customer_id WHERE r.id = ?`,
      args: [returnId]
    })).rows[0] as any
    if (!r || r.isWalkIn) return
    const target = await autoNotifyTarget(Number(r.customerId))
    if (!target) return
    const itemsRs = await db.execute({
      sql: 'SELECT product_name AS name, qty, amount FROM direct_sales_return_items WHERE return_id = ? ORDER BY id',
      args: [returnId]
    })
    const items = (itemsRs.rows as any[]).map((i) => `• ${i.name} × ${qtyText(Number(i.qty))} — ${money(Number(i.amount))}`).join('\n')
    const balance = await customerBalance(Number(r.customerId))
    const message = [
      `أهلاً ${target.name} 👋`,
      `تم تسجيل مرتجع رقم ${r.number}`,
      items,
      `قيمة المرتجع: ${money(Number(r.amount))} (${r.refundMethod === 'credit' ? 'خصم من رصيد الحساب' : 'رد نقدي'})`,
      balance != null ? `رصيد حسابك الحالي: ${money(balance)}` : '',
      target.storeName
    ]
      .filter(Boolean)
      .join('\n')
    await sendWhatsAppMessage(target.phone, message)
  } catch {
    // إشعار واتساب اختياري بالكامل
  }
}

/** بعد تسجيل سداد من العميل — رسالة بالمبلغ ووسيلة الدفع والرصيد قبل وبعد. نفس شروط رسالة البيع، واختياري بالكامل. */
export async function notifyCustomerPaymentByWhatsApp(customerId: number, amount: number, method?: string | null, note?: string | null): Promise<void> {
  try {
    const target = await autoNotifyTarget(customerId)
    if (!target) return
    // سند القبض بيحدد الوسيلة من الخزينة — بنقراها من آخر سداد اتسجل للعميل
    if (!method) {
      const last = await getDb().execute({
        sql: `SELECT method FROM payments WHERE party_type = 'customer' AND party_id = ? ORDER BY id DESC LIMIT 1`,
        args: [customerId]
      })
      method = (last.rows[0] as any)?.method ?? 'cash'
    }
    const after = await customerBalance(customerId)
    const message = [
      `أهلاً ${target.name} 👋`,
      `تم استلام سداد بمبلغ ${money(amount)}`,
      `وسيلة الدفع: ${PAYMENT_LABELS[method as string] ?? method}`,
      note?.trim() ? `ملاحظات: ${note.trim()}` : '',
      after != null ? `الرصيد السابق: ${money(after + amount)}` : '',
      after != null ? `الرصيد الحالي: ${money(after)}` : '',
      `شكرًا لك — ${target.storeName}`
    ]
      .filter(Boolean)
      .join('\n')
    await sendWhatsAppMessage(target.phone, message)
  } catch {
    // إشعار واتساب اختياري بالكامل
  }
}

async function customerBalance(customerId: number): Promise<number | null> {
  const rs = await getDb().execute({ sql: 'SELECT balance FROM customers WHERE id = ?', args: [customerId] })
  const row = rs.rows[0] as any
  return row ? Number(row.balance) : null
}

/**
 * فاتورة «حفظ بدون ترحيل» — نفس رسالة البيع (نفس القالب والشروط) برقم الفاتورة غير المرحّلة.
 * بنعلّم في الـpayload إن الرسالة اتبعتت عشان «الحفظ النهائي» مايبعتش نفس الرسالة تاني.
 */
export async function sendHeldInvoiceByWhatsApp(heldId: number): Promise<WhatsAppSendResult> {
  try {
    const held = await getHeldInvoice(heldId)
    if (!held) return { ok: false, error: 'الفاتورة غير موجودة' }
    const target = await autoNotifyTarget(held.payload.customerId)
    if (!target) return { ok: false }
    const settings = await getWhatsAppSettings()
    const items = held.payload.lines
      .map((l) => `• ${l.name} × ${qtyText(l.qty)} — ${money(l.qty * l.unitPrice - (l.discount || 0))}`)
      .join('\n')
    // نفس تفاصيل الفاتورة المطبوعة غير المرحّلة: وسيلة الدفع المختارة، ولو فيه جزء آجل → الرصيد السابق والحالي (المتوقع بعد الترحيل)
    const details: string[] = []
    const payment = held.payload.payment
    if (payment) {
      details.push(`وسيلة الدفع: ${PAYMENT_LABELS[payment.method] ?? payment.method}`)
      const paidNow =
        payment.method === 'credit'
          ? 0
          : payment.method === 'mixed'
            ? Math.min(held.total, (payment.splitRows ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0))
            : held.total
      const creditPart = held.total - paidNow
      if (creditPart > 0.005 && held.payload.customerId != null) {
        const before = (await customerBalance(held.payload.customerId)) ?? 0
        if (paidNow > 0.005) details.push(`المدفوع: ${money(paidNow)}`, `الباقي آجل: ${money(creditPart)}`)
        details.push(`الرصيد السابق: ${money(before)}`, `الرصيد الحالي: ${money(before + creditPart)}`)
      }
    }
    const message = renderTemplate(withDetailsPlaceholder(withItemsPlaceholder(settings.messageTemplate, items), details.length > 0), {
      items,
      details: details.join('\n'),
      customerName: target.name,
      invoiceNumber: String(held.id),
      total: money(held.total),
      storeName: target.storeName
    })
    const result = await sendWhatsAppMessage(target.phone, message)
    if (result.ok) {
      await getDb().execute({
        sql: 'UPDATE held_invoices SET payload = ? WHERE id = ?',
        args: [JSON.stringify({ ...held.payload, whatsappSent: true }), heldId]
      })
    }
    return result
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر إرسال رسالة واتساب' }
  }
}

/** أقصى عدد حركات في رسالة كشف الحساب — الرسالة نص، والكشف الطويل بيتبعت آخره مع رصيد ما قبله. */
const STATEMENT_MAX_ENTRIES = 40

/** إرسال كشف حساب العميل (نص) على واتساب — بضغطة من شاشة كشف الحساب، بنفس فلتر التاريخ المعروض. */
export async function sendCustomerStatementByWhatsApp(customerId: number, filter: StatementFilter = {}): Promise<WhatsAppSendResult> {
  try {
    if (!connected || !sock) return { ok: false, error: 'واتساب غير متصل — اربط الجلسة من الإعدادات أولًا' }
    const ledger = await getCustomerLedger(customerId, filter)
    if (!ledger.customerPhone?.trim()) return { ok: false, error: 'العميل مالوش رقم موبايل — ضيف الرقم من «تعديل» الأول' }
    const store = await getStoreSettings()
    const shown = ledger.entries.slice(-STATEMENT_MAX_ENTRIES)
    const skipped = ledger.entries.length - shown.length
    // رصيد ما قبل أول حركة معروضة في الرسالة
    const opening = skipped > 0 ? (ledger.entries[skipped - 1].balance ?? 0) : (ledger.openingBalance ?? 0)
    const closing = ledger.entries.length ? (ledger.entries[ledger.entries.length - 1].balance ?? 0) : (ledger.openingBalance ?? 0)
    const period =
      filter.from || filter.to ? `الفترة: ${filter.from ? 'من ' + filter.from : ''} ${filter.to ? 'إلى ' + filter.to : ''}`.trim() : ''
    const rows = shown.map((e) => {
      const parts = [`${e.date.slice(0, 10)} — ${e.description}`]
      const amounts: string[] = []
      if (e.debit) amounts.push(`عليك ${money(e.debit)}`)
      if (e.credit) amounts.push(`لك ${money(e.credit)}`)
      amounts.push(`الرصيد ${money(e.balance ?? 0)}`)
      parts.push('   ' + amounts.join(' | '))
      return parts.join('\n')
    })
    const message = [
      `📄 كشف حساب — ${store.name}`,
      `العميل: ${ledger.customerName}`,
      period,
      skipped > 0 ? `(آخر ${shown.length} حركة من ${ledger.entries.length})` : '',
      `رصيد سابق: ${money(opening)}`,
      '——————————',
      rows.length ? rows.join('\n') : 'لا توجد حركات في الفترة',
      '——————————',
      filter.to ? `رصيد نهاية الفترة: ${money(closing)}` : '',
      `الرصيد الحالي المستحق: ${money(ledger.balance)}`
    ]
      .filter(Boolean)
      .join('\n')
    return await sendWhatsAppMessage(ledger.customerPhone, message)
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر إرسال كشف الحساب' }
  }
}

/**
 * إرسال رابط كشف الحساب للعميل على واتساب: رسالة قصيرة فيها الرصيد الحالي + رابط يفتح الكشف الكامل من غير تسجيل دخول.
 * بيعمل الرابط لو مش موجود (أو بيستخدم الموجود). origin = عنوان الموقع من الواجهة (أو QCP_PUBLIC_URL).
 */
export async function sendCustomerStatementLinkByWhatsApp(customerId: number, origin?: string): Promise<WhatsAppSendResult & { url?: string }> {
  try {
    if (!connected || !sock) return { ok: false, error: 'واتساب غير متصل — اربط الجلسة من الإعدادات أولًا' }
    const ledger = await getCustomerLedger(customerId, {})
    if (!ledger.customerPhone?.trim()) return { ok: false, error: 'العميل مالوش رقم موبايل — ضيف الرقم من «تعديل» الأول' }
    const store = await getStoreSettings()
    const link = await createStatementLink(customerId, origin)
    if (!link.url) return { ok: false, error: 'تعذر عمل رابط كشف الحساب' }
    const due = ledger.balance
    // الرصيد في الرسالة وقت الإرسال بس (نص ثابت)؛ الرابط نفسه بيتحدّث تلقائيًا مع كل حركة — بنوضّح ده للعميل
    const balanceLine =
      due > 0.005
        ? `المبلغ المستحق عليك: ${money(due)} (وقت الإرسال)`
        : due < -0.005
          ? `رصيد لك عندنا: ${money(Math.abs(due))} (وقت الإرسال)`
          : 'حسابك مسدّد — مفيش مستحقات (وقت الإرسال)'
    const message = [
      `📄 كشف حساب — ${store.name}`,
      `أهلًا ${ledger.customerName}`,
      balanceLine,
      '',
      'تقدر تشوف كشف حسابك بالتفصيل من الرابط ده — بيتحدّث تلقائيًا مع كل حركة جديدة، افتحه تاني في أي وقت:',
      link.url
    ].join('\n')
    const sent = await sendWhatsAppMessage(ledger.customerPhone, message)
    return sent.ok ? { ok: true, url: link.url } : sent
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر إرسال رابط كشف الحساب' }
  }
}

/** لو القالب المحفوظ مفيهوش {items} بنضيف الأصناف قبل سطر الإجمالي (أو في الآخر) عشان تظهر من غير ما العميل يعدّل القالب */
function withItemsPlaceholder(template: string, items: string): string {
  if (!items || template.includes('{items}')) return template
  const rows = template.split('\n')
  const at = rows.findIndex((r) => r.includes('{total}'))
  if (at >= 0) rows.splice(at, 0, '{items}')
  else rows.push('{items}')
  return rows.join('\n')
}

/** بعد كل عملية بيع ناجحة — رسالة نصية للعميل (لو مفعّل وله رقم). أي فشل هنا مابيأثرش على البيع. */
export async function notifySaleByWhatsApp(
  customerId: number | null,
  invoiceId: number,
  invoiceNumber: string,
  total: number
): Promise<void> {
  try {
    if (customerId == null || !connected) return
    const settings = await getWhatsAppSettings()
    if (!settings.enabled || !settings.sendOnSale) return
    const party = await getCustomerPhoneAndName(customerId)
    if (!party?.phone) return
    const store = await getStoreSettings()
    const view = await getInvoiceView(invoiceId).catch(() => null)
    const items = (view?.lines ?? []).map((l) => `• ${l.productName} × ${qtyText(l.qty)} — ${l.total.toFixed(2)}`).join('\n')
    // زي الفاتورة المطبوعة: وسيلة الدفع، ولو فيه جزء آجل → المدفوع والرصيد السابق والحالي
    const details: string[] = []
    if (view) {
      details.push(`وسيلة الدفع: ${PAYMENT_LABELS[view.paymentMethod] ?? view.paymentMethod}`)
      if (view.customerBalanceBefore != null && view.customerBalanceAfter != null) {
        if (view.paid > 0.005) details.push(`المدفوع: ${money(view.paid)}`, `الباقي آجل: ${money(view.total - view.paid)}`)
        details.push(`الرصيد السابق: ${money(view.customerBalanceBefore)}`, `الرصيد الحالي: ${money(view.customerBalanceAfter)}`)
      }
    }
    const message = renderTemplate(withDetailsPlaceholder(withItemsPlaceholder(settings.messageTemplate, items), details.length > 0), {
      items,
      details: details.join('\n'),
      customerName: party.name,
      invoiceNumber,
      total: total.toFixed(2),
      storeName: store.name
    })
    await sendWhatsAppMessage(party.phone, message)
  } catch {
    // إشعار واتساب اختياري بالكامل
  }
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  credit: 'آجل',
  card: 'بنكي',
  wallet: 'محفظة',
  mixed: 'تقسيم الدفع',
  vodafone_cash: 'فودافون كاش',
  instapay: 'InstaPay'
}

/** سطور وسيلة الدفع/الأرصدة بتتحط بعد سطر الإجمالي في القالب (أو في الآخر) — من غير ما العميل يعدّل القالب */
function withDetailsPlaceholder(template: string, hasDetails: boolean): string {
  if (!hasDetails || template.includes('{details}')) return template
  const rows = template.split('\n')
  const at = rows.findIndex((r) => r.includes('{total}'))
  if (at >= 0) rows.splice(at + 1, 0, '{details}')
  else rows.push('{details}')
  return rows.join('\n')
}
