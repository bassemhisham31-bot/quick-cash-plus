// تاريخ انتهاء الصلاحية والرقم التسلسلي للمنتج (اختياريان)
export const migration010ProductExpirySerial = `
ALTER TABLE products ADD COLUMN expiry_date TEXT;
ALTER TABLE products ADD COLUMN serial_number TEXT;
`
