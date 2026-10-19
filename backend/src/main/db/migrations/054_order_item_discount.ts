// المرحلة 054 — خصم على كل صنف في طلب المطعم + خصم على الطلب كله (نسبة أو قيمة)

export const migration054OrderItemDiscount = `
ALTER TABLE restaurant_order_items ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'value';
ALTER TABLE restaurant_order_items ADD COLUMN discount_value REAL NOT NULL DEFAULT 0;
ALTER TABLE restaurant_orders ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'value';
ALTER TABLE restaurant_orders ADD COLUMN discount_value REAL NOT NULL DEFAULT 0;
`
