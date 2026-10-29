import type {
  SessionUser,
  Branch,
  BranchInput,
  EventBooking,
  EventBookingInput,
  EventBookingStatus,
  EventPackage,
  EventPackageInput,
  CashDifferenceRow,
  Treasury,
  TreasuryInput,
  TreasuryTransferInput,
  TreasuryTransferView,
  VoucherInput,
  VoucherView,
  HeldInvoice,
  HeldInvoiceInput,
  ActivateLicenseResult,
  KitchenNotification,
  AssistantChatMessage,
  AssistantConnectionTestResult,
  AssistantSendMessageResult,
  AssistantSettings,
  AttachFileResult,
  BackupFileInfo,
  BackupResult,
  BackupSettings,
  BarcodeLabelSettings,
  BarcodeLabelType,
  BulkPriceUpdateItem,
  BulkPriceUpdateResult,
  CashSessionSummary,
  ShiftListRow,
  ShiftSummaryReport,
  Captain,
  AttendancePayrollApproval,
  AttendancePayrollRow,
  AttendancePayrollRules,
  AttendanceSettingsInput,
  AttendanceDayRow,
  AttendanceDeviceUser,
  AttendanceEmployeeLink,
  AttendanceSettings,
  AttendanceSyncResult,
  CategoryPrinter,
  CategorySalesItem,
  CheckoutInput,
  CheckoutResult,
  Category,
  CloseRestaurantOrderInput,
  CustomerInput,
  DeliveryDriver,
  DeliveryOrderListRow,
  DeliveryStatus,
  DeliveryZone,
  DeliveryZoneInput,
  ReservationStatus,
  TableReservation,
  TableReservationInput,
  CustomerView,
  DashboardSummary,
  DataResetResult,
  DeleteUserResult,
  DeviceSettings,
  Employee,
  EmployeeInput,
  EmployeeLedger,
  EmployeePayPeriod,
  EmployeesSummary,
  EmployeeTransactionInput,
  EmployeeTransactionView,
  ExpenseCategory,
  ExpenseInput,
  ExpenseResult,
  ExpensesByMethodSummary,
  ExpenseView,
  ExpiringProductItem,
  InvoiceListFilter,
  InvoiceListItem,
  GoogleAuthUrlResult,
  InvoiceView,
  KeyboardShortcut,
  KeyboardShortcutInput,
  KeyboardShortcutPatch,
  KitchenTicketMeta,
  LicenseStatus,
  LoginResult,
  LoyaltySettings,
  NetworkConfig,
  NetworkStatus,
  NotificationItem,
  OpenRestaurantOrderInput,
  OverviewSummary,
  PaymentMethod,
  PaymentMethodBreakdownItem,
  PosUiSettings,
  PriceCheckerSyncSettings,
  PriceCheckerSyncTestResult,
  StoreSettings,
  PrinterInfo,
  PrintResult,
  PrintSettings,
  Product,
  ProductImportResult,
  ProductInput,
  ProductUpdateInput,
  PurchaseInvoiceInput,
  PurchaseInvoiceListItem,
  PurchaseInvoiceResult,
  PurchaseInvoiceView,
  PurchaseReturnListRow,
  RecipeItemInput,
  RecipeItemView,
  RestaurantOrderItemInput,
  RestaurantOrderListItem,
  RestaurantOrderResult,
  RestaurantOrderView,
  RestaurantSettings,
  RestaurantTable,
  RestaurantFloor,
  RestaurantFloorLine,
  RestaurantFloorLineInput,
  RestaurantFloorSettings,
  RestaurantTableInput,
  StockPermitInput,
  StockPermitListItem,
  StockPermitResult,
  StockPermitType,
  StockPermitView,
  QuotationConvertResult,
  QuotationInput,
  QuotationListItem,
  QuotationView,
  RemoteSupportAppName,
  RemoteSupportResult,
  ReportFilter,
  ReportResult,
  ReportType,
  ReturnLineInput,
  ReturnPurchaseLineInput,
  ReturnResult,
  SalesReturnListRow,
  SalesRep,
  SalesRepInput,
  StatementView,
  TaxSettings,
  ExportResult,
  TopProductItem,
  TransferInput,
  TransferResult,
  Unit,
  UpdateInvoiceInput,
  UserActivityEntry,
  UserInput,
  UserListItem,
  UserUpdateInput,
  VendorInput,
  VendorView,
  Warehouse,
  WeightBarcodeResult,
  WhatsAppSendResult,
  WhatsAppSettings,
  WhatsAppStatus
} from '../../../shared/types'

/** بديل CashSessionView (كان مستورد من main/services/cashSession.ts — كود Electron main process مش موجود هنا). */
interface CashSessionView {
  id: number
  openedAt: string
  openingBalance: number
  status: 'open' | 'closed'
}

const TOKEN_STORAGE_KEY = 'qcp_web_token'
let authToken: string | null = localStorage.getItem(TOKEN_STORAGE_KEY)

const USER_STORAGE_KEY = 'qcp_web_user'

function setToken(token: string | null): void {
  authToken = token
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
  else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}

/* ------------------------------ الفرع المختار (ميزة الفروع) ------------------------------ */

const BRANCH_STORAGE_KEY = 'qcp.activeBranch'
let activeBranchHeader: string | null = null
try {
  activeBranchHeader = localStorage.getItem(BRANCH_STORAGE_KEY)
} catch {
  /* التخزين المحلي مش متاح */
}

/** الفرع المختار: رقم فرع أو 'all' (كل الفروع — للأدمن). بيتبعت مع كل طلب في هيدر x-qcp-branch، والسيرفر بيتجاهله لغير الأدمن. */
export function setActiveBranchHeader(value: string | null): void {
  activeBranchHeader = value
  try {
    if (value) localStorage.setItem(BRANCH_STORAGE_KEY, value)
    else localStorage.removeItem(BRANCH_STORAGE_KEY)
  } catch {
    /* التخزين المحلي مش متاح */
  }
}

export function getActiveBranchHeader(): string | null {
  return activeBranchHeader
}

/** المستخدم المسجّل من زيارة سابقة (لو التوكن لسه محفوظ) — بيرجّع الجلسة بعد إعادة تحميل الصفحة. */
export function getStoredUser(): SessionUser | null {
  if (!authToken) return null
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SessionUser) : null
  } catch {
    return null
  }
}

/** يُستخدم من App.tsx عند الإقلاع عشان يعرف لو فيه توكن محفوظ من زيارة سابقة قبل ما يعرض شاشة الدخول. */
export function hasStoredToken(): boolean {
  return !!authToken
}

/* ------------------------------ الطباعة: السيرفر يبني المستند، والمتصفح يطبعه على طابعات الجهاز ------------------------------ */

