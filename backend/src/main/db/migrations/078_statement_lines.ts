// المرحلة 078 (ويب فقط) — بند الحساب في القوائم المالية (الميزانية وقائمة الدخل):
//   - accounts.statement_line = NULL (تلقائي: من دور الحساب في النظام أو نوعه) أو مفتاح بند من services/statementLines.ts
//     (أصول ثابتة، مجمع إهلاك، نقدية وبنوك، موردين، رأس المال، مصروفات بيع وتسويق...) — بيتحدد من شاشة شجرة الحسابات.
//   - مفيش تغيير في أي أرقام قديمة: الحسابات الحالية كلها NULL وبتتصنّف تلقائيًا.

export const migration078StatementLines = `
ALTER TABLE accounts ADD COLUMN statement_line TEXT;
`
