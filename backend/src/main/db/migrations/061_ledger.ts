// المرحلة 061 — دفتر القيود: شجرة الحسابات + قيود يدوية + تكلفة الصنف وقت البيع.
// قيود المستندات (فواتير، سندات، مصروفات...) بتتولّد وقت القراءة من الجداول الأصلية (services/ledger.ts)
// فمفيش ازدواج ولا قيد بيتنسى لو فاتورة اتعدلت أو اتمسحت؛ الجداول دي بتخزّن الحسابات والقيود اليدوية بس.

export const migration061Ledger = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'cogs', 'expense')),
  is_system INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  account_code TEXT NOT NULL,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  memo TEXT
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);

-- تكلفة الوحدة وقت البيع (للفواتير القديمة NULL = تكلفة الصنف الحالية)
ALTER TABLE sales_items ADD COLUMN cost_price REAL;

INSERT OR IGNORE INTO user_permissions (user_id, permission_code)
  SELECT user_id, 'accounting.manage' FROM user_permissions WHERE permission_code = 'treasury.manage';
`
