// المرحلة 29 — مزامنة الأصناف مع SQL Server لجهاز Price Checker

export const migration029PriceCheckerSync = `
CREATE TABLE IF NOT EXISTS price_checker_sync_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  server TEXT,
  port INTEGER NOT NULL DEFAULT 1433,
  database_name TEXT,
  username TEXT,
  password TEXT,
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_sync_error TEXT
);
INSERT OR IGNORE INTO price_checker_sync_settings (id) VALUES (1);
`
