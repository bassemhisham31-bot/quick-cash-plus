/**
 * تصدير/استيراد العملاء إكسيل (ويب).
 *  - التصدير: كل العملاء (كود، اسم، موبايل، عنوان، ملاحظات، رصيد).
 *  - الاستيراد: الصف اللي فيه «الكود» بيحدّث نفس العميل (الموبايل/الاسم/العنوان/الملاحظات) — ده طريق تبديل الأرقام.
 *    صف من غير كود: لو الاسم مطابق لعميل واحد موجود بيتحدّث، ولو مش موجود بيتضاف عميل جديد برصيد صفر.
 *  - عمود «الرصيد» للعرض بس — الاستيراد عمره ما بيغيّر رصيد ولا حركات.
 */
import ExcelJS from 'exceljs'
import { getDb } from '../db'
import type { ExportResult, ProductImportResult, ProductImportRowError } from '../../shared/types'

const HEADERS = {
  id: 'الكود',
  name: 'الاسم',
  phone: 'الموبايل',
  address: 'العنوان',
  notes: 'ملاحظات',
  balance: 'الرصيد (للعرض فقط)'
} as const
type Key = keyof typeof HEADERS

type WebExportResult = ExportResult & { fileName?: string; mimeType?: string; dataBase64?: string }
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function exportCustomersToExcel(): Promise<WebExportResult> {
  try {
    const rs = await getDb().execute(
      `SELECT id, name, phone, address, notes, balance FROM customers WHERE deleted_at IS NULL AND is_walk_in = 0 ORDER BY name`
    )
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('العملاء')
    sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
    sheet.columns = [
      { header: HEADERS.id, key: 'id', width: 10 },
      { header: HEADERS.name, key: 'name', width: 38 },
      { header: HEADERS.phone, key: 'phone', width: 18 },
      { header: HEADERS.address, key: 'address', width: 34 },
      { header: HEADERS.notes, key: 'notes', width: 34 },
      { header: HEADERS.balance, key: 'balance', width: 18 }
    ]
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    // الموبايل نص (مش رقم) عشان الصفر اللي في الأول ما يتشالش لما المستخدم يكتب رقم جديد
    sheet.getColumn('phone').numFmt = '@'
    for (const r of rs.rows as any[]) {
      sheet.addRow({
        id: Number(r.id),
        name: r.name,
        phone: r.phone ?? '',
        address: r.address ?? '',
        notes: r.notes ?? '',
        balance: Number(r.balance)
      })
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    return {
      ok: true,
      fileName: `العملاء-${new Date().toISOString().slice(0, 10)}.xlsx`,
      mimeType: XLSX_MIME,
      dataBase64: buffer.toString('base64')
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر تصدير العملاء' }
  }
}

function cellText(row: ExcelJS.Row, col: number | undefined): string {
  if (!col) return ''
  const v = row.getCell(col).value as any
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('richText' in v) return (v.richText as any[]).map((t) => t.text).join('').trim()
    if ('text' in v) return String(v.text ?? '').trim()
    if ('result' in v) return String(v.result ?? '').trim()
  }
  return String(v).trim()
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** بيظبط الرقم: أرقام عربي → إنجليزي، وبيرجّع الصفر الأول لو إكسيل شاله (رقم موبايل مصري 10 خانات بيبدأ بـ1). */
function normalizePhone(raw: string): string {
  let s = raw.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).trim()
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '')
  if (/^1\d{9}$/.test(s)) s = '0' + s
  return s
}

