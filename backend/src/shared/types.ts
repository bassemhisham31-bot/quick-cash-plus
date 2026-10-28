// أنواع مشتركة بين عملية Main وواجهة Renderer (عقد الـ IPC)

export type Locale = 'ar' | 'en'
export type ThemeMode = 'light' | 'dark'

export interface SessionUser {
  id: number
  username: string
  fullName: string
  role: 'admin' | 'cashier'
  permissions: string[]
}

export interface LoginResult {
  ok: boolean
  user?: SessionUser
  error?: string
}

export interface Category {
  id: number
  name: string
  parentId: number | null
}

export interface Unit {
  id: number
  name: string
  factor: number
}

export type PriceTier = 'retail' | 'wholesale' | 'wholesale2' | 'pack'

export interface ProductPrices {
  wholesale: number | null
  wholesale2: number | null
  pack: number | null
}

export interface Product {
  id: number
  name: string
  barcode: string
  categoryId: number | null
  unitId: number | null
  vendorId: number | null
  costPrice: number
  retailPrice: number
  prices: ProductPrices
  quantity: number
  reorderPoint: number
  isActive: boolean
  expiryDate: string | null
  serialNumber: string | null
  showInPos: boolean
  serialTrackingEnabled: boolean
  imageDataUrl: string | null
}

export interface ProductInput {
  name: string
  barcode: string
  categoryId: number | null
  unitId: number | null
  vendorId: number | null
  costPrice: number
  retailPrice: number
  wholesalePrice: number
  wholesale2Price: number
  packPrice: number
  openingQuantity: number
  reorderPoint: number
  warehouseId: number
  expiryDate: string | null
  serialNumber: string | null
  showInPos: boolean
  serialTrackingEnabled: boolean
  imageDataUrl: string | null
}

export interface ProductUpdateInput {
  name: string
  barcode: string
  categoryId: number | null
  unitId: number | null
  vendorId: number | null
  costPrice: number
  retailPrice: number
  wholesalePrice: number
  wholesale2Price: number
  packPrice: number
  reorderPoint: number
  expiryDate: string | null
  serialNumber: string | null
  showInPos: boolean
  serialTrackingEnabled: boolean
  imageDataUrl: string | null
}

export type NotificationSeverity = 'critical' | 'warning'
export type NotificationTarget = 'inventory' | 'settings'

export interface NotificationItem {
  id: string
  severity: NotificationSeverity
  title: string
  message: string
  target: NotificationTarget
}

export interface ExpiringProductItem {
  id: number
  name: string
  expiryDate: string
  daysLeft: number
}

export interface Warehouse {
  id: number
  name: string
  isDefault: boolean
}

export interface TransferLineInput {
  productId: number
  qty: number
}

export interface TransferInput {
  fromWarehouseId: number
  toWarehouseId: number
  note: string
  lines: TransferLineInput[]
}

export interface TransferResult {
  ok: boolean
  error?: string
}

export interface PurchaseLineInput {
  productId: number
  name: string
  barcode: string
  qty: number
  purchasePrice: number
}

export interface PurchaseInvoiceInput {
  vendorId: number | null
  warehouseId: number
  lines: PurchaseLineInput[]
  paymentMethod: 'cash' | 'credit' | 'card' | 'wallet' | 'vodafone_cash' | 'instapay'
  paid: number
  note: string
}

export interface PurchaseInvoiceResult {
  ok: boolean
  purchaseId?: number
  number?: string
  total?: number
  error?: string
}

export interface PurchaseInvoiceListItem {
  id: number
  number: string
  vendorName: string
  total: number
  paid: number
  paymentMethod: string
  createdAt: string
}

export interface PurchaseInvoiceLine {
  productName: string
  barcode: string
  qty: number
  purchasePrice: number
  total: number
}

export interface PurchaseInvoiceLineDetail extends PurchaseInvoiceLine {
  purchaseItemId: number
  returnedQty: number
}

export interface PurchaseInvoiceView {
  id: number
  number: string
  vendorName: string
  warehouseName: string
  total: number
  paid: number
  paymentMethod: string
  status: 'completed' | 'partial_return' | 'returned'
  note: string | null
  createdAt: string
  cashierName: string
  lines: PurchaseInvoiceLineDetail[]
}

export interface ReturnPurchaseLineInput {
  purchaseItemId: number
  qty: number
}

export interface SalesReturnListRow {
  id: number
  invoiceId: number
  invoiceNumber: string
  customerName: string
  reasonNote: string | null
  amount: number
  createdAt: string
}

export interface PurchaseReturnListRow {
  id: number
  purchaseInvoiceId: number
  invoiceNumber: string
  vendorName: string
  reasonNote: string | null
  amount: number
  createdAt: string
}

export type StockPermitType = 'addition' | 'deduction'

export interface StockPermitLineInput {
  productId: number
  name: string
  barcode: string
  qty: number
  note: string
  /** سعر الصنف — اختياري (معلوماتي فقط، لا يعدّل بيانات المنتج) */
  unitPrice: number | null
  /** سيريال الصنف — اختياري */
  serialNumber: string | null
}

export interface StockPermitInput {
  type: StockPermitType
  warehouseId: number
  reason: string
  note: string
  lines: StockPermitLineInput[]
}

export interface StockPermitResult {
  ok: boolean
  permitId?: number
  number?: string
  error?: string
}

export interface StockPermitListItem {
  id: number
  number: string
  type: StockPermitType
  warehouseName: string
  reason: string | null
  totalQty: number
  userName: string
  createdAt: string
}

export interface StockPermitLine {
  productName: string
  barcode: string
  qty: number
  note: string | null
  unitPrice: number | null
  serialNumber: string | null
}

