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
  priceEditing: 'inventory.manage',
  customers: 'customers.manage',
  vendors: 'vendors.manage',
  invoices: 'invoices.manage',
  returns: 'invoices.manage',
  expenses: 'expenses.manage',
  shifts: 'reports.view',
  reports: 'reports.view',
  salesReps: 'sales_reps.manage',
  quotations: 'pos.sell',
  stockPermits: 'inventory.manage',
  restaurant: 'restaurant.manage',
  restaurantTables: 'restaurant.manage',
  restaurantCaptains: 'restaurant.manage',
  delivery: 'restaurant.manage',
  settings: 'settings.manage'
}

const VIEW_ORDER: ViewName[] = [
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
  'reports',
  'salesReps',
  'quotations',
  'stockPermits',
  'restaurant',
  'restaurantTables',
  'restaurantCaptains',
  'delivery',
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