export async function importCustomersFromExcel(dataBase64: string): Promise<ProductImportResult> {
  const fail = (error: string): ProductImportResult => ({ ok: false, error, created: 0, updated: 0, rowErrors: [] })
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(dataBase64, 'base64') as any)
    const sheet = workbook.worksheets[0]
    if (!sheet) return fail('الملف لا يحتوي على أي صفحة بيانات')

    const col: Partial<Record<Key, number>> = {}
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const text = String(cell.value ?? '').trim()
      const key = (Object.keys(HEADERS) as Key[]).find((k) => HEADERS[k] === text || (k === 'balance' && text.startsWith('الرصيد')))
      if (key) col[key] = colNumber
    })
    if (!col.id && !col.name) return fail('لازم يكون فيه عمود «الكود» أو «الاسم» — صدّر العملاء الأول وعدّل على نفس الملف')

    const db = getDb()
    const existingRs = await db.execute('SELECT id, name, phone, address, notes FROM customers WHERE deleted_at IS NULL AND is_walk_in = 0')
    const byId = new Map<number, any>()
    const byName = new Map<string, any[]>()
    for (const r of existingRs.rows as any[]) {
      byId.set(Number(r.id), r)
      const k = String(r.name).trim()
      byName.set(k, [...(byName.get(k) ?? []), r])
    }

    const rowErrors: ProductImportRowError[] = []
    const updates: { id: number; name: string; phone: string | null; address: string | null; notes: string | null }[] = []
    const creates: { name: string; phone: string | null; address: string | null; notes: string | null }[] = []
    const seenIds = new Set<number>()

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i)
      const idText = cellText(row, col.id)
      const name = cellText(row, col.name)
      const phone = normalizePhone(cellText(row, col.phone))
      const address = cellText(row, col.address)
      const notes = cellText(row, col.notes)
      if (!idText && !name && !phone) continue // صف فاضي

      let target: any = null
      if (idText) {
        const id = Number(idText)
        target = Number.isInteger(id) ? byId.get(id) : null
        if (!target) {
          rowErrors.push({ row: i, message: `الكود ${idText} مش موجود — سيب خانة الكود فاضية لو ده عميل جديد` })
          continue
        }
        if (seenIds.has(id)) {
          rowErrors.push({ row: i, message: `الكود ${idText} مكرر في الملف` })
          continue
        }
        seenIds.add(id)
      } else {
        if (!name) {
          rowErrors.push({ row: i, message: 'صف من غير كود ولا اسم' })
          continue
        }
        const matches = byName.get(name) ?? []
        if (matches.length > 1) {
          rowErrors.push({ row: i, message: `فيه أكتر من عميل باسم «${name}» — اكتب الكود عشان نعرف أنهي واحد` })
          continue
        }
        target = matches[0] ?? null
        if (target) {
          if (seenIds.has(Number(target.id))) {
            rowErrors.push({ row: i, message: `العميل «${name}» مكرر في الملف` })
            continue
          }
          seenIds.add(Number(target.id))
        }
      }

      // العمود اللي مش موجود في الملف أصلًا ما بيتلمسش؛ الموجود بيتاخد زي ما هو (حتى لو فاضي = مسح القيمة)
      const pick = (present: number | undefined, value: string, old: string | null): string | null =>
        present ? value || null : (old ?? null)

      if (target) {
        const next = {
          id: Number(target.id),
          name: name || String(target.name),
          phone: pick(col.phone, phone, target.phone),
          address: pick(col.address, address, target.address),
          notes: pick(col.notes, notes, target.notes)
        }
        const changed =
          next.name !== String(target.name) ||
          next.phone !== (target.phone ?? null) ||
          next.address !== (target.address ?? null) ||
          next.notes !== (target.notes ?? null)
        if (changed) updates.push(next)
      } else {
        creates.push({ name, phone: phone || null, address: address || null, notes: notes || null })
      }
    }

    const tx = await db.transaction('write')
    try {
      for (const u of updates) {
        await tx.execute({
          sql: 'UPDATE customers SET name = ?, phone = ?, address = ?, notes = ? WHERE id = ?',
          args: [u.name, u.phone, u.address, u.notes, u.id]
        })
      }
      for (const c of creates) {
        await tx.execute({
          sql: `INSERT INTO customers (name, phone, address, balance, loyalty_points, notes, loyalty_enabled) VALUES (?, ?, ?, 0, 0, ?, 1)`,
          args: [c.name, c.phone, c.address, c.notes]
        })
      }
      await tx.commit()
    } catch (err) {
      await tx.rollback()
      throw err
    }
    return { ok: true, created: creates.length, updated: updates.length, rowErrors }
  } catch (err: any) {
    return fail(err?.message ?? 'تعذر قراءة الملف — اتأكد إنه ملف إكسيل (.xlsx)')
  }
}
