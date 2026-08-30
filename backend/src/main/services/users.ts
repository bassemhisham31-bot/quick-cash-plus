import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { PERMISSIONS } from '../../shared/types'
import type {
  DeleteUserResult,
  UserActivityEntry,
  UserInput,
  UserListItem,
  UserUpdateInput
} from '../../shared/types'

async function logActivity(userId: number | null, username: string, action: string, detail?: string): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: 'INSERT INTO user_activity_log (user_id, username, action, detail) VALUES (?, ?, ?, ?)',
    args: [userId, username, action, detail ?? null]
  })
}

export async function listUsers(): Promise<UserListItem[]> {
  const db = getDb()
  const rs = await db.execute(`
    SELECT u.id, u.username, u.full_name AS fullName, u.role, u.active,
           (SELECT COUNT(*) FROM user_permissions WHERE user_id = u.id) AS permissionCount
    FROM users u
    ORDER BY u.id
  `)
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    username: r.username,
    fullName: r.fullName,
    role: r.role,
    active: !!r.active,
    permissionCount: r.role === 'admin' ? PERMISSIONS.length : Number(r.permissionCount)
  }))
}

export async function getUserPermissions(userId: number): Promise<string[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: 'SELECT permission_code FROM user_permissions WHERE user_id = ?',
    args: [userId]
  })
  return rs.rows.map((r: any) => r.permission_code as string)
}

async function countActiveAdmins(excludeUserId?: number): Promise<number> {
  const db = getDb()
  const rs = await db.execute("SELECT id FROM users WHERE role = 'admin' AND active = 1")
  return rs.rows.filter((r: any) => Number(r.id) !== excludeUserId).length
}

export async function createUser(input: UserInput): Promise<UserListItem> {
  const db = getDb()
  const username = input.username.trim()
  if (!username) throw new Error('اسم المستخدم مطلوب')
  if (!input.password || input.password.length < 4) throw new Error('كلمة المرور لازم تكون 4 حروف على الأقل')

  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  if (existing.rows.length > 0) throw new Error('اسم المستخدم مستخدم بالفعل')

  const hash = bcrypt.hashSync(input.password, 10)
  const tx = await db.transaction('write')
  let userId: number
  try {
    const info = await tx.execute({
      sql: `INSERT INTO users (username, password_hash, full_name, role, active) VALUES (?, ?, ?, ?, 1)`,
      args: [username, hash, input.fullName.trim() || username, input.role]
    })
    userId = Number(info.lastInsertRowid)

    if (input.role !== 'admin') {
      for (const code of input.permissions) {
        if (!PERMISSIONS.includes(code as any)) continue
        await tx.execute({
          sql: 'INSERT OR IGNORE INTO user_permissions (user_id, permission_code) VALUES (?, ?)',
          args: [userId, code]
        })
      }
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  await logActivity(userId, username, 'create_user', `الدور: ${input.role}`)

  const created = (await listUsers()).find((u) => u.id === userId)
  if (!created) throw new Error('تعذر إنشاء المستخدم')
  return created
}

export async function updateUser(id: number, input: UserUpdateInput): Promise<UserListItem> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })
  const row = rs.rows[0] as any
  if (!row) throw new Error('المستخدم غير موجود')

  if ((row.role === 'admin' && input.role !== 'admin') || (row.active && !input.active && row.role === 'admin')) {
    const remaining = await countActiveAdmins(id)
    if (remaining === 0) throw new Error('لازم يفضل مدير واحد نشط على الأقل في النظام')
  }

  const tx = await db.transaction('write')
  try {
    if (input.password && input.password.trim()) {
      const hash = bcrypt.hashSync(input.password.trim(), 10)
      await tx.execute({
        sql: 'UPDATE users SET full_name = ?, role = ?, active = ?, password_hash = ? WHERE id = ?',
        args: [input.fullName.trim() || row.username, input.role, input.active ? 1 : 0, hash, id]
      })
    } else {
      await tx.execute({
        sql: 'UPDATE users SET full_name = ?, role = ?, active = ? WHERE id = ?',
        args: [input.fullName.trim() || row.username, input.role, input.active ? 1 : 0, id]
      })
    }

    await tx.execute({ sql: 'DELETE FROM user_permissions WHERE user_id = ?', args: [id] })
    if (input.role !== 'admin') {
      for (const code of input.permissions) {
        if (!PERMISSIONS.includes(code as any)) continue
        await tx.execute({
          sql: 'INSERT OR IGNORE INTO user_permissions (user_id, permission_code) VALUES (?, ?)',
          args: [id, code]
        })
      }
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  await logActivity(id, row.username, 'update_user')

  const updated = (await listUsers()).find((u) => u.id === id)
  if (!updated) throw new Error('تعذر تحديث المستخدم')
  return updated
}

export async function deleteUser(id: number, currentUserId: number): Promise<DeleteUserResult> {
  const db = getDb()
  if (id === currentUserId) return { ok: false, deactivated: false, error: 'مينفعش تحذف حسابك الحالي' }

  const rs = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })
  const row = rs.rows[0] as any
  if (!row) return { ok: false, deactivated: false, error: 'المستخدم غير موجود' }

  if (row.role === 'admin' && row.active) {
    const remaining = await countActiveAdmins(id)
    if (remaining === 0) return { ok: false, deactivated: false, error: 'لازم يفضل مدير واحد نشط على الأقل في النظام' }
  }

  try {
    await db.execute({ sql: 'DELETE FROM user_permissions WHERE user_id = ?', args: [id] })
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] })
    await logActivity(null, row.username, 'delete_user')
    return { ok: true, deactivated: false }
  } catch {
    // فشل الحذف الفعلي لأن المستخدم مرتبط بسجلات تاريخية (فواتير/حركات) — يتعطّل بدل ما يتحذف
    await db.execute({ sql: 'UPDATE users SET active = 0 WHERE id = ?', args: [id] })
    await logActivity(id, row.username, 'deactivate_user', 'تعطيل بدل الحذف — مرتبط بسجلات سابقة')
    return { ok: true, deactivated: true }
  }
}

export async function listUserActivity(limit = 200): Promise<UserActivityEntry[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: 'SELECT id, username, action, detail, created_at AS createdAt FROM user_activity_log ORDER BY created_at DESC LIMIT ?',
    args: [limit]
  })
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    username: r.username,
    action: r.action,
    detail: r.detail,
    createdAt: r.createdAt
  }))
}

export { logActivity as logUserActivity }
