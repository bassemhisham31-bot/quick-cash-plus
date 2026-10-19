// المرحلة 050 — إشعارات التجهيز (زرار 🍳) تظهر على أنهي أجهزة:
// all = كل الأجهزة، sub_only = الأجهزة الفرعية بس، main_only = الجهاز الرئيسي بس، off = متوقفة

export const migration050KitchenNotifyMode = `
ALTER TABLE restaurant_settings ADD COLUMN kitchen_notify_mode TEXT NOT NULL DEFAULT 'all';
`
