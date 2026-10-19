// المرحلة 055 — صلاحية الخصم (pos.discount) + حد أقصى لنسبة الخصم. أي مستخدم كان بيبيع (البيع العادي أو المطعم)
// بياخد الصلاحية الجديدة عشان محدش يفقد حاجة كان بيعملها؛ الأدمن ممكن يسحبها بعد كده من إعدادات المستخدمين.

export const migration055DiscountPermission = `
ALTER TABLE pos_ui_settings ADD COLUMN max_discount_percent REAL NOT NULL DEFAULT 100;
INSERT OR IGNORE INTO user_permissions (user_id, permission_code)
  SELECT user_id, 'pos.discount' FROM user_permissions WHERE permission_code IN ('pos.sell', 'restaurant.manage');
`
