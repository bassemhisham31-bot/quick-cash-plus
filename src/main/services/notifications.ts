import { getDb } from '../db'
import { getDefaultWarehouseId } from '../db/seed'
import { getLicenseStatus } from './license'
import type { NotificationItem } from '../../shared/types'

const EXPIRY_WINDOW_DAYS = 30
const LICENSE_WARNING_DAYS = 7

export async function getNotifications(): Promise<NotificationItem[]> {
  const db = getDb()
  const warehouseId = await getDefaultWarehouseId(db)
  const items: NotificationItem[] = []

  const stockRs = await db.execute({
    sql: `SELECT p.id, p.name, COALESCE(s.quantity, 0) AS qty, p.reorder_point AS reorderPoint
          FROM products p
          JOIN stock s ON s.product_id = p.id AND s.warehouse_id = ?
          WHERE p.deleted_at IS NULL AND s.quantity <= p.reorder_point
          ORDER BY s.quantity ASC
          LIMIT 30`,
    args: [warehouseId]
  })
  for (const r of stockRs.rows as any[]) {
    const qty = Number(r.qty)
    const reorderPoint = Number(r.reorderPoint)
    items.push({
      id: `stock-${r.id}`,
      severity: qty <= 0 ? 'critical' : 'warning',
      title: qty <= 0 ? 'نفاذ مخزون' : 'اقتراب نفاذ مخزون',
      message:
        qty <= 0
          ? `${r.name} — نفد من المخزون`
          : `${r.name} — الكمية المتبقية ${qty} (حد التنبيه ${reorderPoint})`,
      target: 'inventory'
    })
  }

  const expiringRs = await db.execute({
    sql: `SELECT id, name,
                 CAST(julianday(date(expiry_date)) - julianday(date('now', 'localtime')) AS INTEGER) AS daysLeft
          FROM products
          WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
            AND date(expiry_date) <= date('now', 'localtime', '+' || ? || ' days')
          ORDER BY expiry_date
          LIMIT 20`,
    args: [EXPIRY_WINDOW_DAYS]
  })
  for (const r of expiringRs.rows as any[]) {
    const daysLeft = Number(r.daysLeft)
    items.push({
      id: `expiry-${r.id}`,
      severity: daysLeft <= 3 ? 'critical' : 'warning',
      title: daysLeft <= 0 ? 'صنف منتهي الصلاحية' : 'اقتراب انتهاء صلاحية',
      message: daysLeft <= 0 ? `${r.name} — انتهت صلاحيته` : `${r.name} — هينتهي خلال ${daysLeft} يوم`,
      target: 'inventory'
    })
  }

  const license = await getLicenseStatus()
  if (license.status === 'expired') {
    items.push({
      id: 'license-expired',
      severity: 'critical',
      title: 'انتهى الترخيص',
      message: 'رخصة البرنامج منتهية — لازم تفعيل جديد',
      target: 'settings'
    })
  } else if (license.daysRemaining !== null && license.daysRemaining <= LICENSE_WARNING_DAYS) {
    items.push({
      id: 'license-expiring',
      severity: 'warning',
      title: 'اقتراب انتهاء الترخيص',
      message: `الترخيص هينتهي خلال ${license.daysRemaining} يوم`,
      target: 'settings'
    })
  }

  items.sort((a, b) => {
    if (a.severity === b.severity) return 0
    return a.severity === 'critical' ? -1 : 1
  })

  return items
}