/**
 * زي الجهاز الفرعي في الأوفلاين: كل جهاز (متصفح) له إعدادات طباعة وطابعات تصنيفات خاصة بيه (بتتخزن محليًا هنا)،
 * وبتتبعت للسيرفر مع قنوات الطباعة — السيرفر بيبني الـHTML ويرجّع "jobs"، والمتصفح بينفّذها عبر QZ Tray.
 */
const PRINT_CHANNELS = new Set([
  'print:receipt',
  'print:previewReceipt',
  'print:labels',
  'print:quotation',
  'print:previewQuotation',
  'print:shiftSummary',
  'print:previewShiftSummary',
  'print:stockPermit',
  'print:previewStockPermit',
  'print:kitchenTicket',
  'print:heldInvoice',
  'print:voucher',
  'print:eventBooking',
  'restaurant:printCheck',
  'restaurant:sendToKitchen',
  'restaurant:reprintKitchen'
])

type PrintJob =
  | { kind: 'print'; html: string; printSettings: PrintSettings; thermalWidthMm?: number; pageSizeMm?: { width: number; height: number } }
  | { kind: 'preview'; previewKind: string; title: string; html: string }
  | { kind: 'drawer'; printer: string; pin: 'pin2' | 'pin5' }

interface DevicePrintProfile {
  printSettings: PrintSettings
  categoryPrinters: Record<string, string>
}

const PROFILE_STORAGE_KEY = 'qcp_device_print_profile'

