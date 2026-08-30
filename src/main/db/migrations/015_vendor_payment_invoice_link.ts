// المرحلة 015 — ربط سداد دفعات المورد بفاتورة مشتريات محددة (اختياري)

export const migration015VendorPaymentInvoiceLink = `
ALTER TABLE payments ADD COLUMN invoice_id INTEGER REFERENCES purchase_invoices(id);
`
