const fs = require('fs')
let s = fs.readFileSync('D:/New Project/src/main/ipc/handlers.ts', 'utf8').split('\r\n').join('\n')
let lines = s.split('\n')

const dropLinesStartingWith = (prefix) => {
  const before = lines.length
  lines = lines.filter((l) => !l.startsWith(prefix))
  if (lines.length === before) throw new Error('not found: ' + prefix)
}
dropLinesStartingWith('import { exportReportToExcel')
dropLinesStartingWith('import { exportProductsTemplate')
dropLinesStartingWith('import { connectGoogleDrive')
dropLinesStartingWith('import { openAttachment')
dropLinesStartingWith('import { dispatchToDevice')
dropLinesStartingWith('import type { PrintJob }')
dropLinesStartingWith('import type { PrinterInfo }')

for (const ch of [
  'catalog:exportProducts', 'catalog:exportProductsTemplate', 'catalog:importProducts',
  'attachments:pick', 'attachments:open', 'reports:exportExcel', 'reports:exportPdf',
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
s = s.split("'../services/").join("'./services/").split("'../../shared/").join("'../shared/")
fs.writeFileSync('D:/quick-cash-plus-web/backend/src/main/handlers.ts', s)
console.log('ok')
