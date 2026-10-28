import { getDb } from '../db'
import { branchScope, branchesEnabled, currentBranchId, DEFAULT_BRANCH_ID, type BranchScope } from './branchScope'
import type { Branch, BranchInput } from '../../shared/types'

function mapBranch(r: any): Branch {
  return {
    id: Number(r.id),
    name: String(r.name),
    code: r.code ? String(r.code) : null,
    address: r.address ? String(r.address) : null,
    phone: r.phone ? String(r.phone) : null,
    active: !!r.active
  }
}

const COLUMNS = 'id, name, code, address, phone, active'

export async function getBranch(id: number): Promise<Branch | null> {
  const rs = await getDb().execute({ sql: `SELECT ${COLUMNS} FROM branches WHERE id = ?`, args: [id] })
  return rs.rows[0] ? mapBranch(rs.rows[0]) : null
}

export async function getBranchName(id: number): Promise<string> {
  return (await getBranch(id))?.name ?? 'الفرع الرئيسي'
}

/** الفروع اللي المستخدم الحالي يقدر يشوفها: الأدمن كلها، وأي مستخدم تاني فرعه هو بس */
export async function listBranches(): Promise<Branch[]> {
  const rs = await getDb().execute(`SELECT ${COLUMNS} FROM branches ORDER BY id`)
  const all = rs.rows.map(mapBranch)
  const store = branchScope.getStore()
  if (!branchesEnabled() || !store || store.isAdmin) return all
  return all.filter((b) => b.id === store.homeBranchId)
}

function requireAdminWithBranches(): void {
  if (!branchesEnabled()) throw new Error('ميزة الفروع غير مفعّلة لحسابك')
  if (!branchScope.getStore()?.isAdmin) throw new Error('إدارة الفروع من الأدمن فقط')
}

function cleanInput(input: BranchInput): { name: string; code: string | null; address: string | null; phone: string | null } {
  const name = (input.name ?? '').trim()
  if (!name) throw new Error('اسم الفرع مطلوب')
  if (name.length > 80) throw new Error('اسم الفرع طويل')
  const opt = (v: string | null | undefined): string | null => (v ?? '').trim() || null
  return { name, code: opt(input.code), address: opt(input.address), phone: opt(input.phone) }
}

