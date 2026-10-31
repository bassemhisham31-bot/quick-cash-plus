// المرحلة 074 (ويب فقط) — الأصول الثابتة (حساب 4000) تتربط بحركات النظام.
//   - expense_categories.is_fixed_asset = 1 → تصنيف "شراء أصل": المبلغ بيتخصم من الخزينة زي المصروف، لكن القيد بيتسجّل
//     على حساب الأصول الثابتة (دور fixed_assets) ومبيدخلش في المصروفات ولا صافي الربح.
//   - تصنيف جاهز "شراء أصول ثابتة" عشان يظهر في قايمة تصنيفات المصروفات وسندات الصرف من أول يوم.
//   - الشجرة المبسّطة (account_roles مش فاضية): بنضيف ربط fixed_assets → 4000 (لو الحساب موجود) عشان يظهر عليه 🔗 في شجرة الحسابات.
//     الشجرة القديمة بتفضل زي ما هي (الدور بيتحوّل لحساب النظام 1500 وقت القراءة).

export const FIXED_ASSET_ROLE_BACKFILL_SQL = `
INSERT OR IGNORE INTO account_roles (role, account_code)
SELECT 'fixed_assets', '4000'
WHERE EXISTS (SELECT 1 FROM account_roles)
  AND EXISTS (SELECT 1 FROM accounts WHERE code = '4000' AND type = 'asset');
`

export const migration074FixedAssets = `
ALTER TABLE expense_categories ADD COLUMN is_fixed_asset INTEGER NOT NULL DEFAULT 0;

INSERT INTO expense_categories (name, is_fixed_asset) VALUES ('شراء أصول ثابتة', 1);

${FIXED_ASSET_ROLE_BACKFILL_SQL}
`
