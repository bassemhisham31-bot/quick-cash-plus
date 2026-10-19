// المرحلة 060 — الخزائن والسندات وتحويلات الخزائن وفروقات الخزينة.
// الخزينة مرتبطة بوسائل الدفع (methods) عشان المبيعات/المصروفات/المدفوعات تتوزّع عليها تلقائيًا من غير ما نكرر تسجيل أي حاجة:
// حركة الخزينة بتتحسب من الجداول الأصلية (فواتير، مصروفات، مدفوعات...) + السندات اليدوية + التحويلات + فروقات الورديات.

export const migration060TreasuriesVouchers = `
CREATE TABLE IF NOT EXISTS treasuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'cash' CHECK (kind IN ('cash', 'bank', 'wallet')),
  opening_balance REAL NOT NULL DEFAULT 0,
  methods TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO treasuries (name, kind, opening_balance, methods, is_default) VALUES
  ('الخزينة الرئيسية', 'cash', 0, 'cash', 1),
  ('البنك', 'bank', 0, 'card,transfer', 0),
  ('المحافظ الإلكترونية', 'wallet', 0, 'wallet,vodafone_cash,instapay', 0);

ALTER TABLE payments ADD COLUMN treasury_id INTEGER REFERENCES treasuries(id);
ALTER TABLE expenses ADD COLUMN treasury_id INTEGER REFERENCES treasuries(id);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('receipt', 'payment')),
  treasury_id INTEGER NOT NULL REFERENCES treasuries(id),
  amount REAL NOT NULL,
  party_type TEXT NOT NULL CHECK (party_type IN ('customer', 'vendor', 'other')),
  party_id INTEGER,
  party_name TEXT,
  category_id INTEGER,
  note TEXT,
  payment_id INTEGER,
  expense_id INTEGER,
  user_id INTEGER REFERENCES users(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(type, created_at);

CREATE TABLE IF NOT EXISTS treasury_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_treasury_id INTEGER NOT NULL REFERENCES treasuries(id),
  to_treasury_id INTEGER NOT NULL REFERENCES treasuries(id),
  amount REAL NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_differences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL UNIQUE REFERENCES cash_sessions(id),
  treasury_id INTEGER NOT NULL REFERENCES treasuries(id),
  expected REAL NOT NULL,
  actual REAL NOT NULL,
  difference REAL NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- صلاحيات الشاشات الجديدة: اللي كان بيدير المصروفات يدير الخزائن، واللي كان بيشوف التقارير يشوف التقارير المحاسبية
INSERT OR IGNORE INTO user_permissions (user_id, permission_code)
  SELECT user_id, 'treasury.manage' FROM user_permissions WHERE permission_code = 'expenses.manage';
INSERT OR IGNORE INTO user_permissions (user_id, permission_code)
  SELECT user_id, 'accounting.view' FROM user_permissions WHERE permission_code = 'reports.view';
`
