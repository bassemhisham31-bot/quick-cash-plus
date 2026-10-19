const fs = require('fs')
let s = fs.readFileSync('D:/New Project/src/main/services/print.ts', 'utf8').split('\r\n').join('\n')
const cut = (startMarker, endMarker, replacement) => {
  const a = s.indexOf(startMarker)
  const b = s.indexOf(endMarker, a)
  if (a < 0 || b < 0) throw new Error('marker not found: ' + startMarker.slice(0, 40) + ' / ' + endMarker.slice(0, 40))
  s = s.slice(0, a) + replacement + s.slice(b)
}
s = s.replace("import { openCashDrawer as sendDrawerPulse } from './rawPrinter'\n", '')
s = s.replace("import { printCapture, type PrintJob } from './printContext'", "import { printCapture } from './printContext'")
s = s.replace("import { dispatchToDevice, parseRemotePrinter } from '../network/printRelay'\n", '')
s = s.replace("import type { BrowserWindow as ElectronBrowserWindow } from 'electron'\n", '')
cut('// نافذة معاينة واحدة لكل نوع', 'const numberFormat', `/**
 * نسخة الويب: السيرفر ما بيطبعش ولا بيفتح نوافذ — كل طلب طباعة/معاينة بيتسجّل كـ job داخل printCapture
 * (نفس آلية الجهاز الفرعي في الأوفلاين)، وبيرجع للمتصفح في الرد ينفّذه على طابعات الجهاز نفسه عبر QZ Tray.
 */
async function openPreviewWindow(kind: string, title: string, html: string): Promise<void> {
  printCapture.getStore()?.jobs.push({ kind: 'preview', previewKind: kind, title, html })
}

`)
cut('/**\n * بيبني ملف PDF لنفس تصميم الفاتورة', 'export async function printReceipt', '')
cut('function logPrintDebug', '/** طباعة/معاينة مسودة فاتورة معلّقة', 'function logPrintDebug(_message: string): void {}\n\n')
cut('export async function openCashDrawer', 'function loyaltyLinesHtml', `export async function openCashDrawer(): Promise<PrintResult> {
  const [printSettings, deviceSettings] = await Promise.all([getPrintSettings(), getDeviceSettings()])
  if (!printSettings.defaultPrinter) {
    return { ok: false, error: 'حدد طابعة افتراضية من إعدادات الطباعة أولًا' }
  }
  const pin = deviceSettings.drawerPin === 'pin5' ? 'pin5' : 'pin2'
  printCapture.getStore()?.jobs.push({ kind: 'drawer', printer: printSettings.defaultPrinter, pin })
  return { ok: true }
}

async function printHtml(
  html: string,
  printSettings: PrintSettings,
  thermalWidthMm?: number,
  explicitPageSizeMm?: { width: number; height: number }
): Promise<PrintResult> {
  const capture = printCapture.getStore()
  if (!capture) return { ok: false, error: 'الطباعة بتتم من المتصفح — الطلب لازم يوصل ببيانات طابعة الجهاز' }
  capture.jobs.push({ kind: 'print', html, printSettings, thermalWidthMm, pageSizeMm: explicitPageSizeMm })
  return { ok: true }
}

`)
fs.writeFileSync('D:/quick-cash-plus-web/backend/src/main/services/print.ts', s)
console.log('print.ts written', s.split('\n').length, 'lines; electron refs:', (s.match(/electron/g) || []).length)
