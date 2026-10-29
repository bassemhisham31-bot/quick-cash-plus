import ExcelJS from 'exceljs'
import { getDb } from '../db'
import { getDefaultWarehouseId } from '../db/seed'
import { nextAutoBarcode } from './catalog'
import type { ExportResult, ProductImportResult } from '../../shared/types'

const HEADERS = {
  name: 'الاسم',
  barcode: 'الباركود',
  category: 'التصنيف',
  unit: 'الوحدة',
  costPrice: 'سعر الشراء',
  retailPrice: 'سعر البيع (قطاعي)',
  wholesalePrice: 'سعر الجملة',
  wholesale2Price: 'سعر جملة الجملة',
  packPrice: 'سعر العبوة',
  reorderPoint: 'حد التنبيه',
  quantity: 'الكمية الحالية',
  expiryDate: 'تاريخ الصلاحية',
  serialNumber: 'الرقم التسلسلي'
} as const

const HEADER_ORDER = Object.values(HEADERS)

function buildSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('الأصناف')
  sheet.views = [{ rightToLeft: true }]
  sheet.columns = HEADER_ORDER.map((label) => ({ header: label, key: label, width: 20 }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
  return sheet
}

export type WebExportResult = ExportResult & { fileName?: string; mimeType?: string; dataBase64?: string }

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function toResult(workbook: ExcelJS.Workbook, fileName: string): Promise<WebExportResult> {
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return { ok: true, fileName, mimeType: XLSX_MIME, dataBase64: buffer.toString('base64') }
}

export async function exportProductsTemplate(): Promise<WebExportResult> {
  try {
    const workbook = new ExcelJS.Workbook()
    buildSheet(workbook)
    return await toResult(workbook, 'قالب-استيراد-الأصناف.xlsx')
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر إنشاء القالب' }
  }
}

export async function exportProductsToExcel(): Promise<WebExportResult> {
  try {
    return await toResult(await buildProductsWorkbook(), `الأصناف-${new Date().toISOString().slice(0, 10)}.xlsx`)
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر تصدير الأصناف' }
  }
}

async function buildProductsWorkbook(): Promise<ExcelJS.Workbook> {
  const db = getDb()
  const warehouseId = await getDefaultWarehouseId(db)
  const rs = await db.execute({
    sql: `SELECT p.name, p.barcode, COALESCE(c.name, '') AS category, COALESCE(u.name, '') AS unit,
                 p.cost_price AS costPrice, p.retail_price AS retailPrice,
                 (SELECT price FROM product_prices WHERE product_id = p.id AND tier = 'wholesale') AS wholesalePrice,
                 (SELECT price FROM product_prices WHERE product_id = p.id AND tier = 'wholesale2') AS wholesale2Price,
                 (SELECT price FROM product_prices WHERE product_id = p.id AND tier = 'pack') AS packPrice,
                 p.reorder_point AS reorderPoint, COALESCE(s.quantity, 0) AS quantity,
                 p.expiry_date AS expiryDate, p.serial_number AS serialNumber
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN units u ON u.id = p.unit_id
          LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = ?
          WHERE p.deleted_at IS NULL
          ORDER BY p.name`,
    args: [warehouseId]
  })

  const workbook = new ExcelJS.Workbook()
  const sheet = buildSheet(workbook)
  for (const r of rs.rows as any[]) {
    sheet.addRow({
      [HEADERS.name]: r.name,
      [HEADERS.barcode]: r.barcode,
      [HEADERS.category]: r.category,
      [HEADERS.unit]: r.unit,
      [HEADERS.costPrice]: Number(r.costPrice),
      [HEADERS.retailPrice]: Number(r.retailPrice),
      [HEADERS.wholesalePrice]: r.wholesalePrice != null ? Number(r.wholesalePrice) : '',
      [HEADERS.wholesale2Price]: r.wholesale2Price != null ? Number(r.wholesale2Price) : '',
      [HEADERS.packPrice]: r.packPrice != null ? Number(r.packPrice) : '',
      [HEADERS.reorderPoint]: Number(r.reorderPoint),
      [HEADERS.quantity]: Number(r.quantity),
      [HEADERS.expiryDate]: r.expiryDate ?? '',
      [HEADERS.serialNumber]: r.serialNumber ?? ''
    })
  }

  return workbook
}

async function resolveCategoryId(name: string, cache: Map<string, number>): Promise<number | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const cached = cache.get(trimmed)
  if (cached) return cached
  const db = getDb()
  const existing = await db.execute({ sql: 'SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL', args: [trimmed] })
  if (existing.rows[0]) {
    const id = Number((existing.rows[0] as any).id)
    cache.set(trimmed, id)
    return id
  }
  const created = await db.execute({ sql: 'INSERT INTO categories (name, parent_id) VALUES (?, NULL)', args: [trimmed] })
  const id = Number(created.lastInsertRowid)
  cache.set(trimmed, id)
  return id
}

