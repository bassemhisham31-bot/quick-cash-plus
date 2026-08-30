import { getDb } from '../db'
import { getDefaultWarehouseId } from '../db/seed'
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

export async function listWarehouses(): Promise<Warehouse[]> {
  const db = getDb()
  const rs = await db.execute('SELECT id, name, is_default AS isDefault FROM warehouses ORDER BY is_default DESC, name')
  return rs.rows.map((r: any) => ({ id: Number(r.id), name: r.name, isDefault: !!r.isDefault }))
}

export async function createWarehouse(name: string): Promise<Warehouse> {
  const db = getDb()
  const rs = await db.execute({ sql: 'INSERT INTO warehouses (name, is_default) VALUES (?, 0)', args: [name] })
  return { id: Number(rs.lastInsertRowid), name, isDefault: false }
}

async function nextAutoBarcode(): Promise<string> {
  const db = getDb()
  const rs = await db.execute(
    "SELECT MAX(CAST(barcode AS INTEGER)) AS m FROM products WHERE barcode GLOB '[0-9]*'"
  )
  const current = (rs.rows[0] as any)?.m
  const next = (current != null ? Number(current) : 200000000) + 1
  return String(next)
}

export async function deleteProduct(id: number): Promise<void> {
  const db = getDb()
  const rs = await db.execute({ sql: 'SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', args: [id] })
  if (!rs.rows[0]) throw new Error('الصنف غير موجود')
  await db.execute({ sql: "UPDATE products SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

export async function listProducts(search = '', warehouseId?: number): Promise<Product[]> {
  const db = getDb()
  const resolvedWarehouseId = warehouseId ?? (await getDefaultWarehouseId(db))
  const term = `%${search.trim()}%`
  const rs = await db.execute({
    sql: `SELECT p.id, p.name, p.barcode, p.category_id AS categoryId, p.unit_id AS unitId, p.vendor_id AS vendorId,
                 p.cost_price AS costPrice, p.retail_price AS retailPrice,
                 p.reorder_point AS reorderPoint, p.is_active AS isActive,
                 p.expiry_date AS expiryDate, p.serial_number AS serialNumber,
                 p.show_in_pos AS showInPos, p.serial_tracking_enabled AS serialTrackingEnabled,
                 p.image_data_url AS imageDataUrl,
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
    imageDataUrl: r.imageDataUrl ?? null
  }))
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
              (name, barcode, category_id, unit_id, vendor_id, cost_price, retail_price, reorder_point, expiry_date, serial_number, show_in_pos, serial_tracking_enabled, image_data_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.imageDataUrl || null
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
                image_data_url = ?, updated_at = datetime('now')
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
