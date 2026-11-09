/**
 * وضع "طباعة كصورة" (خاص بالجهاز ده، بيتخزن محليًا): على بعض الأجهزة محرّك الرسم الداخلي بتاع QZ Tray
 * بيطبع الحروف العربي مفكوكة. في الوضع ده المتصفح نفسه هو اللي بيرسم الورقة (وبيوصّل العربي صح دايمًا)
 * وبنبعتها لـQZ Tray صورة جاهزة (التنفيذ في qzPrint.ts).
 */
const IMAGE_MODE_KEY = 'qcp_print_as_image'

export function isPrintAsImageEnabled(): boolean {
  try {
    return localStorage.getItem(IMAGE_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function setPrintAsImageEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(IMAGE_MODE_KEY, '1')
    else localStorage.removeItem(IMAGE_MODE_KEY)
  } catch {
    // التخزين المحلي مش متاح
  }
}