/** فرع جديد = سجل الفرع + مخزن افتراضي + 3 خزائن (كاش/بنك/محافظ) على نفس نمط الفرع الرئيسي */
export async function createBranch(input: BranchInput): Promise<Branch> {
  requireAdminWithBranches()
  const clean = cleanInput(input)
  const db = getDb()
  const dup = await db.execute({ sql: 'SELECT id FROM branches WHERE name = ?', args: [clean.name] })
  if (dup.rows.length) throw new Error('فيه فرع بنفس الاسم')

  const tx = await db.transaction('write')
  let id: number
  try {
    const info = await tx.execute({
      sql: 'INSERT INTO branches (name, code, address, phone, active) VALUES (?, ?, ?, ?, 1)',
      args: [clean.name, clean.code, clean.address, clean.phone]
    })
    id = Number(info.lastInsertRowid)
    await tx.execute({
      sql: 'INSERT INTO warehouses (name, is_default, branch_id) VALUES (?, 1, ?)',
      args: [`مخزن ${clean.name}`, id]
    })
    const treasuries: [string, string, string, number][] = [
      [`الخزينة — ${clean.name}`, 'cash', 'cash', 1],
      [`البنك — ${clean.name}`, 'bank', 'card,transfer', 0],
      [`المحافظ الإلكترونية — ${clean.name}`, 'wallet', 'wallet,vodafone_cash,instapay', 0]
    ]
    for (const [name, kind, methods, isDefault] of treasuries) {
      await tx.execute({
        sql: 'INSERT INTO treasuries (name, kind, opening_balance, methods, is_default, branch_id) VALUES (?, ?, 0, ?, ?, ?)',
        args: [name, kind, methods, isDefault, id]
      })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
  return (await getBranch(id))!
}

export async function updateBranch(id: number, input: BranchInput): Promise<Branch> {
  requireAdminWithBranches()
  const clean = cleanInput(input)
  const db = getDb()
  const existing = await getBranch(id)
  if (!existing) throw new Error('الفرع غير موجود')
  const dup = await db.execute({ sql: 'SELECT id FROM branches WHERE name = ? AND id != ?', args: [clean.name, id] })
  if (dup.rows.length) throw new Error('فيه فرع بنفس الاسم')

  const active = input.active === undefined ? existing.active : !!input.active
  if (existing.active && !active) {
    const others = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM branches WHERE active = 1 AND id != ?', args: [id] })
    if (Number((others.rows[0] as any).c) === 0) throw new Error('لازم يفضل فرع واحد نشط على الأقل')
    const openDay = await db.execute({ sql: "SELECT 1 FROM cash_sessions WHERE branch_id = ? AND status = 'open' LIMIT 1", args: [id] })
    if (openDay.rows.length) throw new Error('الفرع عليه يوم مفتوح — اقفله الأول')
  }

  await db.execute({
    sql: 'UPDATE branches SET name = ?, code = ?, address = ?, phone = ?, active = ? WHERE id = ?',
    args: [clean.name, clean.code, clean.address, clean.phone, active ? 1 : 0, id]
  })
  return (await getBranch(id))!
}

/**
 * نطاق الفرع لطلب مستخدم معيّن (بيتنادى من السيرفر قبل كل RPC):
 * المستخدم العادي دايمًا على فرعه، والأدمن على الفرع اللي اختاره في الهيدر (رقم فرع نشط أو all) وإلا فرعه.
 */
export async function resolveBranchScope(userId: number, header: string | undefined): Promise<BranchScope> {
  if (!branchesEnabled()) return { branchId: null, homeBranchId: DEFAULT_BRANCH_ID, isAdmin: false }
  const rs = await getDb().execute({ sql: 'SELECT role, branch_id, active FROM users WHERE id = ?', args: [userId] })
  const row = rs.rows[0] as any
  if (!row) throw new Error('المستخدم غير موجود')
  const home = Number(row.branch_id) || DEFAULT_BRANCH_ID
  const isAdmin = row.role === 'admin'
  let branchId: number | null = home
  const wanted = (header ?? '').trim()
  if (isAdmin && wanted) {
    if (wanted === 'all') {
      branchId = null
    } else {
      const n = Number(wanted)
      if (Number.isInteger(n) && n > 0) {
        const b = await getBranch(n)
        if (b?.active) branchId = n
      }
    }
  }
  return { branchId, homeBranchId: home, isAdmin }
}

/** يتأكد إن فرع المستخدم (عند الإنشاء/التعديل) موجود ونشط؛ لو مش مبعوت بيرجّع الفرع المحدد حاليًا أو الرئيسي */
export async function resolveUserBranchId(requested: number | undefined): Promise<number> {
  if (!branchesEnabled()) return DEFAULT_BRANCH_ID
  const fallback = branchScope.getStore()?.branchId ?? branchScope.getStore()?.homeBranchId ?? DEFAULT_BRANCH_ID
  const id = requested ?? fallback
  const b = await getBranch(id)
  if (!b) throw new Error('الفرع غير موجود')
  if (!b.active) throw new Error('الفرع متوقف')
  return id
}

/** يتأكد إن المخزن تابع لنطاق الفرع الحالي (مفيش وصول لمخزن فرع تاني بالـid) */
export async function assertWarehouseInScope(warehouseId: number | null | undefined): Promise<void> {
  const cur = currentBranchId()
  if (cur == null || warehouseId == null) return
  const rs = await getDb().execute({ sql: 'SELECT branch_id FROM warehouses WHERE id = ?', args: [warehouseId] })
  const row = rs.rows[0] as any
  if (!row || Number(row.branch_id) !== cur) throw new Error('المخزن ده تابع لفرع تاني')
}