export interface StockPermitView {
  id: number
  number: string
  type: StockPermitType
  warehouseName: string
  reason: string | null
  note: string | null
  totalQty: number
  userName: string
  createdAt: string
  lines: StockPermitLine[]
}

/* ---------------------------- مديول المطاعم ---------------------------- */

export interface RestaurantTable {
  id: number
  name: string
  zone: string | null
  posX: number
  posY: number
  seats: number
  status: 'available' | 'occupied'
  currentOrderId: number | null
  /** auto = الشكل بيتحدد من عدد الكراسي */
  shape: RestaurantTableShape
  /** حجم الترابيزة دي لوحدها (1 = العادي، 0.5 = نص الحجم، 2 = الضعف) */
  sizeScale: number
  /** بيانات الطلب المفتوح على الترابيزة (لو مشغولة) — للعرض على مخطط الصالة */
  orderNumber?: string | null
  orderTotal?: number
  orderItemsCount?: number
  orderOpenedAt?: string | null
  orderGuestCount?: number | null
  orderKitchenStatus?: KitchenStatus | null
  /** الكاشير طبع الشيك (الحساب) — الترابيزة بتتلوّن أحمر */
  orderCheckPrinted?: boolean
}

export type RestaurantTableShape = 'auto' | 'round' | 'square' | 'rect'

export interface RestaurantTableInput {
  id?: number
  name: string
  zone: string
  seats: number
  posX: number
  posY: number
  shape?: RestaurantTableShape
  sizeScale?: number
}

/** إعدادات مخطط الصالة (مشتركة بين كل الأجهزة) — المساحة بوحدات افتراضية والمخطط كله بيتكبّر/يتصغّر على الشاشة */
export interface RestaurantFloorSettings {
  floorWidth: number
  floorHeight: number
  /** حجم كل الترابيزات مع بعض (بيتضرب في حجم كل ترابيزة لوحدها) */
  tableScale: number
  showLines: boolean
}

/** خط فاصل اختياري في الصالة — المكان والطول نسبة مئوية من مساحة الصالة */
export interface RestaurantFloorLine {
  id: number
  zone: string | null
  orientation: 'h' | 'v'
  posX: number
  posY: number
  length: number
  style: 'solid' | 'dashed'
  label: string | null
}

export interface RestaurantFloorLineInput {
  id?: number
  zone: string | null
  orientation: 'h' | 'v'
  posX: number
  posY: number
  length: number
  style: 'solid' | 'dashed'
  label: string | null
}

export interface RestaurantFloor {
  settings: RestaurantFloorSettings
  lines: RestaurantFloorLine[]
}

export type RestaurantOrderType = 'dine_in' | 'takeaway' | 'delivery'
export type RestaurantOrderStatus = 'open' | 'closed' | 'cancelled'
export type KitchenStatus = 'pending' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed'

export interface RestaurantOrderItemInput {
  productId: number
  name: string
  qty: number
  unitPrice: number
  note: string
  splitGroup?: number
}

export interface OpenRestaurantOrderInput {
  orderType: RestaurantOrderType
  tableIds?: number[]
  customerId?: number | null
  deliveryAddress?: string
  deliveryDriverId?: number | null
  captainId?: number | null
}

export interface RestaurantOrderResult {
  ok: boolean
  orderId?: number
  number?: string
  error?: string
}

export interface RestaurantOrderListItem {
  id: number
  number: string
  orderType: RestaurantOrderType
  status: RestaurantOrderStatus
  kitchenStatus: KitchenStatus
  tableNames: string[]
  itemsCount: number
  total: number
  createdAt: string
  customerName?: string | null
  customerPhone?: string | null
  deliveryAddress?: string | null
  deliveryFee?: number
  driverName?: string | null
  captainName?: string | null
  /** أسماء الأصناف وكمياتها (مختصرة) لعرضها في كارت الطلب */
  itemsPreview?: { name: string; qty: number }[]
}

export interface RestaurantOrderItemView {
  id: number
  productId: number
  productName: string
  qty: number
  unitPrice: number
  note: string | null
  splitGroup: number
  kitchenSent: boolean
  discountType: 'percent' | 'value'
  discountValue: number
}

export interface RestaurantOrderView {
  id: number
  number: string
  orderType: RestaurantOrderType
  status: RestaurantOrderStatus
  kitchenStatus: KitchenStatus
  tableIds: number[]
  tableNames: string[]
  customerId: number | null
  deliveryAddress: string | null
  deliveryDriverId: number | null
  deliveryFee: number
  specialMark: string | null
  guestCount: number | null
  orderNote: string | null
  captainId: number | null
  /** اسم عميل مكتوب يدويًا (لو العميل عابر) */
  customerLabel: string | null
  /** خصم على الطلب كله (قبل الضريبة والخدمة) */
  discountType: 'percent' | 'value'
  discountValue: number
  items: RestaurantOrderItemView[]
  createdAt: string
  checkPrintedAt: string | null
}

export interface CloseRestaurantOrderInput {
  orderId: number
  customerId: number | null
  customerLabel?: string
  warehouseId: number
  discountType: 'percent' | 'value'
  discountValue: number
  paymentMethod: PaymentMethod
  paid: number
  tipAmount?: number
  splitGroup?: number
}

export interface ShiftListRow {
  id: number
  cashierName: string
  closedByName: string | null
  openedAt: string
  closedAt: string | null
  openingBalance: number
  expectedCash: number | null
  actualCash: number | null
  cashDifference: number | null
  status: 'open' | 'closed'
}

export interface CategoryPrinter {
  categoryId: number
  categoryName: string
  printerName: string
}

