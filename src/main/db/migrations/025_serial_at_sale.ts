// المرحلة 025 — تتبع سيريال نمبر مختلف لكل وحدة تتباع (زي IMEI) — اختياري لكل صنف، وبيتسجل على سطر الفاتورة وقت البيع

export const migration025SerialAtSale = `
ALTER TABLE products ADD COLUMN serial_tracking_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_items ADD COLUMN serial_number TEXT;
`
