// بيانات المتجر — تُستخدم في تصميم طباعة الفاتورة (شعار، اسم، عنوان، رسالة شكر)

export const migration008StoreSettings = `
CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Quick Cash Plus',
  phone TEXT,
  address TEXT,
  website TEXT,
  thank_you_message TEXT NOT NULL DEFAULT 'شكرًا لتعاملكم معنا',
  logo_data_url TEXT
);
INSERT OR IGNORE INTO store_settings (id, name, phone, address, website, thank_you_message, logo_data_url)
VALUES (1, 'Quick Cash Plus', NULL, NULL, NULL, 'شكرًا لتعاملكم معنا', NULL);
`
