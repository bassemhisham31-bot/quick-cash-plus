// المرحلة 047 — سعر وسيريال اختياريين لكل سطر في إذن الإضافة/الخصم (كلاهما اختياري، معلوماتي فقط)

export const migration047StockPermitPriceSerial = `
ALTER TABLE stock_permit_items ADD COLUMN unit_price REAL;
ALTER TABLE stock_permit_items ADD COLUMN serial_number TEXT;
`
