// المرحلة 085 (ويب — فرع elnasr) — نوع المورد وحد الائتمان (للتقرير المجمّع لكل الموردين).
export const migration085VendorTypeCreditLimit = `
ALTER TABLE vendors ADD COLUMN vendor_type TEXT;
ALTER TABLE vendors ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0;
`
