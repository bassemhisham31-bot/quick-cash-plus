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
