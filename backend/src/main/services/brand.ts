/**
 * اسم البرنامج الظاهر للعميل في المطبوعات والتقارير — من QCP_BRAND_NAME في .env الخاص بالعميل،
 * والافتراضي Quick Cash Plus. نظيره في الواجهة VITE_BRAND_NAME (frontend/.env.local وقت البناء).
 */
export function brandName(): string {
  return (process.env.QCP_BRAND_NAME ?? '').trim() || 'Quick Cash Plus'
}
