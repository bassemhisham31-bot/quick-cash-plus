// المرحلة 041 — مرتجعات المشتريات (للموردين)، بنفس بنية مرتجعات المبيعات (migration 002) بالظبط:
// فاتورة مشتريات → purchase_return_items مربوطة بسطر شراء محدد (purchase_item_id) عشان تتبع الكمية
// المرتجعة لكل سطر لو الفاتورة اتسترجعت جزئيًا أكتر من مرة. عمود status جديد على purchase_invoices
// (مكانش موجود خالص قبل كده) بنفس قيم حالة فاتورة البيع (completed/partial_return/returned).

export const migration041PurchaseReturns = `
CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
  type TEXT NOT NULL CHECK (type IN ('full', 'partial')),
  amount REAL NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES purchase_returns(id),
  purchase_item_id INTEGER NOT NULL REFERENCES purchase_items(id),
  qty REAL NOT NULL,
  amount REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_item ON purchase_return_items(purchase_item_id);

ALTER TABLE purchase_invoices ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'
  CHECK (status IN ('completed', 'partial_return', 'returned'));
`
