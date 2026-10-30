import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { createClient, type Client } from '@libsql/client'
import { migration001Init } from './migrations/001_init'
import { migration002CustomersVendorsInvoices } from './migrations/002_customers_vendors_invoices'
import { migration003PricingWarehousesPurchases } from './migrations/003_pricing_warehouses_purchases'
import { migration004ExpensesEmployees } from './migrations/004_expenses_employees'
import { migration005TaxSettings } from './migrations/005_tax_settings'
import { migration006PrintDeviceSettings } from './migrations/006_print_device_settings'
import { migration007LicenseBackup } from './migrations/007_license_backup'
import { migration008StoreSettings } from './migrations/008_store_settings'
import { migration009UserActivityLog } from './migrations/009_user_activity_log'
import { migration010ProductExpirySerial } from './migrations/010_product_expiry_serial'
import { migration011LoyaltySettings } from './migrations/011_loyalty_settings'
import { migration012KeyboardShortcuts } from './migrations/012_keyboard_shortcuts'
import { migration013InvoiceLoyaltyPoints } from './migrations/013_invoice_loyalty_points'
import { migration014AssistantSettings } from './migrations/014_assistant_settings'
import { migration015VendorPaymentInvoiceLink } from './migrations/015_vendor_payment_invoice_link'
import { migration016CustomerLoyaltyToggle } from './migrations/016_customer_loyalty_toggle'
import { migration017SalesReps } from './migrations/017_sales_reps'
import { migration018Quotations } from './migrations/018_quotations'
import { migration019PartyLinkSettlement } from './migrations/019_party_link_settlement'
import { migration020PaymentMethodsWallets } from './migrations/020_payment_methods_wallets'
import { migration021PosUiSettings } from './migrations/021_pos_ui_settings'
import { migration022EmployeePayPeriods } from './migrations/022_employee_pay_periods'
import { migration023ExpenseAttachments } from './migrations/023_expense_attachments'
import { migration024ProductShowInPos } from './migrations/024_product_show_in_pos'
import { migration025SerialAtSale } from './migrations/025_serial_at_sale'
import { migration026StockPermits } from './migrations/026_stock_permits'
import { migration027AssistantChat } from './migrations/027_assistant_chat'
import { migration028ProductImage } from './migrations/028_product_image'
import { migration029PriceCheckerSync } from './migrations/029_price_checker_sync'
import { migration030PrintCopies } from './migrations/030_print_copies'
import { migration031ProductVendorLicenseFeatures } from './migrations/031_product_vendor_license_features'
import { migration032ThermalPrintCalibration } from './migrations/032_thermal_print_calibration'
import { migration033WhatsAppSettings } from './migrations/033_whatsapp_settings'
import { migration034ThermalPageHeight } from './migrations/034_thermal_page_height'
import { migration035ThermalCalibrationPhysicalMargin } from './migrations/035_thermal_calibration_physical_margin'
import { migration036RestaurantCore } from './migrations/036_restaurant_core'
import { migration037RestaurantRecipes } from './migrations/037_restaurant_recipes'
import { migration038RestaurantCaptains } from './migrations/038_restaurant_captains'
import { migration039RestaurantDeliveryExtras } from './migrations/039_restaurant_delivery_extras'
import { migration040CustomerAddress } from './migrations/040_customer_address'
import { migration041PurchaseReturns } from './migrations/041_purchase_returns'
import { migration042DeliveryTracking } from './migrations/042_delivery_tracking'
import { migration043SalesItemNote } from './migrations/043_sales_item_note'
import { migration044OrderGuestCountNote } from './migrations/044_order_guest_count_note'
import { migration045TableReservations } from './migrations/045_table_reservations'
import { migration046WhatsAppInvoicePdf } from './migrations/046_whatsapp_invoice_pdf'
import { migration047StockPermitPriceSerial } from './migrations/047_stock_permit_price_serial'
import { migration048TableShape } from './migrations/048_table_shape'
import { migration049RestaurantTaxKitchenNotifications } from './migrations/049_restaurant_tax_kitchen_notifications'
import { migration050KitchenNotifyMode } from './migrations/050_kitchen_notify_mode'
import { migration051FloorLayout } from './migrations/051_floor_layout'
import { migration052InvoiceDeliveryAddress } from './migrations/052_invoice_delivery_address'
import { migration053PerViewPermissions } from './migrations/053_per_view_permissions'
import { migration054OrderItemDiscount } from './migrations/054_order_item_discount'
import { migration055DiscountPermission } from './migrations/055_discount_permission'
import { migration056InvoiceCustomerLabel } from './migrations/056_invoice_customer_label'
import { migration057OrderCustomerLabel } from './migrations/057_order_customer_label'
import { migration058HeldInvoices } from './migrations/058_held_invoices'
import { migration059SalesItemWarehouse } from './migrations/059_sales_item_warehouse'
import { migration060TreasuriesVouchers } from './migrations/060_treasuries_vouchers'
import { migration061Ledger } from './migrations/061_ledger'
import { migration062AllowNegativeStock } from './migrations/062_allow_negative_stock'
import { migration063LicenseTrial30 } from './migrations/063_license_trial_30'
import { migration064Tips } from './migrations/064_tips'
import { migration065EventBookings } from './migrations/065_event_bookings'
import { migration066Attendance } from './migrations/066_attendance'
import { migration067AttendanceHikvision } from './migrations/067_attendance_hikvision'
import { migration068AttendancePayroll } from './migrations/068_attendance_payroll'
import { migration069PasswordReset } from './migrations/069_password_reset'
import { migration070Branches } from './migrations/070_branches'
import { migration071AccountRoles } from './migrations/071_account_roles'
import { migration072ServicesSplitDueDates } from './migrations/072_services_split_due_dates'
import { migration073PurchaseMode } from './migrations/073_purchase_mode'
import { seedDatabase } from './seed'

