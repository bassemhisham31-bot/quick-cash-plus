import { getDb } from '../db'
import { getEdition } from './edition'

/* ------------------------------ شجرة الحسابات ------------------------------
 * وضعين:
 *  - القديم (جدول account_roles فاضي): حسابات النظام بأكوادها الثابتة (1200 عملاء، 4100 مبيعات...) + حساب لكل خزينة (1100+id)
 *    ولكل تصنيف مصروف (6000+id) بيتعملوا تلقائيًا — ده وضع كل العملاء الحاليين وبيتصرّف زي ما كان بالظبط.
 *  - المبسّط (account_roles فيه ربط): الشجرة بتاعة العميل (7 حسابات أساسية + اللي يضيفه) بإيده بالكامل، ولا حاجة بتتعمل تلقائيًا؛
 *    قيود المستندات (مبيعات/مشتريات/خزائن/مصروفات...) بتتسجّل على الحسابات المربوطة بكل "دور" (account_roles) — يتغيّر من شاشة الحسابات.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense'

export const ACCOUNT_TYPES: readonly AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense']

export interface AccountRow {
  code: string
  name: string
  type: AccountType
  isSystem: boolean
  active: boolean
  /** الأدوار (account_roles) المربوطة بالحساب ده — فاضية في الشجرة القديمة */
  roles: string[]
}

export const AR = '1200'
export const INVENTORY = '1300'
export const FIXED_ASSETS = '1500'
export const AP = '2100'
export const VAT = '2200'
export const TIPS = '2300'
export const EVENT_DEPOSITS = '2400'
export const EVENT_REVENUE = '4600'
export const OPENING_EQUITY = '3100'
export const SALES = '4100'
export const SALES_RETURNS = '4200'
export const SALES_DISCOUNTS = '4300'
export const DELIVERY_REVENUE = '4400'
export const SERVICE_REVENUE = '4500'
export const CASH_SURPLUS = '4800'
export const OTHER_INCOME = '4900'
export const COGS = '5100'
export const CASH_SHORTAGE = '6800'
export const MISC_EXPENSE = '6900'

const SYSTEM_ACCOUNTS: [string, string, AccountType][] = [
  [AR, 'العملاء (المدينون)', 'asset'],
  [INVENTORY, 'المخزون', 'asset'],
  [FIXED_ASSETS, 'الأصول الثابتة', 'asset'],
  [AP, 'الموردون (الدائنون)', 'liability'],
  [VAT, 'ضريبة القيمة المضافة المستحقة', 'liability'],
  [TIPS, 'إكراميات مستحقة للعاملين', 'liability'],
  [EVENT_DEPOSITS, 'عربونات ومقدمات حجوزات المناسبات', 'liability'],
  [OPENING_EQUITY, 'رأس المال والأرصدة الافتتاحية', 'equity'],
  [SALES, 'المبيعات', 'revenue'],
  [SALES_RETURNS, 'مرتجعات المبيعات', 'revenue'],
  [SALES_DISCOUNTS, 'خصومات المبيعات', 'revenue'],
  [DELIVERY_REVENUE, 'إيراد رسوم التوصيل', 'revenue'],
  [SERVICE_REVENUE, 'إيراد رسوم الخدمة', 'revenue'],
  [EVENT_REVENUE, 'إيراد حجوزات المناسبات', 'revenue'],
  [CASH_SURPLUS, 'زيادة الخزينة', 'revenue'],
  [OTHER_INCOME, 'إيرادات أخرى', 'revenue'],
  [COGS, 'تكلفة البضاعة المباعة', 'cogs'],
  [CASH_SHORTAGE, 'عجز الخزينة', 'expense'],
  [MISC_EXPENSE, 'مصروفات متنوعة', 'expense']
]

export const treasuryCode = (id: number): string => String(1100 + id)
export const expenseCategoryCode = (id: number): string => String(6000 + id)

/**
 * شرط SQL بيستبعد مشتريات الأصول الثابتة (تصنيفات is_fixed_asset) من المصروفات — الأصل مش مصروف فمبيدخلش في الأرباح وتقارير المصروفات.
 * col = عمود التصنيف في الاستعلام (مع الـalias لو فيه). الخزينة وإقفال اليوم بيحسبوا المبلغ عادي لأن الفلوس خرجت فعلًا.
 */
