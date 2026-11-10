/**
 * اسم البرنامج الظاهر في الواجهة (شاشة الدخول، القائمة الجانبية، عن البرنامج، عنوان التبويب).
 * بيتحدد وقت البناء من VITE_BRAND_NAME (ملف frontend/.env.local في الـcheckout الخاص بالعميل) —
 * من غيره الاسم الافتراضي Quick Cash Plus. الباك إند له نظيره QCP_BRAND_NAME (الإيصالات والتقارير).
 */
const raw = String(((import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_BRAND_NAME as string | undefined) ?? '').trim()
export const BRAND_NAME = raw || 'Quick Cash Plus'
/** الحرف اللي بيظهر في مربع الشعار */
export const BRAND_INITIAL = BRAND_NAME.charAt(0).toUpperCase()