let db: Client | null = null
let currentDbPath: string | null = null

export function getDb(): Client {
  if (!db) throw new Error('Database has not been initialized yet')
  return db
}

export function getDbPath(): string {
  if (!currentDbPath) throw new Error('Database has not been initialized yet')
  return currentDbPath
}

/**
 * نقطة الدخول الحقيقية للسيرفر — تقرأ إعدادات الاتصال من متغيرات البيئة:
 * - QCP_DB_URL: لو موجود، يُستخدم كما هو (مثال Turso: libsql://xxx.turso.io) — مع QCP_DB_AUTH_TOKEN لو محتاج توكن
 * - غير كده: ملف SQLite محلي في ./data/quick-cash-plus.sqlite (مناسب للتطوير المحلي قبل ما نربط Turso فعليًا)
 */
export async function initDatabase(): Promise<Client> {
  const remoteUrl = process.env.QCP_DB_URL
  if (remoteUrl) {
    db = createClient({ url: remoteUrl, authToken: process.env.QCP_DB_AUTH_TOKEN })
    currentDbPath = remoteUrl
    await db.execute('PRAGMA foreign_keys = ON')
    await runMigrations(db)
    await seedDatabase(db)
    return db
  }

  const dataDir = process.env.QCP_DATA_DIR ?? join(process.cwd(), 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, 'quick-cash-plus.sqlite')
  return initDatabaseAtPath(dbPath)
}

