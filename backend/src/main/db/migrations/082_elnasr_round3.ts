// المرحلة 082 (ويب — فرع elnasr) — ٣ خيارات في إعدادات شاشة البيع:
//   - credit_only_payment (الافتراضي 1): شاشة الدفع بتفتح على «آجل» ووسائل الدفع التانية مخفية (لو اتقفل بترجع كل الوسائل والافتراضي نقدي).
//   - blank_line_on_add (الافتراضي 1): الصنف بيتضاف في السلة بكمية صفر وسعر صفر والمؤشر على الكمية (الكاشير بيكتب الكمية والسعر بنفسه)؛
//     بيشتغل بس لو تعديل السعر مسموح للمستخدم.
//   - unposted_copies (الافتراضي 3): عدد نسخ الطباعة بعد «حفظ بدون ترحيل».

export const migration082ElnasrRound3 = `
ALTER TABLE pos_ui_settings ADD COLUMN credit_only_payment INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_ui_settings ADD COLUMN blank_line_on_add INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_ui_settings ADD COLUMN unposted_copies INTEGER NOT NULL DEFAULT 3;
`
