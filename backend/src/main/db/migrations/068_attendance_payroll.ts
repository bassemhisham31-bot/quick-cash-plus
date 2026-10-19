// المرحلة 068 — ربط الحضور بالمرتبات: وردية كل موظف + قواعد الخصم/الإضافي + سجل الاعتمادات (عشان مفيش خصم يتكرر لنفس الفترة)

export const migration068AttendancePayroll = `
ALTER TABLE employees ADD COLUMN shift_start TEXT;
ALTER TABLE employees ADD COLUMN shift_end TEXT;
ALTER TABLE employees ADD COLUMN weekly_off TEXT NOT NULL DEFAULT '5';

ALTER TABLE attendance_settings ADD COLUMN default_shift_start TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE attendance_settings ADD COLUMN default_shift_end TEXT NOT NULL DEFAULT '17:00';
ALTER TABLE attendance_settings ADD COLUMN grace_minutes INTEGER NOT NULL DEFAULT 10;
ALTER TABLE attendance_settings ADD COLUMN late_multiplier REAL NOT NULL DEFAULT 1;
ALTER TABLE attendance_settings ADD COLUMN absence_multiplier REAL NOT NULL DEFAULT 1;
ALTER TABLE attendance_settings ADD COLUMN overtime_multiplier REAL NOT NULL DEFAULT 0;
ALTER TABLE attendance_settings ADD COLUMN overtime_min_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE attendance_settings ADD COLUMN month_days INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS attendance_payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  deduction_tx_id INTEGER,
  bonus_tx_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_payroll_runs_emp ON attendance_payroll_runs(employee_id);
`
