// المرحلة 04 — المصروفات والموظفون والمرتبات

export const migration004ExpensesEmployees = `
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES expense_categories(id),
  session_id INTEGER REFERENCES cash_sessions(id),
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'card', 'wallet', 'transfer')),
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_session ON expenses(session_id);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  base_salary REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL CHECK (type IN ('salary', 'bonus', 'advance', 'deduction')),
  amount REAL NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_employee_transactions_employee ON employee_transactions(employee_id);
`
