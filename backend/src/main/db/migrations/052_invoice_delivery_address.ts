// المرحلة 052 — ديلفري من شاشة البيع العادية: فاتورة البيع العادي مالهاش طلب مطعم (restaurant_orders)
// فالعنوان والعلامة المميزة بيتسجلوا على الفاتورة نفسها. فواتير المطعم بتفضل تاخدهم من الطلب.

export const migration052InvoiceDeliveryAddress = `
ALTER TABLE sales_invoices ADD COLUMN delivery_address TEXT;
ALTER TABLE sales_invoices ADD COLUMN delivery_mark TEXT;
`
