// المرحلة 023 — مرفقات المصروفات (إيصال/فاتورة) — نفس آلية مرفقات الموظفين بالظبط

export const migration023ExpenseAttachments = `
ALTER TABLE expenses ADD COLUMN attachment_path TEXT;
ALTER TABLE expenses ADD COLUMN attachment_name TEXT;
`
