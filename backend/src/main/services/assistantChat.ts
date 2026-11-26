import { brandName } from './brand'
import { getDb } from '../db'
import { getAssistantSettings } from './settings'
import { getDashboardSummary, getExpiringProducts, getPaymentMethodsBreakdown, getTopSellingProducts } from './dashboard'
import type { AssistantAction, AssistantChatMessage, AssistantSendMessageResult, AssistantSettings } from '../../shared/types'

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

const MAX_HISTORY_MESSAGES = 50
const CONTEXT_TURNS = 12

export async function getChatHistory(userId: number, limit = MAX_HISTORY_MESSAGES): Promise<AssistantChatMessage[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT id, role, content, created_at AS createdAt FROM assistant_chat_messages
          WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    args: [userId, limit]
  })
  return (rs.rows as any[])
    .map((r) => ({ id: Number(r.id), role: r.role as 'user' | 'assistant', content: r.content as string, createdAt: r.createdAt as string }))
    .reverse()
}

export async function clearChatHistory(userId: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM assistant_chat_messages WHERE user_id = ?', args: [userId] })
}

async function appendMessage(userId: number, role: 'user' | 'assistant', content: string): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: 'INSERT INTO assistant_chat_messages (user_id, role, content) VALUES (?, ?, ?)',
    args: [userId, role, content]
  })
}

/** ملخص للقراءة فقط من بيانات المتجر الفعلية — بيتحط في الـsystem prompt، المساعد بيقرأه بس ومينفذش أي عملية بيه. */
async function buildStoreContext(allowedSections: string[]): Promise<string> {
  const allow = (key: string): boolean => allowedSections.length === 0 || allowedSections.includes(key)
  const parts: string[] = []

  if (allow('dashboard') || allow('pos') || allow('inventory')) {
    const summary = await getDashboardSummary()
    parts.push(
      `مبيعات اليوم: ${summary.todaySales} (${summary.todayInvoiceCount} فاتورة)، الربح التقديري لليوم: ${summary.todayProfit}، حالة الوردية: ${summary.dayIsOpen ? 'مفتوحة' : 'مقفولة'}.`
    )
    if (allow('inventory')) {
      parts.push(`عدد الأصناف تحت حد التنبيه: ${summary.lowStockCount}. عدد الأصناف القريبة من انتهاء الصلاحية: ${summary.expiringSoonCount}.`)
    }
  }

  if (allow('inventory')) {
    const expiring = await getExpiringProducts(5)
    if (expiring.length) {
      parts.push('أقرب أصناف لانتهاء الصلاحية: ' + expiring.map((e) => `${e.name} (${e.daysLeft} يوم)`).join('، '))
    }
  }

  if (allow('reports') || allow('pos')) {
    const top = await getTopSellingProducts(5)
    if (top.length) {
      parts.push('الأصناف الأكثر مبيعًا اليوم: ' + top.map((p) => `${p.name} (${p.qty} وحدة)`).join('، '))
    }
    const methods = await getPaymentMethodsBreakdown()
    if (methods.length) {
      parts.push('توزيع طرق الدفع اليوم: ' + methods.map((m) => `${m.method}: ${m.total}`).join('، '))
    }
  }

  return parts.join('\n')
}

