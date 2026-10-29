// المرحلة 071 — ربط حسابات النظام بشجرة الحسابات.
// الجدول فاضي = الشجرة القديمة (حسابات النظام بأكوادها الثابتة 1200/4100/... زي ما هي، وده وضع كل العملاء الحاليين).
// لما يتحوّل عميل للشجرة المبسّطة (services/accountsChart.ts → convertToBaseChart) بيتملى بدور → كود حساب،
// وقيود المبيعات والمشتريات والخزائن بتتسجّل على الحسابات المربوطة بدل الأكواد الثابتة.

export const migration071AccountRoles = `
CREATE TABLE IF NOT EXISTS account_roles (
  role TEXT PRIMARY KEY,
  account_code TEXT NOT NULL
);
`
