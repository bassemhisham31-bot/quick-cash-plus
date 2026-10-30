/**
 * مرفقات المصروفات/الموظفين على نسخة الويب (الأوفلاين بيستخدم حوار اختيار ملف + فتحه من القرص).
 * الملف بيترفع base64 عبر نفس قناة الـRPC وبيتخزّن في مجلد attachments جنب قاعدة بيانات العميل باسم عشوائي،
 * والمسار المحفوظ في قاعدة البيانات هو الاسم العشوائي ده بس (مفيش مسارات مكتوبة من المستخدم → مفيش path traversal).
 */
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import type { AttachFileResult, AttachmentFile } from '../../shared/types'

const MAX_BYTES = 10 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain'
}

const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/

function attachmentsDir(): string {
  const dir = join(process.env.QCP_DATA_DIR ?? join(process.cwd(), 'data'), 'attachments')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export async function uploadAttachment(file: AttachmentFile): Promise<AttachFileResult> {
  const name = String(file?.name ?? '').trim().slice(0, 150)
  const ext = extname(name).toLowerCase()
  if (!name || !MIME_BY_EXT[ext]) {
    return { ok: false, error: 'نوع الملف غير مدعوم (صور، PDF، Word، Excel، نص)' }
  }
  const data = Buffer.from(String(file.dataBase64 ?? ''), 'base64')
  if (!data.length) return { ok: false, error: 'الملف فاضي' }
  if (data.length > MAX_BYTES) return { ok: false, error: 'حجم الملف أكبر من 10 ميجا' }
  const stored = `${randomUUID()}${ext}`
  await writeFile(join(attachmentsDir(), stored), data)
  return { ok: true, path: stored, name }
}

export async function readAttachment(path: string): Promise<{ ok: boolean; error?: string; mime?: string; dataBase64?: string }> {
  if (!STORED_NAME.test(String(path ?? ''))) return { ok: false, error: 'مرفق غير صالح' }
  const full = join(attachmentsDir(), path)
  try {
    const data = await readFile(full)
    return { ok: true, mime: MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream', dataBase64: data.toString('base64') }
  } catch {
    return { ok: false, error: 'الملف مش موجود على السيرفر' }
  }
}
