import { getDb } from '../db'
import { getAssistantSettings } from './settings'
import { getDashboardSummary, getExpiringProducts, getPaymentMethodsBreakdown, getTopSellingProducts } from './dashboard'
import type { AssistantChatMessage, AssistantSendMessageResult, AssistantSettings } from '../../shared/types'

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

function buildSystemPrompt(storeContext: string): string {
  const base =
    'إنت "مساعد Quick Cash Plus" — مساعد ذكاء اصطناعي جوه نظام ERP/POS لإدارة متجر. جاوب بالعربية دايمًا، باختصار ووضوح ومباشر. ' +
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
    const systemPrompt = buildSystemPrompt(storeContext)

    const reply =
      settings.provider === 'gemini'
        ? await callGeminiApi(settings, systemPrompt, history, text)
        : await callChatCompletionsApi(settings, systemPrompt, history, text)

    await appendMessage(userId, 'user', text)
    await appendMessage(userId, 'assistant', reply)
    return { ok: true, reply }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر الوصول للمساعد الذكي' }
  }
}
