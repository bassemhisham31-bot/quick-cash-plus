import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { PERMISSIONS } from '../../shared/types'
import type { LoginResult, SessionUser } from '../../shared/types'
import { logUserActivity } from './users'

export async function login(username: string, password: string): Promise<LoginResult> {
  const db = getDb()
  const rs = await db.execute({
    sql: 'SELECT * FROM users WHERE username = ? AND active = 1',
    args: [username]
  })
  const row = rs.rows[0] as any

  if (!row) return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }

  const matches = bcrypt.compareSync(password, row.password_hash as string)
  if (!matches) return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }

  let permissions: string[]
  if (row.role === 'admin') {
    permissions = [...PERMISSIONS]
  } else {
    const permRs = await db.execute({
      sql: 'SELECT permission_code FROM user_permissions WHERE user_id = ?',
      args: [row.id]
    })
    permissions = permRs.rows.map((p: any) => p.permission_code as string)
  }

  const user: SessionUser = {
    id: Number(row.id),
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    permissions
  }

  await logUserActivity(user.id, user.username, 'login')

  return { ok: true, user }
}

/** قايمة المستخدمين النشطين لشاشة الدخول (اسم الدخول والاسم بس — من غير أي بيانات حساسة) */
export async function listLoginUsers(): Promise<{ username: string; fullName: string }[]> {
  const db = getDb()
  const rs = await db.execute(
    "SELECT username, full_name AS fullName FROM users WHERE active = 1 ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, full_name"
  )
  return rs.rows.map((r: any) => ({ username: r.username, fullName: r.fullName || r.username }))
}

/**
 * موافقة على عملية محمية (مثلاً حذف صنف من الفاتورة لكاشير مالوش صلاحية الحذف): الباسورد لازم يكون
 * لمستخدم نشط أدمن أو عنده صلاحية pos.deleteItem. الموافقة بتتسجل في سجل النشاط باسم اللي وافق.
 */
export async function approveWithSupervisorPassword(
  password: string,
  detail: string,
  requestedBy: string | null
): Promise<{ ok: boolean; approverName?: string; error?: string }> {
  if (!password) return { ok: false, error: 'اكتب الباسورد' }
  const db = getDb()
  const rs = await db.execute(
    `SELECT u.id, u.username, u.full_name AS fullName, u.password_hash AS hash FROM users u
     WHERE u.active = 1 AND (u.role = 'admin'
       OR EXISTS (SELECT 1 FROM user_permissions p WHERE p.user_id = u.id AND p.permission_code = 'pos.deleteItem'))`
  )
  for (const r of rs.rows as any[]) {
    if (bcrypt.compareSync(password, r.hash as string)) {
      const approverName = (r.fullName as string) || (r.username as string)
      await logUserActivity(Number(r.id), r.username as string, 'approve_delete', `${detail}${requestedBy ? ` — طلب: ${requestedBy}` : ''}`).catch(
        () => {}
      )
      return { ok: true, approverName }
    }
  }
  return { ok: false, error: 'الباسورد غلط أو مالوش صلاحية الموافقة' }
}

