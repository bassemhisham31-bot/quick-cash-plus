const fs = require('fs')
const SCRATCH = __dirname + '/'
const WEB_API = 'D:/quick-cash-plus-web/frontend/src/renderer/src/platform/webApi.ts'
const norm = (t) => t.split('\r\n').join('\n')

const preload = norm(fs.readFileSync('D:/New Project/src/preload/index.ts', 'utf8'))
const oldWeb = norm(fs.readFileSync(WEB_API, 'utf8'))
const prelude = norm(fs.readFileSync(SCRATCH + 'prelude.txt', 'utf8'))

let s = preload

// ---- header / imports
s = s.replace("import { contextBridge, ipcRenderer } from 'electron'\n", '')
s = s.replace("import type { CashSessionView } from '../main/services/cashSession'\n", '')
s = s.replace("import { MUTATING_CHANNELS } from '../shared/mutatingChannels'\n", '')
s = s.replace("import { ACTOR_META_KEY } from '../shared/activityActor'\n", '')
s = s.replace("} from '../shared/types'", "} from '../../../shared/types'")

// ---- prelude: replace from the activeUser comment through the end of function invoke
const preStart = s.indexOf('// بيانات المستخدم الحالي اللي دخل')
const invokeStart = s.indexOf('function invoke(channel: string')
const invokeEnd = s.indexOf('\n}\n', invokeStart) + 3
if (preStart < 0 || invokeStart < 0) throw new Error('prelude markers not found')
const cashView = `/** بديل CashSessionView (كان مستورد من main/services/cashSession.ts — كود Electron main process مش موجود هنا). */
interface CashSessionView {
  id: number
  openedAt: string
  openingBalance: number
  status: 'open' | 'closed'
}

`
s = s.slice(0, preStart) + cashView + prelude + s.slice(invokeEnd)

// ---- block replacement helper: "  name: {" ... first "\n  }" at 2-space indent
function replaceBlock(name, text) {
  const start = s.indexOf('\n  ' + name + ': {')
  if (start < 0) throw new Error('block not found: ' + name)
  let end = s.indexOf('\n  }', start + 1)
  if (end < 0) throw new Error('block end not found: ' + name)
  end += '\n  }'.length
  s = s.slice(0, start) + '\n' + text + s.slice(end)
}

replaceBlock(
  'session',
  `  session: {
    setActiveUser: (): void => {
      // التتبع بقى عبر التوكن نفسه (setToken) مش user id/username منفصلين — موجودة هنا بس عشان
      // appStore.ts بينادي الدالة دي، فمحتاجينها تفضل موجودة بدون ما تعمل حاجة إضافية.
    },
    clearActiveUser: (): void => {
      setToken(null)
    }
  }`
)

replaceBlock(
  'auth',
  `  auth: {
    login: async (username: string, password: string): Promise<LoginResult> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const payload = await res.json()
      if (!payload.ok) return { ok: false, error: payload.error }
      setToken(payload.token)
      return { ok: true, user: payload.user }
    },
    /** قبل تسجيل الدخول مفيش توكن — على الإنترنت مش هنكشف قايمة المستخدمين، فالشاشة بتكتب الاسم يدويًا. */
    listLoginUsers: (): Promise<{ username: string; fullName: string }[]> =>
      authToken ? invoke('auth:listLoginUsers') : Promise.resolve([]),
    approveWithSupervisorPassword: (
      password: string,
      detail: string,
      requestedBy: string | null
    ): Promise<{ ok: boolean; approverName?: string; error?: string }> =>
      invoke('auth:approveWithSupervisorPassword', password, detail, requestedBy)
  }`
)

replaceBlock(
  'attachments',
  `  attachments: {
    pick: (): Promise<AttachFileResult> => Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as AttachFileResult),
    open: (_path: string): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: false, error: NOT_ON_WEB })
  }`
)

replaceBlock(
  'googleDrive',
  `  googleDrive: {
    connect: (_clientId: string): Promise<GoogleAuthUrlResult> => Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as GoogleAuthUrlResult),
    disconnect: (): Promise<void> => Promise.resolve(),
    upload: (): Promise<BackupResult> => Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as BackupResult)
  }`
)

const stubExport = (re, replacement) => {
  const before = s
  s = s.replace(re, replacement)
  if (s === before) throw new Error('stub target not found: ' + re)
}
const notOnWebExport = "Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as ExportResult)"
stubExport(/exportProducts: \(\): Promise<ExportResult> => invoke\('catalog:exportProducts'\)/, 'exportProducts: (): Promise<ExportResult> => ' + notOnWebExport)
stubExport(/exportProductsTemplate: \(\): Promise<ExportResult> => invoke\('catalog:exportProductsTemplate'\)/, 'exportProductsTemplate: (): Promise<ExportResult> => ' + notOnWebExport)
stubExport(/importProducts: \(\): Promise<ProductImportResult> => invoke\('catalog:importProducts'\)/, "importProducts: (): Promise<ProductImportResult> => Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as ProductImportResult)")
stubExport(/exportExcel: \(report: ReportResult\): Promise<ExportResult> => invoke\('reports:exportExcel', report\)/, 'exportExcel: (_report: ReportResult): Promise<ExportResult> => ' + notOnWebExport)
stubExport(/exportPdf: \(report: ReportResult\): Promise<ExportResult> => invoke\('reports:exportPdf', report\)/, 'exportPdf: (_report: ReportResult): Promise<ExportResult> => ' + notOnWebExport)

// ---- tail: network ... relaunchApp  (taken from the previous web implementation)
const webTailStart = oldWeb.indexOf('  /**\n   * مزامنة الأجهزة عبر الشبكة المحلية')
const webTailEnd = oldWeb.indexOf('\n}\n\n/** بيتنادى مرة واحدة')
if (webTailStart < 0 || webTailEnd < 0) throw new Error('old web tail not found')
const webTail = oldWeb.slice(webTailStart, webTailEnd)

const tailStart = s.indexOf('\n  network: {')
const tailEnd = s.indexOf('\n}\n\ncontextBridge.exposeInMainWorld')
if (tailStart < 0 || tailEnd < 0) throw new Error('preload tail not found')
s = s.slice(0, tailStart) + '\n' + webTail + s.slice(tailEnd)

s = s.replace(
  "contextBridge.exposeInMainWorld('api', api)\n\nexport type QuickCashApi = typeof api",
  `/** بيتنادى مرة واحدة عند إقلاع التطبيق (main.tsx) عشان يحط window.api — بديل contextBridge.exposeInMainWorld. */
export function installWebApi(): void {
  ;(window as unknown as { api: typeof api }).api = api
}

export type QuickCashApi = typeof api`
)
for (const w of ['ipcRenderer', 'contextBridge,']) { const i = s.indexOf(w); if (i >= 0) throw new Error('leftover ' + w + ': ' + s.slice(i - 80, i + 80)) }
fs.writeFileSync(WEB_API, s)
console.log('webApi.ts generated,', s.split('\n').length, 'lines')
