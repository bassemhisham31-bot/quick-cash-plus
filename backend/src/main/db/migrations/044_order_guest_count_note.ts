// المرحلة 044 — حقلين اختياريين جداد على طلب المطعم: عدد الضيوف الفعلي (للصالة، منفصل عن عدد كراسي
// الترابيزة الثابت) وملاحظة عامة على مستوى الطلب كله (مش على صنف بعينه، زي "عميل VIP") — داخليين بس،
// مبيظهروش في فاتورة العميل المطبوعة (بطلب صريح من المستخدم إن الفاتورة النهائية تفضل نضيفة).

export const migration044OrderGuestCountNote = `
ALTER TABLE restaurant_orders ADD COLUMN guest_count INTEGER;
ALTER TABLE restaurant_orders ADD COLUMN order_note TEXT;
`
