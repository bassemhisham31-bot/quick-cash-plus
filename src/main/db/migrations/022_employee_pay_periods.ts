// المرحلة 022 — نظام "فترات" للموظفين: كل موظف ممكن يبدأ فترة جديدة (بدل ما تفضل كل الحركات مجمّعة في سلة واحدة من غير حدود)،
// + نوع حركة جديد "تالف"، + مرفقات (إيصال/صورة) على كل حركة.

export const migration022EmployeePayPeriods = `
CREATE TABLE IF NOT EXISTS employee_pay_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_employee_pay_periods_employee ON employee_pay_periods(employee_id);

PRAGMA foreign_keys = OFF;

CREATE TABLE employee_transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL CHECK (type IN ('salary', 'bonus', 'advance', 'deduction', 'damage')),
  amount REAL NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  period_id INTEGER REFERENCES employee_pay_periods(id),
  attachment_path TEXT,
  attachment_name TEXT
);

INSERT INTO employee_transactions_new (id, employee_id, type, amount, note, user_id, created_at)
SELECT id, employee_id, type, amount, note, user_id, created_at FROM employee_transactions;

DROP TABLE employee_transactions;
ALTER TABLE employee_transactions_new RENAME TO employee_transactions;
CREATE INDEX IF NOT EXISTS idx_employee_transactions_employee ON employee_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_transactions_period ON employee_transactions(period_id);

PRAGMA foreign_keys = ON;
`
