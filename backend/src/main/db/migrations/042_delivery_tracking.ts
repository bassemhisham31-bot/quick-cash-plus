// المرحلة 042 — صفحة "التوصيل والطيارين": مناطق توصيل بأسعار ثابتة (اختياري، لتسهيل تعبئة رسوم
// التوصيل بدل الكتابة اليدوية كل مرة)، وتتبع حالة تسليم فاتورة الديلفري بعد الدفع (قيد التحضير/مع
// الطيار/تم التسليم) — الحالة دي على sales_invoices مباشرة لأن restaurant_orders بتتقفل/تتحول
// لفاتورة عادية بمجرد الدفع، فمفيش كيان "طلب" يفضل موجود بعد كده يتتبّع عليه.

export const migration042DeliveryTracking = `
CREATE TABLE IF NOT EXISTS delivery_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

ALTER TABLE sales_invoices ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (delivery_status IN ('pending', 'with_driver', 'delivered'));
`
