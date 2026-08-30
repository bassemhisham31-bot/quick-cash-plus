// المرحلة 018 — عروض الأسعار: لا تؤثر على المخزون ولا رصيد العميل إطلاقًا، فقط عند التحويل الفعلي لفاتورة بيع

export const migration018Quotations = `
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT,
  subtotal REAL NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'value' CHECK (discount_type IN ('percent', 'value')),
  discount_value REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'expired')),
  valid_until TEXT,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  converted_invoice_id INTEGER REFERENCES sales_invoices(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id),
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  barcode TEXT,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
`
