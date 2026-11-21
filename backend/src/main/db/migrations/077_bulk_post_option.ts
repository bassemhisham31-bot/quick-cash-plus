// المرحلة 077 (ويب فقط) — «الترحيل الجماعي» للفواتير غير المرحّلة بقى اختياري من إعدادات شاشة البيع:
//   - pos_ui_settings.bulk_post_enabled = 1 (الافتراضي — نفس السلوك القديم: مربعات الاختيار + «تحديد الكل» + «ترحيل المحدد» في قايمة غير المرحّلة)،
//     ولو اتقفل بتفضل «حفظ نهائي» لكل فاتورة لوحدها بس.

export const migration077BulkPostOption = `
ALTER TABLE pos_ui_settings ADD COLUMN bulk_post_enabled INTEGER NOT NULL DEFAULT 1;
`
