// بيولّد backend/src/main/services/catalogImportExport.ts من نسخة الأوفلاين:
// نفس منطق الاستيراد/التصدير بالظبط، بس بدل حوارات Electron وملفات القرص بنشتغل بـbase64 (المتصفح بيرفع وينزّل).
const fs = require('fs')
const src = fs.readFileSync('D:/New Project/src/main/services/catalogImportExport.ts', 'utf8').split('\r\n').join('\n')
let s = src

function between(startMarker, endMarker) {
  const a = s.indexOf(startMarker)
  const b = s.indexOf(endMarker, a)
  if (a < 0 || b < 0) throw new Error('marker not found: ' + startMarker)
  return [a, b]
}

// 1) القالب + تصدير الأصناف
{
  const [a, b] = between('export async function exportProductsTemplate', 'export async function writeProductsToFile')
  s =
    s.slice(0, a) +
    `export type WebExportResult = ExportResult & { fileName?: string; mimeType?: string; dataBase64?: string }

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function toResult(workbook: ExcelJS.Workbook, fileName: string): Promise<WebExportResult> {
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return { ok: true, fileName, mimeType: XLSX_MIME, dataBase64: buffer.toString('base64') }
}

export async function exportProductsTemplate(): Promise<WebExportResult> {
  try {
    const workbook = new ExcelJS.Workbook()
    buildSheet(workbook)
    return await toResult(workbook, 'قالب-استيراد-الأصناف.xlsx')
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر إنشاء القالب' }
  }
}

export async function exportProductsToExcel(): Promise<WebExportResult> {
  try {
    return await toResult(await buildProductsWorkbook(), \`الأصناف-\${new Date().toISOString().slice(0, 10)}.xlsx\`)
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر تصدير الأصناف' }
  }
}

` +
    s.slice(b)
}

// 2) بناء الـworkbook بدل الكتابة على ملف
s = s.replace('export async function writeProductsToFile(filePath: string): Promise<void> {', 'async function buildProductsWorkbook(): Promise<ExcelJS.Workbook> {')
{
  const a = s.indexOf('async function buildProductsWorkbook')
  const w = s.indexOf('  await workbook.xlsx.writeFile(filePath)', a)
  if (a < 0 || w < 0) throw new Error('writeFile marker')
  s = s.slice(0, w) + '  return workbook' + s.slice(w + '  await workbook.xlsx.writeFile(filePath)'.length)
}

// 3) الاستيراد من base64
{
  const [a, b] = between('export async function importProductsFromExcel', 'await workbook.xlsx.readFile(filePath)')
  s =
    s.slice(0, a) +
    `export async function importProductsFromExcel(dataBase64: string): Promise<ProductImportResult> {
  try {
    const buffer = Buffer.from(dataBase64, 'base64')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)` +
    s.slice(b + 'await workbook.xlsx.readFile(filePath)'.length)
}

if (s.includes('electron') || s.includes('filePath')) throw new Error('leftover electron/filePath refs')
fs.writeFileSync('D:/quick-cash-plus-web/backend/src/main/services/catalogImportExport.ts', s)
console.log('catalogImportExport.ts generated')
