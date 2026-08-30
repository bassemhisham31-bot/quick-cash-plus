// المرحلة 03 — تسعير متعدد المستويات، تعدد المخازن والنقل بينها، وفواتير المشتريات

export const migration003PricingWarehousesPurchases = `
ALTER TABLE sales_invoices ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id);
UPDATE sales_invoices SET warehouse_id = (SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1)
  WHERE warehouse_id IS NULL;

CREATE TABLE IF NOT EXISTS product_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  tier TEXT NOT NULL CHECK (tier IN ('wholesale', 'wholesale2', 'pack')),
  price REAL NOT NULL,
  UNIQUE (product_id, tier)
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  vendor_id INTEGER REFERENCES vendors(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  total REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'credit', 'card', 'wallet')),
  paid REAL NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  qty REAL NOT NULL,
  purchase_price REAL NOT NULL,
  total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_invoice ON purchase_items(purchase_invoice_id);
`
