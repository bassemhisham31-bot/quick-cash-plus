import { getDb } from '../db'
import { getDefaultWarehouseId } from '../db/seed'
import { branchWarehouseFilter, requireBranchId } from './branchScope'
import { assertWarehouseInScope } from './branches'
import type {
  BulkPriceUpdateItem,
  BulkPriceUpdateResult,
  Category,
  Product,
  ProductImportResult,
  ProductInput,
  ProductUpdateInput,
  Unit,
  Warehouse
} from '../../shared/types'

export async function listCategories(): Promise<Category[]> {
  const db = getDb()
  const rs = await db.execute(
    'SELECT id, name, parent_id AS parentId FROM categories WHERE deleted_at IS NULL ORDER BY name'
  )
  return rs.rows.map((r: any) => ({ id: Number(r.id), name: r.name, parentId: r.parentId != null ? Number(r.parentId) : null }))
}

export async function createCategory(name: string, parentId: number | null): Promise<Category> {
  const db = getDb()
  const rs = await db.execute({
    sql: 'INSERT INTO categories (name, parent_id) VALUES (?, ?)',
    args: [name, parentId]
  })
  return { id: Number(rs.lastInsertRowid), name, parentId }
}

export async function listUnits(): Promise<Unit[]> {
  const db = getDb()
  const rs = await db.execute('SELECT id, name, factor FROM units ORDER BY id')
  return rs.rows.map((r: any) => ({ id: Number(r.id), name: r.name, factor: Number(r.factor) }))
}

export async function createUnit(name: string, factor: number): Promise<Unit> {
  const db = getDb()
  const rs = await db.execute({ sql: 'INSERT INTO units (name, factor) VALUES (?, ?)', args: [name, factor] })
  return { id: Number(rs.lastInsertRowid), name, factor }
}

const WAREHOUSE_SELECT = `SELECT w.id, w.name, w.is_default AS isDefault, w.branch_id AS branchId, COALESCE(b.name, 'الفرع الرئيسي') AS branchName
   FROM warehouses w LEFT JOIN branches b ON b.id = w.branch_id`

function mapWarehouse(r: any): Warehouse {
  return { id: Number(r.id), name: r.name, isDefault: !!r.isDefault, branchId: Number(r.branchId), branchName: String(r.branchName) }
}

/** مخازن الفرع الحالي (أو كل المخازن لو من غير نطاق فرع) */
export async function listWarehouses(): Promise<Warehouse[]> {
  const db = getDb()
  const bf = branchWarehouseFilter('w.id')
  const rs = await db.execute({ sql: `${WAREHOUSE_SELECT} WHERE ${bf.sql} ORDER BY w.is_default DESC, w.name`, args: bf.args as any })
  return rs.rows.map(mapWarehouse)
}

/** كل المخازن في كل الفروع — لاختيار مخزن الوجهة في نقل البضاعة بين الفروع */
export async function listAllWarehouses(): Promise<Warehouse[]> {
  const rs = await getDb().execute(`${WAREHOUSE_SELECT} ORDER BY w.branch_id, w.is_default DESC, w.name`)
  return rs.rows.map(mapWarehouse)
}

export async function createWarehouse(name: string): Promise<Warehouse> {
  const db = getDb()
  const branchId = requireBranchId()
  const rs = await db.execute({ sql: 'INSERT INTO warehouses (name, is_default, branch_id) VALUES (?, 0, ?)', args: [name, branchId] })
  return { id: Number(rs.lastInsertRowid), name, isDefault: false, branchId }
}

export async function nextAutoBarcode(): Promise<string> {
  const db = getDb()
  const rs = await db.execute(
    "SELECT MAX(CAST(barcode AS INTEGER)) AS m FROM products WHERE barcode GLOB '[0-9]*'"
  )
  const current = (rs.rows[0] as any)?.m
  const next = (current != null ? Number(current) : 200000000) + 1
  return String(next)
}

