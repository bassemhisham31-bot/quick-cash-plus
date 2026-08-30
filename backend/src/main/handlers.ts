import { login } from './services/auth'
import {
  bulkCreateProducts,
  bulkUpdatePricesAndImages,
  createCategory,
  createProduct,
  createUnit,
  createWarehouse,
  deleteProduct,
  listCategories,
  listProducts,
  listUnits,
  listWarehouses,
  updateProduct
} from './services/catalog'
import { checkout } from './services/pos'
import {
  deleteDeliveryZone,
  listDeliveryOrders,
  listDeliveryZones,
  reassignDeliveryDriver,
  updateDeliveryStatus,
  upsertDeliveryZone
} from './services/deliveryTracking'
import { createReservation, deleteReservation, listReservations, updateReservationStatus } from './services/reservations'
import {
  createUser,
  deleteUser,
  getUserPermissions,
  listUserActivity,
  listUsers,
  updateUser
} from './services/users'
import { createCustomShortcut, deleteShortcut, listShortcuts, updateShortcut } from './services/shortcuts'
import { testAssistantConnection } from './services/assistant'
import { clearChatHistory, getChatHistory, sendAssistantMessage } from './services/assistantChat'
import { transferStock } from './services/stockTransfer'
import {
  createPurchaseInvoice,
  getPurchaseInvoiceView,
  listPurchaseInvoices,
  listPurchaseReturns,
  returnPurchaseLines
} from './services/purchases'
import { createStockPermit, deleteStockPermit, getStockPermitView, listStockPermits } from './services/stockPermits'
import {
  deleteInvoice,
  getInvoiceView,
  getReceiptQr,
  listInvoices,
  listSalesReturns,
  restoreInvoice,
  returnInvoiceLines,
  updateInvoice
} from './services/invoices'
import { getOverviewSummary, runReport } from './services/reports'
import {
  deleteCaptain,
  deleteDeliveryDriver,
  getAssistantSettings,
  getBackupSettings,
  getBarcodeLabelSettings,
  getCategoryPrinters,
  getDeviceSettings,
  getLoyaltySettings,
  getPrintSettings,
  getPosUiSettings,
  getPriceCheckerSyncSettings,
  getRestaurantSettings,
  getStoreSettings,
  getSystemPrinters,
  getTaxSettings,
  listCaptains,
  listDeliveryDrivers,
  setCategoryPrinter,
  updateAssistantSettings,
  updatePosUiSettings,
  updateBackupSettings,
  updateBarcodeLabelSettings,
  updateDeviceSettings,
  updateLoyaltySettings,
  updatePrintSettings,
  updateRestaurantSettings,
  updateStoreSettings,
  updateTaxSettings,
  upsertCaptain,
  upsertDeliveryDriver,
  getWhatsAppSettings,
  updateWhatsAppSettings
} from './services/settings'
import { generateBarcodeDataUrl, decodeWeightBarcode } from './services/barcode'
import { activateLicense, getLicenseStatus } from './services/license'
import { listBackups, restoreBackup, runLocalBackup, scheduleAutoBackup } from './services/backup'
import {
  saveAndReschedulePriceCheckerSync,
  syncPriceCheckerNow,
  testPriceCheckerConnection
} from './services/priceCheckerSync'
import {
  factoryReset,
  resetAssistantChat,
  resetCategories,
  resetCustomers,
  resetExpenses,
  resetProducts,
  resetSales,
  resetVendors
} from './services/dataReset'
import { closeDay, getCurrentSessionSummary, getOpenSession, listShifts, openDay } from './services/cashSession'
import {
  getDashboardSummary,
  getExpiringProducts,
  getTopSellingProducts,
  getPaymentMethodsBreakdown,
  getSalesByCategory
} from './services/dashboard'
import { getNotifications } from './services/notifications'
import {
  createCustomer,
  getCustomerStatement,
  linkCustomerVendor,
  listCustomers,
  recordCustomerPayment,
  unlinkCustomerVendor,
  updateCustomerLoyaltyEnabled
} from './services/customers'
import {
  createVendor,
  getVendorStatement,
  listUnpaidPurchaseInvoices,
  listVendors,
  recordVendorPayment
} from './services/vendors'
import {
  createExpense,
  createExpenseCategory,
  getExpensesByMethodSummary,
  listExpenseCategories,
  listExpenses
} from './services/expenses'
import {
  createEmployee,
  deleteEmployeeTransaction,
  getEmployeeLedger,
  getEmployeesSummary,
  listEmployees,
  recordEmployeeTransaction,
  startNewPeriod,
  updateEmployeeTransaction
} from './services/employees'
import { createSalesRep, listSalesReps, setSalesRepActive, updateSalesRep } from './services/salesReps'
import {
  convertQuotationToInvoice,
  createQuotation,
  getQuotationView,
  listQuotations,
  updateQuotationStatus
} from './services/quotations'
import {
  addItemsToOrder,
  cancelOrder,
  closeOrder,
  deleteTable,
  getOrderView,
  listOpenOrders,
  listTables,
  mergeTables,
  openOrder,
  removeOrderItem,
  sendToKitchen,
  setKitchenStatus,
  transferTable,
  updateOrderItem,
  updateOrderMeta,
  upsertTable
} from './services/restaurant'
import { getRecipe, setRecipe } from './services/recipes'
import { printKitchenTicket } from './services/print'
import type {
  AssistantSettings,
  BackupSettings,
  BarcodeLabelSettings,
  BarcodeLabelType,
  BulkPriceUpdateItem,
  CheckoutInput,
  CloseRestaurantOrderInput,
  CustomerInput,
  DeviceSettings,
  EmployeeInput,
  EmployeeTransactionInput,
  ExpenseInput,
  InvoiceListFilter,
  KeyboardShortcutInput,
  KeyboardShortcutPatch,
  KitchenTicketMeta,
  LoyaltySettings,
  OpenRestaurantOrderInput,
  PaymentMethod,
  PrintSettings,
  ProductInput,
  ProductUpdateInput,
  PurchaseInvoiceInput,
  RecipeItemInput,
  ReportFilter,
  PosUiSettings,
  PriceCheckerSyncSettings,
  ReportResult,
  ReportType,
  RestaurantOrderItemInput,
  RestaurantSettings,
  QuotationInput,
  DeliveryStatus,
  DeliveryZoneInput,
  ReservationStatus,
  TableReservationInput,
  ReturnLineInput,
  ReturnPurchaseLineInput,
  SalesRepInput,
  StockPermitInput,
  StockPermitType,
  StoreSettings,
  TaxSettings,
  TransferInput,
  UpdateInvoiceInput,
  UserInput,
  UserUpdateInput,
  VendorInput,
  WhatsAppSettings
} from '../shared/types'

