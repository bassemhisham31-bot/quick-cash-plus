// المرحلة 083 (ويب — فرع elnasr) — المساعد الذكي: مايك + تنفيذ أوامر:
//   - actions_enabled (الافتراضي 1): المساعد يقدر يفتح الشاشات ويجهّز فاتورة بيع وسداد عميل ومصروف بناءً على كلام المستخدم.
//   - confirm_actions (الافتراضي 1): أي عملية بتغيّر بيانات (حفظ الفاتورة، سداد، مصروف) بتستنى تأكيد المستخدم.
//   - voice_enabled (الافتراضي 1): زرار المايك في نافذة المساعد.
//   - voice_reply_enabled (الافتراضي 0): المساعد يقرا الرد بصوت.
export const migration083AssistantVoiceActions = `
ALTER TABLE assistant_settings ADD COLUMN actions_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assistant_settings ADD COLUMN confirm_actions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assistant_settings ADD COLUMN voice_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assistant_settings ADD COLUMN voice_reply_enabled INTEGER NOT NULL DEFAULT 0;
`