/**
 * تعديل سريع لرصيد صنف من شاشة الأصناف: 'add' يزوّد/ينقص الكمية، 'set' يخلّي الرصيد = الكمية (جرد).
 * بيتسجل كحركة 'adjustment' عشان تبان في تقارير حركة الصنف. بيرجع الرصيد الجديد.
 */
export async function adjustProductStock(
  productId: number,
  warehouseId: number,
  mode: 'add' | 'set',
  qty: number,
  userId: number
): Promise<number> {
  if (!Number.isFinite(qty)) throw new Error('الكمية غير صحيحة')
  await assertWarehouseInScope(warehouseId)
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    const rs = await tx.execute({
      sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
      args: [productId, warehouseId]
    })
    const current = rs.rows[0] ? Number((rs.rows[0] as any).quantity) : 0
    const delta = mode === 'set' ? qty - current : qty
    if (delta !== 0) {
      await tx.execute({
        sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
              ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity + ?`,
        args: [productId, warehouseId, delta, delta]
      })
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, user_id)
              VALUES (?, ?, 'adjustment', ?, 'quick_adjust', ?)`,
        args: [productId, warehouseId, delta, userId]
      })
    }
    await tx.commit()
    return current + delta
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

export async function deleteProduct(id: number): Promise<void> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', args: [id] })
  if (!rs.rows[0]) throw new Error('الصنف غير موجود')
  await db.execute({ sql: "UPDATE products SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

export async function listProducts(search = '', warehouseId?: number): Promise<Product[]> {
  const db = getDb()
  await assertWarehouseInScope(warehouseId)
  const resolvedWarehouseId = warehouseId ?? (await getDefaultWarehouseId(db))
  const term = `%${search.trim()}%`
  const rs = await db.execute({
    sql: `SELECT p.id, p.name, p.barcode, p.category_id AS categoryId, p.unit_id AS unitId, p.vendor_id AS vendorId,
                 p.cost_price AS costPrice, p.retail_price AS retailPrice,
                 p.reorder_point AS reorderPoint, p.is_active AS isActive,
                 p.expiry_date AS expiryDate, p.serial_number AS serialNumber,
                 p.show_in_pos AS showInPos, p.serial_tracking_enabled AS serialTrackingEnabled,
                 p.image_data_url AS imageDataUrl,
                 p.is_service AS isService, p.commission_enabled AS commissionEnabled,
                 p.commission_percent AS commissionPercent, p.commission_min AS commissionMin,
                 p.purchase_mode AS purchaseMode, p.reorder_qty AS reorderQty,
                 COALESCE(s.quantity, 0) AS quantity,
                 (SELECT price FROM product_prices WHERE product_id = p.id AND tier = 'wholesale') AS wholesalePrice,
                 (SELECT price FROM product_prices WHERE product_id = p.id AND tier = 'wholesale2') AS wholesale2Price,
                 (SELECT price FROM product_prices WHERE product_id = p.id AND tier = 'pack') AS packPrice
          FROM products p
          LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = ?
          WHERE p.deleted_at IS NULL
            AND (? = '%%' OR p.name LIKE ? OR p.barcode LIKE ?)
          ORDER BY p.name`,
    args: [resolvedWarehouseId, term, term, term]
  })

  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    name: r.name,
    barcode: r.barcode,
    categoryId: r.categoryId != null ? Number(r.categoryId) : null,
    unitId: r.unitId != null ? Number(r.unitId) : null,
    vendorId: r.vendorId != null ? Number(r.vendorId) : null,
    costPrice: Number(r.costPrice),
    retailPrice: Number(r.retailPrice),
    prices: {
      wholesale: r.wholesalePrice != null ? Number(r.wholesalePrice) : null,
      wholesale2: r.wholesale2Price != null ? Number(r.wholesale2Price) : null,
      pack: r.packPrice != null ? Number(r.packPrice) : null
    },
    quantity: Number(r.quantity),
    reorderPoint: Number(r.reorderPoint),
    isActive: !!r.isActive,
    expiryDate: r.expiryDate ?? null,
    serialNumber: r.serialNumber ?? null,
    showInPos: !!r.showInPos,
    serialTrackingEnabled: !!r.serialTrackingEnabled,
    imageDataUrl: r.imageDataUrl ?? null,
    isService: !!r.isService,
    commissionEnabled: !!r.isService && !!r.commissionEnabled,
    commissionPercent: Number(r.commissionPercent) || 0,
    commissionMin: Number(r.commissionMin) || 0,
    purchaseMode: (['every_sale', 'min_stock', 'none'].includes(r.purchaseMode) ? r.purchaseMode : 'every_sale') as Product['purchaseMode'],
    reorderQty: Number(r.reorderQty) || 0
  }))
}

