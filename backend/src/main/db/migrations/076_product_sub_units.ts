// المرحلة 076 (ويب) — صنف فرعي من وحدة أكبر (جركن زيت 100 كيلو ← كيلو زيت):
//   - products.parent_product_id = الصنف الكبير (الجركن) اللي الصنف ده (الكيلو) بيتفكّ منه.
//   - products.units_per_parent  = الوحدة الكبيرة فيها كام من الصنف ده (100).
// كل صنف ليه رصيده وسعره وباركوده عادي. لما رصيد الصنف الفرعي مايكفيش وقت البيع، السيرفر بيفكّ وحدة كبيرة تلقائيًا
// (−1 جركن، +100 كيلو) بحركتين مخزون 'adjustment' (ref_type = 'unit_break') — من غير أي تغيير في الفواتير/المرتجعات/التقارير.

export const migration076ProductSubUnits = `
ALTER TABLE products ADD COLUMN parent_product_id INTEGER;
ALTER TABLE products ADD COLUMN units_per_parent REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_product_id);
`