export const notFixedAssetSql = (col = 'category_id'): string =>
  `(${col} IS NULL OR ${col} NOT IN (SELECT id FROM expense_categories WHERE is_fixed_asset = 1))`

/**
 * هل حساب الأصل ده "ثابت"؟ هو الحساب المربوط بدور fixed_assets + أي حساب تحته بنفس بداية الكود
 * (4000 → 4100 سيارات، 4200 أجهزة...) — بالظبط زي ما الحسابات الفرعية للمتداولة (5100 خزينة...) بتبدأ بـ5.
 */
export function makeFixedAssetMatcher(fixedCode: string): (code: string) => boolean {
  const stem = fixedCode.replace(/0+$/, '')
  return (code) => code === fixedCode || (stem.length > 0 && code.startsWith(stem))
}

/** الحسابات الأساسية السبعة للشجرة المبسّطة */
export const BASE_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: '1000', name: 'الايرادات', type: 'revenue' },
  { code: '2000', name: 'تكلفة المبيعات', type: 'cogs' },
  { code: '3000', name: 'المصروفات', type: 'expense' },
  { code: '4000', name: 'الأصول الثابتة', type: 'asset' },
  { code: '5000', name: 'الأصول المتداولة', type: 'asset' },
  { code: '6000', name: 'الخصوم', type: 'liability' },
  { code: '7000', name: 'حقوق الملكية', type: 'equity' }
]

const BASE_CODE_BY_TYPE: Record<AccountType, string> = {
  revenue: '1000',
  cogs: '2000',
  expense: '3000',
  asset: '5000', // المتداولة: العملاء والمخزون والخزائن — الثابتة (4000) ليها دور fixed_assets لمشتريات الأصول
  liability: '6000',
  equity: '7000'
}

/* ------------------------------ أدوار الحسابات ------------------------------ */

export type AccountRole =
  | 'treasury'
  | 'ar'
  | 'inventory'
  | 'fixed_assets'
  | 'ap'
  | 'vat'
  | 'tips'
  | 'event_deposits'
  | 'opening_equity'
  | 'sales'
  | 'sales_returns'
  | 'sales_discounts'
  | 'delivery_revenue'
  | 'service_revenue'
  | 'event_revenue'
  | 'cash_surplus'
  | 'other_income'
  | 'cogs'
  | 'cash_shortage'
  | 'misc_expense'
  | 'expense'

interface RoleDef {
  role: AccountRole
  label: string
  /** نوع الحساب المسموح بربطه بالدور ده (عشان قوائم الدخل والميزانية تفضل صح) */
  type: AccountType
  /** الكود الثابت في الشجرة القديمة (null = حساب لكل عنصر: خزينة / تصنيف مصروف) */
  legacy: string | null
  /** الحساب الافتراضي في الشجرة المبسّطة */
  base: string
  /** أدوار خاصة بالمطاعم — مخفية من شاشة الربط في نسخة retail */
  restaurantOnly?: boolean
}

