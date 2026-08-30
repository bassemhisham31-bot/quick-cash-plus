import type {
  ActivateLicenseResult,
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

function setToken(token: string | null): void {
  authToken = token
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
  else localStorage.removeItem(TOKEN_STORAGE_KEY)
}

/** يُستخدم من App.tsx عند الإقلاع عشان يعرف لو فيه توكن محفوظ من زيارة سابقة قبل ما يعرض شاشة الدخول. */
export function hasStoredToken(): boolean {
  return !!authToken
}

/**
 * بديل ipcRenderer.invoke: بينادي نفس اسم القناة بالظبط عبر /api/rpc/:channel على الباك إند.
 * "مين نفّذ العملية" (لتسجيل نشاط المستخدمين) بقى بيتحدد من السيرفر نفسه من التوكن الموثّق،
 * مش من الواجهة زي قديم — مفيش داعي لمنطق ACTOR_META_KEY هنا خالص.
 */
async function invoke(channel: string, ...args: unknown[]): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  const res = await fetch(`/api/rpc/${channel}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ args })
  })

  if (res.status === 401) {
    setToken(null)
    window.location.reload()
    throw new Error('انتهت صلاحية الجلسة — لازم تسجّل دخول تاني')
  }

  const payload = await res.json()
  if (!payload.ok) throw new Error(payload.error ?? 'حدث خطأ غير متوقع')
  return payload.result
}

const api = {
  session: {
    setActiveUser: (): void => {
      // التتبع بقى عبر التوكن نفسه (setToken) مش user id/username منفصلين — موجودة هنا بس عشان
      // appStore.ts القديم بينادي الدالة دي، فمحتاجينها تفضل موجودة بدون ما تعمل حاجة إضافية.
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
      return { ok: true, user: payload.user }
    }
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
    listWarehouses: (): Promise<Warehouse[]> => invoke('catalog:listWarehouses'),
    createWarehouse: (name: string): Promise<Warehouse> => invoke('catalog:createWarehouse', name),
    exportProducts: (): Promise<ExportResult> => invoke('catalog:exportProducts'),
    exportProductsTemplate: (): Promise<ExportResult> => invoke('catalog:exportProductsTemplate'),
    importProducts: (): Promise<ProductImportResult> => invoke('catalog:importProducts'),
    bulkUpdatePricesAndImages: (items: BulkPriceUpdateItem[]): Promise<BulkPriceUpdateResult> =>
      invoke('catalog:bulkUpdatePricesAndImages', items),
    bulkCreateProducts: (inputs: ProductInput[]): Promise<ProductImportResult> =>
      invoke('catalog:bulkCreateProducts', inputs)
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
    byMethodSummary: (): Promise<ExpensesByMethodSummary> => invoke('expenses:byMethodSummary')
  },
  employees: {
    list: (): Promise<Employee[]> => invoke('employees:list'),
    create: (input: EmployeeInput): Promise<Employee> => invoke('employees:create', input),
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
    pick: (): Promise<AttachFileResult> => invoke('attachments:pick'),
    open: (path: string): Promise<{ ok: boolean; error?: string }> => invoke('attachments:open', path)
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
    upsertTable: (input: { id?: number; name: string; zone: string; seats: number; posX: number; posY: number }): Promise<RestaurantTable> =>
      invoke('restaurant:upsertTable', input),
    deleteTable: (id: number): Promise<{ ok: boolean; error?: string }> => invoke('restaurant:deleteTable', id),
    mergeTables: (orderId: number, tableIds: number[]): Promise<RestaurantOrderResult> =>
      invoke('restaurant:mergeTables', orderId, tableIds),
    transferTable: (orderId: number, newTableId: number): Promise<RestaurantOrderResult> =>
      invoke('restaurant:transferTable', orderId, newTableId),
    openOrder: (input: OpenRestaurantOrderInput, userId: number): Promise<RestaurantOrderResult> =>
      invoke('restaurant:openOrder', input, userId),
    addItems: (orderId: number, items: RestaurantOrderItemInput[]): Promise<RestaurantOrderResult> =>
      invoke('restaurant:addItems', orderId, items),
    updateItem: (itemId: number, patch: { qty?: number; note?: string; splitGroup?: number }): Promise<void> =>
      invoke('restaurant:updateItem', itemId, patch),
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
      }
    ): Promise<void> => invoke('restaurant:updateOrderMeta', orderId, patch),
    removeItem: (itemId: number): Promise<void> => invoke('restaurant:removeItem', itemId),
    sendToKitchen: (orderId: number): Promise<{ ok: boolean; printedCount: number; error?: string }> =>
      invoke('restaurant:sendToKitchen', orderId),
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
    exportExcel: (report: ReportResult): Promise<ExportResult> => invoke('reports:exportExcel', report),
    exportPdf: (report: ReportResult): Promise<ExportResult> => invoke('reports:exportPdf', report),
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
    shiftSummary: (sessionId: number): Promise<PrintResult> => invoke('print:shiftSummary', sessionId),
    previewShiftSummary: (sessionId: number): Promise<PrintResult> =>
      invoke('print:previewShiftSummary', sessionId),
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
    connect: (clientId: string): Promise<GoogleAuthUrlResult> => invoke('googleDrive:connect', clientId),
    disconnect: (): Promise<void> => invoke('googleDrive:disconnect'),
    upload: (): Promise<BackupResult> => invoke('googleDrive:upload')
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
        role: 'local',
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
        role: 'local',
        serverRunning: false,
        connectedDeviceCount: 0,
        connectedToMain: false,
        localIpAddresses: []
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
