// المرحلة 066 — الحضور والانصراف: ماكينة بصمة على الشبكة (ZKTeco) + سجل البصمات + ربط الموظف برقمه على الجهاز

export const migration066Attendance = `
ALTER TABLE employees ADD COLUMN device_user_id TEXT;

CREATE TABLE IF NOT EXISTS attendance_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  device_ip TEXT NOT NULL DEFAULT '',
  device_port INTEGER NOT NULL DEFAULT 4370,
  auto_sync_minutes INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_sync_error TEXT
);
INSERT OR IGNORE INTO attendance_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_user_id TEXT NOT NULL,
  punched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (device_user_id, punched_at)
);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_time ON attendance_logs(punched_at);
`