const ROLE_DEFS: RoleDef[] = [
  { role: 'treasury', label: 'الخزائن (النقدية والبنك والمحافظ)', type: 'asset', legacy: null, base: '5000' },
  { role: 'ar', label: 'العملاء (المدينون)', type: 'asset', legacy: AR, base: '5000' },
  { role: 'inventory', label: 'المخزون', type: 'asset', legacy: INVENTORY, base: '5000' },
  { role: 'fixed_assets', label: 'الأصول الثابتة (شراء الأصول: معدات، أجهزة، سيارات...)', type: 'asset', legacy: FIXED_ASSETS, base: '4000' },
  { role: 'ap', label: 'الموردون (الدائنون)', type: 'liability', legacy: AP, base: '6000' },
  { role: 'vat', label: 'ضريبة القيمة المضافة المستحقة', type: 'liability', legacy: VAT, base: '6000' },
  { role: 'tips', label: 'إكراميات مستحقة للعاملين', type: 'liability', legacy: TIPS, base: '6000', restaurantOnly: true },
  { role: 'event_deposits', label: 'عربونات ومقدمات الحجوزات', type: 'liability', legacy: EVENT_DEPOSITS, base: '6000', restaurantOnly: true },
  { role: 'opening_equity', label: 'رأس المال والأرصدة الافتتاحية', type: 'equity', legacy: OPENING_EQUITY, base: '7000' },
  { role: 'sales', label: 'المبيعات', type: 'revenue', legacy: SALES, base: '1000' },
  { role: 'sales_returns', label: 'مرتجعات المبيعات', type: 'revenue', legacy: SALES_RETURNS, base: '1000' },
  { role: 'sales_discounts', label: 'خصومات المبيعات', type: 'revenue', legacy: SALES_DISCOUNTS, base: '1000' },
  { role: 'delivery_revenue', label: 'إيراد رسوم التوصيل', type: 'revenue', legacy: DELIVERY_REVENUE, base: '1000', restaurantOnly: true },
  { role: 'service_revenue', label: 'إيراد رسوم الخدمة', type: 'revenue', legacy: SERVICE_REVENUE, base: '1000', restaurantOnly: true },
  { role: 'event_revenue', label: 'إيراد حجوزات المناسبات', type: 'revenue', legacy: EVENT_REVENUE, base: '1000', restaurantOnly: true },
  { role: 'cash_surplus', label: 'زيادة الخزينة (فرق الجرد)', type: 'revenue', legacy: CASH_SURPLUS, base: '1000' },
  { role: 'other_income', label: 'إيرادات أخرى (سندات القبض)', type: 'revenue', legacy: OTHER_INCOME, base: '1000' },
  { role: 'cogs', label: 'تكلفة البضاعة المباعة', type: 'cogs', legacy: COGS, base: '2000' },
  { role: 'cash_shortage', label: 'عجز الخزينة (فرق الجرد)', type: 'expense', legacy: CASH_SHORTAGE, base: '3000' },
  { role: 'misc_expense', label: 'مصروفات متنوعة (بدون تصنيف)', type: 'expense', legacy: MISC_EXPENSE, base: '3000' },
  { role: 'expense', label: 'المصروفات (كل تصنيفات المصروفات)', type: 'expense', legacy: null, base: '3000' }
]

const DEF_BY_ROLE = new Map<string, RoleDef>(ROLE_DEFS.map((d) => [d.role, d]))

/** هل الشجرة في الوضع المبسّط؟ (فيه ربط أدوار محفوظ) */
export async function isCustomChart(): Promise<boolean> {
  const rs = await getDb().execute('SELECT 1 FROM account_roles LIMIT 1')
  return rs.rows.length > 0
}

export interface AccountResolver {
  custom: boolean
  code(role: AccountRole): string
  treasury(id: number): string
  /** كود حساب مصروف تصنيف معيّن (null = مصروف بدون تصنيف) */
  expense(categoryId: number | null): string
}

/** بيحدّد كود الحساب اللي كل نوع حركة بيتسجّل عليه — حسب وضع الشجرة */
export async function loadResolver(): Promise<AccountResolver> {
  const rs = await getDb().execute('SELECT role, account_code FROM account_roles')
  const map = new Map<string, string>((rs.rows as any[]).map((r) => [String(r.role), String(r.account_code)]))
  const base = (role: AccountRole): string => DEF_BY_ROLE.get(role)!.base
  if (map.size === 0) {
    return {
      custom: false,
      code: (role) => DEF_BY_ROLE.get(role)!.legacy ?? base(role),
      treasury: treasuryCode,
      expense: (id) => (id == null ? MISC_EXPENSE : expenseCategoryCode(id))
    }
  }
  return {
    custom: true,
    code: (role) => map.get(role) ?? base(role),
    treasury: (id) => map.get(`treasury:${id}`) ?? map.get('treasury') ?? base('treasury'),
    expense: (id) => (id == null ? (map.get('misc_expense') ?? base('misc_expense')) : (map.get(`expense:${id}`) ?? map.get('expense') ?? base('expense')))
  }
}