const ACTIONS_PROMPT = `
تقدر تنفّذ عمليات جوه النظام عن طريق "أوامر" بتتنفّذ بنفس صلاحيات المستخدم (والعمليات اللي بتغيّر بيانات بتستنى تأكيده).
لازم ردك يكون JSON صالح فقط — من غير أي نص قبله أو بعده ومن غير علامات markdown — بالشكل:
{"reply":"رد قصير بالعربي للمستخدم","actions":[ ...أوامر... ]}
لو مفيش عملية مطلوبة خلّي "actions" مصفوفة فاضية [] وجاوب في "reply" عادي.

الأوامر المتاحة (استخدم دول بس):
1) فتح شاشة: {"type":"navigate","view":"<الشاشة>"} — القيم: dashboard (الرئيسية), pos (البيع), inventory (المخزون والمشتريات), priceEditing (تعديل الأسعار), customers (العملاء), vendors (الموردين), invoices (الفواتير), returns (المرتجعات), expenses (المصروفات), shifts (الورديات), treasury (الخزائن), accounting (الحسابات), reports (التقارير), settings (الإعدادات).
2) فاتورة بيع: {"type":"pos_sale","customer":"اسم العميل أو null","items":[{"name":"اسم الصنف أو الباركود","qty":رقم,"price":رقم أو null}],"payment":"cash|credit|card|wallet|vodafone_cash|instapay|null","finalize":false}
   بيفتح شاشة البيع ويضيف الأصناف (والعميل لو مذكور) ويفتح شاشة الدفع. "finalize":true معناها يحفظ الفاتورة نهائيًا.
3) سداد من عميل: {"type":"customer_payment","customer":"اسم العميل","amount":رقم,"treasury":"اسم الخزينة أو null","note":"ملاحظة أو null"}
4) تسجيل مصروف: {"type":"add_expense","category":"اسم بند المصروف","amount":رقم,"method":"cash|card|wallet|transfer","note":"ملاحظة أو null"}

قواعد صارمة:
- ما تخترعش أسماء أصناف أو عملاء أو مبالغ: استخدم اللي المستخدم قاله بالظبط. لو الكمية مش مذكورة خليها 1. "price" يبقى null إلا لو المستخدم حدد سعر.
- "finalize" يبقى true فقط لو المستخدم طلب صراحة إتمام/حفظ/دفع الفاتورة. غير كده false.
- لو الطلب ناقص (مفيش أصناف، مفيش مبلغ، اسم غامض) اسأله في "reply" وخلّي "actions" فاضية بدل ما تخمّن.
- ممنوع تنفّذ حذف أو تعديل بيانات أو أي حاجة مش في القايمة دي — اعتذر ووجّهه للشاشة المناسبة.
`

function buildSystemPrompt(storeContext: string, actionsEnabled = false): string {
  const brand = `إنت "مساعد ${brandName()}" — ` + 'مساعد ذكاء اصطناعي جوه نظام ERP/POS لإدارة متجر. جاوب بالعربية دايمًا، باختصار ووضوح ومباشر. '
  const base = actionsEnabled
    ? brand + 'بتحلّل بيانات المتجر وبتنفّذ العمليات اللي المستخدم يطلبها بالأوامر الموضّحة تحت.\n' + ACTIONS_PROMPT
    : brand +
      'دورك استشاري وتحليلي بس (قراءة وشرح وتحليل) — مفيش عندك أي صلاحية لتنفيذ أي عملية فعلية جوه النظام (بيع، حذف، تعديل سعر أو بيانات...). ' +
      'لو حد طلب منك تنفّذ حاجة فعليًا، اعتذر بوضوح ووجّهه للشاشة المناسبة عشان ينفّذها بنفسه.'
  if (!storeContext.trim()) return base
  return `${base}\n\nبيانات حقيقية من المتجر الآن (للتحليل والرد على أسئلة المستخدم بس):\n${storeContext}`
}

