// المرحلة 32 — معايرة الطباعة الحرارية (عرض المحتوى + الإزاحة الأفقية لكل مقاس ورق)

export const migration032ThermalPrintCalibration = `
ALTER TABLE print_settings ADD COLUMN thermal_content_width_80mm REAL NOT NULL DEFAULT 76;
ALTER TABLE print_settings ADD COLUMN thermal_content_width_58mm REAL NOT NULL DEFAULT 36;
ALTER TABLE print_settings ADD COLUMN thermal_offset_80mm REAL NOT NULL DEFAULT 0;
ALTER TABLE print_settings ADD COLUMN thermal_offset_58mm REAL NOT NULL DEFAULT 0;
`
