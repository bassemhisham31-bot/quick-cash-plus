import sql from 'mssql'
import { getDb } from '../db'
import {
  getPriceCheckerSyncSettings,
  recordPriceCheckerSyncResult,
  updatePriceCheckerSyncSettings
} from './settings'
import type { PriceCheckerSyncSettings, PriceCheckerSyncTestResult } from '../../shared/types'

const REMOTE_TABLE = 'dbo.QCP_PriceCheckItems'

function toMssqlConfig(settings: PriceCheckerSyncSettings): sql.config {
  return {
    server: settings.server ?? '',
    port: settings.port,
    database: settings.databaseName ?? '',
    user: settings.username ?? undefined,
    password: settings.password ?? undefined,
    options: { encrypt: true, trustServerCertificate: true },
    connectionTimeout: 8000,
    requestTimeout: 15000
  }
}

export async function testPriceCheckerConnection(
  settings: Pick<PriceCheckerSyncSettings, 'server' | 'port' | 'databaseName' | 'username' | 'password'>
): Promise<PriceCheckerSyncTestResult> {
  let pool: sql.ConnectionPool | null = null
  try {
    pool = await new sql.ConnectionPool(
      toMssqlConfig({ ...settings, enabled: true, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null })
    ).connect()
    await pool.request().query('SELECT 1')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر الاتصال بقاعدة بيانات SQL Server' }
  } finally {
    await pool?.close()
  }
}

async function ensureRemoteSchema(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'QCP_PriceCheckItems')
    CREATE TABLE ${REMOTE_TABLE} (
      Barcode NVARCHAR(64) NOT NULL PRIMARY KEY,
      ItemName NVARCHAR(255) NOT NULL,
      Price DECIMAL(18, 2) NOT NULL,
      Unit NVARCHAR(64) NULL,
      UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    )
  `)
}

interface LocalProductRow {
  barcode: string
  name: string
  retail_price: number
  unit_name: string | null
}

async function readLocalProducts(): Promise<LocalProductRow[]> {
  const db = getDb()
  const rs = await db.execute(`
    SELECT p.barcode AS barcode, p.name AS name, p.retail_price AS retail_price, u.name AS unit_name
    FROM products p
    LEFT JOIN units u ON u.id = p.unit_id
    WHERE p.deleted_at IS NULL AND p.is_active = 1
  `)
  return rs.rows as unknown as LocalProductRow[]
}

let syncInFlight: Promise<void> | null = null

export async function syncAllProducts(): Promise<void> {
  // منع تشغيل مزامنتين في نفس الوقت — لو فيه مزامنة شغالة بالفعل، ننتظرها بدل ما نبدأ وحدة تانية فوقها
  if (syncInFlight) return syncInFlight
  syncInFlight = runSync().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

async function runSync(): Promise<void> {
  const settings = await getPriceCheckerSyncSettings()
  if (!settings.enabled || !settings.server || !settings.databaseName) return

  let pool: sql.ConnectionPool | null = null
  try {
    pool = await new sql.ConnectionPool(toMssqlConfig(settings)).connect()
    await ensureRemoteSchema(pool)

    const products = await readLocalProducts()

    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    try {
      await new sql.Request(transaction).query(`TRUNCATE TABLE ${REMOTE_TABLE}`)
      for (const p of products) {
        await new sql.Request(transaction)
          .input('barcode', sql.NVarChar(64), p.barcode)
          .input('itemName', sql.NVarChar(255), p.name)
          .input('price', sql.Decimal(18, 2), p.retail_price)
          .input('unit', sql.NVarChar(64), p.unit_name)
          .query(
            `INSERT INTO ${REMOTE_TABLE} (Barcode, ItemName, Price, Unit) VALUES (@barcode, @itemName, @price, @unit)`
          )
      }
      await transaction.commit()
    } catch (err) {
      await transaction.rollback()
      throw err
    }

    await recordPriceCheckerSyncResult('ok', null)
  } catch (err: any) {
    await recordPriceCheckerSyncResult('error', err?.message ?? 'فشلت المزامنة مع SQL Server').catch(() => {})
  } finally {
    await pool?.close()
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 3000

export async function triggerDebouncedSync(): Promise<void> {
  const settings = await getPriceCheckerSyncSettings()
  if (!settings.enabled) return

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    syncAllProducts().catch(() => {})
  }, DEBOUNCE_MS)
}

let periodicTimer: ReturnType<typeof setInterval> | null = null
const PERIODIC_SYNC_MS = 15 * 60 * 1000

export async function schedulePeriodicPriceCheckerSync(): Promise<void> {
  if (periodicTimer) {
    clearInterval(periodicTimer)
    periodicTimer = null
  }
  const settings = await getPriceCheckerSyncSettings()
  if (!settings.enabled) return

  periodicTimer = setInterval(() => {
    syncAllProducts().catch(() => {})
  }, PERIODIC_SYNC_MS)
}

export async function syncPriceCheckerNow(): Promise<PriceCheckerSyncSettings> {
  await syncAllProducts()
  return getPriceCheckerSyncSettings()
}

export async function saveAndReschedulePriceCheckerSync(
  input: Pick<PriceCheckerSyncSettings, 'enabled' | 'server' | 'port' | 'databaseName' | 'username' | 'password'>
): Promise<PriceCheckerSyncSettings> {
  const updated = await updatePriceCheckerSyncSettings(input)
  await schedulePeriodicPriceCheckerSync()
  if (updated.enabled) syncAllProducts().catch(() => {})
  return updated
}
