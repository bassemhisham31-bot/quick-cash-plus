/** اختبار تقرير كشف الحساب المجمّع لكل العملاء */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { initDatabaseAtPath } from '../src/main/db'
import { createCustomer, updateCustomer } from '../src/main/services/customers'
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
  const pdf: any = await exportReportToPdf(rep)
  assert(pdf.ok && String(pdf.html).includes('أحمد'), 'PDF html')
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
