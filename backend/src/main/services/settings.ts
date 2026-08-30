import { getDb } from '../db'
import type {
  AssistantSettings,
  BackupSettings,
  BarcodeLabelSettings,
  Captain,
  CategoryPrinter,
  DeliveryDriver,
  DeviceSettings,
  LoyaltySettings,
  PosUiSettings,
  PriceCheckerSyncSettings,
  PrinterInfo,
  PrintSettings,
  RestaurantSettings,
  StoreSettings,
  TaxSettings,
  WhatsAppSettings
} from '../../shared/types'

function mapRow(r: any): TaxSettings {
  return {
    enabled: !!r.enabled,
    country: r.country,
    taxNumber: r.tax_number,
    taxName: r.tax_name,
    rate: Number(r.rate),
    eInvoiceEnabled: !!r.e_invoice_enabled,
    qrEnabled: !!r.qr_enabled
  }
}

export async function getTaxSettings(): Promise<TaxSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM tax_settings WHERE id = 1')
  return mapRow(rs.rows[0])
}

export async function updateTaxSettings(input: TaxSettings): Promise<TaxSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE tax_settings
          SET enabled = ?, country = ?, tax_number = ?, tax_name = ?, rate = ?, e_invoice_enabled = ?, qr_enabled = ?
          WHERE id = 1`,
    args: [
      input.enabled ? 1 : 0,
      input.country,
      input.taxNumber,
      input.taxName,
      input.rate,
      input.eInvoiceEnabled ? 1 : 0,
      input.qrEnabled ? 1 : 0
    ]
  })
  return getTaxSettings()
}

function mapPrintRow(r: any): PrintSettings {
  return {
    defaultPrinter: r.default_printer,
    paperSize: r.paper_size,
    printMode: r.print_mode,
    showLogo: !!r.show_logo,
    autoPrintAfterSale: !!r.auto_print_after_sale,
    copies: r.copies,
    thermalContentWidth80mm: Number(r.thermal_content_width_80mm),
    thermalContentWidth58mm: Number(r.thermal_content_width_58mm),
    thermalOffset80mm: Number(r.thermal_offset_80mm),
    thermalOffset58mm: Number(r.thermal_offset_58mm),
    thermalPageHeightMm: Number(r.thermal_page_height_mm)
  }
}

export async function getPrintSettings(): Promise<PrintSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM print_settings WHERE id = 1')
  return mapPrintRow(rs.rows[0])
}

export async function updatePrintSettings(input: PrintSettings): Promise<PrintSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE print_settings
          SET default_printer = ?, paper_size = ?, print_mode = ?, show_logo = ?, auto_print_after_sale = ?, copies = ?,
              thermal_content_width_80mm = ?, thermal_content_width_58mm = ?, thermal_offset_80mm = ?, thermal_offset_58mm = ?,
              thermal_page_height_mm = ?
          WHERE id = 1`,
    args: [
      input.defaultPrinter,
      input.paperSize,
      input.printMode,
      input.showLogo ? 1 : 0,
      input.autoPrintAfterSale ? 1 : 0,
      Math.min(9, Math.max(1, Math.round(input.copies) || 1)),
      Math.max(10, Number(input.thermalContentWidth80mm) || 76),
      Math.max(10, Number(input.thermalContentWidth58mm) || 36),
      Number(input.thermalOffset80mm) || 0,
      Number(input.thermalOffset58mm) || 0,
      Math.max(50, Number(input.thermalPageHeightMm) || 1000)
    ]
  })
  return getPrintSettings()
}

function mapLabelRow(r: any): BarcodeLabelSettings {
  return {
    labelType: r.label_type,
    labelWidthMm: Number(r.label_width_mm),
    labelHeightMm: Number(r.label_height_mm),
    orientation: r.orientation,
    showName: !!r.show_name,
    showPrice: !!r.show_price,
    showBarcodeNumber: !!r.show_barcode_number
  }
}

export async function getBarcodeLabelSettings(): Promise<BarcodeLabelSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM barcode_label_settings WHERE id = 1')
  return mapLabelRow(rs.rows[0])
}

