// المرحلة 021 — إعدادات واجهة البيع: أصوات، صنف مؤقت خارج المخزون، تعديل السعر أثناء البيع،
// تفعيل/تعطيل تعدد المخازن، سايد بار التصنيفات، والعملة المعروضة (رمز/تنسيق فقط بدون تحويل حقيقي)

export const migration021PosUiSettings = `
CREATE TABLE IF NOT EXISTS pos_ui_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  sound_volume REAL NOT NULL DEFAULT 0.3,
  allow_temp_item INTEGER NOT NULL DEFAULT 0,
  price_edit_enabled INTEGER NOT NULL DEFAULT 0,
  multi_warehouse_enabled INTEGER NOT NULL DEFAULT 1,
  category_sidebar_enabled INTEGER NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'EGP',
  currency_symbol TEXT NOT NULL DEFAULT 'ج.م'
);
INSERT OR IGNORE INTO pos_ui_settings
  (id, sound_enabled, sound_volume, allow_temp_item, price_edit_enabled, multi_warehouse_enabled, category_sidebar_enabled, currency_code, currency_symbol)
VALUES (1, 1, 0.3, 0, 0, 1, 0, 'EGP', 'ج.م');
`