export type DeliveryStatus = 'pending' | 'with_driver' | 'delivered'

export interface DeliveryZone {
  id: number
  name: string
  fee: number
  active: boolean
}

export interface DeliveryZoneInput {
  id?: number
  name: string
  fee: number
  active: boolean
}

export interface DeliveryOrderListRow {
  invoiceId: number
  invoiceNumber: string
  customerName: string
  customerPhone: string | null
  deliveryAddress: string | null
  specialMark: string | null
  itemsSummary: string
  driverId: number | null
  driverName: string | null
  deliveryFee: number
  total: number
  deliveryStatus: DeliveryStatus
  createdAt: string
}

export type ReservationStatus = 'confirmed' | 'seated' | 'cancelled' | 'no_show'

export interface TableReservation {
  id: number
  tableId: number | null
  tableName: string | null
  customerName: string
  customerPhone: string | null
  partySize: number
  reservationAt: string
  note: string | null
  status: ReservationStatus
}

export interface TableReservationInput {
  tableId?: number | null
  customerName: string
  customerPhone?: string
  partySize: number
  reservationAt: string
  note?: string
}

export interface DeliveryDriver {
  id: number
  name: string
  phone: string | null
  active: boolean
}

export interface Captain {
  id: number
  name: string
  phone: string | null
  active: boolean
}

export interface RestaurantSettings {
  dineInEnabled: boolean
  takeawayEnabled: boolean
  deliveryEnabled: boolean
  recipesEnabled: boolean
  serviceChargeEnabled: boolean
  serviceChargeType: 'percent' | 'value'
  serviceChargeValue: number
  defaultKitchenPrinter: string | null
  /** ضريبة المطعم — لو مفعّلة بتحل محل ضريبة البرنامج العامة لفواتير المطعم */
  taxEnabled: boolean
  taxName: string
  taxType: 'percent' | 'value'
  taxValue: number
  taxDineIn: boolean
  taxTakeaway: boolean
  taxDelivery: boolean
  /** بعد "للمطبخ" يفتح طلب جديد تلقائي (تيك أواي/ديلفري) أو يرجع لخريطة الترابيزات (صالة) */
  autoNewOrderAfterKitchen: boolean
  /** زرار إشعارات التجهيز 🍳 يظهر على: كل الأجهزة / الفرعي بس / الرئيسي بس / متوقف */
  kitchenNotifyMode: KitchenNotifyMode
}

export type KitchenNotifyMode = 'all' | 'sub_only' | 'main_only' | 'off'

export interface KitchenNotification {
  id: number
  orderId: number
  orderNumber: string
  orderType: string
  tableLabel: string | null
  captainName: string | null
  itemsSummary: string
  itemsCount: number
  sentByName: string | null
  createdAt: string
}

export interface RecipeItemInput {
  rawMaterialProductId: number
  qtyPerUnit: number
}

export interface RecipeItemView {
  rawMaterialProductId: number
  rawMaterialName: string
  qtyPerUnit: number
}

export interface KitchenTicketMeta {
  /** تذكرة معاد طباعتها (مش إرسال جديد) */
  reprint?: boolean
  orderNumber: string
  orderType: string
  tableLabel: string | null
  customerName: string | null
  customerPhone: string | null
  driverName: string | null
  deliveryAddress: string | null
  captainName: string | null
}

export type PaymentMethod = 'cash' | 'credit' | 'card' | 'wallet' | 'mixed' | 'vodafone_cash' | 'instapay'

export interface CartLine {
  productId: number
  name: string
  barcode: string
  unitPrice: number
  qty: number
  /** قيمة الخصم على السطر بالجنيه (محسوبة من discountType/discountValue) */
  discount: number
  /** نوع/قيمة الخصم اللي الكاشير كتبه على الصنف — بتتحول لـdiscount لما الكمية أو السعر يتغير */
  discountType?: 'percent' | 'value'
  discountValue?: number
  /** المخزن اللي الصنف بيتباع منه — لو فاضي بيتباع من مخزن الفاتورة */
  warehouseId?: number | null
  isTemp?: boolean
  serialNumber?: string | null
  note?: string | null
}

export interface CheckoutInput {
  customerId: number | null
  /** اسم مكتوب يدويًا عند الدفع — بيتسجل على الفاتورة لو العميل عابر (من غير ملف عميل) */
  customerLabel?: string
  warehouseId: number
  lines: CartLine[]
  discountType: 'percent' | 'value'
  discountValue: number
  paymentMethod: PaymentMethod
  paid: number
  redeemPoints: number
  salesRepId?: number | null
  vendorSettlementAmount?: number
  orderType?: RestaurantOrderType | 'retail'
  /** شاشة المطعم بتبيع حتى لو رصيد الصنف/الخامة صفر (الرصيد بيروح بالسالب) — البيع العادي لأ */
  allowNegativeStock?: boolean
  tableId?: number | null
  deliveryFee?: number
  deliveryDriverId?: number | null
  /** ديلفري من شاشة البيع العادية (المطعم بياخدهم من الطلب نفسه) */
  deliveryAddress?: string | null
  deliveryMark?: string | null
  captainId?: number | null
  serviceChargeType?: 'percent' | 'value'
  serviceChargeValue?: number
  /** لو متحدد بيحل محل ضريبة البرنامج العامة (بيستخدمه المطعم لما ضريبة المطعم تكون مفعّلة) */
  taxType?: 'percent' | 'value'
  taxValue?: number
  /** إكرامية (تيبس) من باقي العميل — بتدخل الدرج وبتظهر في إقفال الوردية (دفع نقدي بس) */
  tipAmount?: number
}

