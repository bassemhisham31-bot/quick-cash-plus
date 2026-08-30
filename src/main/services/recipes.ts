import { getDb } from '../db'
import type { RecipeItemInput, RecipeItemView } from '../../shared/types'

export async function getRecipe(productId: number): Promise<RecipeItemView[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT ri.raw_material_product_id AS rawMaterialProductId, p.name AS rawMaterialName, ri.qty_per_unit AS qtyPerUnit
          FROM recipe_items ri
          JOIN products p ON p.id = ri.raw_material_product_id
          WHERE ri.product_id = ?
          ORDER BY p.name`,
    args: [productId]
  })
  return rs.rows.map((r: any) => ({
    rawMaterialProductId: Number(r.rawMaterialProductId),
    rawMaterialName: r.rawMaterialName,
    qtyPerUnit: Number(r.qtyPerUnit)
  }))
}

export async function setRecipe(productId: number, items: RecipeItemInput[]): Promise<void> {
  const db = getDb()
  const tx = await db.transaction('write')
  try {
    await tx.execute({ sql: 'DELETE FROM recipe_items WHERE product_id = ?', args: [productId] })
    for (const item of items) {
      if (item.rawMaterialProductId === productId) continue
      await tx.execute({
        sql: `INSERT INTO recipe_items (product_id, raw_material_product_id, qty_per_unit) VALUES (?, ?, ?)
              ON CONFLICT(product_id, raw_material_product_id) DO UPDATE SET qty_per_unit = excluded.qty_per_unit`,
        args: [productId, item.rawMaterialProductId, item.qtyPerUnit]
      })
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }
}

/**
 * بيتأكد إن الصنف ليه وصفة (BOM) وبيرجّع أول خامة ناقصة الكمية فيها لو موجودة — يُستخدم قبل
 * تنفيذ البيع عشان نرفض العملية بدري بدل ما نكتشف نقص المخزون بعد ما بعض الأصناف اتخصمت.
 * بيرجع null لو الصنف مالوش وصفة أصلًا (يبقى pos.ts يرجع للتحقق القديم من مخزون الصنف نفسه).
 */
export async function checkRecipeStock(
  tx: any,
  productId: number,
  soldQty: number,
  warehouseId: number
): Promise<{ hasRecipe: boolean; insufficientMaterial: string | null }> {
  const recipeRs = await tx.execute({
    sql: `SELECT ri.raw_material_product_id, p.name AS name, ri.qty_per_unit
          FROM recipe_items ri JOIN products p ON p.id = ri.raw_material_product_id
          WHERE ri.product_id = ?`,
    args: [productId]
  })
  if (!recipeRs.rows.length) return { hasRecipe: false, insufficientMaterial: null }

  for (const row of recipeRs.rows as any[]) {
    const needed = Number(row.qty_per_unit) * soldQty
    const stockRs = await tx.execute({
      sql: 'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
      args: [Number(row.raw_material_product_id), warehouseId]
    })
    const available = stockRs.rows[0] ? Number((stockRs.rows[0] as any).quantity) : 0
    if (available < needed) return { hasRecipe: true, insufficientMaterial: row.name }
  }
  return { hasRecipe: true, insufficientMaterial: null }
}

/**
 * لو الصنف ليه وصفة (BOM)، بيخصم كل خامة من مخزونها بدل ما نخصم من مخزون الصنف النهائي نفسه
 * (الصنف "طبق" مالوش مخزون فعلي، خامته هي اللي ليها مخزون). بيرجع true لو كان فيه وصفة اتخصمت،
 * عشان pos.ts يقرر يرجع للسلوك القديم (خصم مباشر من مخزون الصنف) لو مفيش وصفة.
 */
export async function deductRecipeIfAny(
  tx: any,
  productId: number,
  soldQty: number,
  warehouseId: number,
  invoiceId: number,
  userId: number
): Promise<boolean> {
  const recipeRs = await tx.execute({
    sql: 'SELECT raw_material_product_id, qty_per_unit FROM recipe_items WHERE product_id = ?',
    args: [productId]
  })
  if (!recipeRs.rows.length) return false

  for (const row of recipeRs.rows as any[]) {
    const rawMaterialProductId = Number(row.raw_material_product_id)
    const deductQty = Number(row.qty_per_unit) * soldQty
    await tx.execute({
      sql: `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (?, ?, ?)
            ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = quantity - ?`,
      args: [rawMaterialProductId, warehouseId, -deductQty, deductQty]
    })
    await tx.execute({
      sql: `INSERT INTO stock_movements (product_id, warehouse_id, type, qty, ref_type, ref_id, user_id)
            VALUES (?, ?, 'sale', ?, 'recipe_consumption', ?, ?)`,
      args: [rawMaterialProductId, warehouseId, -deductQty, invoiceId, userId]
    })
  }
  return true
}
