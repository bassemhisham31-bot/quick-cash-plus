import { getAssistantSettings } from './settings'
import type { AssistantConnectionTestResult } from '../../shared/types'

/**
 * فحص وصول بسيط لرابط الـAPI المحفوظ فقط (بدون إرسال أي محادثة فعلية أو تنفيذ أوامر).
 * الهدف التأكد إن الرابط ومفتاح الـAPI شكلهم سليم ومتاح، مش تشغيل مساعد ذكاء اصطناعي حقيقي.
 */
export async function testAssistantConnection(): Promise<AssistantConnectionTestResult> {
  const settings = await getAssistantSettings()
  if (!settings.apiUrl.trim()) return { ok: false, error: 'رابط API فارغ' }
  if (!settings.apiKey?.trim()) return { ok: false, error: 'مفتاح API فارغ' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(settings.apiUrl.trim(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${settings.apiKey.trim()}` },
      signal: controller.signal
    })
    // أي استجابة (حتى 401/404) تعني إن الرابط شغال ووصل فعليًا للسيرفر
    if (res.status >= 500) return { ok: false, error: `السيرفر رد بخطأ (${res.status})` }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'انتهت مهلة الاتصال' : err?.message ?? 'تعذر الوصول للرابط' }
  } finally {
    clearTimeout(timeout)
  }
}
