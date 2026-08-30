// المرحلة 026 — إذن إضافة / إذن خصم: مستندات تعديل مخزون منفصلة عن المشتريات/المبيعات (جرد، تالف، تسوية...)

export const migration026StockPermits = `
CREATE TABLE IF NOT EXISTS stock_permits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('addition', 'deduction')),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  reason TEXT,
  note TEXT,
  total_qty REAL NOT NULL DEFAULT 0,
  user_id INTEGER REFERENCES users(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_permits_type ON stock_permits(type);

CREATE TABLE IF NOT EXISTS stock_permit_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permit_id INTEGER NOT NULL REFERENCES stock_permits(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  qty REAL NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_stock_permit_items_permit ON stock_permit_items(permit_id);
`
