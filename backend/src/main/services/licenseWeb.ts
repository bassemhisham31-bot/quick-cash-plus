import { getDb } from '../db'
import { getLicenseStatus, invalidateLicenseCache } from './license'
import { editionDisabledFeatures } from './edition'
import { branchesEnabled } from './branchScope'
import type { LicensePlan, LicenseStatus } from '../../shared/types'

/**
 * ترخيص نسخة الويب: بيعتمد على نفس جدول license ومنطق الأوفلاين (license.ts)، لكن:
 * - التفعيل بيتم من السيرفر بأمر المالك (deploy/set-license.sh → /internal/license) مش بكود بيلصقه العميل،
 *   لأن سر توقيع الأكواد موجود في الكود المنشور ومش مناسب للويب.
 * - فيه فترة سماح GRACE_DAYS بعد الانتهاء: البرنامج بيشتغل عادي ومعاه تحذير، وبعدها بيتقفل.
 */
export const GRACE_DAYS = 7
const DAY = 24 * 3600 * 1000

export type WebLicenseStatus = LicenseStatus & { graceDaysLeft?: number }

/** حالة الترخيص بعد دمج ميزات نسخة العميل الموقوفة (QCP_EDITION) مع الميزات الموقوفة بالترخيص */
export async function getWebLicenseStatus(): Promise<WebLicenseStatus> {
  const s = await computeWebLicenseStatus()
  const fromEdition = editionDisabledFeatures()
  const withEdition = fromEdition.length === 0 ? s : { ...s, disabledFeatures: [...new Set([...s.disabledFeatures, ...fromEdition])] }
  return branchesEnabled() ? { ...withEdition, branchesEnabled: true } : withEdition
}

/** حالة الترخيص مع فترة السماح: أثناء السماح بنرجّع active/trial مع graceDaysLeft بدل expired عشان الواجهة ماتتقفلش */
async function computeWebLicenseStatus(): Promise<WebLicenseStatus> {
  const s = await getLicenseStatus()
  if (s.status !== 'expired' || s.clockTampered) return s

  let end: number | null = s.expiresAt ? Date.parse(s.expiresAt) : null
  if (end === null || Number.isNaN(end)) {
    const rs = await getDb().execute('SELECT first_run_at, trial_days FROM license WHERE id = 1')
    const row = rs.rows[0] as any
    end = row ? Date.parse(String(row.first_run_at).replace(' ', 'T') + 'Z') + Number(row.trial_days) * DAY : null
  }
  if (end === null || Number.isNaN(end)) return s

  const daysSince = (Date.now() - end) / DAY
  if (daysSince < GRACE_DAYS) {
    return { ...s, status: s.plan ? 'active' : 'trial', daysRemaining: 0, graceDaysLeft: Math.max(1, Math.ceil(GRACE_DAYS - daysSince)) }
  }
  return s
}

let cache: { blocked: boolean; at: number } | null = null

export function invalidateWebLicenseCache(): void {
  cache = null
  invalidateLicenseCache()
}

const ALWAYS_ALLOWED_PREFIXES = ['license:']

/** رسالة الخطأ لو القناة دي ممنوعة بسبب انتهاء الترخيص (بعد فترة السماح)، أو null لو مسموحة */
export async function webLicenseBlockReason(channel: string): Promise<string | null> {
  if (ALWAYS_ALLOWED_PREFIXES.some((p) => channel.startsWith(p))) return null
  if (!cache || Date.now() - cache.at > 30_000) {
    cache = { blocked: (await getWebLicenseStatus()).status === 'expired', at: Date.now() }
  }
  return cache.blocked ? 'انتهى الاشتراك — تواصل مع مزوّد الخدمة للتجديد' : null
}

export interface OwnerLicenseInput {
  plan: 'trial' | LicensePlan
  /** للاشتراكات المدفوعة: تاريخ الانتهاء (YYYY-MM-DD) */
  expiresAt?: string
  /** للتجربة: عدد الأيام من دلوقتي */
  trialDays?: number
  /** أقسام/ميزات موقوفة (نفس تنسيق الأوفلاين) */
  disabledFeatures?: string[]
}

/** بيضبط الترخيص بأمر المالك (بيتنادى من /internal/license على localhost بس) */
export async function setLicenseFromOwner(input: OwnerLicenseInput): Promise<WebLicenseStatus> {
  const db = getDb()
  const features = (input.disabledFeatures ?? []).filter(Boolean).join(',')

  if (input.plan === 'trial') {
    const days = Math.floor(Number(input.trialDays ?? 30))
    if (!Number.isFinite(days) || days < 1 || days > 365) throw new Error('trialDays لازم يكون بين 1 و365')
    await db.execute({
      sql: `UPDATE license
            SET status = 'trial', plan = NULL, license_key = NULL, activated_at = NULL, expires_at = NULL,
                first_run_at = datetime('now'), trial_days = ?, features = ?
            WHERE id = 1`,
      args: [days, features]
    })
  } else {
    if (input.plan !== 'daily' && input.plan !== 'monthly' && input.plan !== 'yearly') throw new Error('الخطة لازم تكون trial أو daily أو monthly أو yearly')
    const expires = input.expiresAt ? Date.parse(`${input.expiresAt}T23:59:59Z`) : NaN
    if (Number.isNaN(expires)) throw new Error('expiresAt لازم يكون تاريخ بصيغة YYYY-MM-DD')
    if (expires < Date.now()) throw new Error('تاريخ الانتهاء في الماضي')
    await db.execute({
      sql: `UPDATE license
            SET status = 'active', plan = ?, license_key = NULL, activated_at = datetime('now'), expires_at = ?, features = ?
            WHERE id = 1`,
      args: [input.plan, new Date(expires).toISOString(), features]
    })
  }

  invalidateWebLicenseCache()
  return getWebLicenseStatus()
}
