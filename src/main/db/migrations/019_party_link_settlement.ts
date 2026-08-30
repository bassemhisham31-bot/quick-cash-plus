// المرحلة 019 — ربط عميل بمورد (نفس الشخص) + تسوية اختيارية عند البيع تخصم من رصيد المورد المستحق
// بدون أي خصم تلقائي — الربط للعرض/التقارير فقط، والتسوية اختيار صريح وقت البيع.

export const migration019PartyLinkSettlement = `
ALTER TABLE customers ADD COLUMN linked_vendor_id INTEGER REFERENCES vendors(id);

CREATE TABLE IF NOT EXISTS party_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  amount REAL NOT NULL,
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_party_settlements_vendor ON party_settlements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_party_settlements_customer ON party_settlements(customer_id);
`
