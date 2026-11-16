/**
 * وضع "طباعة كصورة" (خاص بالجهاز ده، بيتخزن محليًا): على بعض الأجهزة محرّك الرسم الداخلي بتاع QZ Tray
 * بيطبع الحروف العربي مفكوكة/معكوسة. في الوضع ده المتصفح نفسه هو اللي بيرسم الورقة (وبيوصّل العربي صح دايمًا)
 * وبنبعتها لـQZ Tray صورة جاهزة (التنفيذ في qzPrint.ts).
 *
 * الافتراضي لكل أجهزة العميل بيتحدد وقت البناء: VITE_PRINT_AS_IMAGE_DEFAULT=1 في frontend/.env.local
 * (من غيره الافتراضي مقفول زي الأول). اختيار الجهاز نفسه ('1' / '0') بيغلب الافتراضي.
 */
const IMAGE_MODE_KEY = 'qcp_print_as_image'
const DEFAULT_ON = (import.meta as any).env?.VITE_PRINT_AS_IMAGE_DEFAULT === '1'

export function isPrintAsImageEnabled(): boolean {
  try {
    const stored = localStorage.getItem(IMAGE_MODE_KEY)
    if (stored === '1') return true
    if (stored === '0') return false
    return DEFAULT_ON
  } catch {
    return DEFAULT_ON
  }
}

export function setPrintAsImageEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(IMAGE_MODE_KEY, enabled ? '1' : '0')
  } catch {
    // التخزين المحلي مش متاح
  }
}
