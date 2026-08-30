import { createHmac } from 'crypto'
import { getDb } from '../db'
import { computeDeviceFingerprint } from './deviceFingerprint'
import type { ActivateLicenseResult, LicensePlan, LicenseStatus } from '../../shared/types'

// ملاحظة: هذا سر مُضمَّن داخل التطبيق للتحقق دون اتصال بخادم — أسلوب شائع لبرامج سطح المكتب
// الصغيرة، لكنه ليس بديلاً كاملاً عن خادم تفعيل حقيقي (قابل للاستخراج من الحزمة نظريًا).
const LICENSE_SECRET = 'quick-cash-plus-offline-license-v1'

export { computeDeviceFingerprint }

function sign(payload: string): string {
  return createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').slice(0, 12)
}

/** يُستخدم من طرف مالك المنتج لتوليد كود تفعيل مخصص لجهاز عميل معيّن. */
export function generateLicenseKey(
  deviceFingerprint: string,
  expiresAt: string,
  plan: LicensePlan,
  disabledFeatures: string[] = []
): string {
  const fpPrefix = deviceFingerprint.slice(0, 16)
  const featuresCsv = disabledFeatures.join(',')
  const payload = `${fpPrefix}|${expiresAt}|${plan}|${featuresCsv}`
  const sig = sign(payload)
  return Buffer.from(`${payload}|${sig}`, 'utf-8').toString('base64url')
}

export interface LicenseKeyValidation {
  valid: boolean
  error?: string
  expiresAt?: string
  plan?: LicensePlan
  disabledFeatures?: string[]
}

export function validateLicenseKey(key: string, deviceFingerprint: string): LicenseKeyValidation {
  let raw: string
  try {
    raw = Buffer.from(key.trim(), 'base64url').toString('utf-8')
  } catch {
    return { valid: false, error: 'كود التفعيل غير صالح' }
  }

  const parts = raw.split('|')
  if (parts.length !== 5) return { valid: false, error: 'كود التفعيل غير صالح' }
  const [fpPrefix, expiresAt, plan, featuresCsv, sig] = parts

  const payload = `${fpPrefix}|${expiresAt}|${plan}|${featuresCsv}`
  if (sign(payload) !== sig) return { valid: false, error: 'كود التفعيل غير صحيح' }
  if (deviceFingerprint.slice(0, 16) !== fpPrefix) return { valid: false, error: 'هذا الكود مخصص لجهاز آخر' }
  if (plan !== 'daily' && plan !== 'monthly' && plan !== 'yearly') return { valid: false, error: 'كود التفعيل غير صالح' }
  if (new Date(expiresAt).getTime() < Date.now()) return { valid: false, error: 'انتهت صلاحية هذا الكود' }

  const disabledFeatures = featuresCsv ? featuresCsv.split(',').filter(Boolean) : []
  return { valid: true, expiresAt, plan: plan as LicensePlan, disabledFeatures }
}

function parseFeatures(row: any): string[] {
  const raw = row?.features
  return raw ? String(raw).split(',').filter(Boolean) : []
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const db = getDb()
  const fingerprint = computeDeviceFingerprint()

  const rs = await db.execute('SELECT * FROM license WHERE id = 1')
  const row = rs.rows[0] as any

  if (!row) {
    return { deviceFingerprint: fingerprint, status: 'trial', plan: null, daysRemaining: 15, expiresAt: null, disabledFeatures: [] }
  }

  const disabledFeatures = parseFeatures(row)

  if (row.status === 'active' && row.expires_at) {
    const expiresAt = new Date(row.expires_at)
    if (expiresAt.getTime() < Date.now()) {
      await db.execute("UPDATE license SET status = 'expired' WHERE id = 1")
      return {
        deviceFingerprint: fingerprint,
        status: 'expired',
        plan: row.plan,
        daysRemaining: 0,
        expiresAt: row.expires_at,
        disabledFeatures
      }
    }
    const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000))
    return {
      deviceFingerprint: fingerprint,
      status: 'active',
      plan: row.plan,
      daysRemaining,
      expiresAt: row.expires_at,
      disabledFeatures
    }
  }

  if (row.status === 'expired') {
    return {
      deviceFingerprint: fingerprint,
      status: 'expired',
      plan: row.plan,
      daysRemaining: 0,
      expiresAt: row.expires_at,
      disabledFeatures
    }
  }

  // trial
  const firstRun = new Date(row.first_run_at)
  const trialDays = Number(row.trial_days)
  const daysUsed = Math.floor((Date.now() - firstRun.getTime()) / (24 * 3600 * 1000))
  const daysRemaining = Math.max(0, trialDays - daysUsed)
  return {
    deviceFingerprint: fingerprint,
    status: daysRemaining > 0 ? 'trial' : 'expired',
    plan: null,
    daysRemaining,
    expiresAt: null,
    disabledFeatures: []
  }
}

export async function activateLicense(key: string): Promise<ActivateLicenseResult> {
  const db = getDb()
  const fingerprint = computeDeviceFingerprint()
  const validation = validateLicenseKey(key, fingerprint)
  if (!validation.valid) return { ok: false, error: validation.error }

  await db.execute({
    sql: `UPDATE license
          SET status = 'active', license_key = ?, plan = ?, activated_at = datetime('now'), expires_at = ?, features = ?
          WHERE id = 1`,
    args: [key.trim(), validation.plan, validation.expiresAt, (validation.disabledFeatures ?? []).join(',')]
  })

  return { ok: true, status: await getLicenseStatus() }
}
