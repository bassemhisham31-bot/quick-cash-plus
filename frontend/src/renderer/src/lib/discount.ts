import type { PosUiSettings, SessionUser } from '../../../shared/types'
import { hasPermission } from './permissions'

/** صلاحية الخصم وأقصى نسبة مسموحة للمستخدم الحالي (الأدمن من غير حد) */
export function discountRules(user: SessionUser | null, settings: PosUiSettings | null): { allowed: boolean; maxPercent: number } {
  const allowed = hasPermission(user, 'pos.discount')
  const maxPercent = user?.role === 'admin' ? 100 : Math.min(100, Math.max(0, settings?.maxDiscountPercent ?? 100))
  return { allowed, maxPercent }
}
