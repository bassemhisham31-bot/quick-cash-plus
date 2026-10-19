// المرحلة 065 — حجوزات المناسبات (أعياد الميلاد وغيرها): باكدجات + حجوزات + عربون/دفعات بتدخل الخزينة

export const migration065EventBookings = `
CREATE TABLE IF NOT EXISTS event_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  price_type TEXT NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'per_person')),
  is_active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL DEFAULT 'PENDING',
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  event_type TEXT NOT NULL DEFAULT 'عيد ميلاد',
  honoree TEXT,
  event_date TEXT NOT NULL,
  event_time TEXT,
  guests INTEGER NOT NULL DEFAULT 1,
  package_id INTEGER REFERENCES event_packages(id),
  package_name TEXT,
  base_price REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_bookings_date ON event_bookings(event_date);

CREATE TABLE IF NOT EXISTS event_booking_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES event_bookings(id),
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  session_id INTEGER REFERENCES cash_sessions(id),
  user_id INTEGER REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_payments_booking ON event_booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_session ON event_booking_payments(session_id);
`
