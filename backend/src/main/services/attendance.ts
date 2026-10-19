import { createRequire } from 'module'
import { join } from 'path'
import { getDb } from '../db'
import { hikDeviceInfo, hikFetchPunches, hikListUsers, type IsapiConfig } from './hikvisionIsapi'
import { recordEmployeeTransaction } from './employees'
import type {
  AttendancePayrollApproval,
  AttendancePayrollRow,
  AttendancePayrollRules,
  AttendanceSettingsInput,
  AttendanceDayRow,
  AttendanceDeviceUser,
  AttendanceEmployeeLink,
  AttendanceSettings,
  AttendanceSyncResult
} from '../../shared/types'

/** جهاز ZKTeco على الشبكة المحلية للفرع — السيرفر الأونلاين مايوصلوش، فالمكتبة بتتحمّل عند الحاجة بس. */
function loadZkLib(): any {
  try {
    return createRequire(join(process.cwd(), 'noop.js'))('node-zklib')
  } catch {
    throw new Error('الربط بجهاز البصمة (ZKTeco) غير متاح في نسخة الويب — محتاج وسيط داخل الفرع')
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')
function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const rs = await getDb().execute(
    `SELECT device_type, device_user, device_password, use_https, device_ip, device_port, auto_sync_minutes, last_sync_at, last_sync_error
     FROM attendance_settings WHERE id = 1`
  )
  const r = rs.rows[0] as any
  return {
    deviceType: r.device_type === 'zkteco' ? 'zkteco' : 'hikvision',
    deviceUser: r.device_user ?? 'admin',
    devicePassword: r.device_password ?? '',
    useHttps: Number(r.use_https) === 1,
    deviceIp: r.device_ip ?? '',
    devicePort: Number(r.device_port) || 4370,
    autoSyncMinutes: Number(r.auto_sync_minutes) || 0,
    lastSyncAt: r.last_sync_at ?? null,
    lastSyncError: r.last_sync_error ?? null
  }
}

export async function saveAttendanceSettings(input: AttendanceSettingsInput): Promise<void> {
  const defPort = input.deviceType === 'zkteco' ? 4370 : input.useHttps ? 443 : 80
  await getDb().execute({
    sql: `UPDATE attendance_settings SET device_type = ?, device_user = ?, device_password = ?, use_https = ?,
          device_ip = ?, device_port = ?, auto_sync_minutes = ? WHERE id = 1`,
    args: [
      input.deviceType === 'zkteco' ? 'zkteco' : 'hikvision',
      input.deviceUser.trim() || 'admin',
      input.devicePassword,
      input.useHttps ? 1 : 0,
      input.deviceIp.trim(),
      Math.max(1, Math.floor(input.devicePort) || defPort),
      Math.max(0, Math.floor(input.autoSyncMinutes) || 0)
    ]
  })
  scheduleAttendanceSync()
}

/** بيفتح اتصال بالجهاز، ينفّذ المطلوب، ويقفل الاتصال دايمًا */
async function withDevice<T>(fn: (zk: any) => Promise<T>): Promise<T> {
  const s = await getAttendanceSettings()
  if (!s.deviceIp) throw new Error('اكتب عنوان IP لماكينة البصمة الأول')
  const ZKLib = loadZkLib()
  const zk = new ZKLib(s.deviceIp, s.devicePort, 10000, 4000)
  try {
    await zk.createSocket()
  } catch (e: any) {
    throw new Error(
      `تعذر الاتصال بالماكينة ${s.deviceIp}:${s.devicePort} — اتأكد من الـIP والشبكة والبورت (${e?.message ?? e?.err?.message ?? 'خطأ'})`
    )
  }
  try {
    return await fn(zk)
  } finally {
    try {
      await zk.disconnect()
    } catch {
      /* ignore */
    }
  }
}

function isapiCfg(s: AttendanceSettings): IsapiConfig {
  if (!s.deviceIp) throw new Error('اكتب عنوان IP لماكينة البصمة الأول')
  return { ip: s.deviceIp, port: s.devicePort, user: s.deviceUser, password: s.devicePassword, https: s.useHttps }
}

function friendlyNetError(e: any, s: AttendanceSettings): Error {
  const code = e?.code as string | undefined
  if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ETIMEDOUT' || code === 'ENETUNREACH') {
    return new Error(`تعذر الوصول للماكينة ${s.deviceIp}:${s.devicePort} — اتأكد من الـIP والبورت وإن الجهاز والماكينة على نفس الشبكة (${code})`)
  }
  return e instanceof Error ? e : new Error(String(e))
}

