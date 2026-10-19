const fs = require('fs')
let s = fs.readFileSync('D:/New Project/src/main/ipc/handlers.ts', 'utf8').split('\r\n').join('\n')
let lines = s.split('\n')

const dropLinesStartingWith = (prefix) => {
  const before = lines.length
  lines = lines.filter((l) => !l.startsWith(prefix))
  if (lines.length === before) throw new Error('not found: ' + prefix)
}
dropLinesStartingWith('import { connectGoogleDrive')
dropLinesStartingWith('import { openAttachment')
dropLinesStartingWith('import { dispatchToDevice')
dropLinesStartingWith('import type { PrintJob }')
dropLinesStartingWith('import type { PrinterInfo }')

for (const ch of [

  'attachments:pick', 'attachments:open',
  'net:registerPrinters', 'net:listPrinters', 'net:relayPrint',
  'googleDrive:connect', 'googleDrive:disconnect', 'googleDrive:upload'
]) dropLinesStartingWith("    '" + ch + "':")

s = lines.join('\n')

// settings:getPrinters (multi-line block) -> simple
const a = s.indexOf("    'settings:getPrinters': async () => {")
const b = s.indexOf('    },\n', a)
if (a < 0 || b < 0) throw new Error('getPrinters block not found')
s = s.slice(0, a) + "    'settings:getPrinters': () => getSystemPrinters(),\n" + s.slice(b + '    },\n'.length)

// trailing comma before the closing of the map (googleDrive was the last entry)
s = s.replace("'dataReset:factoryReset': (userId: number) => resetFactory(userId),\n\n  }", 'x')
s = s.replace('importProductsFromExcel()', 'importProductsFromExcel(dataBase64)').replace("'catalog:importProducts': ()", "'catalog:importProducts': (dataBase64: string)")
// (نسخة الويب: الملف بيتبعت base64 من المتصفح)

// الترخيص: حالة مع فترة سماح + منع التفعيل بكود من العميل (التفعيل بأمر المالك من السيرفر — services/licenseWeb.ts)
const licenseReplacements = [
  ["import { activateLicense, getLicenseStatus } from '../services/license'", "import { getWebLicenseStatus } from '../services/licenseWeb'"],
  ["'license:getStatus': () => getLicenseStatus()", "'license:getStatus': () => getWebLicenseStatus()"],
  ["'license:activate': (key: string) => activateLicense(key)", "'license:activate': async () => ({ ok: false, error: 'التفعيل بيتم من مزوّد الخدمة — تواصل معاه للتجديد' })"]
]
for (const [from, to] of licenseReplacements) {
  if (!s.includes(from)) throw new Error('license replacement target not found: ' + from)
  s = s.replace(from, to)
}

s = s.split("'../services/").join("'./services/").split("'../../shared/").join("'../shared/")
fs.writeFileSync('D:/quick-cash-plus-web/backend/src/main/handlers.ts', s)
console.log('ok')
