import type { Client } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { computeDeviceFingerprint } from '../services/deviceFingerprint'

export const DEFAULT_ADMIN_USERNAME = 'admin'
export const DEFAULT_ADMIN_PASSWORD = 'admin123'

async function count(db: Client, table: string): Promise<number> {
  const rs = await db.execute(`SELECT COUNT(*) AS c FROM ${table}`)
  return Number((rs.rows[0] as any).c)
}

export async function seedDatabase(db: Client): Promise<void> {
  if ((await count(db, 'warehouses')) === 0) {
    await db.execute({
      sql: 'INSERT INTO warehouses (name, is_default) VALUES (?, 1)',
      args: ['المخزن الرئيسي']
    })
  }

  if ((await count(db, 'units')) === 0) {
    await db.execute({ sql: 'INSERT INTO units (name, factor) VALUES (?, ?)', args: ['قطعة', 1] })
    await db.execute({ sql: 'INSERT INTO units (name, factor) VALUES (?, ?)', args: ['كرتونة', 12] })
    await db.execute({ sql: 'INSERT INTO units (name, factor) VALUES (?, ?)', args: ['كيلو', 1] })
  }

  if ((await count(db, 'customers')) === 0) {
    await db.execute({
      sql: 'INSERT INTO customers (name, is_walk_in, balance, loyalty_points) VALUES (?, 1, 0, 0)',
      args: ['عميل نقدي']
    })
  }

  if ((await count(db, 'users')) === 0) {
    const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10)
    await db.execute({
      sql: `INSERT INTO users (username, password_hash, full_name, role, active)
            VALUES (?, ?, ?, 'admin', 1)`,
      args: [DEFAULT_ADMIN_USERNAME, hash, 'مدير النظام']
    })
  }

  if ((await count(db, 'license')) === 0) {
    await db.execute({
      sql: 'INSERT INTO license (id, device_fingerprint, status) VALUES (1, ?, ?)',
      args: [computeDeviceFingerprint(), 'trial']
    })
  }
}

export async function getDefaultWarehouseId(db: Client): Promise<number> {
  const rs = await db.execute('SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1')
  if (!rs.rows[0]) throw new Error('No default warehouse configured')
  return Number((rs.rows[0] as any).id)
}

export async function getWalkInCustomerId(db: Client): Promise<number> {
  const rs = await db.execute('SELECT id FROM customers WHERE is_walk_in = 1 LIMIT 1')
  if (!rs.rows[0]) throw new Error('No walk-in customer configured')
  return Number((rs.rows[0] as any).id)
}

const TEMP_ITEM_BARCODE = 'TEMP-ITEM-PLACEHOLDER'

/** منتج مخفي (غير نشط) بيتنشئ مرة واحدة تلقائيًا عند أول استخدام لخيار "إضافة صنف خارج المخزون" في شاشة البيع —
 * السطر الفعلي بيتخزن باسم/سعر مخصصين على sales_items مباشرة، والمنتج ده بس عشان NOT NULL FK، مش بيتأثر بيه المخزون. */
export async function getTempItemProductId(db: Client): Promise<number> {
  const existing = await db.execute({ sql: 'SELECT id FROM products WHERE barcode = ?', args: [TEMP_ITEM_BARCODE] })
  if (existing.rows[0]) return Number((existing.rows[0] as any).id)

  const rs = await db.execute({
    sql: `INSERT INTO products (name, barcode, cost_price, retail_price, reorder_point, is_active)
          VALUES ('صنف مؤقت', ?, 0, 0, 0, 0)`,
    args: [TEMP_ITEM_BARCODE]
  })
  return Number(rs.lastInsertRowid)
}
