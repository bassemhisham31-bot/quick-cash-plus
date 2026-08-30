// المرحلة 038 — الكباتن (نُدل الصالة): إدارة الكباتن، وربط الكابتن بطلب الصالة وبالفاتورة النهائية
// عشان اسمه يظهر في الفاتورة وبون التجهيز.

export const migration038RestaurantCaptains = `
CREATE TABLE IF NOT EXISTS captains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

ALTER TABLE restaurant_orders ADD COLUMN captain_id INTEGER REFERENCES captains(id);
ALTER TABLE sales_invoices ADD COLUMN captain_id INTEGER REFERENCES captains(id);
`
