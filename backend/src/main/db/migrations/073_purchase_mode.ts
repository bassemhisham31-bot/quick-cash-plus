// المرحلة 073 (ويب فقط) — طريقة تسجيل الصنف في قائمة "مطلوب شراؤه":
//   every_sale = كل قطعة تتباع (السلوك الحالي) | min_stock = لما الرصيد بعد البيع يوصل للحد الأدنى (reorder_point) | none = مايتسجلش
// reorder_qty = الكمية المطلوبة لما يوصل للحد (0 = يكمّل لضعف الحد الأدنى). إضافات بس — الأصناف القديمة بتفضل every_sale.

export const migration073PurchaseMode = `
ALTER TABLE products ADD COLUMN purchase_mode TEXT NOT NULL DEFAULT 'every_sale';
ALTER TABLE products ADD COLUMN reorder_qty REAL NOT NULL DEFAULT 0;
`
