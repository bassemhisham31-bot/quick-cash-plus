/**
 * تاريخ اليوم (YYYY-MM-DD) بتوقيت جهاز المستخدم — مش UTC.
 * toISOString() بيرجّع تاريخ UTC، فبين 12 و 2 بعد منتصف الليل (القاهرة) كان بيطلع تاريخ إمبارح في فلاتر التقارير.
 */
export function localIsoDate(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
