import type { SessionUser } from '../../../shared/types'
import { hasPermission } from './permissions'
import { confirmDialog, requestSupervisorApproval } from '../components/ConfirmDialogHost'

/**
 * حذف صنف/طلب في شاشة البيع أو المطعم: اللي معاه صلاحية pos.deleteItem (والأدمن دايمًا) بيحذف على طول،
 * غير كده بتظهر نافذة تطلب باسورد الأدمن. `detail` بيتسجل في سجل النشاط باسم اللي وافق.
 */
export async function ensureDeleteAllowed(
  user: SessionUser | null,
  message: string,
  detail: string,
  opts: { confirmIfAllowed?: boolean } = {}
): Promise<boolean> {
  if (hasPermission(user, 'pos.deleteItem')) return opts.confirmIfAllowed ? confirmDialog(message, { danger: true }) : true
  return requestSupervisorApproval(message, detail, user ? user.fullName || user.username : null)
}
