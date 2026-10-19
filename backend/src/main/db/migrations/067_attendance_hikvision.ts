// المرحلة 067 — دعم ماكينات Hikvision (ISAPI) للحضور والانصراف: نوع الجهاز + مستخدم/باسورد + HTTPS

export const migration067AttendanceHikvision = `
ALTER TABLE attendance_settings ADD COLUMN device_type TEXT NOT NULL DEFAULT 'hikvision';
ALTER TABLE attendance_settings ADD COLUMN device_user TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE attendance_settings ADD COLUMN device_password TEXT NOT NULL DEFAULT '';
ALTER TABLE attendance_settings ADD COLUMN use_https INTEGER NOT NULL DEFAULT 0;
UPDATE attendance_settings SET device_port = 80 WHERE device_port = 4370 AND device_ip = '';
`
