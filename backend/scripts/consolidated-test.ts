/** اختبار تقرير كشف الحساب المجمّع لكل العملاء */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { initDatabaseAtPath } from '../src/main/db'
import { createCustomer, updateCustomer } from '../src/main/services/customers'
import { createVendor, updateVendor } from '../src/main/services/vendors'
import { runReport } from '../src/main/services/reports'
import { exportReportToPdf } from '../src/main/services/exportReport'

const DATA_DIR = join(process.cwd(), 'data', 'consolidated-test')
const DB_PATH = join(DATA_DIR, 't.sqlite')
process.env.QCP_DATA_DIR = DATA_DIR
let passed = 0, failed = 0
const assert = (c: boolean, m: string): void => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${m}`) }

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  for (const s of ['', '-wal', '-shm']) if (existsSync(DB_PATH + s)) rmSync(DB_PATH + s)
  await initDatabaseAtPath(DB_PATH)
  const a = await createCustomer({ name: 'أحمد', phone: '', notes: '', openingBalance: 500, customerType: 'جملة', creditLimit: 1000 } as any)
  const b = await createCustomer({ name: 'بسام', phone: '', notes: '', openingBalance: -200 } as any)
  await updateCustomer(b.id, { name: 'بسام', phone: '', customerType: 'قطاعي', creditLimit: 300 })
  const rep = await runReport('customers_consolidated', { dateFrom: '', dateTo: '', warehouseId: null } as any)
  const ra = rep.rows.find((r: any) => r.customer === 'أحمد') as any
  const rb = rep.rows.find((r: any) => r.customer === 'بسام') as any
  assert(ra.type === 'جملة' && ra.creditLimit === 1000 && ra.debit === 500 && ra.credit === 0, 'مدين + نوع + حد ائتمان')
  assert(rb.type === 'قطاعي' && rb.creditLimit === 300 && rb.debit === 0 && rb.credit === 200, 'دائن بعد التعديل')
  assert(rep.rows.length === 2, 'العميل النقدي مستبعد')
  assert((rep.totals as any).debit === 500 && (rep.totals as any).credit === 200, 'الإجماليات')
  await createVendor({ name: 'مورد1', phone: '', address: '', notes: '', openingBalance: 700, vendorType: 'مصنع', creditLimit: 5000 })
  const v2 = await createVendor({ name: 'مورد2', phone: '', address: '', notes: '', openingBalance: -50 })
  await updateVendor(v2.id, { name: 'مورد2', phone: '', vendorType: 'موزع', creditLimit: 10 })
  const vr = await runReport('vendors_consolidated', { dateFrom: '', dateTo: '', warehouseId: null } as any)
  const x1 = vr.rows.find((r: any) => r.vendor === 'مورد1') as any
  const x2 = vr.rows.find((r: any) => r.vendor === 'مورد2') as any
  assert(x1.type === 'مصنع' && x1.creditLimit === 5000 && x1.debit === 700 && x1.credit === 0, 'مورد: مدين + نوع + حد')
  assert(x2.type === 'موزع' && x2.creditLimit === 10 && x2.debit === 0 && x2.credit === 50, 'مورد: دائن بعد التعديل')
  assert((vr.totals as any).debit === 700 && (vr.totals as any).credit === 50, 'إجماليات الموردين')
  const pdf: any = await exportReportToPdf(rep)
  assert(pdf.ok && String(pdf.html).includes('أحمد'), 'PDF html')
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
