// المرحلة 062 — خيار في إعدادات البيع: السماح بالبيع بالرصيد السالب في البيع العادي (المطعم بيبيع بالسالب دايمًا)

export const migration062AllowNegativeStock = `
ALTER TABLE pos_ui_settings ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 0;
`
