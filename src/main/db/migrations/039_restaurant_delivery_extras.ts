// المرحلة 039 — علامة مميزة اختيارية لطلبات الديلفري (لاندمارك/ملاحظة توصيل). رسوم التوصيل
// (delivery_fee) كانت موجودة أصلاً من migration 036 لكن من غير أي طريقة لتعديلها من الواجهة —
// ده بيتصلح في updateOrderMeta بالكود بس، مش محتاج عمود جديد.

export const migration039RestaurantDeliveryExtras = `
ALTER TABLE restaurant_orders ADD COLUMN special_mark TEXT;
`
