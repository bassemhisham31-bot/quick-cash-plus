// المرحلة 057 — اسم العميل المكتوب يدويًا على طلب المطعم (بيظهر في الشيك وبينتقل للفاتورة عند الدفع)

export const migration057OrderCustomerLabel = `
ALTER TABLE restaurant_orders ADD COLUMN customer_label TEXT;
`