export async function updateBarcodeLabelSettings(input: BarcodeLabelSettings): Promise<BarcodeLabelSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE barcode_label_settings
          SET label_type = ?, label_width_mm = ?, label_height_mm = ?, orientation = ?,
              show_name = ?, show_price = ?, show_barcode_number = ?
          WHERE id = 1`,
    args: [
      input.labelType,
      input.labelWidthMm,
      input.labelHeightMm,
      input.orientation,
      input.showName ? 1 : 0,
      input.showPrice ? 1 : 0,
      input.showBarcodeNumber ? 1 : 0
    ]
  })
  return getBarcodeLabelSettings()
}

function mapDeviceRow(r: any): DeviceSettings {
  return {
    scannerEnabled: !!r.scanner_enabled,
    scannerTimeoutMs: Number(r.scanner_timeout_ms),
    scaleBarcodeEnabled: !!r.scale_barcode_enabled,
    scalePrefix: r.scale_prefix,
    scaleCodeLength: Number(r.scale_code_length),
    drawerPin: r.drawer_pin,
    openDrawerAfterSale: !!r.open_drawer_after_sale
  }
}

export async function getDeviceSettings(): Promise<DeviceSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM device_settings WHERE id = 1')
  return mapDeviceRow(rs.rows[0])
}

export async function updateDeviceSettings(input: DeviceSettings): Promise<DeviceSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE device_settings
          SET scanner_enabled = ?, scanner_timeout_ms = ?, scale_barcode_enabled = ?, scale_prefix = ?,
              scale_code_length = ?, drawer_pin = ?, open_drawer_after_sale = ?
          WHERE id = 1`,
    args: [
      input.scannerEnabled ? 1 : 0,
      input.scannerTimeoutMs,
      input.scaleBarcodeEnabled ? 1 : 0,
      input.scalePrefix,
      input.scaleCodeLength,
      input.drawerPin,
      input.openDrawerAfterSale ? 1 : 0
    ]
  })
  return getDeviceSettings()
}

function mapBackupRow(r: any): BackupSettings {
  return {
    autoBackupEnabled: !!r.auto_backup_enabled,
    backupFolder: r.backup_folder,
    frequencyHours: Number(r.frequency_hours),
    keepCount: Number(r.keep_count),
    lastBackupAt: r.last_backup_at,
    googleDriveEnabled: !!r.google_drive_enabled,
    googleClientId: r.google_client_id,
    googleAccountEmail: r.google_account_email,
    lastCloudBackupAt: r.last_cloud_backup_at
  }
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM backup_settings WHERE id = 1')
  return mapBackupRow(rs.rows[0])
}

export async function updateBackupSettings(
  input: Pick<BackupSettings, 'autoBackupEnabled' | 'backupFolder' | 'frequencyHours' | 'keepCount'>
): Promise<BackupSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE backup_settings
          SET auto_backup_enabled = ?, backup_folder = ?, frequency_hours = ?, keep_count = ?
          WHERE id = 1`,
    args: [input.autoBackupEnabled ? 1 : 0, input.backupFolder, input.frequencyHours, input.keepCount]
  })
  return getBackupSettings()
}

export async function updateGoogleDriveSettings(fields: {
  enabled: boolean
  clientId: string | null
  refreshToken?: string | null
  accountEmail?: string | null
}): Promise<BackupSettings> {
  const db = getDb()
  if (fields.refreshToken !== undefined) {
    await db.execute({
      sql: `UPDATE backup_settings
            SET google_drive_enabled = ?, google_client_id = ?, google_refresh_token = ?, google_account_email = ?
            WHERE id = 1`,
      args: [fields.enabled ? 1 : 0, fields.clientId, fields.refreshToken, fields.accountEmail ?? null]
    })
  } else {
    await db.execute({
      sql: `UPDATE backup_settings SET google_drive_enabled = ?, google_client_id = ? WHERE id = 1`,
      args: [fields.enabled ? 1 : 0, fields.clientId]
    })
  }
  return getBackupSettings()
}

export async function getGoogleRefreshToken(): Promise<string | null> {
  const db = getDb()
  const rs = await db.execute('SELECT google_refresh_token FROM backup_settings WHERE id = 1')
  return (rs.rows[0] as any)?.google_refresh_token ?? null
}

function mapPriceCheckerSyncRow(r: any): PriceCheckerSyncSettings {
  return {
    enabled: !!r.enabled,
    server: r.server,
    port: Number(r.port),
    databaseName: r.database_name,
    username: r.username,
    password: r.password,
    lastSyncAt: r.last_sync_at,
    lastSyncStatus: r.last_sync_status,
    lastSyncError: r.last_sync_error
  }
}

export async function getPriceCheckerSyncSettings(): Promise<PriceCheckerSyncSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM price_checker_sync_settings WHERE id = 1')
  return mapPriceCheckerSyncRow(rs.rows[0])
}

export async function updatePriceCheckerSyncSettings(
  input: Pick<PriceCheckerSyncSettings, 'enabled' | 'server' | 'port' | 'databaseName' | 'username' | 'password'>
): Promise<PriceCheckerSyncSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE price_checker_sync_settings
          SET enabled = ?, server = ?, port = ?, database_name = ?, username = ?, password = ?
          WHERE id = 1`,
    args: [
      input.enabled ? 1 : 0,
      input.server,
      input.port,
      input.databaseName,
      input.username,
      input.password
    ]
  })
  return getPriceCheckerSyncSettings()
}

