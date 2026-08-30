// المرحلة 017 — المناديب ونسبة العمولة الثابتة لكل مندوب من كل عملية بيع

export const migration017SalesReps = `
CREATE TABLE IF NOT EXISTS sales_reps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  commission_percent REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE sales_invoices ADD COLUMN sales_rep_id INTEGER REFERENCES sales_reps(id);
ALTER TABLE sales_invoices ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0;
`