/** أعمدة الخدمة (isService, commissionEnabled, commissionPercent, commissionMin): العمولة مش بتتفعّل إلا لو الصنف خدمة */
function serviceColumns(input: { isService?: boolean; commissionEnabled?: boolean; commissionPercent?: number; commissionMin?: number }): [number, number, number, number] {
  const isService = !!input.isService
  const commission = isService && !!input.commissionEnabled
  const percent = commission ? Math.min(100, Math.max(0, Number(input.commissionPercent) || 0)) : 0
  const min = commission ? Math.max(0, Number(input.commissionMin) || 0) : 0
  return [isService ? 1 : 0, commission ? 1 : 0, percent, min]
}

/** طريقة "مطلوب شراؤه" وكمية الشراء (الخدمة مالهاش مشتريات دايمًا) */
function purchaseColumns(input: { isService?: boolean; purchaseMode?: string; reorderQty?: number }): [string, number] {
  const mode = input.isService ? 'none' : ['every_sale', 'min_stock', 'none'].includes(String(input.purchaseMode)) ? String(input.purchaseMode) : 'every_sale'
  return [mode, Math.max(0, Number(input.reorderQty) || 0)]
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const db = getDb()
  const warehouseId = input.warehouseId ?? (await getDefaultWarehouseId(db))
  const barcode = input.barcode.trim() || (await nextAutoBarcode())

  const tx = await db.transaction('write')
  let productId: number
  try {
    const info = await tx.execute({
      sql: `INSERT INTO products
              (name, barcode, category_id, unit_id, vendor_id, cost_price, retail_price, reorder_point, expiry_date, serial_number, show_in_pos, serial_tracking_enabled, image_data_url,
               is_service, commission_enabled, commission_percent, commission_min, purchase_mode, reorder_qty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.name.trim(),
        barcode,
        input.categoryId,
        input.unitId,
        input.vendorId,
        input.costPrice,
        input.retailPrice,
        input.reorderPoint,
        input.expiryDate || null,
        input.serialNumber?.trim() || null,
        input.showInPos ? 1 : 0,
        input.serialTrackingEnabled ? 1 : 0,
        input.imageDataUrl || null,
        ...serviceColumns(input),
        ...purchaseColumns(input)
      ]
    })
    productId = Number(info.lastInsertRowid)

    const tierPrices: Array<[string, number]> = [
      ['wholesale', input.wholesalePrice],
      ['wholesale2', input.wholesale2Price],
      ['pack', input.packPrice]
    ]
    for (const [tier, price] of tierPrices) {
      if (price && price > 0) {
        await tx.execute({
          sql: 'INSERT INTO product_prices (product_id, tier, price) VALUES (?, ?, ?)',
          args: [productId, tier, price]
        })
      }
    }

    await tx.execute({
      sql: 'INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)',
      args: [productId, warehouseId, input.openingQuantity]
    })

    if (input.openingQuantity !== 0) {
      await tx.execute({
        sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type)
              VALUES (?, ?, 'opening', ?, 'opening_balance')`,
        args: [productId, warehouseId, input.openingQuantity]
      })
    }

    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  const created = (await listProducts('', warehouseId)).find((p) => p.id === productId)
  if (!created) throw new Error('تعذر إنشاء المنتج')
  return created
}

