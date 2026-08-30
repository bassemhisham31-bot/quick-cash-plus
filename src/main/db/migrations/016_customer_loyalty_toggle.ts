// المرحلة 016 — تفعيل/تعطيل نقاط الولاء لعميل بعينه (فوق التفعيل العام في الإعدادات)

export const migration016CustomerLoyaltyToggle = `
ALTER TABLE customers ADD COLUMN loyalty_enabled INTEGER NOT NULL DEFAULT 1;
`
