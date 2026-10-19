// المرحلة 058 — فواتير معلّقة (حفظ الفاتورة قبل الدفع للرجوع لها/طباعتها في أي وقت) + خيارات في إعدادات البيع

export const migration058HeldInvoices = `
CREATE TABLE IF NOT EXISTS held_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  customer_id INTEGER,
  customer_label TEXT,
  items_count REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
ALTER TABLE pos_ui_settings ADD COLUMN hold_invoices_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_ui_settings ADD COLUMN auto_hold_on_leave INTEGER NOT NULL DEFAULT 1;
`
