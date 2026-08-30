// إعدادات نقاط الولاء — صف واحد ثابت زي store_settings
export const migration011LoyaltySettings = `
CREATE TABLE IF NOT EXISTS loyalty_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  points_per_currency REAL NOT NULL DEFAULT 1,
  redemption_value REAL NOT NULL DEFAULT 0.1
);
INSERT OR IGNORE INTO loyalty_settings (id, enabled, points_per_currency, redemption_value)
VALUES (1, 0, 1, 0.1);
`