export async function testAttendanceDevice(): Promise<{ ok: boolean; error?: string; info?: string }> {
  try {
    const s = await getAttendanceSettings()
    if (s.deviceType === 'hikvision') {
      try {
        return { ok: true, info: await hikDeviceInfo(isapiCfg(s)) }
      } catch (e) {
        throw friendlyNetError(e, s)
      }
    }
    const info = await withDevice(async (zk) => {
      const i = await zk.getInfo()
      return `مستخدمين: ${i.userCounts} — بصمات مسجلة: ${i.logCounts}`
    })
    return { ok: true, info }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'تعذر الاتصال' }
  }
}

export async function listDeviceUsers(): Promise<AttendanceDeviceUser[]> {
  const s = await getAttendanceSettings()
  if (s.deviceType === 'hikvision') {
    try {
      return await hikListUsers(isapiCfg(s))
    } catch (e) {
      throw friendlyNetError(e, s)
    }
  }
  const users = await withDevice(async (zk) => (await zk.getUsers()).data as any[])
  return users.map((u) => ({ deviceUserId: String(u.userId), name: String(u.name ?? '') }))
}

let syncing = false

/** بيسحب كل البصمات من الجهاز ويضيف الجديد بس (مفيش تكرار) */
export async function syncAttendance(): Promise<AttendanceSyncResult> {
  if (syncing) return { ok: false, error: 'فيه مزامنة شغالة حاليًا' }
  syncing = true
  const db = getDb()
  try {
    const s = await getAttendanceSettings()
    let records: { deviceUserId: string; at: string }[]
    if (s.deviceType === 'hikvision') {
      // من آخر بصمة متسجلة بيوم أمان (أو آخر 60 يوم أول مرة) لحد دلوقتي — التكرار بيتمنع بالـUNIQUE
      const lastRs = await db.execute('SELECT MAX(punched_at) AS m FROM attendance_logs')
      const last = (lastRs.rows[0] as any)?.m as string | null
      const start = last ? new Date(new Date(last.replace(' ', 'T')).getTime() - 86400000) : new Date(Date.now() - 60 * 86400000)
      const end = new Date(Date.now() + 86400000)
      const iso = (d: Date): string => {
        const off = -d.getTimezoneOffset()
        const sign = off >= 0 ? '+' : '-'
        return `${fmtLocal(d).replace(' ', 'T')}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
      }
      try {
        records = (await hikFetchPunches(isapiCfg(s), iso(start), iso(end))).map((p) => ({ deviceUserId: p.deviceUserId, at: p.at }))
      } catch (e) {
        throw friendlyNetError(e, s)
      }
    } else {
      const raw = await withDevice(async (zk) => (await zk.getAttendances()).data as any[])
      records = raw
        .map((r) => ({ deviceUserId: String(r.deviceUserId), at: fmtLocal(r.recordTime instanceof Date ? r.recordTime : new Date(r.recordTime)) }))
        .filter((r) => !r.at.startsWith('NaN'))
    }
    let added = 0
    const tx = await db.transaction('write')
    try {
      for (const r of records) {
        const res = await tx.execute({
          sql: 'INSERT OR IGNORE INTO attendance_logs (device_user_id, punched_at) VALUES (?, ?)',
          args: [r.deviceUserId, r.at]
        })
        added += Number(res.rowsAffected)
      }
      await tx.commit()
    } catch (e) {
      await tx.rollback()
      throw e
    }
    await db.execute("UPDATE attendance_settings SET last_sync_at = datetime('now','localtime'), last_sync_error = NULL WHERE id = 1")
    return { ok: true, fetched: records.length, added }
  } catch (e: any) {
    const msg = e?.message ?? 'فشلت المزامنة'
    await db.execute({ sql: 'UPDATE attendance_settings SET last_sync_error = ? WHERE id = 1', args: [msg] })
    return { ok: false, error: msg }
  } finally {
    syncing = false
  }
}

export async function listEmployeeLinks(): Promise<AttendanceEmployeeLink[]> {
  const rs = await getDb().execute(
    'SELECT id, name, device_user_id, shift_start, shift_end, weekly_off FROM employees WHERE deleted_at IS NULL AND active = 1 ORDER BY name'
  )
  return (rs.rows as any[]).map((r) => ({
    employeeId: Number(r.id),
    name: r.name,
    deviceUserId: r.device_user_id ?? null,
    shiftStart: r.shift_start ?? null,
    shiftEnd: r.shift_end ?? null,
    weeklyOff: r.weekly_off ?? ''
  }))
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export async function saveEmployeeShift(employeeId: number, shiftStart: string | null, shiftEnd: string | null, weeklyOff: string): Promise<void> {
  const s = shiftStart?.trim() || null
  const e = shiftEnd?.trim() || null
  if ((s && !TIME_RE.test(s)) || (e && !TIME_RE.test(e))) throw new Error('الوقت لازم يكون بصيغة HH:MM')
  const off = weeklyOff.trim()
  if (off !== '' && !/^[0-6]$/.test(off)) throw new Error('يوم الإجازة غير صحيح')
  await getDb().execute({
    sql: 'UPDATE employees SET shift_start = ?, shift_end = ?, weekly_off = ? WHERE id = ?',
    args: [s, e, off, employeeId]
  })
}

export async function getPayrollRules(): Promise<AttendancePayrollRules> {
  const rs = await getDb().execute(
    `SELECT default_shift_start, default_shift_end, grace_minutes, late_multiplier, absence_multiplier,
            overtime_multiplier, overtime_min_minutes, month_days FROM attendance_settings WHERE id = 1`
  )
  const r = rs.rows[0] as any
  return {
    defaultShiftStart: r.default_shift_start,
    defaultShiftEnd: r.default_shift_end,
    graceMinutes: Number(r.grace_minutes),
    lateMultiplier: Number(r.late_multiplier),
    absenceMultiplier: Number(r.absence_multiplier),
    overtimeMultiplier: Number(r.overtime_multiplier),
    overtimeMinMinutes: Number(r.overtime_min_minutes),
    monthDays: Number(r.month_days)
  }
}

export async function savePayrollRules(input: AttendancePayrollRules): Promise<void> {
  if (!TIME_RE.test(input.defaultShiftStart) || !TIME_RE.test(input.defaultShiftEnd)) throw new Error('الوقت لازم يكون بصيغة HH:MM')
  const nonNeg = (n: number): number => (Number.isFinite(n) && n >= 0 ? n : 0)
  await getDb().execute({
    sql: `UPDATE attendance_settings SET default_shift_start = ?, default_shift_end = ?, grace_minutes = ?, late_multiplier = ?,
          absence_multiplier = ?, overtime_multiplier = ?, overtime_min_minutes = ?, month_days = ? WHERE id = 1`,
    args: [
      input.defaultShiftStart,
      input.defaultShiftEnd,
      Math.floor(nonNeg(input.graceMinutes)),
      nonNeg(input.lateMultiplier),
      nonNeg(input.absenceMultiplier),
      nonNeg(input.overtimeMultiplier),
      Math.floor(nonNeg(input.overtimeMinMinutes)),
      Math.max(1, Math.floor(nonNeg(input.monthDays)) || 30)
    ]
  })
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const round2 = (n: number): number => Math.round(n * 100) / 100

function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  // حد أقصى 400 يوم عشان أي مدخل غلط ما يعلّقش البرنامج
  for (let i = 0; d <= end && i < 400; i++) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

/**
 * حساب الخصومات/الإضافي من البصمات للفترة [from, to] — للعرض والمراجعة بس، مفيش حاجة بتتسجل هنا.
 * القواعد: بعد دقائق السماح التأخير كله بيتحسب، الغياب = يوم بدون أي بصمة (غير الإجازة الأسبوعية)،
 * الخروج المبكر والإضافي بيتحسبوا بس لو اليوم فيه بصمتين على الأقل. الورديات اللي بتعدّي منتصف الليل (النهاية <= البداية) مش مدعومة
 * للخروج المبكر/الإضافي (التأخير والغياب شغالين عادي).
 */
export async function calculateAttendancePayroll(from: string, to: string): Promise<AttendancePayrollRow[]> {
  const db = getDb()
  const rules = await getPayrollRules()
  const empRs = await db.execute(
    `SELECT id, name, base_salary, device_user_id, shift_start, shift_end, weekly_off
     FROM employees WHERE deleted_at IS NULL AND active = 1 AND device_user_id IS NOT NULL ORDER BY name`
  )
  const logRs = await db.execute({
    sql: 'SELECT device_user_id AS did, punched_at AS at FROM attendance_logs WHERE date(punched_at) >= date(?) AND date(punched_at) <= date(?) ORDER BY punched_at',
    args: [from, to]
  })
  const punches = new Map<string, string[]>() // "did|day" -> ["HH:MM", ...]
  for (const r of logRs.rows as any[]) {
    const at = String(r.at)
    const key = `${r.did}|${at.slice(0, 10)}`
    const list = punches.get(key) ?? []
    list.push(at.slice(11, 16))
    punches.set(key, list)
  }
  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const days = eachDay(from, to)

  const out: AttendancePayrollRow[] = []
  for (const e of empRs.rows as any[]) {
    const startStr: string = e.shift_start || rules.defaultShiftStart
    const endStr: string = e.shift_end || rules.defaultShiftEnd
    const startMin = toMin(startStr)
    const endMin = toMin(endStr)
    const normalShift = endMin > startMin
    const shiftHours = normalShift ? (endMin - startMin) / 60 : 8
    const baseSalary = Number(e.base_salary) || 0
    const daily = baseSalary / rules.monthDays
    const hourly = daily / shiftHours
    const offDay = e.weekly_off === '' || e.weekly_off == null ? null : Number(e.weekly_off)

    const row: AttendancePayrollRow = {
      employeeId: Number(e.id),
      name: e.name,
      baseSalary,
      absentDays: 0,
      lateMinutes: 0,
      earlyMinutes: 0,
      overtimeMinutes: 0,
      incompleteDays: 0,
      lateDeduction: 0,
      earlyDeduction: 0,
      absenceDeduction: 0,
      totalDeduction: 0,
      overtimeBonus: 0,
      alreadyApproved: false,
      days: []
    }

    for (const day of days) {
      if (day > today) break
      const times = punches.get(`${e.device_user_id}|${day}`)
      if (!times?.length) {
        const isOff = offDay !== null && new Date(`${day}T00:00:00`).getDay() === offDay
        if (isOff || day === today) continue // الإجازة الأسبوعية، واليوم الحالي لسه ما خلصش
        row.absentDays++
        row.days.push({ day, kind: 'absent', firstIn: null, lastOut: null, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0, incomplete: false })
        continue
      }
      const firstIn = times[0]
      const hasOut = times.length >= 2
      const lastOut = hasOut ? times[times.length - 1] : null
      const late = toMin(firstIn) - startMin
      const lateMinutes = late > rules.graceMinutes ? late : 0
      let earlyMinutes = 0
      let overtimeMinutes = 0
      if (hasOut && normalShift) {
        const early = endMin - toMin(lastOut!)
        if (early > rules.graceMinutes) earlyMinutes = early
        const over = toMin(lastOut!) - endMin
        if (rules.overtimeMultiplier > 0 && over >= rules.overtimeMinMinutes) overtimeMinutes = over
      }
      row.lateMinutes += lateMinutes
      row.earlyMinutes += earlyMinutes
      row.overtimeMinutes += overtimeMinutes
      if (!hasOut && day !== today) row.incompleteDays++
      row.days.push({
        day,
        kind: 'present',
        firstIn,
        lastOut,
        lateMinutes,
        earlyMinutes,
        overtimeMinutes,
        incomplete: !hasOut && day !== today
      })
    }

    row.lateDeduction = round2((row.lateMinutes / 60) * hourly * rules.lateMultiplier)
    row.earlyDeduction = round2((row.earlyMinutes / 60) * hourly * rules.lateMultiplier)
    row.absenceDeduction = round2(row.absentDays * daily * rules.absenceMultiplier)
    row.totalDeduction = round2(row.lateDeduction + row.earlyDeduction + row.absenceDeduction)
    row.overtimeBonus = round2((row.overtimeMinutes / 60) * hourly * rules.overtimeMultiplier)

    // اتعتمدت قبل كده؟ (فترة متداخلة وحركتها لسه موجودة في دفتر الموظف)
    const runRs = await db.execute({
      sql: `SELECT 1 FROM attendance_payroll_runs r
            WHERE r.employee_id = ? AND r.from_date <= ? AND r.to_date >= ?
              AND (EXISTS (SELECT 1 FROM employee_transactions t WHERE t.id = r.deduction_tx_id)
                OR EXISTS (SELECT 1 FROM employee_transactions t WHERE t.id = r.bonus_tx_id)) LIMIT 1`,
      args: [row.employeeId, to, from]
    })
    row.alreadyApproved = runRs.rows.length > 0
    out.push(row)
  }
  return out
}

/** بيسجّل الخصم/المكافأة في دفتر الموظف (الفترة المفتوحة) ويقفل الفترة دي من الحساب تاني */
export async function approveAttendancePayroll(
  from: string,
  to: string,
  items: AttendancePayrollApproval[],
  userId: number
): Promise<{ approved: number; skipped: string[] }> {
  const db = getDb()
  let approved = 0
  const skipped: string[] = []
  for (const it of items) {
    const dup = await db.execute({
      sql: `SELECT 1 FROM attendance_payroll_runs r
            WHERE r.employee_id = ? AND r.from_date <= ? AND r.to_date >= ?
              AND (EXISTS (SELECT 1 FROM employee_transactions t WHERE t.id = r.deduction_tx_id)
                OR EXISTS (SELECT 1 FROM employee_transactions t WHERE t.id = r.bonus_tx_id)) LIMIT 1`,
      args: [it.employeeId, to, from]
    })
    const nameRs = await db.execute({ sql: 'SELECT name FROM employees WHERE id = ?', args: [it.employeeId] })
    const name = String((nameRs.rows[0] as any)?.name ?? it.employeeId)
    if (dup.rows.length) {
      skipped.push(`${name} (الفترة معتمدة قبل كده)`)
      continue
    }
    const ded = round2(Number(it.deduction) || 0)
    const bon = round2(Number(it.bonus) || 0)
    if (ded <= 0 && bon <= 0) continue
    let dedId: number | null = null
    let bonId: number | null = null
    if (ded > 0) {
      const tx = await recordEmployeeTransaction({ employeeId: it.employeeId, type: 'deduction', amount: ded, note: it.note }, userId)
      dedId = tx.id
    }
    if (bon > 0) {
      const tx = await recordEmployeeTransaction({ employeeId: it.employeeId, type: 'bonus', amount: bon, note: it.note }, userId)
      bonId = tx.id
    }
    await db.execute({
      sql: 'INSERT INTO attendance_payroll_runs (employee_id, from_date, to_date, deduction_tx_id, bonus_tx_id) VALUES (?, ?, ?, ?, ?)',
      args: [it.employeeId, from, to, dedId, bonId]
    })
    approved++
  }
  return { approved, skipped }
}

export async function linkEmployee(employeeId: number, deviceUserId: string | null): Promise<void> {
  const v = deviceUserId?.trim() || null
  const db = getDb()
  if (v) await db.execute({ sql: 'UPDATE employees SET device_user_id = NULL WHERE device_user_id = ? AND id != ?', args: [v, employeeId] })
  await db.execute({ sql: 'UPDATE employees SET device_user_id = ? WHERE id = ?', args: [v, employeeId] })
}

/** تقرير يومي: أول بصمة = حضور، آخر بصمة = انصراف */
export async function attendanceReport(from: string, to: string): Promise<AttendanceDayRow[]> {
  const rs = await getDb().execute({
    sql: `SELECT l.device_user_id AS did, l.punched_at AS at, e.id AS empId, e.name AS empName
          FROM attendance_logs l
          LEFT JOIN employees e ON e.device_user_id = l.device_user_id AND e.deleted_at IS NULL
          WHERE date(l.punched_at) >= date(?) AND date(l.punched_at) <= date(?)
          ORDER BY l.punched_at`,
    args: [from, to]
  })
  const map = new Map<string, AttendanceDayRow>()
  for (const r of rs.rows as any[]) {
    const at = String(r.at)
    const day = at.slice(0, 10)
    const key = `${day}|${r.did}`
    const row = map.get(key)
    if (!row) {
      map.set(key, {
        day,
        deviceUserId: String(r.did),
        employeeId: r.empId != null ? Number(r.empId) : null,
        employeeName: r.empName ?? `غير مربوط (رقم ${r.did})`,
        firstIn: at.slice(11, 16),
        lastOut: null,
        punches: 1,
        hours: null,
        punchTimes: [at.slice(11, 16)]
      })
    } else {
      row.punches++
      row.punchTimes.push(at.slice(11, 16))
      row.lastOut = at.slice(11, 16)
    }
  }
  const out = Array.from(map.values())
  for (const row of out) {
    if (row.lastOut) {
      const [h1, m1] = row.firstIn.split(':').map(Number)
      const [h2, m2] = row.lastOut.split(':').map(Number)
      row.hours = Math.round(((h2 * 60 + m2 - (h1 * 60 + m1)) / 60) * 100) / 100
    }
  }
  return out.sort((a, b) => (a.day === b.day ? a.employeeName.localeCompare(b.employeeName, 'ar') : a.day < b.day ? 1 : -1))
}

let timer: NodeJS.Timeout | null = null
/** مزامنة تلقائية كل N دقيقة (لو متفعّلة في الإعدادات) — بتشتغل على الجهاز الرئيسي بس */
export function scheduleAttendanceSync(): void {
  if (timer) clearInterval(timer)
  timer = null
  getAttendanceSettings()
    .then((s) => {
      if (!s.deviceIp || s.autoSyncMinutes <= 0) return
      timer = setInterval(() => {
        syncAttendance().catch(() => undefined)
      }, s.autoSyncMinutes * 60_000)
    })
    .catch(() => undefined)
}
