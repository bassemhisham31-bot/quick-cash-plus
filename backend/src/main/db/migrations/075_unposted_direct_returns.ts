// المرحلة 075 (ويب فقط) — طلبات عميل ElNASR:
//   - pos_ui_settings.unposted_mode = 1 (الافتراضي — بطلب المستخدم، ويتقفل من إعدادات شاشة البيع) → بدل «تعليق» في شاشة البيع: «حفظ بدون ترحيل وطباعة» + قايمة «غير مرحّلة» فيها «حفظ نهائي».
//     (نفس جدول held_invoices — الفاتورة غير المرحّلة مابتأثرش على المخزون ولا رصيد العميل لحد الحفظ النهائي.)
//   - pos_ui_settings.receipt_style = 'document' → تصميم الإيصال الحراري بشكل «مستند» (رقم المستند/الحالة/جدول كمية-سعر-قيمة-خصم/رصيد العميل).
//   - pos_ui_settings.sales_rep_pos_enabled = 0 → إخفاء اختيار «المحل المسوّق» من شاشة البيع (الافتراضي ظاهر زي ما كان).
//   - مرتجع مبيعات بدون فاتورة: أصناف بس (+ عميل اختياري)، بيرجّع المخزون ويرد الفلوس نقدًا أو يخصم من رصيد العميل.

export const migration075UnpostedDirectReturns = `
ALTER TABLE pos_ui_settings ADD COLUMN unposted_mode INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_ui_settings ADD COLUMN sales_rep_pos_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_ui_settings ADD COLUMN receipt_style TEXT NOT NULL DEFAULT 'classic';

CREATE TABLE IF NOT EXISTS direct_sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  customer_label TEXT,
  warehouse_id INTEGER NOT NULL,
  refund_method TEXT NOT NULL DEFAULT 'cash',
  amount REAL NOT NULL DEFAULT 0,
  balance_before REAL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  branch_id INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_direct_sales_returns_customer ON direct_sales_returns(customer_id);

CREATE TABLE IF NOT EXISTS direct_sales_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES direct_sales_returns(id),
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  cost_price REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_direct_sales_return_items_return ON direct_sales_return_items(return_id);
`