export async function recordPriceCheckerSyncResult(status: 'ok' | 'error', error: string | null): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE price_checker_sync_settings
          SET last_sync_at = datetime('now'), last_sync_status = ?, last_sync_error = ?
          WHERE id = 1`,
    args: [status, error]
  })
}

function mapStoreRow(r: any): StoreSettings {
  return {
    name: r.name,
    phone: r.phone,
    address: r.address,
    website: r.website,
    thankYouMessage: r.thank_you_message,
    logoDataUrl: r.logo_data_url
  }
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM store_settings WHERE id = 1')
  return mapStoreRow(rs.rows[0])
}

export async function updateStoreSettings(input: StoreSettings): Promise<StoreSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE store_settings
          SET name = ?, phone = ?, address = ?, website = ?, thank_you_message = ?, logo_data_url = ?
          WHERE id = 1`,
    args: [input.name, input.phone, input.address, input.website, input.thankYouMessage, input.logoDataUrl]
  })
  return getStoreSettings()
}

function mapLoyaltyRow(r: any): LoyaltySettings {
  return {
    enabled: !!r.enabled,
    pointsPerCurrency: Number(r.points_per_currency),
    redemptionValue: Number(r.redemption_value)
  }
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM loyalty_settings WHERE id = 1')
  return mapLoyaltyRow(rs.rows[0])
}

export async function updateLoyaltySettings(input: LoyaltySettings): Promise<LoyaltySettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE loyalty_settings SET enabled = ?, points_per_currency = ?, redemption_value = ? WHERE id = 1`,
    args: [input.enabled ? 1 : 0, input.pointsPerCurrency, input.redemptionValue]
  })
  return getLoyaltySettings()
}

function mapAssistantRow(r: any): AssistantSettings {
  return {
    enabled: !!r.enabled,
    floatingButtonEnabled: !!r.floating_button_enabled,
    storeAnalysisEnabled: !!r.store_analysis_enabled,
    externalSearchEnabled: !!r.external_search_enabled,
    provider: r.provider,
    modelName: r.model_name,
    apiKey: r.api_key,
    apiUrl: r.api_url,
    allowedSections: JSON.parse(r.allowed_sections || '[]'),
    allowedUserIds: JSON.parse(r.allowed_user_ids || '[]')
  }
}

export async function getAssistantSettings(): Promise<AssistantSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM assistant_settings WHERE id = 1')
  return mapAssistantRow(rs.rows[0])
}

export async function updateAssistantSettings(input: AssistantSettings): Promise<AssistantSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE assistant_settings
          SET enabled = ?, floating_button_enabled = ?, store_analysis_enabled = ?, external_search_enabled = ?,
              provider = ?, model_name = ?, api_key = ?, api_url = ?, allowed_sections = ?, allowed_user_ids = ?
          WHERE id = 1`,
    args: [
      input.enabled ? 1 : 0,
      input.floatingButtonEnabled ? 1 : 0,
      input.storeAnalysisEnabled ? 1 : 0,
      input.externalSearchEnabled ? 1 : 0,
      input.provider,
      input.modelName.trim(),
      input.apiKey?.trim() || null,
      input.apiUrl.trim(),
      JSON.stringify(input.allowedSections),
      JSON.stringify(input.allowedUserIds)
    ]
  })
  return getAssistantSettings()
}

