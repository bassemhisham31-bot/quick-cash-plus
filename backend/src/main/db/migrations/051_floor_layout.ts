// المرحلة 051 — مخطط الصالة لما الترابيزات تكتر (40 ترابيزة مثلاً):
// 1) حجم لكل ترابيزة لوحدها (size_scale: 1 = الحجم العادي).
// 2) إعدادات الصالة نفسها (صف واحد): مساحتها (عرض/ارتفاع بوحدات افتراضية)، حجم كل الترابيزات، وإظهار الخطوط الفاصلة.
//    المخطط كله بيتكبّر/يتصغّر مع بعض على أي شاشة، فالترتيب بيفضل هو هو على الجهاز الرئيسي والفرعي.
// 3) خطوط فاصلة اختيارية بين الترابيزات (أفقي/رأسي + اسم اختياري) — تتضاف وتتشال براحتك.

export const migration051FloorLayout = `
ALTER TABLE restaurant_tables ADD COLUMN size_scale REAL NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS restaurant_floor_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  floor_width REAL NOT NULL DEFAULT 1200,
  floor_height REAL NOT NULL DEFAULT 700,
  table_scale REAL NOT NULL DEFAULT 1,
  show_lines INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO restaurant_floor_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS restaurant_floor_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT,
  orientation TEXT NOT NULL DEFAULT 'h',
  pos_x REAL NOT NULL DEFAULT 10,
  pos_y REAL NOT NULL DEFAULT 50,
  length REAL NOT NULL DEFAULT 40,
  style TEXT NOT NULL DEFAULT 'solid',
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