/** يفتح قاعدة البيانات في مسار محدد — يُستخدم من initDatabase() (وضع التطوير المحلي) وفي الاختبارات. */
export async function initDatabaseAtPath(dbPath: string): Promise<Client> {
  const dir = join(dbPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // dbPath بييجي من path.join على وندوز فبيبقى فيه backslashes — file: URL محتاج forward slashes
  // وإلا libsql بيفشل يفسّر المسار صح ويفتح ملف تاني غلط بصمت من غير أي error ظاهر.
  const dbUrl = `file:${dbPath.replace(/\\/g, '/')}`
  db = createClient({ url: dbUrl })
  currentDbPath = dbPath

  await db.execute('PRAGMA journal_mode = WAL')
  await db.execute('PRAGMA foreign_keys = ON')
  await db.execute('PRAGMA synchronous = NORMAL')

  await runMigrations(db)
  await seedDatabase(db)

  return db
}

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: '001_init', sql: migration001Init },
  { name: '002_customers_vendors_invoices', sql: migration002CustomersVendorsInvoices },
  { name: '003_pricing_warehouses_purchases', sql: migration003PricingWarehousesPurchases },
  { name: '004_expenses_employees', sql: migration004ExpensesEmployees },
  { name: '005_tax_settings', sql: migration005TaxSettings },
  { name: '006_print_device_settings', sql: migration006PrintDeviceSettings },
  { name: '007_license_backup', sql: migration007LicenseBackup },
  { name: '008_store_settings', sql: migration008StoreSettings },
  { name: '009_user_activity_log', sql: migration009UserActivityLog },
  { name: '010_product_expiry_serial', sql: migration010ProductExpirySerial },
  { name: '011_loyalty_settings', sql: migration011LoyaltySettings },
  { name: '012_keyboard_shortcuts', sql: migration012KeyboardShortcuts },
  { name: '013_invoice_loyalty_points', sql: migration013InvoiceLoyaltyPoints },
  { name: '014_assistant_settings', sql: migration014AssistantSettings },
  { name: '015_vendor_payment_invoice_link', sql: migration015VendorPaymentInvoiceLink },
  { name: '016_customer_loyalty_toggle', sql: migration016CustomerLoyaltyToggle },
  { name: '017_sales_reps', sql: migration017SalesReps },
  { name: '018_quotations', sql: migration018Quotations },
  { name: '019_party_link_settlement', sql: migration019PartyLinkSettlement },
  { name: '020_payment_methods_wallets', sql: migration020PaymentMethodsWallets },
  { name: '021_pos_ui_settings', sql: migration021PosUiSettings },
  { name: '022_employee_pay_periods', sql: migration022EmployeePayPeriods },
  { name: '023_expense_attachments', sql: migration023ExpenseAttachments },
  { name: '024_product_show_in_pos', sql: migration024ProductShowInPos },
  { name: '025_serial_at_sale', sql: migration025SerialAtSale },
  { name: '026_stock_permits', sql: migration026StockPermits },
  { name: '027_assistant_chat', sql: migration027AssistantChat },
  { name: '028_product_image', sql: migration028ProductImage },
  { name: '029_price_checker_sync', sql: migration029PriceCheckerSync },
  { name: '030_print_copies', sql: migration030PrintCopies },
  { name: '031_product_vendor_license_features', sql: migration031ProductVendorLicenseFeatures },
  { name: '032_thermal_print_calibration', sql: migration032ThermalPrintCalibration },
  { name: '033_whatsapp_settings', sql: migration033WhatsAppSettings },
  { name: '034_thermal_page_height', sql: migration034ThermalPageHeight },
  { name: '035_thermal_calibration_physical_margin', sql: migration035ThermalCalibrationPhysicalMargin },
  { name: '036_restaurant_core', sql: migration036RestaurantCore },
  { name: '037_restaurant_recipes', sql: migration037RestaurantRecipes },
  { name: '038_restaurant_captains', sql: migration038RestaurantCaptains },
  { name: '039_restaurant_delivery_extras', sql: migration039RestaurantDeliveryExtras },
  { name: '040_customer_address', sql: migration040CustomerAddress },
  { name: '041_purchase_returns', sql: migration041PurchaseReturns },
  { name: '042_delivery_tracking', sql: migration042DeliveryTracking },
  { name: '043_sales_item_note', sql: migration043SalesItemNote },
  { name: '044_order_guest_count_note', sql: migration044OrderGuestCountNote },
  { name: '045_table_reservations', sql: migration045TableReservations },
  { name: '046_whatsapp_invoice_pdf', sql: migration046WhatsAppInvoicePdf },
  { name: '047_stock_permit_price_serial', sql: migration047StockPermitPriceSerial },
  { name: '048_table_shape', sql: migration048TableShape },
  { name: '049_restaurant_tax_kitchen_notifications', sql: migration049RestaurantTaxKitchenNotifications },
  { name: '050_kitchen_notify_mode', sql: migration050KitchenNotifyMode },
  { name: '051_floor_layout', sql: migration051FloorLayout },
  { name: '052_invoice_delivery_address', sql: migration052InvoiceDeliveryAddress },
  { name: '053_per_view_permissions', sql: migration053PerViewPermissions },
  { name: '054_order_item_discount', sql: migration054OrderItemDiscount },
  { name: '055_discount_permission', sql: migration055DiscountPermission },
  { name: '056_invoice_customer_label', sql: migration056InvoiceCustomerLabel },
  { name: '057_order_customer_label', sql: migration057OrderCustomerLabel },
  { name: '058_held_invoices', sql: migration058HeldInvoices },
  { name: '059_sales_item_warehouse', sql: migration059SalesItemWarehouse },
  { name: '060_treasuries_vouchers', sql: migration060TreasuriesVouchers },
  { name: '061_ledger', sql: migration061Ledger },
  { name: '062_allow_negative_stock', sql: migration062AllowNegativeStock },
  { name: '063_license_trial_30', sql: migration063LicenseTrial30 },
  { name: '064_tips', sql: migration064Tips },
  { name: '065_event_bookings', sql: migration065EventBookings },
  { name: '066_attendance', sql: migration066Attendance },
  { name: '067_attendance_hikvision', sql: migration067AttendanceHikvision },
  { name: '068_attendance_payroll', sql: migration068AttendancePayroll },
  { name: '069_password_reset', sql: migration069PasswordReset },
  { name: '070_branches', sql: migration070Branches },
  { name: '071_account_roles', sql: migration071AccountRoles },
  { name: '072_services_split_due_dates', sql: migration072ServicesSplitDueDates },
  { name: '073_purchase_mode', sql: migration073PurchaseMode }
]

async function runMigrations(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const appliedResult = await client.execute('SELECT name FROM schema_migrations')
  const applied = new Set(appliedResult.rows.map((r: any) => r.name as string))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue
    await client.executeMultiple(migration.sql)
    await client.execute({
      sql: 'INSERT INTO schema_migrations (name) VALUES (?)',
      args: [migration.name]
    })
  }
}