export interface CheckoutResult {
  ok: boolean
  invoiceId?: number
  invoiceNumber?: string
  total?: number
  error?: string
}

export interface InvoiceLineView {
  productName: string
  barcode: string
  qty: number
  unitPrice: number
  discount: number
  total: number
  serialNumber: string | null
  note: string | null
}

export interface InvoiceView {
  id: number
  number: string
  customerId: number
  customerName: string
  customerPhone: string | null
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paid: number
  paymentMethod: PaymentMethod
  status: 'completed' | 'returned' | 'partial_return'
  note: string | null
  createdAt: string
  cashierName: string
  lines: InvoiceLineDetail[]
  loyaltyPointsEarned: number
  loyaltyPointsRedeemed: number
  customerLoyaltyBalance: number | null
  customerBalanceBefore: number | null
  customerBalanceAfter: number | null
  orderType: string
  tableName: string | null
  deliveryDriverName: string | null
  deliveryAddress: string | null
  deliveryMark: string | null
  deliveryFee: number
  serviceChargeTotal: number
  captainName: string | null
}

export interface CustomerView {
  id: number
  name: string
  phone: string | null
  address: string | null
  balance: number
  loyaltyPoints: number
  loyaltyEnabled: boolean
  notes: string | null
  isWalkIn: boolean
  createdAt: string
  linkedVendorId: number | null
  linkedVendorName: string | null
  linkedVendorBalance: number | null
}

export interface CustomerInput {
  name: string
  phone: string
  address?: string
  notes: string
  openingBalance: number
  loyaltyEnabled?: boolean
}

export interface VendorView {
  id: number
  name: string
  phone: string | null
  address: string | null
  balance: number
  notes: string | null
  createdAt: string
  linkedCustomerId: number | null
  linkedCustomerName: string | null
}

export interface VendorInput {
  name: string
  phone: string
  address: string
  notes: string
  openingBalance: number
}

export type PartyType = 'customer' | 'vendor'

export interface PaymentInput {
  partyType: PartyType
  partyId: number
  amount: number
  method: PaymentMethod
  note: string
}

export interface StatementEntry {
  type: 'invoice' | 'payment' | 'opening'
  id: number
  date: string
  description: string
  debit: number
  credit: number
}

export interface StatementView {
  balance: number
  entries: StatementEntry[]
}

export interface InvoiceListItem {
  id: number
  number: string
  customerName: string
  total: number
  paid: number
  paymentMethod: PaymentMethod
  status: 'completed' | 'returned' | 'partial_return'
  createdAt: string
  deletedAt: string | null
}

export interface InvoiceListFilter {
  search: string
  dateFrom: string
  dateTo: string
  paymentMethod: PaymentMethod | 'all'
  includeDeleted: boolean
  serial?: string
}

export interface UpdateInvoiceInput {
  paymentMethod: PaymentMethod
  paid: number
  note: string
}

export interface ReturnLineInput {
  salesItemId: number
  qty: number
}

export interface ReturnResult {
  ok: boolean
  error?: string
  refundAmount?: number
  status?: 'returned' | 'partial_return'
}

export interface InvoiceLineDetail extends InvoiceLineView {
  salesItemId: number
  returnedQty: number
}

export interface DashboardSummary {
  todaySales: number
  todayInvoiceCount: number
  todayProfit: number
  lowStockCount: number
  expiringSoonCount: number
  dayIsOpen: boolean
}

export interface TopProductItem {
  productId: number
  name: string
  qty: number
  revenue: number
}

export interface PaymentMethodBreakdownItem {
  method: PaymentMethod
  total: number
}

export interface CategorySalesItem {
  categoryId: number | null
  categoryName: string
  total: number
}

export type ExpenseMethod = 'cash' | 'card' | 'wallet' | 'transfer'

export interface ExpenseCategory {
  id: number
  name: string
}

export interface ExpenseInput {
  categoryId: number | null
  amount: number
  method: ExpenseMethod
  note: string
  attachmentPath?: string | null
  attachmentName?: string | null
}

export interface ExpenseResult {
  ok: boolean
  error?: string
  expense?: ExpenseView
}

export interface ExpenseView {
  id: number
  categoryName: string
  amount: number
  method: ExpenseMethod
  note: string | null
  cashierName: string
  createdAt: string
  attachmentPath: string | null
  attachmentName: string | null
}

export interface ExpensesByMethodSummary {
  byMethod: { method: ExpenseMethod; total: number }[]
  totalExpenses: number
}

export interface Employee {
  id: number
  name: string
  phone: string | null
  role: string | null
  baseSalary: number
  active: boolean
}

export interface EmployeeInput {
  name: string
  phone: string
  role: string
  baseSalary: number
}

export type EmployeeTransactionType = 'salary' | 'bonus' | 'advance' | 'deduction' | 'damage'

export interface EmployeeTransactionInput {
  employeeId: number
  type: EmployeeTransactionType
  amount: number
  note: string
  periodId?: number | null
  attachmentPath?: string | null
  attachmentName?: string | null
}

export interface EmployeeTransactionView {
  id: number
  type: EmployeeTransactionType
  amount: number
  note: string | null
  createdAt: string
  periodId: number | null
  attachmentPath: string | null
  attachmentName: string | null
}

export type EmployeePayPeriodStatus = 'open' | 'closed'

export interface EmployeePayPeriod {
  id: number
  employeeId: number
  status: EmployeePayPeriodStatus
  startedAt: string
  closedAt: string | null
  note: string | null
}

export interface EmployeesSummary {
  totalBaseSalaryAllPeriods: number
  totalPaid: number
  totalWithdrawalsDeductionsDamage: number
  totalRemaining: number
}

