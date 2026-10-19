// المرحلة 056 — اسم عميل مكتوب يدويًا عند الدفع (للعميل العابر من غير ما نعمله ملف عميل)

export const migration056InvoiceCustomerLabel = `
ALTER TABLE sales_invoices ADD COLUMN customer_label TEXT;
`