async function resolveUnitId(name: string, cache: Map<string, number>): Promise<number | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const cached = cache.get(trimmed)
  if (cached) return cached
  const db = getDb()
  const existing = await db.execute({ sql: 'SELECT id FROM units WHERE name = ?', args: [trimmed] })
  if (existing.rows[0]) {
    const id = Number((existing.rows[0] as any).id)
    cache.set(trimmed, id)
    return id
  }
  const created = await db.execute({ sql: 'INSERT INTO units (name, factor) VALUES (?, 1)', args: [trimmed] })
  const id = Number(created.lastInsertRowid)
  cache.set(trimmed, id)
  return id
}

function cellText(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text ?? '')
  return String(v).trim()
}

function cellNumber(row: ExcelJS.Row, col: number): number | null {
  const text = cellText(row, col)
  if (text === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export async function importProductsFromExcel(dataBase64: string): Promise<ProductImportResult> {
  try {
    const buffer = Buffer.from(dataBase64, 'base64')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    const sheet = workbook.worksheets[0]
    if (!sheet) return { ok: false, error: 'الملف لا يحتوي على أي صفحة بيانات', created: 0, updated: 0, rowErrors: [] }

    const headerRow = sheet.getRow(1)
    const colIndex: Partial<Record<keyof typeof HEADERS, number>> = {}
    headerRow.eachCell((cell, colNumber) => {
      const text = String(cell.value ?? '').trim()
      const key = (Object.keys(HEADERS) as Array<keyof typeof HEADERS>).find((k) => HEADERS[k] === text)
      if (key) colIndex[key] = colNumber
    })
    // الباركود اختياري: عمود "الاسم" هو الوحيد المطلوب (الصف اللي من غير باركود بيتاخد له باركود تلقائي زي شاشة إضافة صنف)
    if (!colIndex.name) {
      return {
        ok: false,
        error: 'لازم يكون فيه عمود "الاسم" على الأقل — استخدم زرار تحميل القالب',
        created: 0,
        updated: 0,
        rowErrors: []
      }
    }

    const db = getDb()
    const warehouseId = await getDefaultWarehouseId(db)
    const categoryCache = new Map<string, number>()
    const unitCache = new Map<string, number>()
    /** أصناف اتضافت في الاستيراد ده من صفوف من غير باركود — عشان صف تاني بنفس الاسم في نفس الملف ما يعدّلهاش بدل ما يضيف صنف */
    const createdThisRun = new Set<number>()

    let created = 0
    let updated = 0
    const rowErrors: { row: number; message: string }[] = []

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber)
      const name = cellText(row, colIndex.name)
      const barcodeCell = colIndex.barcode ? cellText(row, colIndex.barcode) : ''
      if (!name && !barcodeCell) continue

      try {
        if (!name) throw new Error('اسم الصنف مطلوب')

        const categoryId = colIndex.category ? await resolveCategoryId(cellText(row, colIndex.category), categoryCache) : null
        const unitId = colIndex.unit ? await resolveUnitId(cellText(row, colIndex.unit), unitCache) : null
        const costPrice = (colIndex.costPrice ? cellNumber(row, colIndex.costPrice) : null) ?? 0
        const retailPrice = (colIndex.retailPrice ? cellNumber(row, colIndex.retailPrice) : null) ?? 0
        const wholesalePrice = colIndex.wholesalePrice ? cellNumber(row, colIndex.wholesalePrice) : null
        const wholesale2Price = colIndex.wholesale2Price ? cellNumber(row, colIndex.wholesale2Price) : null
        const packPrice = colIndex.packPrice ? cellNumber(row, colIndex.packPrice) : null
        const reorderPoint = (colIndex.reorderPoint ? cellNumber(row, colIndex.reorderPoint) : null) ?? 5
        const quantity = colIndex.quantity ? cellNumber(row, colIndex.quantity) : null
        const expiryDate = colIndex.expiryDate ? cellText(row, colIndex.expiryDate) || null : null
        const serialNumber = colIndex.serialNumber ? cellText(row, colIndex.serialNumber) || null : null

        // الباركود موجود: بنطابق بيه زي الأول. فاضي: بنطابق بالاسم (عشان إعادة استيراد نفس الملف ما تكرّرش الأصناف)، ولو مفيش صنف بالاسم ده بنضيف صنف جديد بباركود تلقائي
        let existing: any
        if (barcodeCell) {
          existing = (await db.execute({ sql: 'SELECT id FROM products WHERE barcode = ?', args: [barcodeCell] })).rows[0]
        } else {
          const byName = await db.execute({ sql: 'SELECT id FROM products WHERE name = ? AND deleted_at IS NULL ORDER BY id', args: [name] })
          existing = (byName.rows as any[]).find((r) => !createdThisRun.has(Number(r.id)))
        }

        if (existing) {
          const productId = Number(existing.id)
          await db.execute({
            sql: `UPDATE products
                  SET name = ?, category_id = ?, unit_id = ?, cost_price = ?, retail_price = ?,
                      reorder_point = ?, expiry_date = ?, serial_number = ?, updated_at = datetime('now')
                  WHERE id = ?`,
            args: [name, categoryId, unitId, costPrice, retailPrice, reorderPoint, expiryDate, serialNumber, productId]
          })
          await db.execute({ sql: 'DELETE FROM product_prices WHERE product_id = ?', args: [productId] })
          const tierPrices: Array<[string, number | null]> = [
            ['wholesale', wholesalePrice],
            ['wholesale2', wholesale2Price],
            ['pack', packPrice]
          ]
          for (const [tier, price] of tierPrices) {
            if (price && price > 0) {
              await db.execute({
                sql: 'INSERT INTO product_prices (product_id, tier, price) VALUES (?, ?, ?)',
                args: [productId, tier, price]
              })
            }
          }

          if (quantity !== null) {
            const stockRs = await db.execute({
              sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
              args: [productId, warehouseId]
            })
            const currentQty = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
            const delta = quantity - currentQty
            if (delta !== 0) {
              if (stockRs.rows[0]) {
                await db.execute({
                  sql: 'UPDATE stock SET quantity = ? WHERE product_id = ? AND warehouse_id = ?',
                  args: [quantity, productId, warehouseId]
                })
              } else {
                await db.execute({
                  sql: 'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)',
                  args: [productId, warehouseId, quantity]
                })
              }
              await db.execute({
                sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type)
                      VALUES (?, ?, 'adjustment', ?, 'import')`,
                args: [productId, warehouseId, delta]
              })
            }
          }
          updated++
        } else {
          const barcode = barcodeCell || (await nextAutoBarcode())
          const info = await db.execute({
            sql: `INSERT INTO products
                    (name, barcode, category_id, unit_id, cost_price, retail_price, reorder_point, expiry_date, serial_number)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [name, barcode, categoryId, unitId, costPrice, retailPrice, reorderPoint, expiryDate, serialNumber]
          })
          const productId = Number(info.lastInsertRowid)
          if (!barcodeCell) createdThisRun.add(productId)
          const tierPrices: Array<[string, number | null]> = [
            ['wholesale', wholesalePrice],
            ['wholesale2', wholesale2Price],
            ['pack', packPrice]
          ]
          for (const [tier, price] of tierPrices) {
            if (price && price > 0) {
              await db.execute({
                sql: 'INSERT INTO product_prices (product_id, tier, price) VALUES (?, ?, ?)',
                args: [productId, tier, price]
              })
            }
          }
          const openingQty = quantity ?? 0
          await db.execute({
            sql: 'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)',
            args: [productId, warehouseId, openingQty]
          })
          if (openingQty !== 0) {
            await db.execute({
              sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type)
                    VALUES (?, ?, 'opening', ?, 'import')`,
              args: [productId, warehouseId, openingQty]
            })
          }
          created++
        }
      } catch (rowErr: any) {
        rowErrors.push({ row: rowNumber, message: rowErr?.message ?? 'خطأ غير معروف' })
      }
    }

    return { ok: true, created, updated, rowErrors }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر قراءة الملف', created: 0, updated: 0, rowErrors: [] }
  }
}
