/**
 * تكامل واتساب الحقيقي (Baileys) في نسخة الأوفلاين محتاج جلسة متصفح + توليد PDF عبر Electron
 * (services/print.ts، غير منقول لسه). النسخة دي stub بس عشان pos.ts يفضل يشتغل عادي — التكامل
 * الفعلي مؤجل لمرحلة لاحقة من خطة التحويل (بعد حل تخزين الملفات/توليد PDF على السيرفر).
 */
export async function notifySaleByWhatsApp(
  _customerId: number | null,
  _invoiceId: number,
  _invoiceNumber: string,
  _total: number
): Promise<void> {
  // لسه غير مفعّل في نسخة الويب
}

const NOT_SUPPORTED = 'واتساب غير مدعوم في نسخة الويب لسه'

export async function getWhatsAppStatus(): Promise<{
  connected: boolean
  connecting: boolean
  qrDataUrl: string | null
  phoneNumber: string | null
  lastError: string | null
}> {
  return { connected: false, connecting: false, qrDataUrl: null, phoneNumber: null, lastError: NOT_SUPPORTED }
}

export async function startWhatsAppPairing(): ReturnType<typeof getWhatsAppStatus> {
  return getWhatsAppStatus()
}

export async function logoutWhatsApp(): ReturnType<typeof getWhatsAppStatus> {
  return getWhatsAppStatus()
}

export async function sendWhatsAppMessage(_phone: string, _message: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: NOT_SUPPORTED }
}
