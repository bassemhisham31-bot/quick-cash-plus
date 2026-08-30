import { copyFile, mkdir, readdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getDb, getDbPath } from '../db'
import { getBackupSettings } from './settings'
import type { BackupFileInfo, BackupResult } from '../../shared/types'

async function resolveBackupFolder(): Promise<string> {
  const settings = await getBackupSettings()
  if (settings.backupFolder) return settings.backupFolder
  return join(process.env.QCP_BACKUP_DIR ?? join(process.cwd(), 'data', 'backups'))
}

/** النسخ الاحتياطي بنسخ ملف حاليًا بيشتغل بس لما قاعدة البيانات ملف SQLite محلي (وضع التطوير) — لو متصلة بـTurso (سيرفر بعيد)، Turso نفسه بيوفر نسخ احتياطي/point-in-time recovery، والنسخ اليدوي ده هيتصمم من جديد في مرحلة لاحقة (Cloudflare R2). */
export async function runLocalBackup(): Promise<BackupResult> {
  const db = getDb()
  try {
    const dbPathCheck = getDbPath()
    if (/^(libsql|https?):\/\//.test(dbPathCheck)) {
      return { ok: false, error: 'قاعدة البيانات متصلة بسيرفر بعيد (Turso) — النسخ الاحتياطي المحلي غير مدعوم في هذه الحالة بعد' }
    }

    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)')

    const folder = await resolveBackupFolder()
    if (!existsSync(folder)) await mkdir(folder, { recursive: true })

    const dbPath = getDbPath()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const destPath = join(folder, `quick-cash-plus-backup-${timestamp}.sqlite`)
    await copyFile(dbPath, destPath)

    const info = await stat(destPath)
    await db.execute({
      sql: `INSERT INTO backup_log (type, file_path, size_bytes, status) VALUES ('local', ?, ?, 'success')`,
      args: [destPath, info.size]
    })
    await db.execute("UPDATE backup_settings SET last_backup_at = datetime('now') WHERE id = 1")

    await pruneOldBackups(folder)

    return { ok: true, filePath: destPath }
  } catch (err: any) {
    const message = err?.message ?? 'تعذر إنشاء النسخة الاحتياطية'
    try {
      await db.execute({
        sql: `INSERT INTO backup_log (type, status, error) VALUES ('local', 'failed', ?)`,
        args: [message]
      })
    } catch {
      // تجاهل فشل تسجيل الخطأ نفسه
    }
    return { ok: false, error: message }
  }
}

async function pruneOldBackups(folder: string): Promise<void> {
  const settings = await getBackupSettings()
  const files = await listBackups(folder)
  const excess = files.slice(settings.keepCount)
  for (const f of excess) {
    await unlink(f.filePath).catch(() => {})
  }
}

export async function listBackups(folderOverride?: string): Promise<BackupFileInfo[]> {
  const folder = folderOverride ?? (await resolveBackupFolder())
  if (!existsSync(folder)) return []

  const names = await readdir(folder)
  const sqliteFiles = names.filter((n) => n.endsWith('.sqlite'))
  const infos = await Promise.all(
    sqliteFiles.map(async (name) => {
      const filePath = join(folder, name)
      const info = await stat(filePath)
      return { fileName: name, filePath, sizeBytes: info.size, createdAt: info.mtime.toISOString() }
    })
  )
  return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** يستبدل ملف قاعدة البيانات الحالي بنسخة احتياطية، ثم ينهي عملية السيرفر — متوقَّع أن يكون مُدار بـPM2 (أو مشابه) عشان يعيد تشغيلها تلقائيًا. */
export async function restoreBackup(filePath: string): Promise<BackupResult> {
  try {
    if (!existsSync(filePath)) return { ok: false, error: 'الملف غير موجود' }

    const dbPath = getDbPath()
    if (/^(libsql|https?):\/\//.test(dbPath)) {
      return { ok: false, error: 'قاعدة البيانات متصلة بسيرفر بعيد (Turso) — الاسترجاع من ملف محلي غير مدعوم في هذه الحالة بعد' }
    }
    const db = getDb()
    await (db as any).close?.()

    await copyFile(filePath, dbPath)
    for (const suffix of ['-wal', '-shm']) {
      const p = `${dbPath}${suffix}`
      if (existsSync(p)) await unlink(p).catch(() => {})
    }

    setTimeout(() => process.exit(0), 200)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر استرجاع النسخة الاحتياطية' }
  }
}

let scheduledTimer: ReturnType<typeof setInterval> | null = null

export async function scheduleAutoBackup(): Promise<void> {
  if (scheduledTimer) {
    clearInterval(scheduledTimer)
    scheduledTimer = null
  }
  const settings = await getBackupSettings()
  if (!settings.autoBackupEnabled) return

  const intervalMs = settings.frequencyHours * 3600 * 1000
  scheduledTimer = setInterval(() => {
    runLocalBackup()
  }, intervalMs)
}
