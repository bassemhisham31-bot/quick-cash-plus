// المرحلة 020 — إضافة وسيلتي دفع (فودافون كاش وInstaPay). SQLite ما بيدعمش تعديل CHECK
// مباشر، فبنعيد بناء sales_invoices وpurchase_invoices بنفس الأعمدة + CHECK محدّث (النمط الموصى به رسميًا من SQLite).
// مع تعطيل foreign_keys مؤقتًا عشان DROP TABLE ميعملش implicit DELETE بيكسر الجداول المرتبطة (sales_items, purchase_items, payments...).
// وبالمناسبة بنضيف عمود purchase_invoices.note الناقص (كان services/purchases.ts بيحاول يقرأه وهو مش موجود أصلاً).

export const migration020PaymentMethodsWallets = `
PRAGMA foreign_keys = OFF;

CREATE TABLE sales_invoices_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
  cashier_id INTEGER NOT NULL REFERENCES users(id),
  subtotal REAL NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'value' CHECK (discount_type IN ('percent', 'value')),
  discount_value REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  paid REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'credit', 'card', 'wallet', 'mixed', 'vodafone_cash', 'instapay')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'returned', 'partial_return')),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT,
  warehouse_id INTEGER REFERENCES warehouses(id),
  tax_total REAL NOT NULL DEFAULT 0,
  loyalty_points_earned REAL NOT NULL DEFAULT 0,
  loyalty_points_redeemed REAL NOT NULL DEFAULT 0,
  sales_rep_id INTEGER REFERENCES sales_reps(id),
  commission_amount REAL NOT NULL DEFAULT 0
);

INSERT INTO sales_invoices_new
  (id, number, customer_id, session_id, cashier_id, subtotal, discount_type, discount_value, discount_total, total,
   paid, payment_method, status, deleted_at, created_at, note, warehouse_id, tax_total, loyalty_points_earned,
   loyalty_points_redeemed, sales_rep_id, commission_amount)
SELECT id, number, customer_id, session_id, cashier_id, subtotal, discount_type, discount_value, discount_total, total,
   paid, payment_method, status, deleted_at, created_at, note, warehouse_id, tax_total, loyalty_points_earned,
   loyalty_points_redeemed, sales_rep_id, commission_amount
FROM sales_invoices;

DROP TABLE sales_invoices;
ALTER TABLE sales_invoices_new RENAME TO sales_invoices;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_number ON sales_invoices(number);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_created_at ON sales_invoices(created_at);

CREATE TABLE purchase_invoices_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  vendor_id INTEGER REFERENCES vendors(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  total REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'credit', 'card', 'wallet', 'vodafone_cash', 'instapay')),
  paid REAL NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO purchase_invoices_new (id, number, vendor_id, warehouse_id, total, payment_method, paid, user_id, created_at)
SELECT id, number, vendor_id, warehouse_id, total, payment_method, paid, user_id, created_at
FROM purchase_invoices;

DROP TABLE purchase_invoices;
ALTER TABLE purchase_invoices_new RENAME TO purchase_invoices;

PRAGMA foreign_keys = ON;
`