async function callChatCompletionsApi(
  settings: AssistantSettings,
  systemPrompt: string,
  history: ChatTurn[],
  message: string
): Promise<string> {
  const base = settings.apiUrl.trim().replace(/\/+$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey?.trim() ?? ''}` },
    body: JSON.stringify({
      model: settings.modelName,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }
      ]
    })
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error?.message ?? `فشل الاتصال بالمزود (${res.status})`)
  const reply = data?.choices?.[0]?.message?.content
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('رد المزود فاضي أو بصيغة غير متوقعة')
  return reply.trim()
}

async function callGeminiApi(
  settings: AssistantSettings,
  systemPrompt: string,
  history: ChatTurn[],
  message: string
): Promise<string> {
  const base = settings.apiUrl.trim().replace(/\/+$/, '')
  const url = `${base}/models/${encodeURIComponent(settings.modelName)}:generateContent?key=${encodeURIComponent(settings.apiKey?.trim() ?? '')}`
  const body: Record<string, unknown> = {
    contents: [
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  }
  if (settings.externalSearchEnabled) body.tools = [{ google_search: {} }]

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error?.message ?? `فشل الاتصال بـGemini (${res.status})`)
  const parts = data?.candidates?.[0]?.content?.parts
  const reply = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? '').join('') : ''
  if (!reply.trim()) throw new Error('رد Gemini فاضي أو بصيغة غير متوقعة')
  return reply.trim()
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/[٫,]/g, '.')) : Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** بيفلتر أوامر المساعد: أنواع معروفة بس وقيم مظبوطة — أي حاجة غريبة بتتشال */
export function sanitizeAssistantActions(raw: unknown): AssistantAction[] {
  if (!Array.isArray(raw)) return []
  const out: AssistantAction[] = []
  for (const a of raw.slice(0, 8) as any[]) {
    if (!a || typeof a !== 'object') continue
    if (a.type === 'navigate') {
      const view = str(a.view)
      if (view) out.push({ type: 'navigate', view })
    } else if (a.type === 'pos_sale') {
      const items = (Array.isArray(a.items) ? a.items : [])
        .slice(0, 40)
        .map((it: any) => {
          const name = str(it?.name)
          if (!name) return null
          const qty = num(it?.qty)
          const price = num(it?.price)
          return { name, qty: qty != null && qty > 0 ? qty : 1, price: price != null && price > 0 ? price : null }
        })
        .filter(Boolean) as { name: string; qty: number; price: number | null }[]
      out.push({ type: 'pos_sale', customer: str(a.customer), items, payment: str(a.payment), finalize: a.finalize === true })
    } else if (a.type === 'customer_payment') {
      const customer = str(a.customer)
      const amount = num(a.amount)
      if (customer && amount != null && amount > 0) out.push({ type: 'customer_payment', customer, amount, treasury: str(a.treasury), note: str(a.note) })
    } else if (a.type === 'add_expense') {
      const category = str(a.category)
      const amount = num(a.amount)
      if (category && amount != null && amount > 0) out.push({ type: 'add_expense', category, amount, method: str(a.method), note: str(a.note) })
    }
  }
  return out
}

/** رد المساعد (JSON: reply + actions) — لو مش JSON بيتعامل معاه كنص عادي من غير أوامر */
export function parseAssistantOutput(raw: string): { reply: string; actions: AssistantAction[] } {
  let text = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text)
  if (fence) text = fence[1]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1))
      if (obj && typeof obj === 'object' && ('reply' in obj || 'actions' in obj)) {
        const reply = typeof obj.reply === 'string' && obj.reply.trim() ? obj.reply.trim() : ''
        const actions = sanitizeAssistantActions(obj.actions)
        return { reply: reply || (actions.length ? 'تمام، بنفّذ الطلب.' : raw.trim()), actions }
      }
    } catch {
      // مش JSON سليم — نعتبره كلام عادي
    }
  }
  return { reply: raw.trim(), actions: [] }
}

/** بيسجّل نتيجة تنفيذ أوامر المساعد في المحادثة (عشان تبان في السجل ويشوفها المساعد في الرسايل الجاية) */
export async function logAssistantNote(userId: number, text: string): Promise<void> {
  const note = text.trim()
  if (note) await appendMessage(userId, 'assistant', note.slice(0, 2000))
}

export async function sendAssistantMessage(userId: number, message: string): Promise<AssistantSendMessageResult> {
  const text = message.trim()
  if (!text) return { ok: false, error: 'اكتب رسالة أولًا' }

  const settings = await getAssistantSettings()
  if (!settings.enabled) return { ok: false, error: 'المساعد الذكي غير مفعّل من إعدادات المساعد' }
  if (settings.allowedUserIds.length > 0 && !settings.allowedUserIds.includes(userId)) {
    return { ok: false, error: 'مفيش صلاحية لاستخدام المساعد الذكي لهذا المستخدم' }
  }
  if (!settings.apiKey?.trim()) return { ok: false, error: 'مفتاح API فارغ في إعدادات المساعد' }
  if (!settings.apiUrl.trim()) return { ok: false, error: 'رابط API فارغ في إعدادات المساعد' }

  try {
    const history = (await getChatHistory(userId, CONTEXT_TURNS)).map((m) => ({ role: m.role, content: m.content }))
    const storeContext = settings.storeAnalysisEnabled ? await buildStoreContext(settings.allowedSections) : ''
    const systemPrompt = buildSystemPrompt(storeContext, settings.actionsEnabled)

    const raw =
      settings.provider === 'gemini'
        ? await callGeminiApi(settings, systemPrompt, history, text)
        : await callChatCompletionsApi(settings, systemPrompt, history, text)

    const parsed = settings.actionsEnabled ? parseAssistantOutput(raw) : { reply: raw, actions: [] as AssistantAction[] }
    await appendMessage(userId, 'user', text)
    await appendMessage(userId, 'assistant', parsed.reply)
    return { ok: true, reply: parsed.reply, actions: parsed.actions }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر الوصول للمساعد الذكي' }
  }
}