/** بيضمن إن حسابات النظام وحسابات الخزائن وتصنيفات المصروفات موجودة (وبيحدّث الأسماء لو اتغيّرت) — الشجرة القديمة بس */
export async function ensureAccounts(): Promise<void> {
  if (await isCustomChart()) return
  const db = getDb()
  const upsert = async (code: string, name: string, type: AccountType, system: number): Promise<void> => {
    await db.execute({
      sql: `INSERT INTO accounts (code, name, type, is_system) VALUES (?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET name = excluded.name WHERE is_system = 1`,
      args: [code, name, type, system]
    })
  }
  for (const [code, name, type] of SYSTEM_ACCOUNTS) await upsert(code, name, type, 1)
  const treasuries = await db.execute('SELECT id, name FROM treasuries WHERE deleted_at IS NULL')
  for (const t of treasuries.rows as any[]) await upsert(treasuryCode(Number(t.id)), `خزينة: ${t.name}`, 'asset', 1)
  // تصنيفات "شراء أصل" مالهاش حساب مصروف — قيدها على حساب الأصول الثابتة
  const cats = await db.execute('SELECT id, name FROM expense_categories WHERE is_fixed_asset = 0')
  for (const c of cats.rows as any[]) await upsert(expenseCategoryCode(Number(c.id)), `مصروف: ${c.name}`, 'expense', 1)
}

export async function listAccounts(): Promise<AccountRow[]> {
  await ensureAccounts()
  const db = getDb()
  const rs = await db.execute('SELECT code, name, type, is_system, active FROM accounts ORDER BY code')
  const rolesByCode = new Map<string, string[]>()
  for (const r of (await db.execute('SELECT role, account_code FROM account_roles')).rows as any[]) {
    const list = rolesByCode.get(String(r.account_code)) ?? []
    list.push(String(r.role))
    rolesByCode.set(String(r.account_code), list)
  }
  return (rs.rows as any[]).map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    isSystem: !!r.is_system,
    active: !!r.active,
    roles: rolesByCode.get(String(r.code)) ?? []
  }))
}

function validateAccountInput(code: string, name: string, type: string): void {
  if (!/^\d{3,10}$/.test(code)) throw new Error('كود الحساب أرقام فقط (3 إلى 10 أرقام)')
  if (!name) throw new Error('اسم الحساب مطلوب')
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) throw new Error('نوع الحساب غير صحيح')
}

export async function createAccount(input: { code: string; name: string; type: AccountType }): Promise<void> {
  const code = input.code.trim()
  const name = input.name.trim()
  validateAccountInput(code, name, input.type)
  const exists = await getDb().execute({ sql: 'SELECT 1 FROM accounts WHERE code = ?', args: [code] })
  if (exists.rows.length) throw new Error('الكود ده مستخدم قبل كده')
  await getDb().execute({ sql: 'INSERT INTO accounts (code, name, type, is_system) VALUES (?, ?, ?, 0)', args: [code, name, input.type] })
}

export async function setAccountActive(code: string, active: boolean): Promise<void> {
  await getDb().execute({ sql: 'UPDATE accounts SET active = ? WHERE code = ? AND is_system = 0', args: [active ? 1 : 0, code] })
}

const roleLabels = (roles: string[]): string => roles.map((r) => DEF_BY_ROLE.get(r)?.label ?? r).join('، ')

async function loadEditableAccount(code: string): Promise<{ code: string; type: AccountType }> {
  const row = (await getDb().execute({ sql: 'SELECT code, type, is_system FROM accounts WHERE code = ?', args: [code] })).rows[0] as any
  if (!row) throw new Error('الحساب مش موجود')
  if (row.is_system) throw new Error('ده حساب نظام ومينفعش يتعدل ولا يتحذف')
  return { code: row.code, type: row.type }
}

async function rolesOf(code: string): Promise<string[]> {
  const rs = await getDb().execute({ sql: 'SELECT role FROM account_roles WHERE account_code = ?', args: [code] })
  return (rs.rows as any[]).map((r) => String(r.role))
}

