// المرحلة 070 — الفروع (ميزة اختيارية بتتفعّل بـQCP_BRANCHES=on في .env العميل).
// الإضافة بس: جدول فروع + عمود branch_id (الافتراضي 1 = الفرع الرئيسي) على الجداول اللي بتتسجّل عليها العمليات.
// لو الميزة مقفولة كل الصفوف بتفضل على الفرع 1 ومفيش أي تغيير في السلوك.

export const migration070Branches = `
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO branches (id, name) VALUES (1, 'الفرع الرئيسي');

ALTER TABLE warehouses ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE treasuries ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cash_sessions ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE employees ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sales_invoices ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE purchase_invoices ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sales_returns ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE purchase_returns ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payments ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vouchers ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE held_invoices ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_branch ON sales_invoices(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_branch ON purchase_invoices(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch ON cash_sessions(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_warehouses_branch ON warehouses(branch_id);
`
