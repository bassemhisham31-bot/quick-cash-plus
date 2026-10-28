import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { getDb } from '../db'
import { logUserActivity as logActivity } from './users'
import { getStoreSettings } from './settings'
import { isMailConfigured, sendMail } from './mailer'

/**
 * استعادة كلمة المرور بالإيميل (نسخة الويب بس).
 * - الرابط صالح 30 دقيقة ولمرة واحدة، وبنخزّن hash منه في القاعدة (مش الرابط نفسه).
 * - الرد على "نسيت كلمة المرور" ثابت دايمًا سواء المستخدم موجود أو لأ، عشان محدش يعرف مين مسجّل.
 * - لكل مستخدم رسالة واحدة كل دقيقة بحد أقصى (منع إغراق صندوق الإيميل).
 */

const TOKEN_TTL_MS = 30 * 60 * 1000
const MIN_GAP_MS = 60 * 1000
const MIN_PASSWORD_LENGTH = 6

export const FORGOT_PASSWORD_REPLY =
  'لو الحساب موجود وعليه إيميل، هتوصلك رسالة فيها رابط لتعيين كلمة مرور جديدة (صالح 30 دقيقة). اتأكد كمان من مجلد الرسائل غير المرغوبة.'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sqlTime(ms: number): string {
  return new Date(ms).toISOString()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** بيحاول يبعت رسالة الاستعادة. ما بيرميش أخطاء للمستدعي (الرد دايمًا ثابت)؛ الأخطاء بتتسجّل في سجل السيرفر. */
export async function requestPasswordReset(identifier: string): Promise<void> {
  const id = identifier.trim().toLowerCase()
  if (!id || id.length > 200) return

  const publicUrl = (process.env.QCP_PUBLIC_URL ?? '').replace(/\/+$/, '')
  if (!publicUrl || !isMailConfigured()) {
    console.error('[password-reset] QCP_PUBLIC_URL أو إعدادات SMTP غير مضبوطة — لن يُرسل أي إيميل')
    return
  }

  const db = getDb()
  await db.execute("DELETE FROM password_resets WHERE created_at < datetime('now', '-7 days')").catch(() => {})
  const users = await db.execute({
    sql: `SELECT id, username, full_name, email FROM users
          WHERE active = 1 AND email IS NOT NULL AND email <> ''
            AND (lower(username) = ? OR lower(email) = ?)
          LIMIT 3`,
    args: [id, id]
  })
  if (!users.rows.length) return

  const storeName = (await getStoreSettings().catch(() => null))?.name || 'Quick Cash Plus'

  for (const u of users.rows as any[]) {
    const userId = Number(u.id)

    const last = await db.execute({
      sql: 'SELECT created_at FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      args: [userId]
    })
    const lastAt = last.rows[0] ? Date.parse(String((last.rows[0] as any).created_at).replace(' ', 'T') + 'Z') : NaN
    if (!Number.isNaN(lastAt) && Date.now() - lastAt < MIN_GAP_MS) continue

    const token = randomBytes(32).toString('hex')
    // أي رابط قديم لنفس المستخدم يتلغي — الأحدث بس هو الصالح
    await db.execute({ sql: 'DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', args: [userId] })
    await db.execute({
      sql: 'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      args: [userId, hashToken(token), sqlTime(Date.now() + TOKEN_TTL_MS)]
    })

    // الجزء بعد # مابيتبعتش للسيرفر ولا بيظهر في سجلات الوصول
    const link = `${publicUrl}/#reset=${token}`
    const name = String(u.full_name || u.username)
    try {
      await sendMail({
        to: String(u.email),
        subject: `استعادة كلمة المرور — ${storeName}`,
        text:
          `أهلاً ${name}،\n\n` +
          `وصلنا طلب لتعيين كلمة مرور جديدة لحسابك (${u.username}) في ${storeName}.\n` +
          `افتح الرابط ده لتعيين كلمة المرور (صالح 30 دقيقة ولمرة واحدة):\n${link}\n\n` +
          `لو إنت ماطلبتش ده، تجاهل الرسالة وكلمة مرورك هتفضل زي ما هي.`,
        html:
          `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#222">` +
          `<p>أهلاً ${escapeHtml(name)}،</p>` +
          `<p>وصلنا طلب لتعيين كلمة مرور جديدة لحسابك (<b>${escapeHtml(String(u.username))}</b>) في ${escapeHtml(storeName)}.</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none">تعيين كلمة مرور جديدة</a></p>` +
          `<p style="font-size:13px;color:#666">الرابط صالح 30 دقيقة ولمرة واحدة. لو الزرار مش شغّال انسخ الرابط ده في المتصفح:<br><span dir="ltr">${link}</span></p>` +
          `<p style="font-size:13px;color:#666">لو إنت ماطلبتش ده، تجاهل الرسالة وكلمة مرورك هتفضل زي ما هي.</p></div>`
      })
      await logActivity(userId, String(u.username), 'password_reset_requested').catch(() => {})
    } catch (err: any) {
      console.error('[password-reset] فشل إرسال الإيميل:', err?.message ?? err)
      await db.execute({ sql: 'DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', args: [userId] })
    }
  }
}

/** بيتحقق من الرابط ويعيّن كلمة المرور الجديدة. بيرمي رسالة عربية واضحة لو الرابط غلط/منتهي/مستخدم. */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new Error('رابط الاستعادة غير صالح')
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`كلمة المرور لازم تكون ${MIN_PASSWORD_LENGTH} حروف على الأقل`)
  }
  if (newPassword.length > 200) throw new Error('كلمة المرور طويلة جدًا')

  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT r.id, r.user_id, r.expires_at, r.used_at, u.username, u.active
          FROM password_resets r JOIN users u ON u.id = r.user_id
          WHERE r.token_hash = ?`,
    args: [hashToken(token)]
  })
  const row = rs.rows[0] as any
  if (!row || row.used_at || !row.active || Date.parse(String(row.expires_at)) < Date.now()) {
    throw new Error('رابط الاستعادة منتهي أو مستخدم قبل كده — اطلب رابط جديد')
  }

  const hash = bcrypt.hashSync(newPassword, 10)
  const tx = await db.transaction('write')
  try {
    // used_at IS NULL في الشرط: لو رابطين اتفتحوا في نفس اللحظة واحد بس ينجح
    const claimed = await tx.execute({
      sql: "UPDATE password_resets SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL",
      args: [Number(row.id)]
    })
    if (claimed.rowsAffected !== 1) throw new Error('رابط الاستعادة منتهي أو مستخدم قبل كده — اطلب رابط جديد')
    await tx.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hash, Number(row.user_id)] })
    await tx.execute({ sql: 'DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', args: [Number(row.user_id)] })
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  await logActivity(Number(row.user_id), String(row.username), 'password_reset_done').catch(() => {})
}
