// Quick Cash Plus — المخطط الأساسي (المرحلة 00 + 01)
// ملاحظة: محفوظة كسلسلة نصية (وليست ملف .sql مستقل) حتى تُضمّن تلقائيًا
// في حزمة عملية Main عند البناء بدون إعداد نسخ أصول إضافي في Vite.
export const migration001Init = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (user_id, permission_code)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  factor REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  category_id INTEGER REFERENCES categories(id),
  unit_id INTEGER REFERENCES units(id),
  cost_price REAL NOT NULL DEFAULT 0,
  retail_price REAL NOT NULL DEFAULT 0,
  reorder_point REAL NOT NULL DEFAULT 5,
  is_active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  quantity REAL NOT NULL DEFAULT 0,
  UNIQUE (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  type TEXT NOT NULL CHECK (type IN ('opening', 'sale', 'sale_return', 'purchase', 'transfer', 'adjustment')),
  qty REAL NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  balance REAL NOT NULL DEFAULT 0,
  loyalty_points REAL NOT NULL DEFAULT 0,
  is_walk_in INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_by INTEGER NOT NULL REFERENCES users(id),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  opening_balance REAL NOT NULL DEFAULT 0,
  closed_by INTEGER REFERENCES users(id),
  closed_at TEXT,
  expected_cash REAL,
  actual_cash REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS sales_invoices (
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
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'credit', 'card', 'wallet', 'mixed')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'returned', 'partial_return')),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_number ON sales_invoices(number);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_created_at ON sales_invoices(created_at);

CREATE TABLE IF NOT EXISTS sales_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  barcode TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_items(invoice_id);
`
