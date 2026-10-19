import type { SessionUser } from '../../../shared/types'
import type { ViewName } from '../store/appStore'

export function hasPermission(user: SessionUser | null, permission: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.permissions.includes(permission)
}

export const VIEW_PERMISSIONS: Record<ViewName, string> = {
  dashboard: 'dashboard.view',
  pos: 'pos.sell',
  inventory: 'inventory.manage',
  priceEditing: 'priceEditing.manage',
  customers: 'customers.manage',
  vendors: 'vendors.manage',
  invoices: 'invoices.manage',
  returns: 'returns.manage',
  expenses: 'expenses.manage',
  shifts: 'shifts.view',
  treasury: 'treasury.manage',
  accounting: 'accounting.view',
  reports: 'reports.view',
  salesReps: 'sales_reps.manage',
  quotations: 'quotations.manage',
  stockPermits: 'stockPermits.manage',
  restaurant: 'restaurant.manage',
  restaurantTables: 'restaurant.tables',
  restaurantCaptains: 'restaurant.captains',
  delivery: 'delivery.manage',
  events: 'events.manage',
  attendance: 'attendance.manage',
  settings: 'settings.manage'
}

export const VIEW_ORDER: ViewName[] = [
  'dashboard',
  'pos',
  'inventory',
  'priceEditing',
  'customers',
  'vendors',
  'invoices',
  'returns',
  'expenses',
  'shifts',
  'treasury',
  'accounting',
  'reports',
  'salesReps',
  'quotations',
  'stockPermits',
  'restaurant',
  'restaurantTables',
  'restaurantCaptains',
  'delivery',
  'events',
  'attendance',
  'settings'
]

/**
 * الميزات الموقوفة عبر كود الترخيص تُطبَّق فوق صلاحيات الدور — حتى المدير (admin) لا يتخطاها،
 * على عكس hasPermission التي يتخطاها الأدمن دائمًا.
 */
export function isViewLicensed(view: ViewName, disabledFeatures: string[]): boolean {
  return !disabledFeatures.includes(view)
}

export function isViewAllowed(user: SessionUser | null, view: ViewName, disabledFeatures: string[]): boolean {
  return hasPermission(user, VIEW_PERMISSIONS[view]) && isViewLicensed(view, disabledFeatures)
}

export function firstPermittedView(user: SessionUser | null, disabledFeatures: string[] = []): ViewName {
  return VIEW_ORDER.find((v) => isViewAllowed(user, v, disabledFeatures)) ?? 'dashboard'
}
