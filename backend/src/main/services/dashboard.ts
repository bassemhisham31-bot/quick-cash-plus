import { getDb } from '../db'
import { getDefaultWarehouseId } from '../db/seed'
import { branchFilter } from './branchScope'
import { getOpenSession } from './cashSession'
import { SALE_PAY_LINES_SQL } from './salePayments'
import type {
  CategorySalesItem,
  DashboardSummary,
  ExpiringProductItem,
  PaymentMethodBreakdownItem,
  PaymentMethod,
  TopProductItem
} from '../../shared/types'

const EXPIRY_WINDOW_DAYS = 30

/**
 * «اليوم» في اللوحة = اليوم المفتوح (الوردية) لو فيه واحد، عشان المبيعات هنا تطابق أرقام إقفال اليوم بالظبط
 * (الوردية ممكن تعدّي منتصف الليل، وتواريخ السيرفر بتوقيت UTC فتاريخ التقويم كان بيقص مبيعات الوردية).
 * ولو مفيش يوم مفتوح: تاريخ النهاردة بتوقيت السيرفر المحلي زي ما كان.
 */
async function todayScope(alias: string): Promise<{ sql: string; args: unknown[] }> {
  const session = await getOpenSession()
  if (session) return { sql: `${alias}.session_id = ?`, args: [session.id] }
  return { sql: `date(${alias}.created_at, 'localtime') = date('now', 'localtime')`, args: [] }
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const db = getDb()
  const warehouseId = await getDefaultWarehouseId(db)
  const session = await getOpenSession()
  const bf = branchFilter('branch_id')
  const scope = await todayScope('sales_invoices')

  const salesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(total), 0) AS totalSales, COUNT(*) AS cnt,
            COALESCE(SUM(total - (SELECT COALESCE(SUM(si.qty * p.cost_price), 0)
                                   FROM sales_items si JOIN products p ON p.id = si.product_id
                                   WHERE si.invoice_id = sales_invoices.id)), 0) AS profit
     FROM sales_invoices
     WHERE ${scope.sql} AND deleted_at IS NULL AND ${bf.sql}`,
    args: [...scope.args, ...bf.args] as any
  })
  const salesRow = salesRs.rows[0] as any

  const lowStockRs = await db.execute({
    sql: `SELECT COUNT(*) AS cnt FROM products p
          JOIN stock s ON s.product_id = p.id AND s.warehouse_id = ?
          WHERE p.deleted_at IS NULL AND p.is_service = 0 AND s.quantity <= p.reorder_point`,
    args: [warehouseId]
  })
  const lowStockRow = lowStockRs.rows[0] as any

  const expiringRs = await db.execute({
    sql: `SELECT COUNT(*) AS cnt FROM products
          WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
            AND date(expiry_date) <= date('now', 'localtime', '+' || ? || ' days')`,
    args: [EXPIRY_WINDOW_DAYS]
  })
  const expiringRow = expiringRs.rows[0] as any

  return {
    todaySales: Number(salesRow.totalSales),
    todayInvoiceCount: Number(salesRow.cnt),
    todayProfit: Number(salesRow.profit),
    lowStockCount: Number(lowStockRow.cnt),
    expiringSoonCount: Number(expiringRow.cnt),
    dayIsOpen: !!session
  }
}

export async function getTopSellingProducts(limit = 5): Promise<TopProductItem[]> {
  const db = getDb()
  const bf = branchFilter('i.branch_id')
  const scope = await todayScope('i')
  const rs = await db.execute({
    sql: `SELECT si.product_id AS productId, si.product_name AS name,
                 SUM(si.qty) AS qty, SUM(si.total) AS revenue
          FROM sales_items si
          JOIN sales_invoices i ON i.id = si.invoice_id
          WHERE i.deleted_at IS NULL AND ${scope.sql} AND ${bf.sql}
          GROUP BY si.product_id, si.product_name
          ORDER BY revenue DESC
          LIMIT ?`,
    args: [...scope.args, ...bf.args, limit] as any
  })
  return rs.rows.map((r: any) => ({
    productId: Number(r.productId),
    name: r.name,
    qty: Number(r.qty),
    revenue: Number(r.revenue)
  }))
}

export async function getPaymentMethodsBreakdown(): Promise<PaymentMethodBreakdownItem[]> {
  const db = getDb()
  const bf = branchFilter('i.branch_id')
  const scope = await todayScope('i')
  const rs = await db.execute({
    sql: `SELECT pl.method AS method, COALESCE(SUM(pl.total_amount), 0) AS total
     FROM (${SALE_PAY_LINES_SQL}) pl JOIN sales_invoices i ON i.id = pl.invoice_id
     WHERE i.deleted_at IS NULL AND ${scope.sql} AND ${bf.sql}
     GROUP BY pl.method
     ORDER BY total DESC`,
    args: [...scope.args, ...bf.args] as any
  })
  return rs.rows.map((r: any) => ({ method: r.method as PaymentMethod, total: Number(r.total) }))
}

export async function getSalesByCategory(): Promise<CategorySalesItem[]> {
  const db = getDb()
  const bf = branchFilter('i.branch_id')
  const scope = await todayScope('i')
  const rs = await db.execute({
    sql: `SELECT c.id AS categoryId, COALESCE(c.name, 'بدون تصنيف') AS categoryName,
            COALESCE(SUM(si.total), 0) AS total
     FROM sales_items si
     JOIN sales_invoices i ON i.id = si.invoice_id
     LEFT JOIN products p ON p.id = si.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE i.deleted_at IS NULL AND ${scope.sql} AND ${bf.sql}
     GROUP BY c.id
     ORDER BY total DESC`,
    args: [...scope.args, ...bf.args] as any
  })
  return rs.rows.map((r: any) => ({
    categoryId: r.categoryId != null ? Number(r.categoryId) : null,
    categoryName: r.categoryName,
    total: Number(r.total)
  }))
}

export async function getExpiringProducts(limit = 10): Promise<ExpiringProductItem[]> {
  const db = getDb()
  const rs = await db.execute({
    sql: `SELECT id, name, expiry_date AS expiryDate,
                 CAST(julianday(date(expiry_date)) - julianday(date('now', 'localtime')) AS INTEGER) AS daysLeft
          FROM products
          WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
            AND date(expiry_date) <= date('now', 'localtime', '+' || ? || ' days')
          ORDER BY expiry_date
          LIMIT ?`,
    args: [EXPIRY_WINDOW_DAYS, limit]
  })
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    name: r.name,
    expiryDate: r.expiryDate,
    daysLeft: Number(r.daysLeft)
  }))
}
