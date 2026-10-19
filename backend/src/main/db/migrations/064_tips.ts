// المرحلة 064 — إكرامية (تيبس): جزء من الباقي بيسيبه العميل بدل ما يتردله، بيتسجل على الفاتورة وبيظهر في إقفال الوردية

export const migration064Tips = `
ALTER TABLE sales_invoices ADD COLUMN tip_amount REAL NOT NULL DEFAULT 0;
`
