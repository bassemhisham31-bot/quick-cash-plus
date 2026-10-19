// المرحلة 053 — صلاحية مستقلة لكل شاشة في البرنامج (الأدمن بيتحكم في كل شاشة لوحدها للكاشير).
// قبل كده كذا شاشة كانت متعلقة بنفس الصلاحية (مثلاً الترابيزات والكباتن والتوصيل كلهم restaurant.manage،
// وتعديل الأسعار وأذونات المخزون inventory.manage). عشان محدش يفقد شاشة كان شايفها، أي مستخدم معاه الصلاحية
// القديمة بياخد الصلاحيات الجديدة المتفرعة منها.

const DERIVED: [string, string][] = [
  ['inventory.manage', 'priceEditing.manage'],
  ['inventory.manage', 'stockPermits.manage'],
  ['invoices.manage', 'returns.manage'],
  ['reports.view', 'shifts.view'],
  ['pos.sell', 'quotations.manage'],
  ['restaurant.manage', 'restaurant.tables'],
  ['restaurant.manage', 'restaurant.captains'],
  ['restaurant.manage', 'delivery.manage']
]

export const migration053PerViewPermissions = DERIVED.map(
  ([from, to]) =>
    `INSERT OR IGNORE INTO user_permissions (user_id, permission_code)
     SELECT user_id, '${to}' FROM user_permissions WHERE permission_code = '${from}';`
).join('\n')
