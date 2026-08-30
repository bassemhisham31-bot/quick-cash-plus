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
