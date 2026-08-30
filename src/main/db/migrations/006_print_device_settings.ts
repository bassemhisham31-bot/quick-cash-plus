// المرحلة 06 — إعدادات الطباعة والباركود والأجهزة

export const migration006PrintDeviceSettings = `
CREATE TABLE IF NOT EXISTS print_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_printer TEXT,
  paper_size TEXT NOT NULL DEFAULT '80mm' CHECK (paper_size IN ('80mm', '58mm', 'A5', 'A4')),
  print_mode TEXT NOT NULL DEFAULT 'manual' CHECK (print_mode IN ('auto', 'manual')),
  show_logo INTEGER NOT NULL DEFAULT 1,
  auto_print_after_sale INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO print_settings (id, default_printer, paper_size, print_mode, show_logo, auto_print_after_sale)
VALUES (1, NULL, '80mm', 'manual', 1, 0);

CREATE TABLE IF NOT EXISTS barcode_label_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  label_type TEXT NOT NULL DEFAULT 'auto' CHECK (label_type IN ('auto', 'QR', 'EAN8', 'EAN13', 'CODE128')),
  label_width_mm REAL NOT NULL DEFAULT 35,
  label_height_mm REAL NOT NULL DEFAULT 25,
  orientation TEXT NOT NULL DEFAULT 'vertical' CHECK (orientation IN ('horizontal', 'vertical')),
  show_name INTEGER NOT NULL DEFAULT 1,
  show_price INTEGER NOT NULL DEFAULT 1,
  show_barcode_number INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO barcode_label_settings
  (id, label_type, label_width_mm, label_height_mm, orientation, show_name, show_price, show_barcode_number)
VALUES (1, 'auto', 35, 25, 'vertical', 1, 1, 1);

CREATE TABLE IF NOT EXISTS device_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scanner_enabled INTEGER NOT NULL DEFAULT 1,
  scanner_timeout_ms INTEGER NOT NULL DEFAULT 100,
  scale_barcode_enabled INTEGER NOT NULL DEFAULT 0,
  scale_prefix TEXT NOT NULL DEFAULT '20',
  scale_code_length INTEGER NOT NULL DEFAULT 5,
  drawer_pin TEXT NOT NULL DEFAULT 'pin2',
  open_drawer_after_sale INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO device_settings
  (id, scanner_enabled, scanner_timeout_ms, scale_barcode_enabled, scale_prefix, scale_code_length, drawer_pin, open_drawer_after_sale)
VALUES (1, 1, 100, 0, '20', 5, 'pin2', 0);
`