function mapWhatsAppRow(r: any): WhatsAppSettings {
  return {
    enabled: !!r.enabled,
    sendOnSale: !!r.send_on_sale,
    sendInvoicePdf: !!r.send_invoice_pdf,
    messageTemplate: r.message_template
  }
}

export async function getWhatsAppSettings(): Promise<WhatsAppSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM whatsapp_settings WHERE id = 1')
  return mapWhatsAppRow(rs.rows[0])
}

export async function updateWhatsAppSettings(input: WhatsAppSettings): Promise<WhatsAppSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE whatsapp_settings SET enabled = ?, send_on_sale = ?, send_invoice_pdf = ?, message_template = ? WHERE id = 1`,
    args: [input.enabled ? 1 : 0, input.sendOnSale ? 1 : 0, input.sendInvoicePdf ? 1 : 0, input.messageTemplate]
  })
  return getWhatsAppSettings()
}

function mapPosUiRow(r: any): PosUiSettings {
  return {
    soundEnabled: !!r.sound_enabled,
    soundVolume: Number(r.sound_volume),
    allowTempItem: !!r.allow_temp_item,
    priceEditEnabled: !!r.price_edit_enabled,
    multiWarehouseEnabled: !!r.multi_warehouse_enabled,
    categorySidebarEnabled: !!r.category_sidebar_enabled,
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol
  }
}

export async function getPosUiSettings(): Promise<PosUiSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM pos_ui_settings WHERE id = 1')
  return mapPosUiRow(rs.rows[0])
}

export async function updatePosUiSettings(input: PosUiSettings): Promise<PosUiSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE pos_ui_settings
          SET sound_enabled = ?, sound_volume = ?, allow_temp_item = ?, price_edit_enabled = ?,
              multi_warehouse_enabled = ?, category_sidebar_enabled = ?, currency_code = ?, currency_symbol = ?
          WHERE id = 1`,
    args: [
      input.soundEnabled ? 1 : 0,
      input.soundVolume,
      input.allowTempItem ? 1 : 0,
      input.priceEditEnabled ? 1 : 0,
      input.multiWarehouseEnabled ? 1 : 0,
      input.categorySidebarEnabled ? 1 : 0,
      input.currencyCode,
      input.currencySymbol
    ]
  })
  return getPosUiSettings()
}

function mapRestaurantRow(r: any): RestaurantSettings {
  return {
    dineInEnabled: !!r.dine_in_enabled,
    takeawayEnabled: !!r.takeaway_enabled,
    deliveryEnabled: !!r.delivery_enabled,
    recipesEnabled: !!r.recipes_enabled,
    serviceChargeEnabled: !!r.service_charge_enabled,
    serviceChargeType: r.service_charge_type,
    serviceChargeValue: Number(r.service_charge_value),
    defaultKitchenPrinter: r.default_kitchen_printer
  }
}

export async function getRestaurantSettings(): Promise<RestaurantSettings> {
  const db = getDb()
  const rs = await db.execute('SELECT * FROM restaurant_settings WHERE id = 1')
  return mapRestaurantRow(rs.rows[0])
}

export async function updateRestaurantSettings(input: RestaurantSettings): Promise<RestaurantSettings> {
  const db = getDb()
  await db.execute({
    sql: `UPDATE restaurant_settings
          SET dine_in_enabled = ?, takeaway_enabled = ?, delivery_enabled = ?, recipes_enabled = ?,
              service_charge_enabled = ?, service_charge_type = ?, service_charge_value = ?, default_kitchen_printer = ?
          WHERE id = 1`,
    args: [
      input.dineInEnabled ? 1 : 0,
      input.takeawayEnabled ? 1 : 0,
      input.deliveryEnabled ? 1 : 0,
      input.recipesEnabled ? 1 : 0,
      input.serviceChargeEnabled ? 1 : 0,
      input.serviceChargeType,
      input.serviceChargeValue,
      input.defaultKitchenPrinter
    ]
  })
  return getRestaurantSettings()
}

