// المرحلة 059 — مخزن لكل صنف في فاتورة البيع (الصنف ممكن يتباع من مخزن غير مخزن باقي الفاتورة).
// NULL = مخزن الفاتورة نفسها (كل الفواتير القديمة).

export const migration059SalesItemWarehouse = `
ALTER TABLE sales_items ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id);
`
