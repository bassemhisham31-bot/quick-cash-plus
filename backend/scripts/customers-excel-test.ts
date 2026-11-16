/**
 * اختبار تصدير/استيراد العملاء إكسيل (2026-11-16) على قاعدة مؤقتة:
 * تصدير → تعديل أرقام في نفس الملف → استيراد بيبدّل الأرقام بالكود، من غير ما يلمس الرصيد.
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { initDatabaseAtPath } from '../src/main/db'
import { createCustomer, listCustomers } from '../src/main/services/customers'
import { exportCustomersToExcel, importCustomersFromExcel } from '../src/main/services/customersImportExport'

const DATA_DIR = join(process.cwd(), 'data', 'customers-excel-test')
process.env.QCP_DATA_DIR = DATA_DIR

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}

async function main(): Promise<void> {
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true })
  mkdirSync(DATA_DIR, { recursive: true })
  await initDatabaseAtPath(join(DATA_DIR, 'test.sqlite'))

  const mk = (name: string, phone: string, openingBalance = 0) =>
    createCustomer({ name, phone, address: '', notes: '', openingBalance, loyaltyEnabled: true })
  const a = await mk('أحمد علي', '01000000001', 500)
  const b = await mk('محمود حسن', '', 250)
  const c = await mk('سيد إبراهيم', '01000000003')
  await mk('اسم مكرر', '01000000004')
  await mk('اسم مكرر', '01000000005')

  console.log('1) التصدير')
  const exp: any = await exportCustomersToExcel()
  assert(exp.ok && !!exp.dataBase64 && exp.fileName.endsWith('.xlsx'), 'ملف الإكسيل اتولّد')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(exp.dataBase64, 'base64') as any)
  const sheet = wb.worksheets[0]
  assert(sheet.rowCount === 6, 'فيه كل العملاء (5) + العناوين، من غير العميل النقدي')
  const headers = (sheet.getRow(1).values as any[]).slice(1)
  assert(headers[0] === 'الكود' && headers[1] === 'الاسم' && headers[2] === 'الموبايل', 'الأعمدة: الكود/الاسم/الموبايل...')
  const rowOf = (id: number): ExcelJS.Row => {
    for (let i = 2; i <= sheet.rowCount; i++) if (Number(sheet.getRow(i).getCell(1).value) === id) return sheet.getRow(i)
    throw new Error('row not found')
  }
  assert(rowOf(a.id).getCell(3).value === '01000000001', 'الموبايل متصدّر نص (الصفر الأول موجود)')

  console.log('2) تعديل الأرقام في نفس الملف واستيراده')
  rowOf(a.id).getCell(3).value = '01111111111' // رقم جديد نص
  rowOf(b.id).getCell(3).value = 1222222222 // إكسيل شال الصفر الأول (رقم)
  rowOf(c.id).getCell(3).value = '٠١٠٩٩٩٩٩٩٩٩' // أرقام عربي
  rowOf(a.id).getCell(6).value = 999999 // محاولة تغيير الرصيد — لازم تتجاهل
  sheet.addRow([null, 'عميل جديد من الإكسيل', '01055555555', 'طنطا', '', null])
  sheet.addRow([null, 'اسم مكرر', '01066666666', '', '', null]) // اسم مكرر من غير كود → خطأ
  sheet.addRow([98765, 'كود غلط', '01077777777', '', '', null]) // كود مش موجود → خطأ
  const edited = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
  const imp = await importCustomersFromExcel(edited)
  console.log('     ', JSON.stringify({ updated: imp.updated, created: imp.created, errors: imp.rowErrors }))
  assert(imp.ok && imp.updated === 3 && imp.created === 1, '3 عملاء اتحدّثوا + عميل جديد اتضاف')
  assert(imp.rowErrors.length === 2, 'الصفين الغلط (اسم مكرر / كود مش موجود) اترفضوا برسالة')

  const all = await listCustomers('')
  const get = (id: number) => all.find((x) => x.id === id)!
  assert(get(a.id).phone === '01111111111', 'الرقم القديم اتبدّل بالجديد')
  assert(get(b.id).phone === '01222222222', 'الصفر الأول رجع لما إكسيل شاله')
  assert(get(c.id).phone === '01099999999', 'الأرقام العربي اتحوّلت')
  assert(get(a.id).balance === 500 && get(b.id).balance === 250, 'الرصيد ما اتغيرش (عمود الرصيد للعرض بس)')
  const created = all.find((x) => x.name === 'عميل جديد من الإكسيل')
  assert(!!created && created.phone === '01055555555' && created.balance === 0, 'العميل الجديد اتضاف برصيد صفر')
  assert(all.filter((x) => x.name === 'اسم مكرر').every((x) => x.phone !== '01066666666'), 'العميل المكرر الاسم ما اتلمسش')

  console.log('3) إعادة استيراد نفس الملف ما بتعملش حاجة')
  const again = await importCustomersFromExcel(edited)
  assert(again.updated === 0 && again.created === 0, 'no second update and the new customer is not duplicated')

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
