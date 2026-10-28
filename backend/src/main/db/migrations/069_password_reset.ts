// المرحلة 069 — استعادة كلمة المرور بالإيميل: إيميل اختياري لكل مستخدم + جدول روابط الاستعادة (بنخزّن الـhash بس، مش الرابط نفسه)

export const migration069PasswordReset = `
ALTER TABLE users ADD COLUMN email TEXT;

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
`
