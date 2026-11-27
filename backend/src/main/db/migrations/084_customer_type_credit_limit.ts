// المرحلة 084 (ويب — فرع elnasr) — نوع العميل وحد الائتمان (للتقرير المجمّع لكل العملاء).
export const migration084CustomerTypeCreditLimit = `
ALTER TABLE customers ADD COLUMN customer_type TEXT;
ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0;
`
