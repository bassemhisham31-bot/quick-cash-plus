import type { AccountType } from './accountsChart'

/* ------------------------------ بنود القوائم المالية ------------------------------
 * كل حساب في الشجرة بيتحسب تحت "بند" في الميزانية أو قائمة الدخل:
 *  1) البند اللي اتحدد للحساب يدويًا (accounts.statement_line) لو موجود،
 *  2) وإلا بند "دور" الحركة اللي ولّدت السطر (مبيعات → المبيعات، عملاء → العملاء، خزائن → النقدية والبنوك...)،
 *  3) وإلا بند افتراضي من نوع الحساب (أصل → أصول متداولة أخرى، مصروف → مصروفات إدارية وعمومية...).
 * ملحوظة: التسمية هنا بنفس كلام العميل بالظبط.
 */

export interface StatementLineDef {
  key: string
  label: string
  /** أنواع الحسابات اللي ينفع تتحط تحت البند ده */
  types: AccountType[]
}

export const STATEMENT_LINES: StatementLineDef[] = [
  // الأصول
  { key: 'fixed_assets', label: 'الأصول الثابتة', types: ['asset'] },
  { key: 'accumulated_depreciation', label: 'مجمع الإهلاك', types: ['asset'] },
  { key: 'cash_bank', label: 'النقدية والبنوك', types: ['asset'] },
  { key: 'receivables', label: 'العملاء (المدينون)', types: ['asset'] },
  { key: 'vat_recoverable', label: 'ضريبة القيمة المضافة', types: ['asset'] },
  { key: 'inventory', label: 'المخزون', types: ['asset'] },
  { key: 'other_current_assets', label: 'أصول متداولة أخرى', types: ['asset'] },
  // الخصوم
  { key: 'suppliers', label: 'الموردين', types: ['liability'] },
  { key: 'accrued_expenses', label: 'مصروفات مستحقة', types: ['liability'] },
  { key: 'advances', label: 'مقدمات', types: ['liability'] },
  { key: 'vat_payable', label: 'ضريبة القيمة المضافة المستحقة', types: ['liability'] },
  { key: 'other_current_liabilities', label: 'خصوم متداولة أخرى', types: ['liability'] },
  // حقوق الملكية
  { key: 'capital', label: 'رأس المال', types: ['equity'] },
  { key: 'partners_current', label: 'جاري الشركاء', types: ['equity'] },
  { key: 'retained_earnings', label: 'أرباح محتجزة', types: ['equity'] },
  // الإيرادات
  { key: 'sales', label: 'المبيعات', types: ['revenue'] },
  { key: 'sales_returns', label: 'مردودات المبيعات', types: ['revenue'] },
  { key: 'sales_discounts', label: 'خصومات المبيعات', types: ['revenue'] },
  { key: 'service_revenue', label: 'إيرادات الخدمات', types: ['revenue'] },
  { key: 'receivables_revenue', label: 'إيرادات الذمم', types: ['revenue'] },
  { key: 'other_revenue', label: 'إيرادات أخرى', types: ['revenue'] },
  // التكلفة والمصروفات
  { key: 'cogs', label: 'تكلفة المبيعات', types: ['cogs'] },
  { key: 'selling_expenses', label: 'مصروفات بيع وتسويق', types: ['expense'] },
  { key: 'admin_expenses', label: 'مصروفات إدارية وعمومية', types: ['expense'] },
  { key: 'income_tax', label: 'ضرائب الدخل', types: ['expense'] }
]

const BY_KEY = new Map(STATEMENT_LINES.map((l) => [l.key, l]))

export const lineLabel = (key: string): string => BY_KEY.get(key)?.label ?? key

export function lineAllowed(key: string | null | undefined, type: AccountType): boolean {
  if (!key) return false
  return BY_KEY.get(key)?.types.includes(type) ?? false
}

/** بند كل دور حركة في النظام (الأدوار بتاعة accountsChart.ts) */
export const ROLE_LINE: Record<string, string> = {
  treasury: 'cash_bank',
  ar: 'receivables',
  inventory: 'inventory',
  fixed_assets: 'fixed_assets',
  ap: 'suppliers',
  vat: 'vat_payable',
  tips: 'accrued_expenses',
  event_deposits: 'advances',
  opening_equity: 'capital',
  sales: 'sales',
  sales_returns: 'sales_returns',
  sales_discounts: 'sales_discounts',
  delivery_revenue: 'service_revenue',
  service_revenue: 'service_revenue',
  event_revenue: 'service_revenue',
  cash_surplus: 'other_revenue',
  other_income: 'other_revenue',
  cogs: 'cogs',
  cash_shortage: 'admin_expenses',
  misc_expense: 'admin_expenses',
  expense: 'admin_expenses'
}

/** حسابات النظام في الشجرة القديمة (أكواد ثابتة) — للقيود اليدوية عليها */
export const LEGACY_CODE_LINE: Record<string, string> = {
  '1200': 'receivables',
  '1300': 'inventory',
  '1500': 'fixed_assets',
  '2100': 'suppliers',
  '2200': 'vat_payable',
  '2300': 'accrued_expenses',
  '2400': 'advances',
  '3100': 'capital',
  '4100': 'sales',
  '4200': 'sales_returns',
  '4300': 'sales_discounts',
  '4400': 'service_revenue',
  '4500': 'service_revenue',
  '4600': 'service_revenue',
  '4800': 'other_revenue',
  '4900': 'other_revenue',
  '5100': 'cogs',
  '6800': 'admin_expenses',
  '6900': 'admin_expenses'
}

/** البند الافتراضي لما مفيش حاجة تانية تحدّد (من نوع الحساب بس) */
export const TYPE_DEFAULT_LINE: Record<AccountType, string> = {
  asset: 'other_current_assets',
  liability: 'other_current_liabilities',
  equity: 'capital',
  revenue: 'other_revenue',
  cogs: 'cogs',
  expense: 'admin_expenses'
}
