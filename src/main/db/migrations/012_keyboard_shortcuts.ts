// اختصارات الكيبورد — صفوف أساسية (تنقل بين الشاشات + تبديل الوضع الليلي) قابلة للتعديل، بالإضافة لاختصارات مخصصة
export const migration012KeyboardShortcuts = `
CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  use_shift INTEGER NOT NULL DEFAULT 0,
  use_alt INTEGER NOT NULL DEFAULT 1,
  use_ctrl INTEGER NOT NULL DEFAULT 0,
  key TEXT NOT NULL,
  is_custom INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO keyboard_shortcuts (action_key, label, use_shift, use_alt, use_ctrl, key, is_custom) VALUES
  ('nav.dashboard', 'فتح لوحة التحكم', 0, 1, 0, '1', 0),
  ('nav.pos', 'فتح البيع', 0, 1, 0, '2', 0),
  ('nav.inventory', 'فتح المخزون', 0, 1, 0, '3', 0),
  ('nav.customers', 'فتح العملاء', 0, 1, 0, '4', 0),
  ('nav.vendors', 'فتح الموردين', 0, 1, 0, '5', 0),
  ('nav.invoices', 'فتح الفواتير', 0, 1, 0, '6', 0),
  ('nav.expenses', 'فتح المصروفات', 0, 1, 0, '7', 0),
  ('nav.reports', 'فتح التقارير', 0, 1, 0, '8', 0),
  ('nav.settings', 'فتح الإعدادات', 0, 1, 0, '9', 0),
  ('toggleTheme', 'تبديل الوضع الليلي', 0, 1, 1, 't', 0);
`
