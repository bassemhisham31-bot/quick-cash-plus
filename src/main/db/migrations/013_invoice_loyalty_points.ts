// تسجيل نقاط الولاء المكتسبة/المستبدلة على كل فاتورة، عشان تظهر في الفاتورة وسجلها التاريخي
export const migration013InvoiceLoyaltyPoints = `
ALTER TABLE sales_invoices ADD COLUMN loyalty_points_earned REAL NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN loyalty_points_redeemed REAL NOT NULL DEFAULT 0;
`
