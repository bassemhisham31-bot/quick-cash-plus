/**
 * واتساب في نسخة الويب (Baileys) — منقول من نسخة الأوفلاين:
 *  - كل عميل له عملية سيرفر وقاعدة ومجلد بيانات خاص، فالجلسة بتتخزن في <QCP_DATA_DIR>/whatsapp-auth وحالة الاتصال في الذاكرة.
 *  - الربط بمسح QR من «الإعدادات ← واتساب»، وبعد كل بيع بتتبعت رسالة نصية للعميل (لو مفعّل).
 *  - إرسال الفاتورة PDF غير مدعوم هنا لسه (توليد الـPDF في الأوفلاين بيعتمد على Electron) — الرسالة النصية بس.
 */
import { join } from 'path'
import { existsSync, rmSync } from 'fs'
import QRCode from 'qrcode'
import { getCustomerPhoneAndName } from './customers'
import { getStoreSettings, getWhatsAppSettings } from './settings'
import { getInvoiceView } from './invoices'
import type { WhatsAppSendResult, WhatsAppStatus } from '../../shared/types'

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
    const qtyFmt = (n: number): string => String(Math.round(n * 1000) / 1000)
    const items = (view?.lines ?? []).map((l) => `• ${l.productName} × ${qtyFmt(l.qty)} — ${l.total.toFixed(2)}`).join('\n')
    // لو القالب المحفوظ مفيهوش {items} بنضيف الأصناف قبل سطر الإجمالي (أو في الآخر) عشان تظهر من غير ما العميل يعدّل القالب
    let template = settings.messageTemplate
    if (items && !template.includes('{items}')) {
      const rows = template.split('\n')
      const at = rows.findIndex((r) => r.includes('{total}'))
      if (at >= 0) rows.splice(at, 0, '{items}')
      else rows.push('{items}')
      template = rows.join('\n')
    }
    const message = renderTemplate(template, {
      items,
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
