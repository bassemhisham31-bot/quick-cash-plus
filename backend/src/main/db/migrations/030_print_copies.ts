// المرحلة 30 — عدد نسخ الطباعة

export const migration030PrintCopies = `
ALTER TABLE print_settings ADD COLUMN copies INTEGER NOT NULL DEFAULT 1;
`
