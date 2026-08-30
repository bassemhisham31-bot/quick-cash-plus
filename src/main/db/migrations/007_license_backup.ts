// المرحلة 07 — الترخيص والنسخ الاحتياطي

export const migration007LicenseBackup = `
CREATE TABLE IF NOT EXISTS license (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  device_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired')),
  license_key TEXT,
  plan TEXT,
  first_run_at TEXT NOT NULL DEFAULT (datetime('now')),
  trial_days INTEGER NOT NULL DEFAULT 15,
  activated_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS backup_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  auto_backup_enabled INTEGER NOT NULL DEFAULT 1,
  backup_folder TEXT,
  frequency_hours INTEGER NOT NULL DEFAULT 24,
  keep_count INTEGER NOT NULL DEFAULT 10,
  last_backup_at TEXT,
  google_drive_enabled INTEGER NOT NULL DEFAULT 0,
  google_client_id TEXT,
  google_refresh_token TEXT,
  google_account_email TEXT,
  last_cloud_backup_at TEXT
);
INSERT OR IGNORE INTO backup_settings (id, auto_backup_enabled, backup_folder, frequency_hours, keep_count)
VALUES (1, 1, NULL, 24, 10);

CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('local', 'cloud')),
  file_path TEXT,
  size_bytes INTEGER,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
