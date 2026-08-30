// المرحلة 34 — ارتفاع الصفحة الافتراضي للطباعة الحرارية قابل للتعديل (كان ثابت 1000مم)
export const migration034ThermalPageHeight = `
ALTER TABLE print_settings ADD COLUMN thermal_page_height_mm REAL NOT NULL DEFAULT 1000;
`
