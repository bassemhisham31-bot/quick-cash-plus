// المرحلة 028 — صورة المنتج (تُخزَّن كـ data URL نصي زي شعار المتجر، من غير أي رفع لسيرفر خارجي)
export const migration028ProductImage = `
ALTER TABLE products ADD COLUMN image_data_url TEXT;
`