export interface EmployeeLedger {
  employee: Employee
  totals: Record<EmployeeTransactionType, number>
  currentPeriod: EmployeePayPeriod | null
  currentPeriodTotals: Record<EmployeeTransactionType, number>
  periods: EmployeePayPeriod[]
  transactions: EmployeeTransactionView[]
}

export interface AttachFileResult {
  ok: boolean
  canceled?: boolean
  error?: string
  path?: string
  name?: string
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'expired'

export interface QuotationInput {
  customerId: number | null
  customerName: string
  lines: CartLine[]
  discountType: 'percent' | 'value'
  discountValue: number
  validUntil: string | null
  note: string
}

export interface QuotationListItem {
  id: number
  number: string
  customerName: string
  total: number
  status: QuotationStatus
  validUntil: string | null
  createdAt: string
}

export interface QuotationLineView {
  productName: string
  barcode: string
  qty: number
  unitPrice: number
  discount: number
  total: number
}

export interface QuotationView {
  id: number
  number: string
  customerId: number | null
  customerName: string
  subtotal: number
  discountTotal: number
  total: number
  status: QuotationStatus
  validUntil: string | null
  note: string | null
  createdAt: string
  cashierName: string
  lines: QuotationLineView[]
  convertedInvoiceId: number | null
}

export interface QuotationConvertResult {
  ok: boolean
  invoiceId?: number
  invoiceNumber?: string
  error?: string
}

export interface SalesRep {
  id: number
  name: string
  phone: string | null
  commissionPercent: number
  active: boolean
  createdAt: string
}

export interface SalesRepInput {
  name: string
  phone: string
  commissionPercent: number
}

export const REPORT_TYPES = [
  'inventory_status',
  'stocktake',
  'sales_detailed',
  'sales_summary',
  'vendors_report',
  'customers_analysis',
  'stock_movement',
  'stock_permits',
  'profit_loss',
  'monthly_expenses',
  'product_performance',
  'payment_methods',
  'tax_report',
  'financial_summary',
  'receivables_payables',
  'cash_drawer_sessions',
  'top_customers',
  'sales_by_employee',
  'sales_rep_commission',
  'purchases_last_price',
  'purchases_detailed',
  'account_statement',
  'restaurant_sales_by_order_type',
  'restaurant_recipe_consumption',
  'restaurant_table_activity',
  'category_sales_daily',
  'item_sales',
  'sales_by_captain'
] as const

export type ReportType = (typeof REPORT_TYPES)[number]

export interface OverviewMetric {
  value: number
  changePercent: number | null
}

export interface OverviewSummary {
  netProfitAfterExpenses: OverviewMetric
  totalExpenses: OverviewMetric
  totalReturns: OverviewMetric
  totalSales: OverviewMetric
  wholesaleSales: OverviewMetric
  vendorsDebt: number
  customersDebt: number
  stockValue: number
  periodFrom: string
  periodTo: string
}

export interface ReportFilter {
  dateFrom: string
  dateTo: string
  warehouseId: number | null
  serial?: string
  partyType?: 'customer' | 'vendor'
  partyId?: number
  /** تقرير مبيعات التصنيف اليومي: التصنيف (وتصنيفاته الفرعية). فاضي = كل التصنيفات */
  categoryId?: number
}

export interface ReportColumn {
  key: string
  label: string
  align?: 'start' | 'end'
  /** 'number' = عدد/كمية بدون رمز العملة. لو مش محدد بيتحدد من اسم العمود (isCountColumn). */
  format?: 'currency' | 'number'
}

/** أعمدة العدد/الكمية/النسب اللي المفروض تظهر رقم بس من غير ج.م */
/** قيمة خصم سطر بالجنيه: نسبة من (الكمية × السعر) أو مبلغ ثابت على السطر كله — مش بتزيد عن قيمة السطر */
export function lineDiscountAmount(
  qty: number,
  unitPrice: number,
  type: 'percent' | 'value' | undefined,
  value: number | undefined
): number {
  const gross = qty * unitPrice
  const v = Number(value) || 0
  if (v <= 0 || gross <= 0) return 0
  const amount = type === 'percent' ? gross * (Math.min(v, 100) / 100) : v
  return Math.round(Math.min(amount, gross) * 100) / 100
}

export function isCountColumn(col: ReportColumn): boolean {
  if (col.format) return col.format === 'number'
  return /عدد|كمية|الكمية|حد التنبيه|نقاط|نسبة|%|^#$/.test(col.label)
}

export interface ReportResult {
  title: string
  columns: ReportColumn[]
  rows: Record<string, string | number>[]
  totals?: Record<string, number>
}

export interface TaxSettings {
  enabled: boolean
  country: string
  taxNumber: string | null
  taxName: string
  rate: number
  eInvoiceEnabled: boolean
  qrEnabled: boolean
}

export type ExportFormat = 'pdf' | 'excel'

export interface ExportResult {
  ok: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

export interface ProductImportRowError {
  row: number
  message: string
}

export interface ProductImportResult {
  ok: boolean
  canceled?: boolean
  error?: string
  created: number
  updated: number
  rowErrors: ProductImportRowError[]
}

export interface BulkPriceUpdateItem {
  id: number
  costPrice: number
  retailPrice: number
  imageDataUrl: string | null
}

export interface BulkPriceUpdateResult {
  updated: number
}

export type PaperSize = '80mm' | '58mm' | 'A5' | 'A4'
export type PrintMode = 'auto' | 'manual'

export interface PrintSettings {
  defaultPrinter: string | null
  paperSize: PaperSize
  printMode: PrintMode
  showLogo: boolean
  autoPrintAfterSale: boolean
  copies: number
  thermalContentWidth80mm: number
  thermalContentWidth58mm: number
  thermalOffset80mm: number
  thermalOffset58mm: number
  thermalPageHeightMm: number
}

export type BarcodeLabelType = 'auto' | 'QR' | 'EAN8' | 'EAN13' | 'CODE128'

export interface BarcodeLabelSettings {
  labelType: BarcodeLabelType
  labelWidthMm: number
  labelHeightMm: number
  orientation: 'horizontal' | 'vertical'
  showName: boolean
  showPrice: boolean
  showBarcodeNumber: boolean
}

export interface DeviceSettings {
  scannerEnabled: boolean
  scannerTimeoutMs: number
  scaleBarcodeEnabled: boolean
  scalePrefix: string
  scaleCodeLength: number
  drawerPin: string
  openDrawerAfterSale: boolean
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface WeightBarcodeResult {
  matched: boolean
  productCode?: string
  weightGrams?: number
}

export interface PrintResult {
  ok: boolean
  error?: string
}

export type RemoteSupportAppName = 'anydesk' | 'teamviewer'

export interface RemoteSupportResult {
  ok: boolean
  error?: string
}

export type LicenseState = 'trial' | 'active' | 'expired'
export type LicensePlan = 'daily' | 'monthly' | 'yearly'

export interface LicenseStatus {
  deviceFingerprint: string
  /** تاريخ الجهاز اتغيّر للخلف — البرنامج مقفول لحد ما التاريخ يتصلّح */
  clockTampered?: boolean
  status: LicenseState
  plan: LicensePlan | null
  daysRemaining: number | null
  expiresAt: string | null
  disabledFeatures: string[]
}

export interface ActivateLicenseResult {
  ok: boolean
  error?: string
  status?: LicenseStatus
}

export interface BackupSettings {
  autoBackupEnabled: boolean
  backupFolder: string | null
  frequencyHours: number
  keepCount: number
  lastBackupAt: string | null
  googleDriveEnabled: boolean
  googleClientId: string | null
  googleAccountEmail: string | null
  lastCloudBackupAt: string | null
}

export interface PriceCheckerSyncSettings {
  enabled: boolean
  server: string | null
  port: number
  databaseName: string | null
  username: string | null
  password: string | null
  lastSyncAt: string | null
  lastSyncStatus: 'ok' | 'error' | null
  lastSyncError: string | null
}

export interface PriceCheckerSyncTestResult {
  ok: boolean
  error?: string
}

export interface BackupFileInfo {
  fileName: string
  filePath: string
  sizeBytes: number
  createdAt: string
}

export interface BackupResult {
  ok: boolean
  error?: string
  filePath?: string
}

export interface HeldInvoicePayload {
  lines: CartLine[]
  discountType: 'percent' | 'value'
  discountValue: number
  customerId: number | null
  customerLabel: string
  warehouseId: number | null
}

export interface HeldInvoiceInput {
  payload: HeldInvoicePayload
  total: number
  note?: string
}

export interface HeldInvoice {
  id: number
  userId: number | null
  userName: string | null
  customerLabel: string
  itemsCount: number
  total: number
  note: string | null
  createdAt: string
  payload: HeldInvoicePayload
}

export interface PosUiSettings {
  soundEnabled: boolean
  soundVolume: number
  allowTempItem: boolean
  priceEditEnabled: boolean
  /** أقصى نسبة خصم مسموحة للكاشير (الأدمن من غير حد) — بتتطبق على خصم الصنف وخصم الفاتورة */
  maxDiscountPercent: number
  /** السماح ببيع صنف رصيده صفر أو أقل من الكمية المطلوبة في البيع العادي (الرصيد بيروح بالسالب) */
  allowNegativeStock: boolean
  /** تعليق الفاتورة قبل الدفع للرجوع لها وطباعتها في أي وقت */
  holdInvoicesEnabled: boolean
  /** لو الكاشير خرج من شاشة البيع وفيها فاتورة ما اتحفظتش → تتعلّق تلقائيًا وتظهر في زرار تنبيه */
  autoHoldOnLeave: boolean
  multiWarehouseEnabled: boolean
  categorySidebarEnabled: boolean
  currencyCode: string
  currencySymbol: string
}

export interface DataResetResult {
  ok: boolean
  error?: string
  backupFilePath?: string
}

export interface GoogleAuthUrlResult {
  ok: boolean
  authUrl?: string
  error?: string
}

export interface StoreSettings {
  name: string
  phone: string | null
  address: string | null
  website: string | null
  thankYouMessage: string
  logoDataUrl: string | null
}

export type DeviceRole = 'standalone' | 'main' | 'sub'

export interface NetworkConfig {
  role: DeviceRole
  deviceName: string
  port: number
  connectionCode: string
  mainHost: string | null
  mainPort: number | null
  mainConnectionCode: string | null
}

export interface NetworkStatus {
  role: DeviceRole
  serverRunning: boolean
  connectedDeviceCount: number
  connectedToMain: boolean
  localIpAddresses: string[]
  /** سبب آخر فشل اتصال (للجهاز الفرعي) — لعرضه للمستخدم بدل "غير متصل" فقط */
  lastConnectionError: string | null
  /** خطأ تشغيل السيرفر على الجهاز الرئيسي (مثلاً البورت مستخدم) */
  serverError: string | null
}

export interface CashSessionSummary {
  sessionId: number
  openedAt: string
  openingBalance: number
  cashSales: number
  cashExpenses: number
  /** إكراميات نقدية في الوردية */
  tips: number
  /** تحصيلات الحجوزات في الوردية (كاش وغيره) — منفصلة عن المبيعات */
  eventPayments: number
  /** الجزء النقدي من تحصيلات الحجوزات */
  eventCashPayments: number
  expectedCash: number
}

export interface ShiftSummaryReport {
  sessionId: number
  openedAt: string
  closedAt: string | null
  cashierName: string
  closedByName: string | null
  openingBalance: number
  invoiceCount: number
  totalItemsSold: number
  /** إجمالي كل صنف اتباع في الوردية (للطباعة التفصيلية عند الإقفال) */
  itemsSold: { name: string; qty: number; total: number }[]
  totalSales: number
  salesByMethod: { method: PaymentMethod; total: number }[]
  /** إجمالي الإكراميات (تيبس) في الوردية */
  totalTips: number
  /** تحصيلات الحجوزات (عربون/دفعات − استرداد) — منفصلة عن المبيعات */
  totalEventPayments: number
  eventPaymentCount: number
  totalExpenses: number
  expensesByMethod: { method: ExpenseMethod; total: number }[]
  totalPurchases: number
  purchaseInvoiceCount: number
  totalReturns: number
  returnCount: number
  expectedCash: number | null
  actualCash: number | null
  cashDifference: number | null
}

export const PERMISSIONS = [
  'dashboard.view',
  'pos.sell',
  'inventory.manage',
  'invoices.manage',
  'customers.manage',
  'vendors.manage',
  'expenses.manage',
  'reports.view',
  'settings.manage',
  'users.manage',
  'sales_reps.manage',
  'pos.editPrice',
  'restaurant.manage',
  'pos.return',
  'pos.deleteItem',
  'pos.discount',
  'treasury.manage',
  'accounting.view',
  'accounting.manage',
  // صلاحية لكل شاشة (migration 053)
  'priceEditing.manage',
  'returns.manage',
  'shifts.view',
  'quotations.manage',
  'stockPermits.manage',
  'restaurant.tables',
  'restaurant.captains',
  'delivery.manage',
  'events.manage',
  'attendance.manage'
] as const

export type Permission = (typeof PERMISSIONS)[number]

export interface UserListItem {
  id: number
  username: string
  fullName: string
  role: 'admin' | 'cashier'
  active: boolean
  email: string | null
  permissionCount: number
}

export interface UserInput {
  username: string
  password: string
  fullName: string
  role: 'admin' | 'cashier'
  email?: string | null
  permissions: string[]
}

export interface UserUpdateInput {
  fullName: string
  role: 'admin' | 'cashier'
  active: boolean
  password: string | null
  email?: string | null
  permissions: string[]
}

export interface UserActivityEntry {
  id: number
  username: string
  action: string
  detail: string | null
  createdAt: string
}

export interface DeleteUserResult {
  ok: boolean
  deactivated: boolean
  error?: string
}

export interface LoyaltySettings {
  enabled: boolean
  pointsPerCurrency: number
  redemptionValue: number
}

export interface KeyboardShortcut {
  id: number
  actionKey: string
  label: string
  enabled: boolean
  useShift: boolean
  useAlt: boolean
  useCtrl: boolean
  key: string
  isCustom: boolean
}

export interface KeyboardShortcutInput {
  actionKey: string
  label: string
  useShift: boolean
  useAlt: boolean
  useCtrl: boolean
  key: string
}

export interface KeyboardShortcutPatch {
  enabled: boolean
  useShift: boolean
  useAlt: boolean
  useCtrl: boolean
  key: string
}

export type AssistantProvider = 'openai_compatible' | 'groq' | 'gemini' | 'openai'

export interface AssistantSettings {
  enabled: boolean
  floatingButtonEnabled: boolean
  storeAnalysisEnabled: boolean
  externalSearchEnabled: boolean
  provider: AssistantProvider
  modelName: string
  apiKey: string | null
  apiUrl: string
  allowedSections: string[]
  allowedUserIds: number[]
}

export interface AssistantConnectionTestResult {
  ok: boolean
  error?: string
}

export interface WhatsAppSettings {
  enabled: boolean
  sendOnSale: boolean
  sendInvoicePdf: boolean
  messageTemplate: string
}

export interface WhatsAppStatus {
  connected: boolean
  connecting: boolean
  qrDataUrl: string | null
  phoneNumber: string | null
  lastError: string | null
}

export interface WhatsAppSendResult {
  ok: boolean
  error?: string
}

export interface AssistantChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface AssistantSendMessageResult {
  ok: boolean
  reply?: string
  error?: string
}

/* ------------------------------ الخزائن والسندات ------------------------------ */

export type TreasuryKind = 'cash' | 'bank' | 'wallet'

export interface Treasury {
  id: number
  name: string
  kind: TreasuryKind
  openingBalance: number
  /** وسائل الدفع اللي بتتسجّل في الخزينة دي تلقائيًا (cash,card,wallet,vodafone_cash,instapay,transfer) */
  methods: string[]
  isDefault: boolean
  active: boolean
  balance: number
}

export interface TreasuryInput {
  name: string
  kind: TreasuryKind
  openingBalance: number
  methods: string[]
  active: boolean
}

export type VoucherType = 'receipt' | 'payment'
export type VoucherPartyType = 'customer' | 'vendor' | 'other'

export interface VoucherInput {
  type: VoucherType
  treasuryId: number
  amount: number
  partyType: VoucherPartyType
  partyId?: number | null
  /** اسم حر للطرف (لو "أخرى") */
  partyName?: string
  /** تصنيف المصروف (لسند صرف "أخرى") */
  categoryId?: number | null
  note?: string
}

export interface VoucherView {
  id: number
  number: string
  type: VoucherType
  treasuryId: number
  treasuryName: string
  amount: number
  partyType: VoucherPartyType
  partyName: string
  note: string | null
  userName: string | null
  createdAt: string
}

export interface TreasuryTransferInput {
  fromTreasuryId: number
  toTreasuryId: number
  amount: number
  note?: string
}

export interface TreasuryTransferView {
  id: number
  fromName: string
  toName: string
  amount: number
  note: string | null
  userName: string | null
  createdAt: string
}

export interface CashDifferenceRow {
  id: number
  sessionId: number
  treasuryName: string
  expected: number
  actual: number
  difference: number
  userName: string | null
  createdAt: string
}


/* ---------------------------- حجوزات المناسبات (أعياد الميلاد…) ---------------------------- */

export interface EventPackage {
  id: number
  name: string
  description: string | null
  price: number
  /** fixed = سعر ثابت للحجز، per_person = السعر × عدد الأفراد */
  priceType: 'fixed' | 'per_person'
  isActive: boolean
}

export interface EventPackageInput {
  id?: number
  name: string
  description?: string | null
  price: number
  priceType: 'fixed' | 'per_person'
  isActive?: boolean
}

export type EventBookingStatus = 'booked' | 'completed' | 'cancelled'

export interface EventBookingPayment {
  id: number
  bookingId: number
  /** موجب = عربون/دفعة، سالب = استرداد */
  amount: number
  method: PaymentMethod
  note: string | null
  createdAt: string
  userName: string | null
}

export interface EventBooking {
  id: number
  number: string
  customerId: number | null
  customerName: string
  customerPhone: string | null
  eventType: string
  honoree: string | null
  eventDate: string
  eventTime: string | null
  guests: number
  packageId: number | null
  packageName: string | null
  basePrice: number
  discount: number
  total: number
  paid: number
  remaining: number
  notes: string | null
  status: EventBookingStatus
  createdAt: string
  payments: EventBookingPayment[]
}

export interface EventBookingInput {
  id?: number
  customerId?: number | null
  customerName: string
  customerPhone?: string | null
  eventType: string
  honoree?: string | null
  eventDate: string
  eventTime?: string | null
  guests: number
  packageId?: number | null
  basePrice: number
  discount: number
  notes?: string | null
  /** عربون أولي بيتسجل مع الحجز (اختياري) */
  depositAmount?: number
  depositMethod?: PaymentMethod
}

/* ------------------------------ الحضور والانصراف (بصمة) ------------------------------ */

export type AttendanceDeviceType = 'hikvision' | 'zkteco'

export interface AttendanceSettingsInput {
  deviceType: AttendanceDeviceType
  deviceIp: string
  devicePort: number
  deviceUser: string
  devicePassword: string
  useHttps: boolean
  autoSyncMinutes: number
}

export interface AttendanceSettings {
  deviceType: AttendanceDeviceType
  deviceUser: string
  devicePassword: string
  useHttps: boolean
  deviceIp: string
  devicePort: number
  autoSyncMinutes: number
  lastSyncAt: string | null
  lastSyncError: string | null
}

export interface AttendanceSyncResult {
  ok: boolean
  error?: string
  fetched?: number
  added?: number
}

export interface AttendanceDeviceUser {
  deviceUserId: string
  name: string
}

export interface AttendanceEmployeeLink {
  employeeId: number
  name: string
  deviceUserId: string | null
  /** وردية الموظف (HH:MM) — null = يستخدم الوردية الافتراضية */
  shiftStart: string | null
  shiftEnd: string | null
  /** يوم الإجازة الأسبوعية (0=الأحد … 6=السبت) أو '' لو مفيش */
  weeklyOff: string
}

export interface AttendancePayrollRules {
  defaultShiftStart: string
  defaultShiftEnd: string
  /** دقائق السماح قبل ما التأخير يتحسب */
  graceMinutes: number
  /** معامل خصم التأخير/الخروج المبكر (1 = بسعر الساعة العادي) */
  lateMultiplier: number
  /** معامل خصم الغياب (1 = يوم واحد) */
  absenceMultiplier: number
  /** معامل الإضافي (0 = متعطّل) */
  overtimeMultiplier: number
  overtimeMinMinutes: number
  /** عدد أيام الشهر اللي بيتقسم عليها المرتب الأساسي */
  monthDays: number
}

export interface AttendancePayrollDay {
  day: string
  kind: 'absent' | 'present'
  firstIn: string | null
  lastOut: string | null
  lateMinutes: number
  earlyMinutes: number
  overtimeMinutes: number
  /** بصمة واحدة بس في اليوم — الخروج المبكر والإضافي مش بيتحسبوا */
  incomplete: boolean
}

export interface AttendancePayrollRow {
  employeeId: number
  name: string
  baseSalary: number
  absentDays: number
  lateMinutes: number
  earlyMinutes: number
  overtimeMinutes: number
  incompleteDays: number
  lateDeduction: number
  earlyDeduction: number
  absenceDeduction: number
  totalDeduction: number
  overtimeBonus: number
  /** الفترة دي (أو جزء منها) اتعتمدت قبل كده لنفس الموظف */
  alreadyApproved: boolean
  days: AttendancePayrollDay[]
}

export interface AttendancePayrollApproval {
  employeeId: number
  deduction: number
  bonus: number
  note: string
}

export interface AttendanceDayRow {
  day: string
  deviceUserId: string
  employeeId: number | null
  employeeName: string
  firstIn: string
  lastOut: string | null
  punches: number
  /** ساعات العمل (آخر بصمة - أول بصمة) — null لو بصمة واحدة بس */
  hours: number | null
  punchTimes: string[]
}