export type ChannelHandler = (...args: any[]) => Promise<any> | any

/**
 * جدول موحّد لكل عمليات البرنامج: channel -> دالة تنفيذ.
 * يُستخدم من طبقتين مختلفتين: ipcMain.handle على الجهاز نفسه، وخادم WebSocket
 * عند تلقّي طلب من جهاز فرعي — بدون ازدواج أي منطق.
 */
export function buildHandlerMap(): Record<string, ChannelHandler> {
  return {
    'auth:login': (username: string, password: string) => login(username, password),

    'catalog:listCategories': () => listCategories(),
    'catalog:createCategory': (name: string, parentId: number | null) => createCategory(name, parentId),
    'catalog:listUnits': () => listUnits(),
    'catalog:createUnit': (name: string, factor: number) => createUnit(name, factor),
    'catalog:listProducts': (search: string, warehouseId?: number) => listProducts(search, warehouseId),
    'catalog:createProduct': (input: ProductInput) => createProduct(input),
    'catalog:updateProduct': (id: number, input: ProductUpdateInput) => updateProduct(id, input),
    'catalog:deleteProduct': (id: number) => deleteProduct(id),
    'catalog:listWarehouses': () => listWarehouses(),
    'catalog:createWarehouse': (name: string) => createWarehouse(name),
    'catalog:bulkUpdatePricesAndImages': (items: BulkPriceUpdateItem[]) => bulkUpdatePricesAndImages(items),
    'catalog:bulkCreateProducts': (inputs: ProductInput[]) => bulkCreateProducts(inputs),

    'users:list': () => listUsers(),
    'users:getPermissions': (id: number) => getUserPermissions(id),
    'users:create': (input: UserInput) => createUser(input),
    'users:update': (id: number, input: UserUpdateInput) => updateUser(id, input),
    'users:delete': (id: number, currentUserId: number) => deleteUser(id, currentUserId),
    'users:listActivity': (limit?: number) => listUserActivity(limit),

    'shortcuts:list': () => listShortcuts(),
    'shortcuts:update': (id: number, patch: KeyboardShortcutPatch) => updateShortcut(id, patch),
    'shortcuts:create': (input: KeyboardShortcutInput) => createCustomShortcut(input),
    'shortcuts:delete': (id: number) => deleteShortcut(id),

    'pos:checkout': (input: CheckoutInput, cashierId: number) => checkout(input, cashierId),

    'invoices:getView': (invoiceId: number) => getInvoiceView(invoiceId),
    'invoices:list': (filter: InvoiceListFilter) => listInvoices(filter),
    'invoices:delete': (invoiceId: number, userId: number) => deleteInvoice(invoiceId, userId),
    'invoices:restore': (invoiceId: number, userId: number) => restoreInvoice(invoiceId, userId),
    'invoices:update': (invoiceId: number, input: UpdateInvoiceInput, userId: number) =>
      updateInvoice(invoiceId, input, userId),
    'invoices:returnLines': (invoiceId: number, lines: ReturnLineInput[], userId: number) =>
      returnInvoiceLines(invoiceId, lines, userId),
    'invoices:getReceiptQr': (invoiceId: number) => getReceiptQr(invoiceId),
    'invoices:listReturns': (filter?: { from?: string; to?: string }) => listSalesReturns(filter ?? {}),

    'cash:getOpenSession': () => getOpenSession(),
    'cash:openDay': (userId: number, openingBalance: number) => openDay(userId, openingBalance),
    'cash:closeDay': (userId: number, actualCash: number) => closeDay(userId, actualCash),
    'cash:getSummary': () => getCurrentSessionSummary(),
    'cash:listShifts': (filter?: { from?: string; to?: string }) => listShifts(filter ?? {}),

    'dashboard:getSummary': () => getDashboardSummary(),
    'dashboard:getExpiringSoon': (limit?: number) => getExpiringProducts(limit),
    'dashboard:getTopProducts': (limit?: number) => getTopSellingProducts(limit),
    'dashboard:getPaymentMethodsBreakdown': () => getPaymentMethodsBreakdown(),
    'dashboard:getSalesByCategory': () => getSalesByCategory(),

    'notifications:list': () => getNotifications(),

    'customers:list': (search: string) => listCustomers(search),
    'customers:create': (input: CustomerInput) => createCustomer(input),
    'customers:getStatement': (customerId: number) => getCustomerStatement(customerId),
    'customers:recordPayment': (customerId: number, amount: number, method: PaymentMethod, note: string, userId: number) =>
      recordCustomerPayment(customerId, amount, method, note, userId),
    'customers:updateLoyaltyEnabled': (customerId: number, enabled: boolean) =>
      updateCustomerLoyaltyEnabled(customerId, enabled),
    'customers:linkVendor': (customerId: number, vendorId: number) => linkCustomerVendor(customerId, vendorId),
    'customers:unlinkVendor': (customerId: number) => unlinkCustomerVendor(customerId),

    'vendors:list': (search: string) => listVendors(search),
    'vendors:create': (input: VendorInput) => createVendor(input),
    'vendors:getStatement': (vendorId: number) => getVendorStatement(vendorId),
    'vendors:recordPayment': (
      vendorId: number,
      amount: number,
      method: PaymentMethod,
      note: string,
      userId: number,
      invoiceId?: number | null
    ) => recordVendorPayment(vendorId, amount, method, note, userId, invoiceId),
    'vendors:listUnpaidInvoices': (vendorId: number) => listUnpaidPurchaseInvoices(vendorId),

    'stock:transfer': (input: TransferInput, userId: number) => transferStock(input, userId),

    'purchases:create': (input: PurchaseInvoiceInput, userId: number) => createPurchaseInvoice(input, userId),
    'purchases:list': () => listPurchaseInvoices(),
    'purchases:getView': (purchaseId: number) => getPurchaseInvoiceView(purchaseId),
    'purchases:returnLines': (purchaseId: number, lines: ReturnPurchaseLineInput[], userId: number) =>
      returnPurchaseLines(purchaseId, lines, userId),
    'purchases:listReturns': (filter?: { from?: string; to?: string }) => listPurchaseReturns(filter ?? {}),

    'stockPermits:create': (input: StockPermitInput, userId: number) => createStockPermit(input, userId),
    'stockPermits:list': (type?: StockPermitType) => listStockPermits(type),
    'stockPermits:getView': (permitId: number) => getStockPermitView(permitId),
    'stockPermits:delete': (permitId: number, userId: number) => deleteStockPermit(permitId, userId),

    'expenses:listCategories': () => listExpenseCategories(),
    'expenses:createCategory': (name: string) => createExpenseCategory(name),
    'expenses:list': (limit?: number) => listExpenses(limit),
    'expenses:create': (input: ExpenseInput, userId: number) => createExpense(input, userId),
    'expenses:byMethodSummary': () => getExpensesByMethodSummary(),

    'employees:list': () => listEmployees(),
    'employees:create': (input: EmployeeInput) => createEmployee(input),
    'employees:recordTransaction': (input: EmployeeTransactionInput, userId: number) =>
      recordEmployeeTransaction(input, userId),
    'employees:updateTransaction': (transactionId: number, input: { amount: number; note: string }) =>
      updateEmployeeTransaction(transactionId, input),
    'employees:deleteTransaction': (transactionId: number) => deleteEmployeeTransaction(transactionId),
    'employees:startNewPeriod': (employeeId: number, note?: string) => startNewPeriod(employeeId, note),
    'employees:getLedger': (employeeId: number) => getEmployeeLedger(employeeId),
    'employees:getSummary': () => getEmployeesSummary(),


    'salesReps:list': (includeInactive: boolean) => listSalesReps(includeInactive),
    'salesReps:create': (input: SalesRepInput) => createSalesRep(input),
    'salesReps:update': (id: number, input: SalesRepInput) => updateSalesRep(id, input),
    'salesReps:setActive': (id: number, active: boolean) => setSalesRepActive(id, active),

    'quotations:create': (input: QuotationInput, userId: number) => createQuotation(input, userId),
    'quotations:list': () => listQuotations(),
    'quotations:getView': (quotationId: number) => getQuotationView(quotationId),
    'quotations:updateStatus': (quotationId: number, status: 'draft' | 'sent' | 'expired') =>
      updateQuotationStatus(quotationId, status),
    'quotations:convertToInvoice': (
      quotationId: number,
      options: { warehouseId: number; paymentMethod: PaymentMethod; paid: number },
      userId: number
    ) => convertQuotationToInvoice(quotationId, options, userId),

    'restaurant:listTables': () => listTables(),
    'restaurant:upsertTable': (input: { id?: number; name: string; zone: string; seats: number; posX: number; posY: number }) =>
      upsertTable(input),
    'restaurant:deleteTable': (id: number) => deleteTable(id),
    'restaurant:mergeTables': (orderId: number, tableIds: number[]) => mergeTables(orderId, tableIds),
    'restaurant:transferTable': (orderId: number, newTableId: number) => transferTable(orderId, newTableId),
    'restaurant:openOrder': (input: OpenRestaurantOrderInput, userId: number) => openOrder(input, userId),
    'restaurant:addItems': (orderId: number, items: RestaurantOrderItemInput[]) => addItemsToOrder(orderId, items),
    'restaurant:updateItem': (itemId: number, patch: { qty?: number; note?: string; splitGroup?: number }) =>
      updateOrderItem(itemId, patch),
    'restaurant:updateOrderMeta': (
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
    ) => updateOrderMeta(orderId, patch),
    'restaurant:removeItem': (itemId: number) => removeOrderItem(itemId),
    'restaurant:sendToKitchen': (orderId: number) => sendToKitchen(orderId),
    'restaurant:setKitchenStatus': (orderId: number, status: string) => setKitchenStatus(orderId, status),
    'restaurant:listOpenOrders': () => listOpenOrders(),
    'restaurant:getOrderView': (orderId: number) => getOrderView(orderId),
    'restaurant:closeOrder': (input: CloseRestaurantOrderInput, userId: number) => closeOrder(input, userId),
    'restaurant:cancelOrder': (orderId: number) => cancelOrder(orderId),

    'recipes:get': (productId: number) => getRecipe(productId),
    'recipes:set': (productId: number, items: RecipeItemInput[]) => setRecipe(productId, items),

    'reports:run': (type: ReportType, filter: ReportFilter) => runReport(type, filter),
    'reports:overview': (filter: ReportFilter) => getOverviewSummary(filter),

    'settings:getTax': () => getTaxSettings(),
    'settings:updateTax': (input: TaxSettings) => updateTaxSettings(input),
    'settings:getPrint': () => getPrintSettings(),
    'settings:updatePrint': (input: PrintSettings) => updatePrintSettings(input),
    'settings:getBarcodeLabel': () => getBarcodeLabelSettings(),
    'settings:updateBarcodeLabel': (input: BarcodeLabelSettings) => updateBarcodeLabelSettings(input),
    'settings:getDevice': () => getDeviceSettings(),
    'settings:updateDevice': (input: DeviceSettings) => updateDeviceSettings(input),
    'settings:getPrinters': () => getSystemPrinters(),
    'settings:getStore': () => getStoreSettings(),
    'settings:updateStore': (input: StoreSettings) => updateStoreSettings(input),
    'settings:getLoyalty': () => getLoyaltySettings(),
    'settings:updateLoyalty': (input: LoyaltySettings) => updateLoyaltySettings(input),
    'settings:getAssistant': () => getAssistantSettings(),
    'settings:updateAssistant': (input: AssistantSettings) => updateAssistantSettings(input),
    'settings:getPosUi': () => getPosUiSettings(),
    'settings:updatePosUi': (input: PosUiSettings) => updatePosUiSettings(input),
    'settings:getRestaurant': () => getRestaurantSettings(),
    'settings:updateRestaurant': (input: RestaurantSettings) => updateRestaurantSettings(input),
    'settings:getCategoryPrinters': () => getCategoryPrinters(),
    'settings:setCategoryPrinter': (categoryId: number, printerName: string | null) => setCategoryPrinter(categoryId, printerName),
    'settings:listDeliveryDrivers': (includeInactive?: boolean) => listDeliveryDrivers(includeInactive),
    'settings:upsertDeliveryDriver': (input: { id?: number; name: string; phone: string; active: boolean }) =>
      upsertDeliveryDriver(input),
    'settings:deleteDeliveryDriver': (id: number) => deleteDeliveryDriver(id),
    'settings:listCaptains': (includeInactive?: boolean) => listCaptains(includeInactive),
    'settings:upsertCaptain': (input: { id?: number; name: string; phone: string; active: boolean }) => upsertCaptain(input),
    'settings:deleteCaptain': (id: number) => deleteCaptain(id),

    'delivery:listZones': (includeInactive?: boolean) => listDeliveryZones(includeInactive),
    'delivery:upsertZone': (input: DeliveryZoneInput) => upsertDeliveryZone(input),
    'delivery:deleteZone': (id: number) => deleteDeliveryZone(id),
    'delivery:listOrders': (filter?: { from?: string; to?: string }) => listDeliveryOrders(filter ?? {}),
    'delivery:updateStatus': (invoiceId: number, status: DeliveryStatus) => updateDeliveryStatus(invoiceId, status),
    'delivery:reassignDriver': (invoiceId: number, driverId: number | null) => reassignDeliveryDriver(invoiceId, driverId),

    'reservations:list': (filter?: { from?: string; to?: string }) => listReservations(filter ?? {}),
    'reservations:create': (input: TableReservationInput) => createReservation(input),
    'reservations:updateStatus': (id: number, status: ReservationStatus) => updateReservationStatus(id, status),
    'reservations:delete': (id: number) => deleteReservation(id),

    'assistant:testConnection': () => testAssistantConnection(),
    'assistant:sendMessage': (userId: number, message: string) => sendAssistantMessage(userId, message),
    'assistant:getHistory': (userId: number) => getChatHistory(userId),
    'assistant:clearHistory': (userId: number) => clearChatHistory(userId),

    'settings:getWhatsApp': () => getWhatsAppSettings(),
    'settings:updateWhatsApp': (input: WhatsAppSettings) => updateWhatsAppSettings(input),

    'barcode:generate': (value: string, type?: BarcodeLabelType) => generateBarcodeDataUrl(value, type),
    'barcode:decodeWeight': async (barcode: string) => decodeWeightBarcode(barcode, await getDeviceSettings()),

    'print:kitchenTicket': (
      meta: KitchenTicketMeta,
      printerName: string | null,
      items: { name: string; qty: number; note: string | null }[]
    ) => printKitchenTicket(meta, printerName, items),

    'license:getStatus': () => getLicenseStatus(),
    'license:activate': (key: string) => activateLicense(key),

    'backup:getSettings': () => getBackupSettings(),
    'backup:updateSettings': async (
      input: Pick<BackupSettings, 'autoBackupEnabled' | 'backupFolder' | 'frequencyHours' | 'keepCount'>
    ) => {
      const result = await updateBackupSettings(input)
      scheduleAutoBackup()
      return result
    },
    'backup:runNow': () => runLocalBackup(),
    'backup:list': () => listBackups(),
    'backup:restore': (filePath: string) => restoreBackup(filePath),

    'priceCheckerSync:get': () => getPriceCheckerSyncSettings(),
    'priceCheckerSync:update': (
      input: Pick<PriceCheckerSyncSettings, 'enabled' | 'server' | 'port' | 'databaseName' | 'username' | 'password'>
    ) => saveAndReschedulePriceCheckerSync(input),
    'priceCheckerSync:test': (
      input: Pick<PriceCheckerSyncSettings, 'server' | 'port' | 'databaseName' | 'username' | 'password'>
    ) => testPriceCheckerConnection(input),
    'priceCheckerSync:syncNow': () => syncPriceCheckerNow(),

    'dataReset:customers': (userId: number) => resetCustomers(userId),
    'dataReset:products': (userId: number) => resetProducts(userId),
    'dataReset:sales': (userId: number) => resetSales(userId),
    'dataReset:vendors': (userId: number) => resetVendors(userId),
    'dataReset:categories': (userId: number) => resetCategories(userId),
    'dataReset:expenses': (userId: number) => resetExpenses(userId),
    'dataReset:assistantChat': (userId: number) => resetAssistantChat(userId),
    'dataReset:factoryReset': (userId: number) => factoryReset(userId)
  }
}

/** القنوات اللي بتغيّر بيانات فعليًا — مشتركة مع طبقة الـHTTP/WebSocket لتسجيل نشاط المستخدمين. */
export { MUTATING_CHANNELS } from '../shared/mutatingChannels'
