// المرحلة 040 — عنوان العميل: تسجيله وقت إنشاء العميل عشان لما يتصل يظهر عنوانه المحفوظ ويتعبى
// تلقائيًا في عنوان التوصيل بطلبات المطاعم (زي ما حصل بالفعل مع الموردين اللي عندهم عمود address).

export const migration040CustomerAddress = `
ALTER TABLE customers ADD COLUMN address TEXT;
`
