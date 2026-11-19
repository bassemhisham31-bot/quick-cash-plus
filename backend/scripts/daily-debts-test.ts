/** اختبار تقرير مديونيات العملاء خلال اليوم (customer_daily_debts) + تصدير Excel */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { createCustomer } from '../src/main/services/customers'
import { openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { runReport } from '../src/main/services/reports'
import { exportReportToExcel } from '../src/main/services/exportReport'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'daily-debts-test')
const DB_PATH = join(DATA_DIR, 't.sqlite')
process.env.QCP_DATA_DIR = DATA_DIR
let passed = 0, failed = 0
const assert = (c: boolean, m: string): void => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${m}`) }
const scalar = async (sql: string): Promise<any> => ((await getDb().execute(sql)).rows[0] as any)?.v

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const s of ['', '-wal', '-shm']) if (existsSync(DB_PATH + s)) rmSync(DB_PATH + s)
  await initDatabaseAtPath(DB_PATH)
  const wh = Number(await scalar('SELECT id AS v FROM warehouses WHERE is_default = 1'))
  const adminId = Number(await scalar("SELECT id AS v FROM users WHERE username = 'admin'"))
  const p = await createProduct({ name: 'صنف', barcode: '', categoryId: null, unitId: null, vendorId: null, costPrice: 50, retailPrice: 100, wholesalePrice: 0, wholesale2Price: 0, packPrice: 0, openingQuantity: 1000, reorderPoint: 0, warehouseId: wh, expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null } as ProductInput)
  const a = await createCustomer({ name: 'عميل أ', phone: '0100', address: '', notes: '', openingBalance: 0 } as any)
  const b = await createCustomer({ name: 'عميل ب', phone: '', address: '', notes: '', openingBalance: 0 } as any)
  const c = await createCustomer({ name: 'عميل ج', phone: '', address: '', notes: '', openingBalance: 0 } as any)
  await openDay(adminId, 0)
  const line = (qty: number) => ({ productId: p.id, name: p.name, barcode: p.barcode, unitPrice: 100, qty, discount: 0 })
  const base = { warehouseId: wh, discountType: 'value', discountValue: 0, redeemPoints: 0 } as const
  // أ: 1000 دفع 500 (مختلط) → باقي 500
  const r1 = await checkout({ ...base, customerId: a.id, lines: [line(10)], paymentMethod: 'mixed', paid: 500, payments: [{ method: 'cash', amount: 500 }] } as CheckoutInput, adminId)
  // ب: آجل 300 كامل
  const r2 = await checkout({ ...base, customerId: b.id, lines: [line(3)], paymentMethod: 'credit', paid: 0 } as CheckoutInput, adminId)
  // ج: مدفوع كاش بالكامل → مايظهرش
  const r3 = await checkout({ ...base, customerId: c.id, lines: [line(2)], paymentMethod: 'cash', paid: 200 } as CheckoutInput, adminId)
  assert(!!r1.ok && !!r2.ok && !!r3.ok, `3 فواتير اتسجلت ${r1.error ?? ''}${r2.error ?? ''}${r3.error ?? ''}`)
  const rep = await runReport('customer_daily_debts', { dateFrom: '', dateTo: '', warehouseId: null })
  console.log(rep.title, JSON.stringify(rep.rows), JSON.stringify(rep.totals))
  assert(rep.rows.length === 2, 'عميلين بس عليهم باقي (ج دفع كاش مش بيظهر)')
  const ra = rep.rows.find((r) => r.customer === 'عميل أ')!
  assert(ra.total === 1000 && ra.paid === 500 && ra.remaining === 500 && ra.balance === 500, 'أ: 1000 دفع 500 باقي 500')
  const rb = rep.rows.find((r) => r.customer === 'عميل ب')!
  assert(rb.total === 300 && rb.paid === 0 && rb.remaining === 300, 'ب: 300 آجل')
  assert(rep.totals?.remaining === 800, 'إجمالي الباقي 800')
  const old = await runReport('customer_daily_debts', { dateFrom: '2020-01-01', dateTo: '2020-01-02', warehouseId: null })
  assert(old.rows.length === 0, 'يوم تاني فاضي')
  const x = await exportReportToExcel(rep)
  assert(x.ok && !!x.dataBase64, 'تصدير Excel شغال')
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