export async function getCategoryPrinters(): Promise<CategoryPrinter[]> {
  const db = getDb()
  const rs = await db.execute(`
    SELECT c.id AS categoryId, c.name AS categoryName, cp.printer_name AS printerName
    FROM categories c
    JOIN category_printers cp ON cp.category_id = c.id
    WHERE c.deleted_at IS NULL
    ORDER BY c.name`)
  return rs.rows.map((r: any) => ({
    categoryId: Number(r.categoryId),
    categoryName: r.categoryName,
    printerName: r.printerName
  }))
}

export async function setCategoryPrinter(categoryId: number, printerName: string | null): Promise<void> {
  const db = getDb()
  if (!printerName) {
    await db.execute({ sql: 'DELETE FROM category_printers WHERE category_id = ?', args: [categoryId] })
    return
  }
  await db.execute({
    sql: `INSERT INTO category_printers (category_id, printer_name) VALUES (?, ?)
          ON CONFLICT(category_id) DO UPDATE SET printer_name = excluded.printer_name`,
    args: [categoryId, printerName]
  })
}

export async function listDeliveryDrivers(includeInactive = false): Promise<DeliveryDriver[]> {
  const db = getDb()
  const rs = await db.execute(`
    SELECT id, name, phone, active FROM delivery_drivers
    WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND active = 1'}
    ORDER BY name`)
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    name: r.name,
    phone: r.phone ?? null,
    active: !!r.active
  }))
}

export async function upsertDeliveryDriver(
  input: { id?: number; name: string; phone: string; active: boolean }
): Promise<DeliveryDriver> {
  const db = getDb()
  if (input.id) {
    await db.execute({
      sql: 'UPDATE delivery_drivers SET name = ?, phone = ?, active = ? WHERE id = ?',
      args: [input.name.trim(), input.phone.trim() || null, input.active ? 1 : 0, input.id]
    })
    return { id: input.id, name: input.name.trim(), phone: input.phone.trim() || null, active: input.active }
  }
  const info = await db.execute({
    sql: 'INSERT INTO delivery_drivers (name, phone, active) VALUES (?, ?, ?)',
    args: [input.name.trim(), input.phone.trim() || null, input.active ? 1 : 0]
  })
  const id = Number(info.lastInsertRowid)
  return { id, name: input.name.trim(), phone: input.phone.trim() || null, active: input.active }
}

export async function deleteDeliveryDriver(id: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: "UPDATE delivery_drivers SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

export async function listCaptains(includeInactive = false): Promise<Captain[]> {
  const db = getDb()
  const rs = await db.execute(`
    SELECT id, name, phone, active FROM captains
    WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND active = 1'}
    ORDER BY name`)
  return rs.rows.map((r: any) => ({
    id: Number(r.id),
    name: r.name,
    phone: r.phone ?? null,
    active: !!r.active
  }))
}

export async function upsertCaptain(input: { id?: number; name: string; phone: string; active: boolean }): Promise<Captain> {
  const db = getDb()
  if (input.id) {
    await db.execute({
      sql: 'UPDATE captains SET name = ?, phone = ?, active = ? WHERE id = ?',
      args: [input.name.trim(), input.phone.trim() || null, input.active ? 1 : 0, input.id]
    })
    return { id: input.id, name: input.name.trim(), phone: input.phone.trim() || null, active: input.active }
  }
  const info = await db.execute({
    sql: 'INSERT INTO captains (name, phone, active) VALUES (?, ?, ?)',
    args: [input.name.trim(), input.phone.trim() || null, input.active ? 1 : 0]
  })
  const id = Number(info.lastInsertRowid)
  return { id, name: input.name.trim(), phone: input.phone.trim() || null, active: input.active }
}

export async function deleteCaptain(id: number): Promise<void> {
  const db = getDb()
  await db.execute({ sql: "UPDATE captains SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

/**
 * في نسخة الويب مفيش "طابعات نظام" على السيرفر — الطباعة هتتم لاحقًا عبر QZ Tray
 * على جهاز كل فرع (مرحلة لاحقة من خطة التحويل). لسه غير مبني.
 */
export async function getSystemPrinters(): Promise<PrinterInfo[]> {
  return []
}
