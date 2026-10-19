// المرحلة 049 — طلبات المستخدم بعد التجربة الحقيقية للمطعم:
// 1) ضريبة خاصة بالمطعم بنفس فكرة الخدمة (تفعيل + نسبة/قيمة + أنواع الطلبات اللي تتطبق عليها) — لو مفعّلة
//    بتحل محل ضريبة البرنامج العامة لفواتير المطعم بس (البيع العادي بيفضل على الضريبة العامة).
// 2) فتح طلب جديد تلقائي بعد الإرسال للمطبخ (تجهيز).
// 3) إشعارات طلبات التجهيز — كل إرسال للمطبخ (من أي جهاز، رئيسي أو فرعي) بيتسجل هنا عشان يظهر فورًا في زرار
//    إشعارات المطبخ فوق.
// 4) وقت طباعة الشيك (الحساب قبل الدفع) على الطلب.

export const migration049RestaurantTaxKitchenNotifications = `
ALTER TABLE restaurant_settings ADD COLUMN tax_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restaurant_settings ADD COLUMN tax_name TEXT NOT NULL DEFAULT 'ضريبة';
ALTER TABLE restaurant_settings ADD COLUMN tax_type TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE restaurant_settings ADD COLUMN tax_value REAL NOT NULL DEFAULT 14;
ALTER TABLE restaurant_settings ADD COLUMN tax_dine_in INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restaurant_settings ADD COLUMN tax_takeaway INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restaurant_settings ADD COLUMN tax_delivery INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restaurant_settings ADD COLUMN auto_new_order_after_kitchen INTEGER NOT NULL DEFAULT 1;

ALTER TABLE restaurant_orders ADD COLUMN check_printed_at TEXT;

CREATE TABLE IF NOT EXISTS kitchen_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  order_number TEXT NOT NULL,
  order_type TEXT NOT NULL,
  table_label TEXT,
  captain_name TEXT,
  items_summary TEXT NOT NULL,
  items_count REAL NOT NULL DEFAULT 0,
  sent_by_user_id INTEGER,
  sent_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_kitchen_notifications_created ON kitchen_notifications(created_at);
`
