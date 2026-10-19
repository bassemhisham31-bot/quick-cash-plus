// المرحلة 048 — شكل الترابيزة في مخطط الصالة (auto = حسب عدد الكراسي، round/square/rect اختيار يدوي)

export const migration048TableShape = `
ALTER TABLE restaurant_tables ADD COLUMN shape TEXT NOT NULL DEFAULT 'auto';
`