async function rpc(channel: string, args: unknown[], printProfile?: DevicePrintProfile): Promise<{ result: any; printJobs?: PrintJob[] }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  if (activeBranchHeader) headers['x-qcp-branch'] = activeBranchHeader

  const res = await fetch(`/api/rpc/${channel}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ args, ...(printProfile ? { printProfile } : {}) }, (_k, v) => (v === undefined ? { __undef: true } : v))
  })

  if (res.status === 401) {
    // لو كان فيه توكن واتّرفض = الجلسة انتهت. لو مفيش توكن أصلاً (قبل الدخول) مفيش داعي لإعادة التحميل.
    if (authToken) {
      setToken(null)
      window.location.reload()
    }
    throw new Error('انتهت صلاحية الجلسة — لازم تسجّل دخول تاني')
  }

  const payload = await res.json()
  if (!payload.ok) throw new Error(payload.error ?? 'حدث خطأ غير متوقع')
  return { result: payload.result, printJobs: payload.printJobs }
}

async function loadPrintProfile(): Promise<DevicePrintProfile> {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DevicePrintProfile
  } catch {
    // بروفايل تالف — نبدأ من جديد
  }
  // أول مرة: نبدأ من إعدادات السيرفر (المقاس والنسخ...) لكن من غير اسم طابعة — الطابعات هنا هي طابعات الجهاز ده
  const main = (await rpc('settings:getPrint', [])).result as PrintSettings
  const profile: DevicePrintProfile = { printSettings: { ...main, defaultPrinter: null }, categoryPrinters: {} }
  savePrintProfile(profile)
  return profile
}

function savePrintProfile(profile: DevicePrintProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // التخزين المحلي مش متاح — الإعدادات هتفضل للجلسة الحالية بس
  }
}

/** QZ Tray بيعلّق لو الـconfig من غير "size" — لازم عرض حقيقي دايمًا (تفصيل في qzPrint.ts). */
function widthMmOf(printSettings: PrintSettings): number {
  if (printSettings.paperSize === '80mm') return 80
  if (printSettings.paperSize === '58mm') return 58
  if (printSettings.paperSize === 'A5') return 148
  return 210 // A4
}

/** معاينة في تاب جديد — رابط Blob + نقرة بدل window.open() لأن المتصفحات بتمنعه لما يتنادى من كود. */
function openPreviewTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

async function runPrintJob(job: PrintJob): Promise<void> {
  if (job.kind === 'preview') {
    openPreviewTab(job.html)
    return
  }
  const { printHtmlViaQz, openCashDrawerViaQz } = await import('./qzPrint')
  if (job.kind === 'drawer') {
    await openCashDrawerViaQz(job.printer, job.pin)
    return
  }
  const widthMm = job.pageSizeMm?.width ?? job.thermalWidthMm ?? widthMmOf(job.printSettings)
  // نكرر النداء بعدد النسخ بدل نسخ الطابعة نفسها (تعريفات الطابعات الحرارية بتطبع نسخ فاضية مع copies > 1)
  const copies = Math.max(1, job.printSettings.copies ?? 1)
  for (let i = 0; i < copies; i++) {
    await printHtmlViaQz(job.html, { printerName: job.printSettings.defaultPrinter, widthMm })
  }
}

async function invoke(channel: string, ...args: unknown[]): Promise<any> {
  // إعدادات الطباعة/طابعات التصنيفات خاصة بالجهاز ده — بتتخزن محليًا مش على السيرفر
  switch (channel) {
    case 'settings:getPrint':
      return (await loadPrintProfile()).printSettings
    case 'settings:updatePrint': {
      const profile = await loadPrintProfile()
      profile.printSettings = args[0] as PrintSettings
      savePrintProfile(profile)
      return profile.printSettings
    }
    case 'settings:getCategoryPrinters': {
      const profile = await loadPrintProfile()
      const categories = ((await rpc('catalog:listCategories', [])).result ?? []) as { id: number; name: string }[]
      return Object.entries(profile.categoryPrinters).map(([id, printerName]) => ({
        categoryId: Number(id),
        categoryName: categories.find((c) => c.id === Number(id))?.name ?? '',
        printerName
      }))
    }
    case 'settings:setCategoryPrinter': {
      const [categoryId, printerName] = args as [number, string | null]
      const profile = await loadPrintProfile()
      if (printerName) profile.categoryPrinters[String(categoryId)] = printerName
      else delete profile.categoryPrinters[String(categoryId)]
      savePrintProfile(profile)
      return undefined
    }
    case 'settings:getPrinters': {
      const { listPrintersViaQz } = await import('./qzPrint')
      return listPrintersViaQz()
    }
    case 'print:openDrawer': {
      const profile = await loadPrintProfile()
      const printer = profile.printSettings.defaultPrinter
      if (!printer) return { ok: false, error: 'حدد طابعة افتراضية لهذا الجهاز من إعدادات الطباعة أولًا' }
      try {
        const device = (await rpc('settings:getDevice', [])).result as { drawerPin?: string }
        const { openCashDrawerViaQz } = await import('./qzPrint')
        await openCashDrawerViaQz(printer, device.drawerPin === 'pin5' ? 'pin5' : 'pin2')
        return { ok: true }
      } catch (err: any) {
        return { ok: false, error: err?.message ?? 'تعذر فتح الدرج' }
      }
    }
  }

  if (!PRINT_CHANNELS.has(channel)) return (await rpc(channel, args)).result

  const profile = await loadPrintProfile()
  const response = await rpc(channel, args, profile)
  const errors: string[] = []
  for (const job of response.printJobs ?? []) {
    try {
      await runPrintJob(job)
    } catch (err: any) {
      errors.push(err?.message ?? String(err))
    }
  }

  const result = response.result
  if (!errors.length) return result
  const message = errors.join(' / ')
  if (result && typeof result === 'object' && 'printedCount' in result) {
    return { ...result, printWarning: `الطلب اتبعت بس تذكرة المطبخ ما اتطبعتش: ${message}` }
  }
  return { ...(result ?? {}), ok: false, error: message }
}

const NOT_ON_WEB = 'الميزة دي لسه مش متاحة في نسخة الويب'

/* ------------------------------ تصدير/استيراد ملفات (المتصفح بينزّل ويرفع) ------------------------------ */

function downloadBase64(fileName: string, mimeType: string, dataBase64: string): void {
  const bytes = Uint8Array.from(atob(dataBase64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

async function exportFile(channel: string, ...args: unknown[]): Promise<ExportResult> {
  try {
    const r = await invoke(channel, ...args)
    if (!r?.ok) return { ok: false, error: r?.error ?? 'تعذر التصدير' }
    downloadBase64(r.fileName, r.mimeType, r.dataBase64)
    return { ok: true, filePath: `${r.fileName} (في مجلد التنزيلات)` }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر التصدير' }
  }
}

/** PDF: بنفتح التقرير في تاب جديد وبنشغّل نافذة الطباعة — اختار "حفظ كـPDF" كطابعة. */
async function exportPdf(report: ReportResult): Promise<ExportResult> {
  try {
    const r = await exportPdf(report)
    if (!r?.ok) return { ok: false, error: r?.error ?? 'تعذر التصدير' }
    const html = String((r as any).html).replace('</body>', "<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script></body>")
    openPreviewTab(html)
    return { ok: true, filePath: 'اختار "حفظ كـ PDF" من نافذة الطباعة' }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر التصدير' }
  }
}

/** لازم يتنادى مباشرة من ضغطة المستخدم (قبل أي await) وإلا المتصفح هيمنع نافذة اختيار الملف. */
function pickFileAsBase64(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

async function importProductsFile(): Promise<ProductImportResult> {
  const data = await pickFileAsBase64('.xlsx')
  if (!data) return { ok: false, canceled: true, created: 0, updated: 0, rowErrors: [] }
  try {
    return await invoke('catalog:importProducts', data)
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر الاستيراد', created: 0, updated: 0, rowErrors: [] }
  }
}

const api = {
  ledger: {
    listAccounts: (): Promise<{ code: string; name: string; type: string; isSystem: boolean; active: boolean; roles?: string[] }[]> => invoke('ledger:listAccounts'),
    createAccount: (input: { code: string; name: string; type: string }): Promise<void> => invoke('ledger:createAccount', input),
    setAccountActive: (code: string, active: boolean): Promise<void> => invoke('ledger:setAccountActive', code, active),
    updateAccount: (code: string, input: { code?: string; name: string; type: string }): Promise<void> => invoke('ledger:updateAccount', code, input),
    deleteAccount: (code: string): Promise<void> => invoke('ledger:deleteAccount', code),
    listAccountRoles: (): Promise<{ custom: boolean; roles: { role: string; label: string; type: string; accountCode: string; defaultCode: string }[] }> => invoke('ledger:listAccountRoles'),
    setAccountRoles: (input: Record<string, string>): Promise<void> => invoke('ledger:setAccountRoles', input),
    listEntries: (): Promise<{ id: number; date: string; description: string; debit: number }[]> => invoke('ledger:listEntries'),
    createEntry: (
      input: { date: string; description: string; lines: { code: string; debit: number; credit: number; memo?: string }[] },
      userId: number
    ): Promise<number> => invoke('ledger:createEntry', input, userId),
    deleteEntry: (id: number): Promise<void> => invoke('ledger:deleteEntry', id)
  },
  accounting: {
    listReports: (): Promise<{ type: string; icon: string; label: string; needsWarehouse?: boolean; noDates?: boolean; needsAccount?: boolean }[]> =>
      invoke('accounting:listReports'),
    run: (type: string, filter: { from?: string; to?: string; warehouseId?: number | null; accountCode?: string }): Promise<ReportResult> =>
      invoke('accounting:run', type, filter)
  },
  treasury: {
    list: (): Promise<Treasury[]> => invoke('treasury:list'),
    create: (input: TreasuryInput): Promise<void> => invoke('treasury:create', input),
    update: (id: number, input: TreasuryInput): Promise<void> => invoke('treasury:update', id, input),
    setDefault: (id: number): Promise<void> => invoke('treasury:setDefault', id),
    delete: (id: number): Promise<void> => invoke('treasury:delete', id),
    listVouchers: (filter?: { type?: 'receipt' | 'payment'; from?: string; to?: string }): Promise<VoucherView[]> =>
      invoke('treasury:listVouchers', filter),
    createVoucher: (input: VoucherInput, userId: number): Promise<VoucherView> => invoke('treasury:createVoucher', input, userId),
    deleteVoucher: (id: number): Promise<void> => invoke('treasury:deleteVoucher', id),
    printVoucher: (id: number, preview = false): Promise<{ ok: boolean; error?: string }> => invoke('print:voucher', id, preview),
    listTransfers: (): Promise<TreasuryTransferView[]> => invoke('treasury:listTransfers'),
    createTransfer: (input: TreasuryTransferInput, userId: number): Promise<void> => invoke('treasury:createTransfer', input, userId),
    deleteTransfer: (id: number): Promise<void> => invoke('treasury:deleteTransfer', id),
    listDifferences: (filter?: { from?: string; to?: string }): Promise<CashDifferenceRow[]> => invoke('treasury:listDifferences', filter),
    statement: (treasuryId: number | null, from?: string, to?: string): Promise<ReportResult> =>
      invoke('treasury:statement', treasuryId, from, to)
  },
  attendance: {
    getSettings: (): Promise<AttendanceSettings> => invoke('attendance:getSettings'),
    saveSettings: (input: AttendanceSettingsInput): Promise<void> =>
      invoke('attendance:saveSettings', input),
    test: (): Promise<{ ok: boolean; error?: string; info?: string }> => invoke('attendance:test'),
    deviceUsers: (): Promise<AttendanceDeviceUser[]> => invoke('attendance:deviceUsers'),
    sync: (): Promise<AttendanceSyncResult> => invoke('attendance:sync'),
    employees: (): Promise<AttendanceEmployeeLink[]> => invoke('attendance:employees'),
    linkEmployee: (employeeId: number, deviceUserId: string | null): Promise<void> =>
      invoke('attendance:linkEmployee', employeeId, deviceUserId),
    report: (from: string, to: string): Promise<AttendanceDayRow[]> => invoke('attendance:report', from, to),
    getPayrollRules: (): Promise<AttendancePayrollRules> => invoke('attendance:getPayrollRules'),
    savePayrollRules: (input: AttendancePayrollRules): Promise<void> => invoke('attendance:savePayrollRules', input),
    saveEmployeeShift: (employeeId: number, shiftStart: string | null, shiftEnd: string | null, weeklyOff: string): Promise<void> =>
      invoke('attendance:saveEmployeeShift', employeeId, shiftStart, shiftEnd, weeklyOff),
    calculatePayroll: (from: string, to: string): Promise<AttendancePayrollRow[]> => invoke('attendance:calculatePayroll', from, to),
    approvePayroll: (
      from: string,
      to: string,
      items: AttendancePayrollApproval[],
      userId: number
    ): Promise<{ approved: number; skipped: string[] }> => invoke('attendance:approvePayroll', from, to, items, userId)
  },
  events: {
    listPackages: (includeInactive = true): Promise<EventPackage[]> => invoke('events:listPackages', includeInactive),
    upsertPackage: (input: EventPackageInput): Promise<void> => invoke('events:upsertPackage', input),
    deletePackage: (id: number): Promise<void> => invoke('events:deletePackage', id),
    listBookings: (filter?: { status?: EventBookingStatus; from?: string; to?: string }): Promise<EventBooking[]> =>
      invoke('events:listBookings', filter),
    getBooking: (id: number): Promise<EventBooking | null> => invoke('events:getBooking', id),
    saveBooking: (input: EventBookingInput, userId: number): Promise<EventBooking> => invoke('events:saveBooking', input, userId),
    addPayment: (bookingId: number, amount: number, method: PaymentMethod, note: string | null, userId: number): Promise<EventBooking> =>
      invoke('events:addPayment', bookingId, amount, method, note, userId),
    setStatus: (bookingId: number, status: EventBookingStatus): Promise<EventBooking> => invoke('events:setStatus', bookingId, status),
    print: (id: number, preview = false): Promise<{ ok: boolean; error?: string }> => invoke('print:eventBooking', id, preview)
  },
  held: {
    hold: (input: HeldInvoiceInput, userId: number | null): Promise<number> => invoke('held:hold', input, userId),
    list: (): Promise<HeldInvoice[]> => invoke('held:list'),
    get: (id: number): Promise<HeldInvoice | null> => invoke('held:get', id),
    delete: (id: number): Promise<void> => invoke('held:delete', id),
    print: (id: number, preview = false): Promise<{ ok: boolean; error?: string }> => invoke('print:heldInvoice', id, preview)
  },
  session: {
    setActiveUser: (_id?: number, _username?: string): void => {
      // التتبع بقى عبر التوكن نفسه (setToken) مش user id/username منفصلين — موجودة هنا بس عشان
      // appStore.ts بينادي الدالة دي، فمحتاجينها تفضل موجودة بدون ما تعمل حاجة إضافية.
    },
    clearActiveUser: (): void => {
      setToken(null)
    }
  },
  auth: {
    login: async (username: string, password: string): Promise<LoginResult> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const payload = await res.json()
      if (!payload.ok) return { ok: false, error: payload.error }
      setToken(payload.token)
      try {
        localStorage.setItem('qcp_web_user', JSON.stringify(payload.user))
      } catch {
        // التخزين المحلي مش متاح — الجلسة هتنتهي بإعادة التحميل
      }
      return { ok: true, user: payload.user }
    },
    /** استعادة كلمة المرور بالإيميل: الرد ثابت سواء الحساب موجود أو لأ (مفيش كشف لمين مسجّل). */
    forgotPassword: async (identifier: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      })
      return res.json()
    },
    resetPassword: async (token: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })
      return res.json()
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
  },
  catalog: {
    listCategories: (): Promise<Category[]> => invoke('catalog:listCategories'),
    createCategory: (name: string, parentId: number | null): Promise<Category> =>
      invoke('catalog:createCategory', name, parentId),
    listUnits: (): Promise<Unit[]> => invoke('catalog:listUnits'),
    createUnit: (name: string, factor: number): Promise<Unit> =>
      invoke('catalog:createUnit', name, factor),
    listProducts: (search = '', warehouseId?: number): Promise<Product[]> =>
      invoke('catalog:listProducts', search, warehouseId),
    createProduct: (input: ProductInput): Promise<Product> =>
      invoke('catalog:createProduct', input),
    updateProduct: (id: number, input: ProductUpdateInput): Promise<Product> =>
      invoke('catalog:updateProduct', id, input),
    deleteProduct: (id: number): Promise<void> => invoke('catalog:deleteProduct', id),
    adjustStock: (productId: number, warehouseId: number, mode: 'add' | 'set', qty: number, userId: number): Promise<number> =>
      invoke('catalog:adjustStock', productId, warehouseId, mode, qty, userId),
    listWarehouses: (): Promise<Warehouse[]> => invoke('catalog:listWarehouses'),
    /** كل المخازن في كل الفروع (لاختيار وجهة نقل البضاعة بين الفروع) */
    listAllWarehouses: (): Promise<Warehouse[]> => invoke('catalog:listAllWarehouses'),
    stockByWarehouse: (productIds: number[]): Promise<{ productId: number; warehouseId: number; quantity: number }[]> =>
      invoke('catalog:stockByWarehouse', productIds),
    createWarehouse: (name: string): Promise<Warehouse> => invoke('catalog:createWarehouse', name),
    exportProducts: (): Promise<ExportResult> => exportFile('catalog:exportProducts'),
    exportProductsTemplate: (): Promise<ExportResult> => exportFile('catalog:exportProductsTemplate'),
    importProducts: (): Promise<ProductImportResult> => importProductsFile(),
    bulkUpdatePricesAndImages: (items: BulkPriceUpdateItem[]): Promise<BulkPriceUpdateResult> =>
      invoke('catalog:bulkUpdatePricesAndImages', items),
    bulkCreateProducts: (inputs: ProductInput[]): Promise<ProductImportResult> =>
      invoke('catalog:bulkCreateProducts', inputs)
  },
  branches: {
    list: (): Promise<Branch[]> => invoke('branches:list'),
    create: (input: BranchInput): Promise<Branch> => invoke('branches:create', input),
    update: (id: number, input: BranchInput): Promise<Branch> => invoke('branches:update', id, input)
  },
  users: {
    list: (): Promise<UserListItem[]> => invoke('users:list'),
    getPermissions: (id: number): Promise<string[]> => invoke('users:getPermissions', id),
    create: (input: UserInput): Promise<UserListItem> => invoke('users:create', input),
    update: (id: number, input: UserUpdateInput): Promise<UserListItem> =>
      invoke('users:update', id, input),
    delete: (id: number, currentUserId: number): Promise<DeleteUserResult> =>
      invoke('users:delete', id, currentUserId),
    listActivity: (limit?: number): Promise<UserActivityEntry[]> => invoke('users:listActivity', limit)
  },
  shortcuts: {
    list: (): Promise<KeyboardShortcut[]> => invoke('shortcuts:list'),
    update: (id: number, patch: KeyboardShortcutPatch): Promise<KeyboardShortcut> =>
      invoke('shortcuts:update', id, patch),
    create: (input: KeyboardShortcutInput): Promise<KeyboardShortcut> =>
      invoke('shortcuts:create', input),
    delete: (id: number): Promise<void> => invoke('shortcuts:delete', id)
  },
  pos: {
    checkout: (input: CheckoutInput, cashierId: number): Promise<CheckoutResult> =>
      invoke('pos:checkout', input, cashierId)
  },
  invoices: {
    getView: (invoiceId: number): Promise<InvoiceView | null> =>
      invoke('invoices:getView', invoiceId),
    list: (filter: InvoiceListFilter): Promise<InvoiceListItem[]> => invoke('invoices:list', filter),
    delete: (invoiceId: number, userId: number): Promise<void> =>
      invoke('invoices:delete', invoiceId, userId),
    restore: (invoiceId: number, userId: number): Promise<void> =>
      invoke('invoices:restore', invoiceId, userId),
    update: (invoiceId: number, input: UpdateInvoiceInput, userId: number): Promise<InvoiceView | null> =>
      invoke('invoices:update', invoiceId, input, userId),
    returnLines: (invoiceId: number, lines: ReturnLineInput[], userId: number): Promise<ReturnResult> =>
      invoke('invoices:returnLines', invoiceId, lines, userId),
    getReceiptQr: (invoiceId: number): Promise<string | null> =>
      invoke('invoices:getReceiptQr', invoiceId),
    listReturns: (filter?: { from?: string; to?: string }): Promise<SalesReturnListRow[]> =>
      invoke('invoices:listReturns', filter)
  },
  cash: {
    getOpenSession: (): Promise<CashSessionView | null> => invoke('cash:getOpenSession'),
    openDay: (userId: number, openingBalance: number): Promise<CashSessionView> =>
      invoke('cash:openDay', userId, openingBalance),
    closeDay: (userId: number, actualCash: number): Promise<ShiftSummaryReport | null> =>
      invoke('cash:closeDay', userId, actualCash),
    getSummary: (): Promise<CashSessionSummary | null> => invoke('cash:getSummary'),
    listShifts: (filter?: { from?: string; to?: string }): Promise<ShiftListRow[]> =>
      invoke('cash:listShifts', filter)
  },
  dashboard: {
    getSummary: (): Promise<DashboardSummary> => invoke('dashboard:getSummary'),
    getExpiringSoon: (limit?: number): Promise<ExpiringProductItem[]> =>
      invoke('dashboard:getExpiringSoon', limit),
    getTopProducts: (limit?: number): Promise<TopProductItem[]> =>
      invoke('dashboard:getTopProducts', limit),
    getPaymentMethodsBreakdown: (): Promise<PaymentMethodBreakdownItem[]> =>
      invoke('dashboard:getPaymentMethodsBreakdown'),
    getSalesByCategory: (): Promise<CategorySalesItem[]> => invoke('dashboard:getSalesByCategory')
  },
  notifications: {
    list: (): Promise<NotificationItem[]> => invoke('notifications:list')
  },
  customers: {
    list: (search = ''): Promise<CustomerView[]> => invoke('customers:list', search),
    create: (input: CustomerInput): Promise<CustomerView> => invoke('customers:create', input),
    getStatement: (customerId: number): Promise<StatementView> =>
      invoke('customers:getStatement', customerId),
    recordPayment: (
      customerId: number,
      amount: number,
      method: PaymentMethod,
      note: string,
      userId: number
    ): Promise<CustomerView> =>
      invoke('customers:recordPayment', customerId, amount, method, note, userId),
    updateLoyaltyEnabled: (customerId: number, enabled: boolean): Promise<CustomerView> =>
      invoke('customers:updateLoyaltyEnabled', customerId, enabled),
    linkVendor: (customerId: number, vendorId: number): Promise<CustomerView> =>
      invoke('customers:linkVendor', customerId, vendorId),
    unlinkVendor: (customerId: number): Promise<CustomerView> =>
      invoke('customers:unlinkVendor', customerId)
  },
  vendors: {
    list: (search = ''): Promise<VendorView[]> => invoke('vendors:list', search),
    create: (input: VendorInput): Promise<VendorView> => invoke('vendors:create', input),
    getStatement: (vendorId: number): Promise<StatementView> =>
      invoke('vendors:getStatement', vendorId),
    recordPayment: (
      vendorId: number,
      amount: number,
      method: PaymentMethod,
      note: string,
      userId: number,
      invoiceId?: number | null
    ): Promise<VendorView> =>
      invoke('vendors:recordPayment', vendorId, amount, method, note, userId, invoiceId),
    listUnpaidInvoices: (vendorId: number): Promise<PurchaseInvoiceListItem[]> =>
      invoke('vendors:listUnpaidInvoices', vendorId)
  },
  stock: {
    transfer: (input: TransferInput, userId: number): Promise<TransferResult> =>
      invoke('stock:transfer', input, userId)
  },
  purchases: {
    create: (input: PurchaseInvoiceInput, userId: number): Promise<PurchaseInvoiceResult> =>
      invoke('purchases:create', input, userId),
    list: (): Promise<PurchaseInvoiceListItem[]> => invoke('purchases:list'),
    getView: (purchaseId: number): Promise<PurchaseInvoiceView | null> =>
      invoke('purchases:getView', purchaseId),
    returnLines: (purchaseId: number, lines: ReturnPurchaseLineInput[], userId: number): Promise<ReturnResult> =>
      invoke('purchases:returnLines', purchaseId, lines, userId),
    listReturns: (filter?: { from?: string; to?: string }): Promise<PurchaseReturnListRow[]> =>
      invoke('purchases:listReturns', filter)
  },
  stockPermits: {
    create: (input: StockPermitInput, userId: number): Promise<StockPermitResult> =>
      invoke('stockPermits:create', input, userId),
    list: (type?: StockPermitType): Promise<StockPermitListItem[]> =>
      invoke('stockPermits:list', type),
    getView: (permitId: number): Promise<StockPermitView | null> =>
      invoke('stockPermits:getView', permitId),
    delete: (permitId: number, userId: number): Promise<StockPermitResult> =>
      invoke('stockPermits:delete', permitId, userId)
  },
  expenses: {
    listCategories: (): Promise<ExpenseCategory[]> => invoke('expenses:listCategories'),
    createCategory: (name: string): Promise<ExpenseCategory> => invoke('expenses:createCategory', name),
    list: (limit?: number): Promise<ExpenseView[]> => invoke('expenses:list', limit),
    create: (input: ExpenseInput, userId: number): Promise<ExpenseResult> =>
      invoke('expenses:create', input, userId),
    delete: (expenseId: number): Promise<void> => invoke('expenses:delete', expenseId),
    byMethodSummary: (): Promise<ExpensesByMethodSummary> => invoke('expenses:byMethodSummary')
  },
  employees: {
    list: (): Promise<Employee[]> => invoke('employees:list'),
    create: (input: EmployeeInput): Promise<Employee> => invoke('employees:create', input),
    update: (employeeId: number, input: EmployeeInput): Promise<Employee> => invoke('employees:update', employeeId, input),
    delete: (employeeId: number): Promise<void> => invoke('employees:delete', employeeId),
    recordTransaction: (input: EmployeeTransactionInput, userId: number): Promise<EmployeeTransactionView> =>
      invoke('employees:recordTransaction', input, userId),
    updateTransaction: (transactionId: number, input: { amount: number; note: string }): Promise<EmployeeTransactionView> =>
      invoke('employees:updateTransaction', transactionId, input),
    deleteTransaction: (transactionId: number): Promise<void> =>
      invoke('employees:deleteTransaction', transactionId),
    startNewPeriod: (employeeId: number, note?: string): Promise<EmployeePayPeriod> =>
      invoke('employees:startNewPeriod', employeeId, note),
    getLedger: (employeeId: number): Promise<EmployeeLedger> => invoke('employees:getLedger', employeeId),
    getSummary: (): Promise<EmployeesSummary> => invoke('employees:getSummary')
  },
  attachments: {
    pick: (): Promise<AttachFileResult> => Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as AttachFileResult),
    open: (_path: string): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: false, error: NOT_ON_WEB })
  },
  salesReps: {
    list: (includeInactive = true): Promise<SalesRep[]> => invoke('salesReps:list', includeInactive),
    create: (input: SalesRepInput): Promise<SalesRep> => invoke('salesReps:create', input),
    update: (id: number, input: SalesRepInput): Promise<SalesRep> =>
      invoke('salesReps:update', id, input),
    setActive: (id: number, active: boolean): Promise<SalesRep> =>
      invoke('salesReps:setActive', id, active)
  },
  quotations: {
    create: (input: QuotationInput, userId: number): Promise<QuotationView> =>
      invoke('quotations:create', input, userId),
    list: (): Promise<QuotationListItem[]> => invoke('quotations:list'),
    getView: (quotationId: number): Promise<QuotationView | null> =>
      invoke('quotations:getView', quotationId),
    updateStatus: (quotationId: number, status: 'draft' | 'sent' | 'expired'): Promise<QuotationView | null> =>
      invoke('quotations:updateStatus', quotationId, status),
    convertToInvoice: (
      quotationId: number,
      options: { warehouseId: number; paymentMethod: PaymentMethod; paid: number },
      userId: number
    ): Promise<QuotationConvertResult> =>
      invoke('quotations:convertToInvoice', quotationId, options, userId)
  },
  restaurant: {
    listTables: (): Promise<RestaurantTable[]> => invoke('restaurant:listTables'),
    upsertTable: (input: RestaurantTableInput): Promise<RestaurantTable> => invoke('restaurant:upsertTable', input),
    deleteTable: (id: number): Promise<{ ok: boolean; error?: string }> => invoke('restaurant:deleteTable', id),
    getFloor: (): Promise<RestaurantFloor> => invoke('restaurant:getFloor'),
    saveFloorSettings: (input: RestaurantFloorSettings): Promise<RestaurantFloor> => invoke('restaurant:saveFloorSettings', input),
    upsertFloorLine: (input: RestaurantFloorLineInput): Promise<RestaurantFloorLine> => invoke('restaurant:upsertFloorLine', input),
    deleteFloorLine: (id: number): Promise<void> => invoke('restaurant:deleteFloorLine', id),
    setTablePositions: (positions: { id: number; posX: number; posY: number }[]): Promise<void> =>
      invoke('restaurant:setTablePositions', positions),
    mergeTables: (orderId: number, tableIds: number[]): Promise<RestaurantOrderResult> =>
      invoke('restaurant:mergeTables', orderId, tableIds),
    transferTable: (orderId: number, newTableId: number): Promise<RestaurantOrderResult> =>
      invoke('restaurant:transferTable', orderId, newTableId),
    openOrder: (input: OpenRestaurantOrderInput, userId: number): Promise<RestaurantOrderResult> =>
      invoke('restaurant:openOrder', input, userId),
    addItems: (orderId: number, items: RestaurantOrderItemInput[]): Promise<RestaurantOrderResult> =>
      invoke('restaurant:addItems', orderId, items),
    updateItem: (itemId: number, patch: { qty?: number; note?: string; splitGroup?: number; discountType?: 'percent' | 'value'; discountValue?: number }): Promise<void> =>
      invoke('restaurant:updateItem', itemId, patch),
    moveItem: (itemId: number, group: number, qty?: number): Promise<void> =>
      invoke('restaurant:moveItem', itemId, group, qty),
    updateOrderMeta: (
      orderId: number,
      patch: {
        customerId?: number | null
        deliveryDriverId?: number | null
        deliveryAddress?: string
        deliveryFee?: number
        specialMark?: string
        guestCount?: number | null
        orderNote?: string
        captainId?: number | null
        discountType?: 'percent' | 'value'
        discountValue?: number
        customerLabel?: string
      }
    ): Promise<void> => invoke('restaurant:updateOrderMeta', orderId, patch),
    removeItem: (itemId: number): Promise<void> => invoke('restaurant:removeItem', itemId),
    sendToKitchen: (orderId: number): Promise<{ ok: boolean; printedCount: number; error?: string; printWarning?: string }> =>
      invoke('restaurant:sendToKitchen', orderId),
    reprintKitchen: (orderId: number): Promise<{ ok: boolean; printedCount: number; error?: string; printWarning?: string }> =>
      invoke('restaurant:reprintKitchen', orderId),
    printCheck: (orderId: number, preview = false, splitGroup?: number): Promise<{ ok: boolean; error?: string }> =>
      invoke('restaurant:printCheck', orderId, preview, splitGroup),
    listKitchenNotifications: (limit = 30): Promise<KitchenNotification[]> =>
      invoke('restaurant:listKitchenNotifications', limit),
    setKitchenStatus: (orderId: number, status: string): Promise<void> =>
      invoke('restaurant:setKitchenStatus', orderId, status),
    listOpenOrders: (): Promise<RestaurantOrderListItem[]> => invoke('restaurant:listOpenOrders'),
    getOrderView: (orderId: number): Promise<RestaurantOrderView | null> => invoke('restaurant:getOrderView', orderId),
    closeOrder: (input: CloseRestaurantOrderInput, userId: number): Promise<CheckoutResult> =>
      invoke('restaurant:closeOrder', input, userId),
    cancelOrder: (orderId: number): Promise<RestaurantOrderResult> => invoke('restaurant:cancelOrder', orderId)
  },
  recipes: {
    get: (productId: number): Promise<RecipeItemView[]> => invoke('recipes:get', productId),
    set: (productId: number, items: RecipeItemInput[]): Promise<void> => invoke('recipes:set', productId, items)
  },
  reports: {
    run: (type: ReportType, filter: ReportFilter): Promise<ReportResult> =>
      invoke('reports:run', type, filter),
    exportExcel: (report: ReportResult): Promise<ExportResult> => exportFile('reports:exportExcel', report),
    exportPdf: (report: ReportResult): Promise<ExportResult> => exportPdf(report),
    overview: (filter: ReportFilter): Promise<OverviewSummary> => invoke('reports:overview', filter)
  },
  settings: {
    getTax: (): Promise<TaxSettings> => invoke('settings:getTax'),
    updateTax: (input: TaxSettings): Promise<TaxSettings> => invoke('settings:updateTax', input),
    getPrint: (): Promise<PrintSettings> => invoke('settings:getPrint'),
    updatePrint: (input: PrintSettings): Promise<PrintSettings> => invoke('settings:updatePrint', input),
    getBarcodeLabel: (): Promise<BarcodeLabelSettings> => invoke('settings:getBarcodeLabel'),
    updateBarcodeLabel: (input: BarcodeLabelSettings): Promise<BarcodeLabelSettings> =>
      invoke('settings:updateBarcodeLabel', input),
    getDevice: (): Promise<DeviceSettings> => invoke('settings:getDevice'),
    updateDevice: (input: DeviceSettings): Promise<DeviceSettings> =>
      invoke('settings:updateDevice', input),
    getPrinters: (): Promise<PrinterInfo[]> => invoke('settings:getPrinters'),
    getStore: (): Promise<StoreSettings> => invoke('settings:getStore'),
    updateStore: (input: StoreSettings): Promise<StoreSettings> => invoke('settings:updateStore', input),
    getLoyalty: (): Promise<LoyaltySettings> => invoke('settings:getLoyalty'),
    updateLoyalty: (input: LoyaltySettings): Promise<LoyaltySettings> =>
      invoke('settings:updateLoyalty', input),
    getAssistant: (): Promise<AssistantSettings> => invoke('settings:getAssistant'),
    updateAssistant: (input: AssistantSettings): Promise<AssistantSettings> =>
      invoke('settings:updateAssistant', input),
    getPosUi: (): Promise<PosUiSettings> => invoke('settings:getPosUi'),
    updatePosUi: (input: PosUiSettings): Promise<PosUiSettings> => invoke('settings:updatePosUi', input),
    getWhatsApp: (): Promise<WhatsAppSettings> => invoke('settings:getWhatsApp'),
    updateWhatsApp: (input: WhatsAppSettings): Promise<WhatsAppSettings> =>
      invoke('settings:updateWhatsApp', input),
    getRestaurant: (): Promise<RestaurantSettings> => invoke('settings:getRestaurant'),
    updateRestaurant: (input: RestaurantSettings): Promise<RestaurantSettings> =>
      invoke('settings:updateRestaurant', input),
    getCategoryPrinters: (): Promise<CategoryPrinter[]> => invoke('settings:getCategoryPrinters'),
    setCategoryPrinter: (categoryId: number, printerName: string | null): Promise<void> =>
      invoke('settings:setCategoryPrinter', categoryId, printerName),
    listDeliveryDrivers: (includeInactive?: boolean): Promise<DeliveryDriver[]> =>
      invoke('settings:listDeliveryDrivers', includeInactive),
    upsertDeliveryDriver: (input: { id?: number; name: string; phone: string; active: boolean }): Promise<DeliveryDriver> =>
      invoke('settings:upsertDeliveryDriver', input),
    deleteDeliveryDriver: (id: number): Promise<void> => invoke('settings:deleteDeliveryDriver', id),
    listCaptains: (includeInactive?: boolean): Promise<Captain[]> => invoke('settings:listCaptains', includeInactive),
    upsertCaptain: (input: { id?: number; name: string; phone: string; active: boolean }): Promise<Captain> =>
      invoke('settings:upsertCaptain', input),
    deleteCaptain: (id: number): Promise<void> => invoke('settings:deleteCaptain', id)
  },
  delivery: {
    listZones: (includeInactive?: boolean): Promise<DeliveryZone[]> => invoke('delivery:listZones', includeInactive),
    upsertZone: (input: DeliveryZoneInput): Promise<DeliveryZone> => invoke('delivery:upsertZone', input),
    deleteZone: (id: number): Promise<void> => invoke('delivery:deleteZone', id),
    listOrders: (filter?: { from?: string; to?: string }): Promise<DeliveryOrderListRow[]> =>
      invoke('delivery:listOrders', filter),
    updateStatus: (invoiceId: number, status: DeliveryStatus): Promise<void> =>
      invoke('delivery:updateStatus', invoiceId, status),
    reassignDriver: (invoiceId: number, driverId: number | null): Promise<void> =>
      invoke('delivery:reassignDriver', invoiceId, driverId)
  },
  reservations: {
    list: (filter?: { from?: string; to?: string }): Promise<TableReservation[]> => invoke('reservations:list', filter),
    create: (input: TableReservationInput): Promise<TableReservation> => invoke('reservations:create', input),
    updateStatus: (id: number, status: ReservationStatus): Promise<void> =>
      invoke('reservations:updateStatus', id, status),
    delete: (id: number): Promise<void> => invoke('reservations:delete', id)
  },
  assistant: {
    testConnection: (): Promise<AssistantConnectionTestResult> => invoke('assistant:testConnection'),
    sendMessage: (userId: number, message: string): Promise<AssistantSendMessageResult> =>
      invoke('assistant:sendMessage', userId, message),
    getHistory: (userId: number): Promise<AssistantChatMessage[]> => invoke('assistant:getHistory', userId),
    clearHistory: (userId: number): Promise<void> => invoke('assistant:clearHistory', userId)
  },
  whatsapp: {
    getStatus: (): Promise<WhatsAppStatus> => invoke('whatsapp:getStatus'),
    startPairing: (): Promise<WhatsAppStatus> => invoke('whatsapp:startPairing'),
    logout: (): Promise<void> => invoke('whatsapp:logout'),
    sendTest: (phone: string, message: string): Promise<WhatsAppSendResult> =>
      invoke('whatsapp:sendTest', phone, message)
  },
  barcode: {
    generate: (value: string, type?: BarcodeLabelType): Promise<string> =>
      invoke('barcode:generate', value, type),
    decodeWeight: (barcode: string): Promise<WeightBarcodeResult> =>
      invoke('barcode:decodeWeight', barcode)
  },
  print: {
    receipt: (invoiceId: number): Promise<PrintResult> => invoke('print:receipt', invoiceId),
    previewReceipt: (invoiceId: number): Promise<PrintResult> =>
      invoke('print:previewReceipt', invoiceId),
    labels: (items: { barcode: string; name: string; price: number }[]): Promise<PrintResult> =>
      invoke('print:labels', items),
    quotation: (quotationId: number): Promise<PrintResult> => invoke('print:quotation', quotationId),
    previewQuotation: (quotationId: number): Promise<PrintResult> =>
      invoke('print:previewQuotation', quotationId),
    shiftSummary: (sessionId: number, detailed = false): Promise<PrintResult> => invoke('print:shiftSummary', sessionId, detailed),
    previewShiftSummary: (sessionId: number, detailed = false): Promise<PrintResult> =>
      invoke('print:previewShiftSummary', sessionId, detailed),
    stockPermit: (permitId: number): Promise<PrintResult> => invoke('print:stockPermit', permitId),
    previewStockPermit: (permitId: number): Promise<PrintResult> =>
      invoke('print:previewStockPermit', permitId),
    openDrawer: (): Promise<PrintResult> => invoke('print:openDrawer'),
    kitchenTicket: (
      meta: KitchenTicketMeta,
      printerName: string | null,
      items: { name: string; qty: number; note: string | null }[]
    ): Promise<PrintResult> => invoke('print:kitchenTicket', meta, printerName, items)
  },
  license: {
    getStatus: (): Promise<LicenseStatus> => invoke('license:getStatus'),
    activate: (key: string): Promise<ActivateLicenseResult> => invoke('license:activate', key)
  },
  backup: {
    getSettings: (): Promise<BackupSettings> => invoke('backup:getSettings'),
    updateSettings: (
      input: Pick<BackupSettings, 'autoBackupEnabled' | 'backupFolder' | 'frequencyHours' | 'keepCount'>
    ): Promise<BackupSettings> => invoke('backup:updateSettings', input),
    runNow: (): Promise<BackupResult> => invoke('backup:runNow'),
    list: (): Promise<BackupFileInfo[]> => invoke('backup:list'),
    restore: (filePath: string): Promise<BackupResult> => invoke('backup:restore', filePath)
  },
  priceCheckerSync: {
    get: (): Promise<PriceCheckerSyncSettings> => invoke('priceCheckerSync:get'),
    update: (
      input: Pick<
        PriceCheckerSyncSettings,
        'enabled' | 'server' | 'port' | 'databaseName' | 'username' | 'password'
      >
    ): Promise<PriceCheckerSyncSettings> => invoke('priceCheckerSync:update', input),
    test: (
      input: Pick<PriceCheckerSyncSettings, 'server' | 'port' | 'databaseName' | 'username' | 'password'>
    ): Promise<PriceCheckerSyncTestResult> => invoke('priceCheckerSync:test', input),
    syncNow: (): Promise<PriceCheckerSyncSettings> => invoke('priceCheckerSync:syncNow')
  },
  dataReset: {
    customers: (userId: number): Promise<DataResetResult> => invoke('dataReset:customers', userId),
    products: (userId: number): Promise<DataResetResult> => invoke('dataReset:products', userId),
    sales: (userId: number): Promise<DataResetResult> => invoke('dataReset:sales', userId),
    vendors: (userId: number): Promise<DataResetResult> => invoke('dataReset:vendors', userId),
    categories: (userId: number): Promise<DataResetResult> => invoke('dataReset:categories', userId),
    expenses: (userId: number): Promise<DataResetResult> => invoke('dataReset:expenses', userId),
    assistantChat: (userId: number): Promise<DataResetResult> => invoke('dataReset:assistantChat', userId),
    factoryReset: (userId: number): Promise<DataResetResult> => invoke('dataReset:factoryReset', userId)
  },
  googleDrive: {
    connect: (_clientId: string): Promise<GoogleAuthUrlResult> => Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as GoogleAuthUrlResult),
    disconnect: (): Promise<void> => Promise.resolve(),
    upload: (): Promise<BackupResult> => Promise.resolve({ ok: false, error: NOT_ON_WEB } as unknown as BackupResult)
  },
  /**
   * مزامنة الأجهزة عبر الشبكة المحلية (جهاز رئيسي/فرعي) كانت مفهوم خاص بنسخة الأوفلاين —
   * في نسخة الويب كل "جهاز" هو مجرد متصفح بيتصل بالسيرفر المركزي مباشرة عبر الإنترنت،
   * فمفهوم "الجهاز الرئيسي" نفسه بقى متقاعد. قيم افتراضية ثابتة بس عشان أي شاشة إعدادات
   * قديمة بتعرض الحالة دي متتعطلش.
   */
  network: {
    getConfig: (): Promise<NetworkConfig> =>
      Promise.resolve({
        role: 'standalone',
        deviceName: 'ويب',
        port: 0,
        connectionCode: '',
        mainHost: null,
        mainPort: null,
        mainConnectionCode: null
      }),
    updateConfig: (config: NetworkConfig): Promise<NetworkConfig> => Promise.resolve(config),
    getStatus: (): Promise<NetworkStatus> =>
      Promise.resolve({
        role: 'standalone',
        serverRunning: false,
        connectedDeviceCount: 0,
        connectedToMain: false,
        localIpAddresses: [],
        lastConnectionError: null,
        serverError: null
      }),
    regenerateCode: (): Promise<string> => Promise.resolve(''),
    getLocalIps: (): Promise<string[]> => Promise.resolve([])
  },
  system: {
    /** فتح بروتوكول خاص (anydesk:, teamviewer10:) من المتصفح — بيشتغل لو البرنامج مثبت فعليًا على جهاز المستخدم. */
    openRemoteSupportApp: (appName: RemoteSupportAppName): Promise<RemoteSupportResult> => {
      const protocols: Record<string, string> = { anydesk: 'anydesk:', teamviewer: 'teamviewer10:' }
      const protocol = protocols[appName]
      if (!protocol) return Promise.resolve({ ok: false, error: 'برنامج غير معروف' })
      try {
        window.open(protocol, '_self')
        return Promise.resolve({ ok: true })
      } catch {
        return Promise.resolve({ ok: false, error: 'تعذر فتح البرنامج' })
      }
    }
  },
  /** بديل قناة IPC 'data:changed' — بث لحظي عبر WebSocket على /ws من نفس الباك إند. */
  onDataChanged: (callback: () => void): (() => void) => {
    let ws: WebSocket | null = null
    let closed = false

    function connect(): void {
      if (closed || !authToken) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${authToken}`)
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg?.type === 'changed') callback()
        } catch {
          // تجاهل رسائل غير متوقعة
        }
      }
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 2000)
      }
    }
    connect()

    return () => {
      closed = true
      ws?.close()
    }
  },
  /** إعادة تشغيل Electron مش مفهوم موجود في متصفح — أقرب مكافئ هو إعادة تحميل الصفحة. */
  relaunchApp: (): Promise<void> => {
    window.location.reload()
    return Promise.resolve()
  }
}

/** بيتنادى مرة واحدة عند إقلاع التطبيق (main.tsx) عشان يحط window.api — بديل contextBridge.exposeInMainWorld. */
export function installWebApi(): void {
  ;(window as unknown as { api: typeof api }).api = api
}

export type QuickCashApi = typeof api