/** تعديل حساب: الاسم والنوع والكود (لو الكود اتغيّر بيتنقل معاه القيود اليدوية وربط الأدوار) */
export async function updateAccount(code: string, input: { code?: string; name: string; type: AccountType }): Promise<void> {
  await loadEditableAccount(code)
  const newCode = (input.code ?? code).trim()
  const name = input.name.trim()
  validateAccountInput(newCode, name, input.type)
  const db = getDb()
  if (newCode !== code) {
    const used = await db.execute({ sql: 'SELECT 1 FROM accounts WHERE code = ?', args: [newCode] })
    if (used.rows.length) throw new Error('الكود الجديد مستخدم في حساب تاني')
  }
  for (const role of await rolesOf(code)) {
    const def = DEF_BY_ROLE.get(role) // أدوار الخزائن/المصروفات الفردية (treasury:3...) مالهاش تعريف — نتحقق بالدور الأساسي
    const baseDef = def ?? DEF_BY_ROLE.get(role.split(':')[0])
    if (baseDef && baseDef.type !== input.type) {
      throw new Error(`الحساب ده مربوط بـ"${baseDef.label}" فلازم يفضل نوعه "${baseDef.type}" — غيّر الربط الأول لو عايز تغيّر النوع`)
    }
  }
  const tx = await db.transaction('write')
  try {
    await tx.execute({ sql: 'UPDATE accounts SET code = ?, name = ?, type = ? WHERE code = ?', args: [newCode, name, input.type, code] })
    if (newCode !== code) {
      await tx.execute({ sql: 'UPDATE journal_lines SET account_code = ? WHERE account_code = ?', args: [newCode, code] })
      await tx.execute({ sql: 'UPDATE account_roles SET account_code = ? WHERE account_code = ?', args: [newCode, code] })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

/** حذف حساب: ممنوع لو مربوط بحركات النظام أو عليه قيود يدوية — يتنقل أو يتفك الربط الأول */
export async function deleteAccount(code: string): Promise<void> {
  await loadEditableAccount(code)
  const db = getDb()
  const roles = await rolesOf(code)
  if (roles.length) throw new Error(`الحساب ده مربوط بحركات النظام (${roleLabels(roles)}) — اربط الحركات دي بحساب تاني الأول من "ربط حسابات النظام"`)
  const lines = Number(
    ((await db.execute({
      sql: `SELECT COUNT(*) AS c FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE l.account_code = ? AND e.deleted_at IS NULL`,
      args: [code]
    })).rows[0] as any).c
  )
  if (lines > 0) throw new Error(`الحساب ده عليه ${lines} سطر في القيود اليدوية — احذف القيود دي أو غيّر حسابها الأول (تقدر توقف الحساب بدل ما تحذفه)`)
  await db.execute({ sql: 'DELETE FROM accounts WHERE code = ?', args: [code] })
}

/* ------------------------------ ربط الأدوار ------------------------------ */

export interface AccountRoleRow {
  role: AccountRole
  label: string
  type: AccountType
  accountCode: string
  defaultCode: string
}

/** ربط حسابات النظام الحالي (الشجرة المبسّطة بس — في القديمة custom=false والقايمة فاضية) */
export async function listAccountRoles(): Promise<{ custom: boolean; roles: AccountRoleRow[] }> {
  const R = await loadResolver()
  if (!R.custom) return { custom: false, roles: [] }
  const hideRestaurant = getEdition() === 'retail'
  const roles = ROLE_DEFS.filter((d) => !(hideRestaurant && d.restaurantOnly)).map((d) => ({
    role: d.role,
    label: d.label,
    type: d.type,
    accountCode: d.role === 'treasury' ? R.treasury(0) : d.role === 'expense' ? R.expense(0) : R.code(d.role),
    defaultCode: d.base
  }))
  return { custom: true, roles }
}

/** تغيير ربط دور أو أكتر: { sales: '1100', ar: '5200' } — الحساب لازم يكون موجود ونشط ونوعه مناسب للدور */
export async function setAccountRoles(input: Record<string, string>): Promise<void> {
  if (!(await isCustomChart())) throw new Error('ربط الحسابات متاح بعد تحويل الشجرة للنظام المبسّط')
  const db = getDb()
  const entries = Object.entries(input)
  for (const [role, codeRaw] of entries) {
    const def = DEF_BY_ROLE.get(role)
    if (!def) throw new Error(`دور غير معروف: ${role}`)
    const acc = (await db.execute({ sql: 'SELECT type, active FROM accounts WHERE code = ?', args: [String(codeRaw)] })).rows[0] as any
    if (!acc) throw new Error(`الحساب ${codeRaw} مش موجود (${def.label})`)
    if (!acc.active) throw new Error(`الحساب ${codeRaw} موقوف (${def.label})`)
    if (acc.type !== def.type) throw new Error(`"${def.label}" لازم يتربط بحساب من نوع "${def.type}" — الحساب ${codeRaw} نوعه "${acc.type}"`)
  }
  const tx = await db.transaction('write')
  try {
    for (const [role, code] of entries) {
      await tx.execute({
        sql: 'INSERT INTO account_roles (role, account_code) VALUES (?, ?) ON CONFLICT(role) DO UPDATE SET account_code = excluded.account_code',
        args: [role, String(code)]
      })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

/** الحساب الافتراضي لتقرير الأستاذ لو مفيش اختيار */
export async function defaultLedgerAccountCode(): Promise<string> {
  const R = await loadResolver()
  return R.custom ? R.treasury(0) : AR
}

/* ------------------------------ التحويل للشجرة المبسّطة ------------------------------ */

export interface ChartConversionPlan {
  alreadyConverted: boolean
  /** الحسابات اللي هتتحذف + قيودها اليدوية هتتنقل لأنهي حساب أساسي */
  toDelete: { code: string; name: string; type: AccountType; isSystem: boolean; manualLines: number; remapTo: string }[]
  /** الحسابات الأساسية اللي هتتعمل */
  toCreate: { code: string; name: string; type: AccountType }[]
  /** عدد سطور القيود اليدوية اللي كودها هيتغيّر */
  manualLinesToRemap: number
  /** سطور قيود يدوية على أكواد مش موجودة في الشجرة أصلًا (هتفضل زي ما هي) */
  orphanLines: number
}

export async function planBaseChart(): Promise<ChartConversionPlan> {
  const custom = await isCustomChart()
  if (!custom) await ensureAccounts()
  const db = getDb()
  const accounts = (await db.execute('SELECT code, name, type, is_system FROM accounts ORDER BY code')).rows as any[]
  const usage = new Map<string, number>(
    ((await db.execute('SELECT account_code, COUNT(*) AS c FROM journal_lines GROUP BY account_code')).rows as any[]).map((r) => [String(r.account_code), Number(r.c)])
  )
  const known = new Set(accounts.map((a) => String(a.code)))
  let orphanLines = 0
  for (const [code, c] of usage) if (!known.has(code)) orphanLines += c
  const toDelete = accounts.map((a) => ({
    code: String(a.code),
    name: String(a.name),
    type: a.type as AccountType,
    isSystem: !!a.is_system,
    manualLines: usage.get(String(a.code)) ?? 0,
    remapTo: BASE_CODE_BY_TYPE[a.type as AccountType]
  }))
  return {
    alreadyConverted: custom,
    toDelete,
    toCreate: BASE_ACCOUNTS,
    manualLinesToRemap: toDelete.reduce((s, a) => s + a.manualLines, 0),
    orphanLines
  }
}

/**
 * بيمسح كل الحسابات الحالية ويعمل الـ7 حسابات الأساسية بس، وبينقل القيود اليدوية لحساب أساسي من نفس النوع،
 * وبيربط كل أدوار النظام (مبيعات/عملاء/مخزون/خزائن/...) بالحسابات الأساسية.
 * قيود المستندات (فواتير ومشتريات ومصروفات...) مش بتتأثر لأنها بتتولّد وقت القراءة من الجداول الأصلية — الأرقام الكلية (صافي الربح، إجمالي الأصول...) بتفضل زي ما هي.
 */
export async function convertToBaseChart(): Promise<ChartConversionPlan> {
  const plan = await planBaseChart()
  if (plan.alreadyConverted) throw new Error('الشجرة اتحوّلت للنظام المبسّط قبل كده')
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    if (plan.toDelete.length) {
      const remap = plan.toDelete.filter((a) => a.manualLines > 0)
      if (remap.length) {
        // جملة واحدة بـCASE على القيمة الأصلية عشان نقل حساب لكود حساب تاني قديم ما يتنقلش مرتين
        await tx.execute({
          sql: `UPDATE journal_lines SET account_code = CASE account_code ${remap.map(() => 'WHEN ? THEN ?').join(' ')} ELSE account_code END
                WHERE account_code IN (${remap.map(() => '?').join(', ')})`,
          args: [...remap.flatMap((a) => [a.code, a.remapTo]), ...remap.map((a) => a.code)]
        })
      }
    }
    await tx.execute('DELETE FROM accounts')
    for (const a of BASE_ACCOUNTS) {
      await tx.execute({ sql: 'INSERT INTO accounts (code, name, type, is_system) VALUES (?, ?, ?, 0)', args: [a.code, a.name, a.type] })
    }
    for (const d of ROLE_DEFS) {
      await tx.execute({ sql: 'INSERT INTO account_roles (role, account_code) VALUES (?, ?)', args: [d.role, d.base] })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
  return plan
}