export async function updateProduct(id: number, input: ProductUpdateInput): Promise<Product> {
  const db = getDb()
  const warehouseId = await getDefaultWarehouseId(db)

  const tx = await db.transaction('write')
  try {
    await tx.execute({
      sql: `UPDATE products
            SET name = ?, barcode = ?, category_id = ?, unit_id = ?, vendor_id = ?, cost_price = ?, retail_price = ?,
                reorder_point = ?, expiry_date = ?, serial_number = ?, show_in_pos = ?, serial_tracking_enabled = ?,
                image_data_url = ?, is_service = ?, commission_enabled = ?, commission_percent = ?, commission_min = ?,
                purchase_mode = ?, reorder_qty = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        input.name.trim(),
        input.barcode.trim(),
        input.categoryId,
        input.unitId,
        input.vendorId,
        input.costPrice,
        input.retailPrice,
        input.reorderPoint,
        input.expiryDate || null,
        input.serialNumber?.trim() || null,
        input.showInPos ? 1 : 0,
        input.serialTrackingEnabled ? 1 : 0,
        input.imageDataUrl || null,
        ...serviceColumns(input),
        ...purchaseColumns(input),
        id
      ]
    })

    await tx.execute({ sql: 'DELETE FROM product_prices WHERE product_id = ?', args: [id] })
    const tierPrices: Array<[string, number]> = [
      ['wholesale', input.wholesalePrice],
      ['wholesale2', input.wholesale2Price],
      ['pack', input.packPrice]
    ]
    for (const [tier, price] of tierPrices) {
      if (price && price > 0) {
        await tx.execute({
          sql: 'INSERT INTO product_prices (product_id, tier, price) VALUES (?, ?, ?)',
          args: [id, tier, price]
        })
      }
    }

    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  const updated = (await listProducts('', warehouseId)).find((p) => p.id === id)
  if (!updated) throw new Error('تعذر تحديث المنتج')
  return updated
}

export async function bulkUpdatePricesAndImages(items: BulkPriceUpdateItem[]): Promise<BulkPriceUpdateResult> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    for (const item of items) {
      await tx.execute({
        sql: `UPDATE products
              SET cost_price = ?, retail_price = ?, image_data_url = ?, updated_at = datetime('now')
              WHERE id = ? AND deleted_at IS NULL`,
        args: [item.costPrice, item.retailPrice, item.imageDataUrl, item.id]
      })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
  return { updated: items.length }
}

export async function bulkCreateProducts(inputs: ProductInput[]): Promise<ProductImportResult> {
  let created = 0
  const rowErrors: { row: number; message: string }[] = []

  for (let i = 0; i < inputs.length; i++) {
    try {
      if (!inputs[i].name.trim()) throw new Error('اسم الصنف مطلوب')
      await createProduct(inputs[i])
      created++
    } catch (err: any) {
      rowErrors.push({ row: i + 1, message: err?.message ?? 'خطأ غير معروف' })
    }
  }

  return { ok: true, created, updated: 0, rowErrors }
}

/** رصيد الأصناف في كل المخازن (لاختيار مخزن البيع لكل صنف في شاشة البيع) */
export async function getStockByWarehouse(productIds: number[]): Promise<{ productId: number; warehouseId: number; quantity: number }[]> {
  if (!productIds.length) return []
  const db = getDb()
  const bf = branchWarehouseFilter('warehouse_id')
  const rs = await db.execute({
    sql: `SELECT product_id AS productId, warehouse_id AS warehouseId, quantity FROM stock
          WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND ${bf.sql}`,
    args: [...productIds, ...bf.args] as any
  })
  return (rs.rows as any[]).map((r) => ({ productId: Number(r.productId), warehouseId: Number(r.warehouseId), quantity: Number(r.quantity) }))
}
