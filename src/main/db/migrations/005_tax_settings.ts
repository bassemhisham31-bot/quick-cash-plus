// المرحلة 05 — إعدادات الضرائب والفاتورة الإلكترونية

export const migration005TaxSettings = `
ALTER TABLE sales_invoices ADD COLUMN tax_total REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tax_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT 'مصر',
  tax_number TEXT,
  tax_name TEXT NOT NULL DEFAULT 'ضريبة القيمة المضافة',
  rate REAL NOT NULL DEFAULT 14,
  e_invoice_enabled INTEGER NOT NULL DEFAULT 0,
  qr_enabled INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO tax_settings (id, enabled, country, tax_number, tax_name, rate, e_invoice_enabled, qr_enabled)
VALUES (1, 0, 'مصر', NULL, 'ضريبة القيمة المضافة', 14, 0, 1);
`
