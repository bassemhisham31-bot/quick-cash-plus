// المرحلة 036 — مديول المطاعم: ترابيزات الصالة، الطلبات المفتوحة (صالة/تيك أواي/ديلفري) وأصنافها،
// ربط تصنيف بطابعة مطبخ، سائقي التوصيل، وإعدادات المطاعم العامة. أعمدة جديدة على sales_invoices
// (نوع الطلب/الترابيزة/رسوم التوصيل/السائق/ضريبة الخدمة) بقيم افتراضية حتى تفضل الفواتير الحالية سليمة.

export const migration036RestaurantCore = `
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  zone TEXT,
  pos_x REAL NOT NULL DEFAULT 0,
  pos_y REAL NOT NULL DEFAULT 0,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  current_order_id INTEGER,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS restaurant_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
  table_id INTEGER REFERENCES restaurant_tables(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  customer_id INTEGER REFERENCES customers(id),
  delivery_address TEXT,
  delivery_driver_id INTEGER,
  delivery_fee REAL NOT NULL DEFAULT 0,
  kitchen_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (kitchen_status IN ('pending', 'preparing', 'ready', 'out_for_delivery', 'completed')),
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_status ON restaurant_orders(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_table ON restaurant_orders(table_id);

CREATE TABLE IF NOT EXISTS restaurant_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES restaurant_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  note TEXT,
  split_group INTEGER NOT NULL DEFAULT 1,
  kitchen_sent INTEGER NOT NULL DEFAULT 0,
  kitchen_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_order ON restaurant_order_items(order_id);

-- دمج الترابيزات: كل الترابيزات المدموجة تحت نفس الطلب بتتسجل هنا (many-to-many)
CREATE TABLE IF NOT EXISTS restaurant_order_tables (
  order_id INTEGER NOT NULL REFERENCES restaurant_orders(id),
  table_id INTEGER NOT NULL REFERENCES restaurant_tables(id),
  PRIMARY KEY (order_id, table_id)
);

CREATE TABLE IF NOT EXISTS category_printers (
  category_id INTEGER PRIMARY KEY REFERENCES categories(id),
  printer_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS restaurant_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dine_in_enabled INTEGER NOT NULL DEFAULT 1,
  takeaway_enabled INTEGER NOT NULL DEFAULT 1,
  delivery_enabled INTEGER NOT NULL DEFAULT 1,
  recipes_enabled INTEGER NOT NULL DEFAULT 1,
  service_charge_enabled INTEGER NOT NULL DEFAULT 0,
  service_charge_type TEXT NOT NULL DEFAULT 'percent' CHECK (service_charge_type IN ('percent', 'value')),
  service_charge_value REAL NOT NULL DEFAULT 0,
  default_kitchen_printer TEXT
);
INSERT OR IGNORE INTO restaurant_settings (id) VALUES (1);

ALTER TABLE sales_invoices ADD COLUMN order_type TEXT NOT NULL DEFAULT 'retail';
ALTER TABLE sales_invoices ADD COLUMN table_id INTEGER REFERENCES restaurant_tables(id);
ALTER TABLE sales_invoices ADD COLUMN delivery_fee REAL NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN delivery_driver_id INTEGER REFERENCES delivery_drivers(id);
ALTER TABLE sales_invoices ADD COLUMN service_charge_total REAL NOT NULL DEFAULT 0;
`
