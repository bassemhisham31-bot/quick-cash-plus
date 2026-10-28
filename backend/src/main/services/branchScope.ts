import { AsyncLocalStorage } from 'async_hooks'

/**
 * نطاق الفرع للطلب الحالي (ميزة الفروع الاختيارية — QCP_BRANCHES=on في .env العميل).
 *
 * الميزة مقفولة (الافتراضي): كل الدوال هنا بتتصرف كأن مفيش فروع — مفيش فلاتر على أي استعلام، وأي عملية جديدة بتتسجّل على
 * الفرع الافتراضي (رقم 1) — فالنسخ القديمة بتشتغل بنفس السلوك بالظبط.
 *
 * الميزة مفعّلة: السيرفر بيحدد النطاق لكل طلب (branches.ts → resolveBranchScope):
 *  - الكاشير/المستخدم العادي: فرعه هو بس، دايمًا.
 *  - الأدمن: الفرع اللي اختاره من أعلى الشاشة (هيدر x-qcp-branch)، أو "كل الفروع" للقراءة والتقارير.
 */
export const DEFAULT_BRANCH_ID = 1

export interface BranchScope {
  /** الفرع المحدد للطلب، أو null = كل الفروع (للأدمن بس) */
  branchId: number | null
  /** فرع المستخدم نفسه */
  homeBranchId: number
  isAdmin: boolean
}

export const branchScope = new AsyncLocalStorage<BranchScope>()

export function branchesEnabled(): boolean {
  return ['1', 'on', 'true', 'yes'].includes((process.env.QCP_BRANCHES ?? '').trim().toLowerCase())
}

/** الفرع المحدد للقراءة، أو null = من غير فلتر (كل الفروع، أو الميزة مقفولة) */
export function currentBranchId(): number | null {
  if (!branchesEnabled()) return null
  return branchScope.getStore()?.branchId ?? null
}

/** للعمليات اللي بتسجّل بيانات (بيع، يوم، مصروف، شراء…): لازم فرع محدد */
export function requireBranchId(): number {
  if (!branchesEnabled()) return DEFAULT_BRANCH_ID
  const store = branchScope.getStore()
  if (!store) throw new Error('سياق الفرع غير موجود')
  if (store.branchId == null) throw new Error('اختار فرع محدد من أعلى الشاشة قبل العملية دي (مش "كل الفروع")')
  return store.branchId
}

export interface SqlFilter {
  sql: string
  args: unknown[]
}

/** شرط SQL لعمود فيه رقم الفرع مباشرة. من غير نطاق بيرجّع شرط دايمًا صحيح عشان يتحط بعد AND/WHERE بأمان */
export function branchFilter(column: string): SqlFilter {
  const id = currentBranchId()
  return id == null ? { sql: '1 = 1', args: [] } : { sql: `${column} = ?`, args: [id] }
}

/** نفس الفكرة لعمود فيه رقم مخزن (المخزن تابع لفرع) */
export function branchWarehouseFilter(column: string): SqlFilter {
  const id = currentBranchId()
  return id == null
    ? { sql: '1 = 1', args: [] }
    : { sql: `${column} IN (SELECT id FROM warehouses WHERE branch_id = ?)`, args: [id] }
}

/** نفس الفكرة لعمود فيه رقم موظف (الموظف تابع لفرع) */
export function branchEmployeeFilter(column: string): SqlFilter {
  const id = currentBranchId()
  return id == null
    ? { sql: '1 = 1', args: [] }
    : { sql: `${column} IN (SELECT id FROM employees WHERE branch_id = ?)`, args: [id] }
}

/** نفس الفكرة لعمود فيه رقم خزينة (الخزينة تابعة لفرع) */
export function branchTreasuryFilter(column: string): SqlFilter {
  const id = currentBranchId()
  return id == null
    ? { sql: '1 = 1', args: [] }
    : { sql: `${column} IN (SELECT id FROM treasuries WHERE branch_id = ?)`, args: [id] }
}

/** حماية الوصول بالـid: لو المستخدم محدد فرع، ماينفعش يفتح/يعدّل سجل تابع لفرع تاني (الأدمن على "كل الفروع" مستثنى) */
export function assertBranchAccess(rowBranchId: number | null | undefined, what = 'السجل'): void {
  const id = currentBranchId()
  if (id != null && rowBranchId != null && Number(rowBranchId) !== id) throw new Error(`${what} تابع لفرع تاني`)
}
