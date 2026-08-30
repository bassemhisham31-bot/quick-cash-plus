// المرحلة 024 — إظهار/إخفاء الصنف في شاشة اختيار المنتجات بالبيع (يفضل قابل للإضافة بالسكان حتى لو مخفي)

export const migration024ProductShowInPos = `
ALTER TABLE products ADD COLUMN show_in_pos INTEGER NOT NULL DEFAULT 1;
`
