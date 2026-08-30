// المرحلة 037 — الوصفات (BOM): ربط الصنف النهائي (الوجبة) بالخامات الخام وكمية كل خامة،
// عشان خصم المخزون التلقائي من الخامات بدل الصنف النهائي نفسه عند البيع.

export const migration037RestaurantRecipes = `
CREATE TABLE IF NOT EXISTS recipe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  raw_material_product_id INTEGER NOT NULL REFERENCES products(id),
  qty_per_unit REAL NOT NULL,
  UNIQUE(product_id, raw_material_product_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_items_product ON recipe_items(product_id);
`
