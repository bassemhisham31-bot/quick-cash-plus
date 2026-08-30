// المرحلة 045 — حجز الترابيزة: سجل حجوزات بسيط جنب تاب "الترابيزات" (مش مرتبط تلقائيًا بفتح طلب —
// لما العميل يوصل، الموظف بيفتح الطلب عادي من شاشة الترابيزات ويأكد الحجز يدوي كـ"تم الجلوس").

export const migration045TableReservations = `
CREATE TABLE IF NOT EXISTS table_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER REFERENCES restaurant_tables(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  party_size INTEGER NOT NULL DEFAULT 1,
  reservation_at TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'seated', 'cancelled', 'no_show')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_table_reservations_at ON table_reservations(reservation_at);
`
