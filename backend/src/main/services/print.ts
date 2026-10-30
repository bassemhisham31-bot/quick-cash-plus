import { getDb } from '../db'
import { branchesEnabled } from './branchScope'
import { getInvoiceView, getReceiptQr } from './invoices'
import { getQuotationView } from './quotations'
import { getShiftSummaryReport } from './cashSession'
import { getStockPermitView } from './stockPermits'
import {
  getBarcodeLabelSettings,
  getDeviceSettings,
  getPosUiSettings,
  getPrintSettings,
  getRestaurantSettings,
  getStoreSettings,
  getTaxSettings
} from './settings'
import { getHeldInvoice } from './heldInvoices'
import { getVoucher } from './treasuries'
import { getBooking } from './events'
import { generateBarcodeDataUrl } from './barcode'
import { printCapture } from './printContext'
import type {
  BarcodeLabelSettings,
  InvoiceView,
  KitchenTicketMeta,
  PrintResult,
  PrintSettings,
  QuotationView,
  ShiftSummaryReport,
  StockPermitView,
  StoreSettings,
  TaxSettings
} from '../../shared/types'

/**
 * نسخة الويب: السيرفر ما بيطبعش ولا بيفتح نوافذ — كل طلب طباعة/معاينة بيتسجّل كـ job داخل printCapture
 * (نفس آلية الجهاز الفرعي في الأوفلاين)، وبيرجع للمتصفح في الرد ينفّذه على طابعات الجهاز نفسه عبر QZ Tray.
 */
async function openPreviewWindow(kind: string, title: string, html: string): Promise<void> {
  printCapture.getStore()?.jobs.push({ kind: 'preview', previewKind: kind, title, html })
}

const numberFormat = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 })
// بيتحدّث لكل استدعاء طباعة قبل بناء الـHTML — Node عملية واحدة متزامنة فبيتقرا بأمان جوه نفس الاستدعاء
let currentCurrencySymbol = 'ج.م'
const currency = { format: (value: number): string => `${numberFormat.format(value)} ${currentCurrencySymbol}` }
const escapeHtml = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  credit: 'آجل',
  card: 'بنكي',
  wallet: 'محفظة',
  mixed: 'مختلط',
  vodafone_cash: 'فودافون كاش',
  instapay: 'InstaPay'
}

const EXPENSE_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  card: 'بنكي',
  wallet: 'محفظة',
  transfer: 'تحويل'
}

/** لو ميزة الفروع مفعّلة: اسم الفرع بيتضاف لاسم المتجر في رأس المستند (من جدول الفروع بالـsql المعطى) */
async function withBranchName<T extends { name: string }>(store: T, sql: string, id: number): Promise<T> {
  if (!branchesEnabled()) return store
  const rs = await getDb().execute({ sql, args: [id] })
  const branch = (rs.rows[0] as any)?.name
  return branch ? { ...store, name: `${store.name} — ${branch}` } : store
}

export async function buildInvoiceHtml(
  invoiceId: number
): Promise<{ html: string; printSettings: PrintSettings } | null> {
  const invoice = await getInvoiceView(invoiceId)
  if (!invoice) return null

  const [printSettings, globalTaxSettings, rawStoreSettings, posUiSettings, restaurantSettings] = await Promise.all([
    getPrintSettings(),
    getTaxSettings(),
    getStoreSettings(),
    getPosUiSettings(),
    getRestaurantSettings()
  ])
  const storeSettings = await withBranchName(
    rawStoreSettings,
    'SELECT b.name FROM sales_invoices i JOIN branches b ON b.id = i.branch_id WHERE i.id = ?',
    invoiceId
  )
  currentCurrencySymbol = posUiSettings.currencySymbol
  // فواتير المطعم مع ضريبة المطعم المفعّلة: اسم/نسبة الضريبة في الفاتورة من إعدادات المطعم مش من الضريبة العامة
  // (rate = 0 معناها قيمة ثابتة → بيظهر الاسم بس من غير %)
  const taxSettings =
    invoice.orderType !== 'retail' && restaurantSettings.taxEnabled
      ? {
          ...globalTaxSettings,
          taxName: restaurantSettings.taxName,
          rate: restaurantSettings.taxType === 'percent' ? restaurantSettings.taxValue : 0
        }
      : globalTaxSettings
  const qr = taxSettings.qrEnabled ? await getReceiptQr(invoiceId) : null
  const invoiceBarcode = await generateBarcodeDataUrl(invoice.number, 'CODE128')
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'

  const html = isThermal
    ? buildThermalReceiptHtml(invoice, printSettings, storeSettings, taxSettings, qr, invoiceBarcode)
    : buildFormalInvoiceHtml(invoice, printSettings, storeSettings, taxSettings, qr, invoiceBarcode)

  return { html, printSettings }
}

function taxLabel(tax: { taxName: string; rate: number }): string {
  return tax.rate > 0 ? `${escapeHtml(tax.taxName)} (${tax.rate}%)` : escapeHtml(tax.taxName)
}

function thermalWidthMm(paperSize: PrintSettings['paperSize']): number | undefined {
  if (paperSize === '80mm') return 80
  if (paperSize === '58mm') return 58
  return undefined
}

/** يجمّع أبعاد الورق الحراري ومعايرة المستخدم (عرض المحتوى + الإزاحة الأفقية) في مكان واحد بدل تكرارها في كل قالب. */
function thermalCalibration(printSettings: PrintSettings): { widthMm: number; contentWidthMm: number; offsetMm: number } {
  if (printSettings.paperSize === '80mm') {
    return { widthMm: 80, contentWidthMm: printSettings.thermalContentWidth80mm, offsetMm: printSettings.thermalOffset80mm }
  }
  return { widthMm: 58, contentWidthMm: printSettings.thermalContentWidth58mm, offsetMm: printSettings.thermalOffset58mm }
}

export async function printReceipt(invoiceId: number): Promise<PrintResult> {
  logPrintDebug(`printReceipt called invoiceId=${invoiceId}`)
  const built = await buildInvoiceHtml(invoiceId)
  if (!built) return { ok: false, error: 'الفاتورة غير موجودة' }
  return printHtml(built.html, built.printSettings, thermalWidthMm(built.printSettings.paperSize))
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  retail: 'بيع عادي',
  dine_in: 'صالة',
  takeaway: 'تيك أواي',
  delivery: 'ديلفري'
}

/** أسطر بيانات نوع الطلب (تيك أواي/ديلفري/صالة) اللي بتتضاف لفاتورة العميل الحرارية — مش موجودة على الفاتورة الرسمية العادية. */
function orderTypeInfoLinesHtml(invoice: InvoiceView): string {
  if (invoice.orderType === 'retail') return ''
  const rows: string[] = [
    `<div class="info-line"><span>نوع الطلب</span><span>${ORDER_TYPE_LABELS[invoice.orderType] ?? invoice.orderType}</span></div>`
  ]
  if (invoice.orderType === 'dine_in') {
    if (invoice.tableName) {
      rows.push(`<div class="info-line"><span>الترابيزة</span><span>${escapeHtml(invoice.tableName)}</span></div>`)
    }
    if (invoice.captainName) {
      rows.push(`<div class="info-line"><span>الكابتن</span><span>${escapeHtml(invoice.captainName)}</span></div>`)
    }
  }
  if (invoice.orderType === 'delivery') {
    if (invoice.deliveryDriverName) {
      rows.push(`<div class="info-line"><span>السائق</span><span>${escapeHtml(invoice.deliveryDriverName)}</span></div>`)
    }
    if (invoice.customerPhone) {
      rows.push(`<div class="info-line"><span>هاتف العميل</span><span>${escapeHtml(invoice.customerPhone)}</span></div>`)
    }
    if (invoice.deliveryAddress) {
      rows.push(`<div class="info-line"><span>العنوان</span><span>${escapeHtml(invoice.deliveryAddress)}</span></div>`)
    }
    if (invoice.deliveryMark) {
      rows.push(`<div class="info-line"><span>علامة مميزة</span><span>${escapeHtml(invoice.deliveryMark)}</span></div>`)
    }
  }
  return rows.join('')
}

/**
 * بون تجهيز مطبخ: الصنف والملاحظة والكمية بس، من غير أسعار — مش فاتورة عميل. تفاصيل نوع الطلب بتتغيّر
 * حسب النوع: الصالة بتوضّح رقم الترابيزة، والديلفري بيوضّح اسم السائق وبيانات تواصل العميل.
 */
function buildKitchenTicketHtml(
  meta: KitchenTicketMeta,
  items: { name: string; qty: number; note: string | null }[],
  printSettings: PrintSettings
): string {
  const { widthMm, contentWidthMm, offsetMm } = thermalCalibration(printSettings)
  const itemsHtml = items
    .map(
      (i) => `
      <div class="k-item">
        <div class="k-item-row"><span class="k-item-name">${escapeHtml(i.name)}</span><span class="k-qty">×${i.qty}</span></div>
        ${i.note ? `<div class="k-note">${escapeHtml(i.note)}</div>` : ''}
      </div>`
    )
    .join('')

  const metaLines: string[] = [`<div class="k-type">${ORDER_TYPE_LABELS[meta.orderType] ?? meta.orderType}</div>`]
  if (meta.reprint) metaLines.push('<div style="font-weight:800;border:1px dashed #000;margin:2px 0">★ إعادة طباعة ★</div>')
  if (meta.orderType === 'dine_in') {
    if (meta.tableLabel) metaLines.push(`<div>ترابيزة: ${escapeHtml(meta.tableLabel)}</div>`)
    if (meta.captainName) metaLines.push(`<div>الكابتن: ${escapeHtml(meta.captainName)}</div>`)
  }
  if (meta.orderType === 'delivery') {
    if (meta.driverName) metaLines.push(`<div>السائق: ${escapeHtml(meta.driverName)}</div>`)
    if (meta.customerName) metaLines.push(`<div>العميل: ${escapeHtml(meta.customerName)}</div>`)
    if (meta.customerPhone) metaLines.push(`<div>هاتف: ${escapeHtml(meta.customerPhone)}</div>`)
    if (meta.deliveryAddress) metaLines.push(`<div>العنوان: ${escapeHtml(meta.deliveryAddress)}</div>`)
  }

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; }
  .ticket { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; }
  h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
  .k-meta { font-size: 12px; text-align: center; margin-bottom: 6px; }
  .k-type { font-size: 17px; font-weight: 800; margin-bottom: 2px; }
  hr { border: none; border-top: 2px dashed #000; margin: 6px 0; }
  .k-item { margin-bottom: 8px; }
  .k-item-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; }
  .k-note { font-size: 13px; color: #000; margin-top: 2px; padding-inline-start: 6px; }
  .k-qty { font-weight: 800; }
</style>
</head>
<body>
  <div class="ticket">
    <h1>بون تجهيز</h1>
    <div class="k-meta">
      <div>${escapeHtml(meta.orderNumber)}</div>
      ${metaLines.join('')}
      <div>${new Date().toLocaleString('ar-EG')}</div>
    </div>
    <hr />
    ${itemsHtml}
  </div>
</body>
</html>`
}

export async function printKitchenTicket(
  meta: KitchenTicketMeta,
  printerName: string | null,
  items: { name: string; qty: number; note: string | null }[]
): Promise<PrintResult> {
  const printSettings = await getPrintSettings()
  const html = buildKitchenTicketHtml(meta, items, printSettings)
  const effectiveSettings: PrintSettings = {
    ...printSettings,
    defaultPrinter: printerName ?? printSettings.defaultPrinter,
    copies: 1
  }
  return printHtml(html, effectiveSettings, thermalWidthMm(printSettings.paperSize))
}

/* ---------------------------- الشيك (حساب الترابيزة قبل الدفع) ---------------------------- */

export interface OrderCheckData {
  orderNumber: string
  orderType: string
  tableLabel: string | null
  /** لو الشيك لمجموعة تقسيم فاتورة (مثلاً "فاتورة 2") */
  splitLabel?: string | null
  captainName: string | null
  guestCount: number | null
  customerName: string | null
  items: { name: string; qty: number; unitPrice: number; discount: number }[]
  subtotal: number
  /** مجموع خصومات الأصناف + خصم الطلب كله (بالجنيه) — بتظهر في الشيك لو أكبر من صفر */
  itemsDiscount: number
  orderDiscount: number
  taxName: string
  tax: number
  service: number
  delivery: number
  total: number
}

/** شيك للزبون يعرف منه حسابه قبل الدفع — مش فاتورة نهائية (مفيش رقم فاتورة ولا خصم مخزون) */
export function buildOrderCheckHtml(data: OrderCheckData, printSettings: PrintSettings, store: StoreSettings): string {
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'
  const { widthMm, contentWidthMm, offsetMm } = isThermal
    ? thermalCalibration(printSettings)
    : { widthMm: 80, contentWidthMm: 72, offsetMm: 4 }
  const lines = data.items
    .map(
      (i) =>
        `<tr><td class="n">${escapeHtml(i.name)}</td><td class="q">${i.qty}</td><td class="t">${currency.format(i.qty * i.unitPrice)}</td></tr>${i.discount > 0 ? `<tr><td class="n" colspan="3" style="font-size:10px">خصم -${currency.format(i.discount)}</td></tr>` : ''}`
    )
    .join('')
  const info: string[] = [`<div class="info-line"><span>الطلب</span><span>${escapeHtml(data.orderNumber)}</span></div>`]
  info.push(`<div class="info-line"><span>النوع</span><span>${ORDER_TYPE_LABELS[data.orderType] ?? data.orderType}</span></div>`)
  if (data.tableLabel) info.push(`<div class="info-line"><span>الترابيزة</span><span>${escapeHtml(data.tableLabel)}</span></div>`)
  if (data.splitLabel) info.push(`<div class="info-line"><span>تقسيم</span><span>${escapeHtml(data.splitLabel)}</span></div>`)
  if (data.captainName) info.push(`<div class="info-line"><span>الكابتن</span><span>${escapeHtml(data.captainName)}</span></div>`)
  if (data.guestCount) info.push(`<div class="info-line"><span>عدد الضيوف</span><span>${data.guestCount}</span></div>`)
  if (data.customerName) info.push(`<div class="info-line"><span>العميل</span><span>${escapeHtml(data.customerName)}</span></div>`)
  info.push(`<div class="info-line"><span>التاريخ</span><span>${new Date().toLocaleString('ar-EG')}</span></div>`)

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { size: ${isThermal ? widthMm + 'mm auto' : printSettings.paperSize}; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; }
  .receipt { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; text-align: center; }
  .logo { max-width: 55mm; max-height: 20mm; margin-bottom: 4px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .check-title { font-size: 16px; font-weight: 800; border: 1.5px solid #000; border-radius: 4px; padding: 3px 0; margin: 4px 0; }
  hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
  .info-line { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { border-bottom: 1px solid #000; padding: 2px 0; }
  td { padding: 2px 0; }
  .n { text-align: start; } .q { text-align: center; width: 14%; } .t { text-align: end; width: 32%; }
  .totals-row { display: flex; justify-content: space-between; font-size: 12px; padding: 1px 0; }
  .grand-total { display: flex; justify-content: space-between; font-weight: bold; font-size: 17px; margin-top: 4px; }
  .note { font-size: 10.5px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="receipt">
    ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
    <h1>${escapeHtml(store.name)}</h1>
    <div class="check-title">الشيك — الحساب</div>
    ${info.join('')}
    <hr />
    <table>
      <thead><tr><th class="n">الصنف</th><th class="q">الكمية</th><th class="t">القيمة</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <hr />
    <div class="totals-row"><span>المجموع</span><span>${currency.format(data.subtotal)}</span></div>
    ${data.itemsDiscount > 0 ? `<div class="totals-row"><span>خصم الأصناف</span><span>-${currency.format(data.itemsDiscount)}</span></div>` : ''}
    ${data.orderDiscount > 0 ? `<div class="totals-row"><span>خصم الفاتورة</span><span>-${currency.format(data.orderDiscount)}</span></div>` : ''}
    ${data.tax > 0 ? `<div class="totals-row"><span>${escapeHtml(data.taxName)}</span><span>${currency.format(data.tax)}</span></div>` : ''}
    ${data.service > 0 ? `<div class="totals-row"><span>خدمة</span><span>${currency.format(data.service)}</span></div>` : ''}
    ${data.delivery > 0 ? `<div class="totals-row"><span>رسوم التوصيل</span><span>${currency.format(data.delivery)}</span></div>` : ''}
    <div class="grand-total"><span>المطلوب</span><span>${currency.format(data.total)}</span></div>
    <div class="note">ده شيك بالحساب وليس فاتورة نهائية — الفاتورة بتطلع بعد الدفع</div>
  </div>
</body>
</html>`
}

export async function printOrderCheck(data: OrderCheckData, preview = false): Promise<PrintResult> {
  const [printSettings, storeSettings, posUiSettings] = await Promise.all([
    getPrintSettings(),
    getStoreSettings(),
    getPosUiSettings()
  ])
  currentCurrencySymbol = posUiSettings.currencySymbol
  const html = buildOrderCheckHtml(data, printSettings, storeSettings)
  if (preview) {
    await openPreviewWindow('orderCheck', 'معاينة الشيك', html)
    return { ok: true }
  }
  return printHtml(html, { ...printSettings, copies: 1 }, thermalWidthMm(printSettings.paperSize))
}

/** إيصال حجز مناسبة (عيد ميلاد…) — بيانات الحجز + الدفعات + المتبقي */
export async function printEventBooking(id: number, preview = false): Promise<PrintResult> {
  const booking = await getBooking(id)
  if (!booking) return { ok: false, error: 'الحجز غير موجود' }
  const [printSettings, storeSettings, posUiSettings] = await Promise.all([getPrintSettings(), getStoreSettings(), getPosUiSettings()])
  currentCurrencySymbol = posUiSettings.currencySymbol
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'
  const { widthMm, contentWidthMm, offsetMm } = isThermal
    ? thermalCalibration(printSettings)
    : { widthMm: 80, contentWidthMm: 72, offsetMm: 4 }
  const payRows = booking.payments
    .map(
      (p) =>
        `<div class="line"><span>${escapeHtml(p.createdAt.slice(0, 16))} — ${p.amount < 0 ? 'استرداد' : escapeHtml(p.note || 'دفعة')}</span><span>${currency.format(p.amount)}</span></div>`
    )
    .join('')
  const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { size: ${isThermal ? widthMm + 'mm auto' : printSettings.paperSize}; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; }
  .receipt { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; text-align: center; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .title { font-size: 16px; font-weight: 800; border: 1.5px solid #000; border-radius: 4px; padding: 3px 0; margin: 4px 0; }
  hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
  .line { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; text-align: start; gap: 8px; }
  .big { font-size: 15px; font-weight: 800; }
</style>
</head>
<body>
  <div class="receipt">
    <h1>${escapeHtml(storeSettings.name)}</h1>
    <div class="title">حجز ${escapeHtml(booking.eventType)}</div>
    <div class="line"><span>رقم الحجز</span><span>${escapeHtml(booking.number)}</span></div>
    <div class="line"><span>العميل</span><span>${escapeHtml(booking.customerName)}</span></div>
    ${booking.customerPhone ? `<div class="line"><span>الموبايل</span><span>${escapeHtml(booking.customerPhone)}</span></div>` : ''}
    ${booking.honoree ? `<div class="line"><span>صاحب المناسبة</span><span>${escapeHtml(booking.honoree)}</span></div>` : ''}
    <div class="line"><span>الموعد</span><span>${escapeHtml(booking.eventDate)} ${escapeHtml(booking.eventTime ?? '')}</span></div>
    <div class="line"><span>عدد الأفراد</span><span>${booking.guests}</span></div>
    ${booking.packageName ? `<div class="line"><span>الباكدج</span><span>${escapeHtml(booking.packageName)}</span></div>` : ''}
    <hr />
    <div class="line"><span>السعر</span><span>${currency.format(booking.basePrice)}</span></div>
    ${booking.discount > 0 ? `<div class="line"><span>خصم</span><span>-${currency.format(booking.discount)}</span></div>` : ''}
    <div class="line big"><span>الإجمالي</span><span>${currency.format(booking.total)}</span></div>
    <hr />
    ${payRows || '<div class="line"><span>لا توجد دفعات</span><span></span></div>'}
    <div class="line"><span>المدفوع</span><span>${currency.format(booking.paid)}</span></div>
    <div class="line big"><span>المتبقي</span><span>${currency.format(booking.remaining)}</span></div>
    ${booking.notes ? `<hr /><div class="line"><span>ملاحظات</span><span>${escapeHtml(booking.notes)}</span></div>` : ''}
  </div>
</body>
</html>`
  if (preview) {
    await openPreviewWindow('eventBooking', 'معاينة إيصال الحجز', html)
    return { ok: true }
  }
  return printHtml(html, { ...printSettings, copies: 1 }, thermalWidthMm(printSettings.paperSize))
}

/** سند قبض/صرف (إيصال حراري) */
export async function printVoucher(id: number, preview = false): Promise<PrintResult> {
  const voucher = await getVoucher(id)
  if (!voucher) return { ok: false, error: 'السند غير موجود' }
  const [printSettings, storeSettings, posUiSettings] = await Promise.all([getPrintSettings(), getStoreSettings(), getPosUiSettings()])
  currentCurrencySymbol = posUiSettings.currencySymbol
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'
  const { widthMm, contentWidthMm, offsetMm } = isThermal
    ? thermalCalibration(printSettings)
    : { widthMm: 80, contentWidthMm: 72, offsetMm: 4 }
  const isReceipt = voucher.type === 'receipt'
  const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { size: ${isThermal ? widthMm + 'mm auto' : printSettings.paperSize}; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; }
  .receipt { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; text-align: center; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .title { font-size: 16px; font-weight: 800; border: 1.5px solid #000; border-radius: 4px; padding: 3px 0; margin: 4px 0; }
  hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
  .line { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; text-align: start; gap: 8px; }
  .amount { font-size: 20px; font-weight: 800; margin: 6px 0; }
  .sign { display: flex; justify-content: space-between; margin-top: 18px; font-size: 11px; }
</style>
</head>
<body>
  <div class="receipt">
    <h1>${escapeHtml(storeSettings.name)}</h1>
    <div class="title">${isReceipt ? 'سند قبض' : 'سند صرف'}</div>
    <div class="line"><span>رقم السند</span><span>${escapeHtml(voucher.number)}</span></div>
    <div class="line"><span>التاريخ</span><span>${escapeHtml(voucher.createdAt)}</span></div>
    <div class="line"><span>الخزينة</span><span>${escapeHtml(voucher.treasuryName)}</span></div>
    <div class="line"><span>${isReceipt ? 'استلمنا من' : 'صرفنا إلى'}</span><span>${escapeHtml(voucher.partyName)}</span></div>
    <hr />
    <div class="amount">${currency.format(voucher.amount)}</div>
    ${voucher.note ? `<div class="line"><span>البيان</span><span>${escapeHtml(voucher.note)}</span></div>` : ''}
    <hr />
    <div class="sign"><span>المستلم: ........</span><span>أمين الخزينة: ${escapeHtml(voucher.userName ?? '........')}</span></div>
  </div>
</body>
</html>`
  if (preview) {
    await openPreviewWindow('voucher', 'معاينة السند', html)
    return { ok: true }
  }
  return printHtml(html, { ...printSettings, copies: 1 }, thermalWidthMm(printSettings.paperSize))
}

// تشخيص مؤقت لمشكلة "الفاتورة بتطبع مرتين" — بيسجّل كل نداء طباعة فعلي في ملف
// عشان نتأكد هل السبب استدعاء مكرر من الكود، ولا تكرار على مستوى الطابعة/الدرايفر نفسه.
// ينفع تتشال بعد ما تتحل المشكلة.
function logPrintDebug(_message: string): void {}

/** طباعة/معاينة مسودة فاتورة معلّقة (لسه ما اتدفعتش) — بنفس تصميم الشيك */
export async function printHeldInvoice(id: number, preview = false): Promise<PrintResult> {
  const held = await getHeldInvoice(id)
  if (!held) return { ok: false, error: 'الفاتورة المعلّقة غير موجودة' }
  const taxSettings = await getTaxSettings()
  const lines = held.payload.lines.map((l) => ({
    name: l.name,
    qty: l.qty,
    unitPrice: l.unitPrice,
    discount: l.discount || 0
  }))
  const gross = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const itemsDiscount = lines.reduce((s, l) => s + l.discount, 0)
  const net = gross - itemsDiscount
  const orderDiscount = Math.min(
    net,
    held.payload.discountType === 'percent' ? net * (held.payload.discountValue / 100) : held.payload.discountValue
  )
  const preTax = Math.max(0, net - orderDiscount)
  const tax = taxSettings.enabled ? preTax * (taxSettings.rate / 100) : 0
  return printOrderCheck(
    {
      orderNumber: `معلّقة #${held.id}`,
      orderType: 'retail',
      tableLabel: null,
      captainName: null,
      guestCount: null,
      customerName: held.customerLabel || null,
      items: lines,
      subtotal: gross,
      itemsDiscount,
      orderDiscount,
      taxName: `${taxSettings.taxName} (${taxSettings.rate}%)`,
      tax,
      service: 0,
      delivery: 0,
      total: preTax + tax
    },
    preview
  )
}

/** يفتح نافذة معاينة مرئية للفاتورة بنفس تصميم الطباعة دون إرسالها لطابعة فعليًا. */
export async function previewReceipt(invoiceId: number): Promise<PrintResult> {
  const built = await buildInvoiceHtml(invoiceId)
  if (!built) return { ok: false, error: 'الفاتورة غير موجودة' }

  await openPreviewWindow('receipt', 'معاينة الفاتورة', built.html)
  return { ok: true }
}

export async function buildQuotationHtml(
  quotationId: number
): Promise<{ html: string; printSettings: PrintSettings } | null> {
  const quotation = await getQuotationView(quotationId)
  if (!quotation) return null

  const [printSettings, storeSettings, posUiSettings] = await Promise.all([
    getPrintSettings(),
    getStoreSettings(),
    getPosUiSettings()
  ])
  currentCurrencySymbol = posUiSettings.currencySymbol
  const quotationBarcode = await generateBarcodeDataUrl(quotation.number, 'CODE128')
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'

  const html = isThermal
    ? buildThermalQuotationHtml(quotation, printSettings, storeSettings, quotationBarcode)
    : buildFormalQuotationHtml(quotation, printSettings, storeSettings, quotationBarcode)

  return { html, printSettings }
}

export async function printQuotation(quotationId: number): Promise<PrintResult> {
  const built = await buildQuotationHtml(quotationId)
  if (!built) return { ok: false, error: 'عرض السعر غير موجود' }
  return printHtml(built.html, built.printSettings, thermalWidthMm(built.printSettings.paperSize))
}

export async function previewQuotation(quotationId: number): Promise<PrintResult> {
  const built = await buildQuotationHtml(quotationId)
  if (!built) return { ok: false, error: 'عرض السعر غير موجود' }

  await openPreviewWindow('quotation', 'معاينة عرض السعر', built.html)
  return { ok: true }
}

const QUOTATION_STATUS_LABELS: Record<QuotationView['status'], string> = {
  draft: 'مسودة',
  sent: 'مُرسل',
  accepted: 'تم التحويل لفاتورة',
  expired: 'منتهي'
}

function buildThermalQuotationHtml(
  quotation: QuotationView,
  printSettings: PrintSettings,
  store: StoreSettings,
  quotationBarcode: string
): string {
  const { widthMm, contentWidthMm, offsetMm } = thermalCalibration(printSettings)

  const linesHtml = quotation.lines
    .map(
      (l) => `
      <div class="item">
        <div class="item-name">${escapeHtml(l.productName)}</div>
        <div class="item-row">
          <span>${l.qty} × ${currency.format(l.unitPrice)}</span>
          <span>${currency.format(l.total)}</span>
        </div>
      </div>`
    )
    .join('')

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; }
  .receipt { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; text-align: center; }
  .logo { max-width: 55mm; max-height: 20mm; margin-bottom: 4px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  p.store-meta { margin: 0 0 2px; font-size: 10.5px; color: #333; }
  hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
  .info-line { display: flex; justify-content: space-between; font-size: 10.5px; text-align: start; margin: 2px 0; }
  .item { text-align: start; margin-bottom: 3px; }
  .item-name { font-weight: bold; }
  .item-row { display: flex; justify-content: space-between; color: #333; }
  .totals-row { display: flex; justify-content: space-between; font-size: 11.5px; padding: 1px 0; }
  .grand-total { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 4px; }
  .invoice-barcode { margin: 4px 0; max-width: 100%; max-height: 15mm; }
  .quote-title { font-weight: 800; font-size: 13px; margin: 4px 0; }
</style>
</head>
<body>
  <div class="receipt">
    ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
    <h1>${escapeHtml(store.name)}</h1>
    ${store.address ? `<p class="store-meta">${escapeHtml(store.address)}</p>` : ''}
    ${store.phone ? `<p class="store-meta">${escapeHtml(store.phone)}</p>` : ''}
    <div class="quote-title">عرض سعر</div>
    <img class="invoice-barcode" src="${quotationBarcode}" />
    <hr />
    <div class="info-line"><span>الرقم</span><span>${escapeHtml(quotation.number)}</span></div>
    <div class="info-line"><span>التاريخ</span><span>${escapeHtml(quotation.createdAt)}</span></div>
    <div class="info-line"><span>العميل</span><span>${escapeHtml(quotation.customerName)}</span></div>
    ${quotation.validUntil ? `<div class="info-line"><span>صالح حتى</span><span>${escapeHtml(quotation.validUntil)}</span></div>` : ''}
    <div class="info-line"><span>الحالة</span><span>${QUOTATION_STATUS_LABELS[quotation.status]}</span></div>
    <hr />
    ${linesHtml}
    <hr />
    <div class="totals-row"><span>الإجمالي الفرعي</span><span>${currency.format(quotation.subtotal)}</span></div>
    ${quotation.discountTotal > 0 ? `<div class="totals-row"><span>الخصم</span><span>-${currency.format(quotation.discountTotal)}</span></div>` : ''}
    <div class="grand-total"><span>الإجمالي</span><span>${currency.format(quotation.total)}</span></div>
    ${quotation.note ? `<p class="store-meta">${escapeHtml(quotation.note)}</p>` : ''}
    <div class="thanks">${escapeHtml(store.thankYouMessage)}</div>
  </div>
</body>
</html>`
}

function buildFormalQuotationHtml(
  quotation: QuotationView,
  printSettings: PrintSettings,
  store: StoreSettings,
  quotationBarcode: string
): string {
  const rowsHtml = quotation.lines
    .map(
      (l, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(l.productName)}</td>
        <td>${escapeHtml(l.barcode)}</td>
        <td>${l.qty}</td>
        <td>${currency.format(l.unitPrice)}</td>
        <td>${l.discount > 0 ? currency.format(l.discount) : '—'}</td>
        <td>${currency.format(l.total)}</td>
      </tr>`
    )
    .join('')

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${printSettings.paperSize}; margin: 14mm 12mm; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; color: #16211c; font-size: 13px; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #146356; padding-bottom: 12px; margin-bottom: 16px; }
  .store-block { display: flex; gap: 12px; align-items: center; }
  .logo { max-width: 60px; max-height: 60px; }
  .store-name { font-size: 19px; font-weight: 800; margin: 0; }
  .store-meta { font-size: 11.5px; color: #555; margin: 2px 0 0; line-height: 1.5; }
  .invoice-title { text-align: end; }
  .invoice-title h2 { margin: 0; font-size: 20px; color: #146356; }
  .invoice-meta { margin-top: 6px; font-size: 12px; color: #444; }
  .invoice-meta div { margin-bottom: 2px; }
  .invoice-barcode { max-width: 170px; max-height: 18mm; margin-bottom: 4px; }

  .parties { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12.5px; }
  .parties .box { background: #f4f6f2; border-radius: 8px; padding: 8px 14px; }
  .parties .label { color: #6b7280; font-size: 11px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12.5px; }
  th, td { border: 1px solid #d9ded7; padding: 7px 9px; text-align: center; }
  th { background: #eef0f6; font-size: 11.5px; }
  td:nth-child(2) { text-align: start; }

  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { width: 280px; font-size: 13px; }
  .totals-box .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals-box .grand { border-top: 2px solid #146356; margin-top: 4px; padding-top: 6px; font-weight: 800; font-size: 17px; color: #146356; }

  .note-box { background: #f4f6f2; border-radius: 8px; padding: 10px 14px; font-size: 12px; margin-bottom: 16px; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px dashed #c3cdc0; padding-top: 14px; }
  .thanks { font-size: 13px; font-weight: bold; }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="store-block">
      ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
      <div>
        <p class="store-name">${escapeHtml(store.name)}</p>
        <p class="store-meta">
          ${store.address ? escapeHtml(store.address) + '<br/>' : ''}
          ${store.phone ? 'ت: ' + escapeHtml(store.phone) : ''}
          ${store.website ? ' — ' + escapeHtml(store.website) : ''}
        </p>
      </div>
    </div>
    <div class="invoice-title">
      <h2>عرض سعر</h2>
      <img class="invoice-barcode" src="${quotationBarcode}" />
      <span class="status-badge">${QUOTATION_STATUS_LABELS[quotation.status]}</span>
      <div class="invoice-meta">
        <div>الرقم: <b>${escapeHtml(quotation.number)}</b></div>
        <div>التاريخ: ${escapeHtml(quotation.createdAt)}</div>
        ${quotation.validUntil ? `<div>صالح حتى: ${escapeHtml(quotation.validUntil)}</div>` : ''}
        <div>أعدّه: ${escapeHtml(quotation.cashierName)}</div>
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <div class="label">العميل</div>
      <div><b>${escapeHtml(quotation.customerName)}</b></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>م</th><th>الصنف</th><th>الباركود</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals-box">
      <div class="row"><span>الإجمالي الفرعي</span><span>${currency.format(quotation.subtotal)}</span></div>
      ${quotation.discountTotal > 0 ? `<div class="row"><span>الخصم</span><span>-${currency.format(quotation.discountTotal)}</span></div>` : ''}
      <div class="row grand"><span>الإجمالي</span><span>${currency.format(quotation.total)}</span></div>
    </div>
  </div>

  ${quotation.note ? `<div class="note-box"><b>ملاحظات:</b> ${escapeHtml(quotation.note)}</div>` : ''}

  <div class="footer">
    <div class="thanks">${escapeHtml(store.thankYouMessage)}</div>
  </div>
</body>
</html>`
}

/* ---------------------------- إذن إضافة / إذن خصم ---------------------------- */

const STOCK_PERMIT_TITLE: Record<StockPermitView['type'], string> = {
  addition: 'إذن إضافة مخزون',
  deduction: 'إذن خصم مخزون'
}

export async function buildStockPermitHtml(
  permitId: number
): Promise<{ html: string; printSettings: PrintSettings } | null> {
  const permit = await getStockPermitView(permitId)
  if (!permit) return null

  const [printSettings, storeSettings, posUiSettings] = await Promise.all([
    getPrintSettings(),
    getStoreSettings(),
    getPosUiSettings()
  ])
  currentCurrencySymbol = posUiSettings.currencySymbol
  const permitBarcode = await generateBarcodeDataUrl(permit.number, 'CODE128')
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'

  const html = isThermal
    ? buildThermalStockPermitHtml(permit, printSettings, storeSettings, permitBarcode)
    : buildFormalStockPermitHtml(permit, printSettings, storeSettings, permitBarcode)

  return { html, printSettings }
}

export async function printStockPermit(permitId: number): Promise<PrintResult> {
  const built = await buildStockPermitHtml(permitId)
  if (!built) return { ok: false, error: 'الإذن غير موجود' }
  return printHtml(built.html, built.printSettings, thermalWidthMm(built.printSettings.paperSize))
}

export async function previewStockPermit(permitId: number): Promise<PrintResult> {
  const built = await buildStockPermitHtml(permitId)
  if (!built) return { ok: false, error: 'الإذن غير موجود' }

  await openPreviewWindow('stockPermit', 'معاينة الإذن', built.html)
  return { ok: true }
}

function buildThermalStockPermitHtml(
  permit: StockPermitView,
  printSettings: PrintSettings,
  store: StoreSettings,
  permitBarcode: string
): string {
  const { widthMm, contentWidthMm, offsetMm } = thermalCalibration(printSettings)

  const linesHtml = permit.lines
    .map(
      (l) => `
      <div class="item">
        <div class="item-name">${escapeHtml(l.productName)}</div>
        <div class="item-row">
          <span>${escapeHtml(l.barcode)}</span>
          <span>${l.qty}</span>
        </div>
        ${l.serialNumber ? `<div class="item-row"><span>سيريال</span><span>${escapeHtml(l.serialNumber)}</span></div>` : ''}
        ${l.unitPrice != null ? `<div class="item-row"><span>السعر</span><span>${currency.format(l.unitPrice)}</span></div>` : ''}
      </div>`
    )
    .join('')

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; }
  .receipt { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; text-align: center; }
  .logo { max-width: 55mm; max-height: 20mm; margin-bottom: 4px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
  .info-line { display: flex; justify-content: space-between; font-size: 10.5px; text-align: start; margin: 2px 0; }
  .item { text-align: start; margin-bottom: 3px; }
  .item-name { font-weight: bold; }
  .item-row { display: flex; justify-content: space-between; color: #333; }
  .grand-total { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 4px; }
  .invoice-barcode { margin: 4px 0; max-width: 100%; max-height: 15mm; }
  .quote-title { font-weight: 800; font-size: 13px; margin: 4px 0; }
</style>
</head>
<body>
  <div class="receipt">
    ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
    <h1>${escapeHtml(store.name)}</h1>
    <div class="quote-title">${STOCK_PERMIT_TITLE[permit.type]}</div>
    <img class="invoice-barcode" src="${permitBarcode}" />
    <hr />
    <div class="info-line"><span>الرقم</span><span>${escapeHtml(permit.number)}</span></div>
    <div class="info-line"><span>التاريخ</span><span>${escapeHtml(permit.createdAt)}</span></div>
    <div class="info-line"><span>المخزن</span><span>${escapeHtml(permit.warehouseName)}</span></div>
    <div class="info-line"><span>السبب</span><span>${escapeHtml(permit.reason ?? '—')}</span></div>
    <div class="info-line"><span>بواسطة</span><span>${escapeHtml(permit.userName)}</span></div>
    <hr />
    ${linesHtml}
    <hr />
    <div class="grand-total"><span>إجمالي الكمية</span><span>${permit.totalQty}</span></div>
    ${permit.note ? `<p class="info-line">${escapeHtml(permit.note)}</p>` : ''}
  </div>
</body>
</html>`
}

function buildFormalStockPermitHtml(
  permit: StockPermitView,
  printSettings: PrintSettings,
  store: StoreSettings,
  permitBarcode: string
): string {
  const rowsHtml = permit.lines
    .map(
      (l, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(l.productName)}</td>
        <td>${escapeHtml(l.barcode)}</td>
        <td>${l.qty}</td>
        <td>${l.unitPrice != null ? currency.format(l.unitPrice) : '—'}</td>
        <td>${l.serialNumber ? escapeHtml(l.serialNumber) : '—'}</td>
        <td>${l.note ? escapeHtml(l.note) : '—'}</td>
      </tr>`
    )
    .join('')

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${printSettings.paperSize}; margin: 14mm 12mm; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; color: #16211c; font-size: 13px; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #146356; padding-bottom: 12px; margin-bottom: 16px; }
  .store-block { display: flex; gap: 12px; align-items: center; }
  .logo { max-width: 60px; max-height: 60px; }
  .store-name { font-size: 19px; font-weight: 800; margin: 0; }
  .invoice-title { text-align: end; }
  .invoice-title h2 { margin: 0; font-size: 20px; color: #146356; }
  .invoice-meta { margin-top: 6px; font-size: 12px; color: #444; }
  .invoice-meta div { margin-bottom: 2px; }
  .invoice-barcode { max-width: 170px; max-height: 18mm; margin-bottom: 4px; }

  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12.5px; }
  .meta .box { background: #f4f6f2; border-radius: 8px; padding: 8px 14px; }
  .meta .label { color: #6b7280; font-size: 11px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12.5px; }
  th, td { border: 1px solid #d9ded7; padding: 7px 9px; text-align: center; }
  th { background: #eef0f6; font-size: 11.5px; }
  td:nth-child(2) { text-align: start; }

  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { width: 240px; font-size: 13px; }
  .totals-box .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals-box .grand { border-top: 2px solid #146356; margin-top: 4px; padding-top: 6px; font-weight: 800; font-size: 17px; color: #146356; }

  .note-box { background: #f4f6f2; border-radius: 8px; padding: 10px 14px; font-size: 12px; margin-bottom: 16px; }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="store-block">
      ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
      <p class="store-name">${escapeHtml(store.name)}</p>
    </div>
    <div class="invoice-title">
      <h2>${STOCK_PERMIT_TITLE[permit.type]}</h2>
      <img class="invoice-barcode" src="${permitBarcode}" />
      <div class="invoice-meta">
        <div>الرقم: <b>${escapeHtml(permit.number)}</b></div>
        <div>التاريخ: ${escapeHtml(permit.createdAt)}</div>
        <div>بواسطة: ${escapeHtml(permit.userName)}</div>
      </div>
    </div>
  </div>

  <div class="meta">
    <div class="box"><span class="label">المخزن</span><br/>${escapeHtml(permit.warehouseName)}</div>
    <div class="box"><span class="label">السبب</span><br/>${escapeHtml(permit.reason ?? '—')}</div>
  </div>

  <table>
    <thead>
      <tr><th>م</th><th>الصنف</th><th>الباركود</th><th>الكمية</th><th>السعر</th><th>السيريال</th><th>ملاحظة</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals-box">
      <div class="row grand"><span>إجمالي الكمية</span><span>${permit.totalQty}</span></div>
    </div>
  </div>

  ${permit.note ? `<div class="note-box"><b>ملاحظات:</b> ${escapeHtml(permit.note)}</div>` : ''}
</body>
</html>`
}

export async function printBarcodeLabels(
  items: { barcode: string; name: string; price: number }[]
): Promise<PrintResult> {
  if (!items.length) return { ok: false, error: 'اختر صنف واحد على الأقل' }

  const labelSettings = await getBarcodeLabelSettings()
  const printSettings = await getPrintSettings()

  const labelsHtml = await Promise.all(
    items.map(async (item) => {
      const img = await generateBarcodeDataUrl(item.barcode, labelSettings.labelType)
      return buildLabelHtml(item, img, labelSettings)
    })
  )

  const html = wrapLabelsHtml(labelsHtml.join(''), labelSettings)
  // مقاس الصفحة = مقاس الملصق الفعلي (مع مراعاة الاتجاه)، مش مقاس ورق الإيصالات. ده بيخلي كل صفحة
  // تساوي ملصق واحد بالمقاس الصحيح، وبالتالي طابعة الملصقات (زي Zebra ZD100) بتفهرس صح وتقص عند
  // نهاية كل ملصق بدل ما تغذّي ورق زيادة أو ترصّ أكتر من ملصق في صفحة واحدة.
  const pageWidthMm = labelSettings.orientation === 'vertical' ? labelSettings.labelWidthMm : labelSettings.labelHeightMm
  const pageHeightMm = labelSettings.orientation === 'vertical' ? labelSettings.labelHeightMm : labelSettings.labelWidthMm
  return printHtml(html, printSettings, undefined, { width: pageWidthMm, height: pageHeightMm })
}

/* ---------------------------- ملخص إقفال الوردية ---------------------------- */

export async function buildShiftSummaryHtml(
  sessionId: number,
  detailed = false
): Promise<{ html: string; printSettings: PrintSettings } | null> {
  const report = await getShiftSummaryReport(sessionId)
  if (!report) return null

  const [printSettings, rawStoreSettings, posUiSettings] = await Promise.all([
    getPrintSettings(),
    getStoreSettings(),
    getPosUiSettings()
  ])
  const storeSettings = await withBranchName(
    rawStoreSettings,
    'SELECT b.name FROM cash_sessions cs JOIN branches b ON b.id = cs.branch_id WHERE cs.id = ?',
    sessionId
  )
  currentCurrencySymbol = posUiSettings.currencySymbol
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'

  const html = isThermal
    ? buildThermalShiftSummaryHtml(report, printSettings, storeSettings, detailed)
    : buildFormalShiftSummaryHtml(report, printSettings, storeSettings, detailed)

  return { html, printSettings }
}

export async function printShiftSummary(sessionId: number, detailed = false): Promise<PrintResult> {
  const built = await buildShiftSummaryHtml(sessionId, detailed)
  if (!built) return { ok: false, error: 'الوردية غير موجودة' }
  return printHtml(built.html, built.printSettings, thermalWidthMm(built.printSettings.paperSize))
}

export async function previewShiftSummary(sessionId: number, detailed = false): Promise<PrintResult> {
  const built = await buildShiftSummaryHtml(sessionId, detailed)
  if (!built) return { ok: false, error: 'الوردية غير موجودة' }

  await openPreviewWindow('shiftSummary', 'معاينة ملخص الوردية', built.html)
  return { ok: true }
}

function shiftSummaryRowsHtml(report: ShiftSummaryReport): string {
  const rows: string[] = []
  for (const m of report.salesByMethod) {
    rows.push(
      `<div class="totals-row"><span>مبيعات ${escapeHtml(PAYMENT_METHOD_LABELS[m.method] ?? m.method)}</span><span>${currency.format(m.total)}</span></div>`
    )
  }
  for (const m of report.expensesByMethod) {
    rows.push(
      `<div class="totals-row"><span>مصروفات ${escapeHtml(EXPENSE_METHOD_LABELS[m.method] ?? m.method)}</span><span>-${currency.format(m.total)}</span></div>`
    )
  }
  return rows.join('')
}

const qtyFormat = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 })

/** الطباعة التفصيلية للوردية: جدول بكل صنف اتباع (الكمية + الإجمالي) */
function shiftItemsTableHtml(report: ShiftSummaryReport): string {
  if (!report.itemsSold.length) return '<p style="text-align:center;font-size:11px">لا توجد أصناف مباعة في الوردية</p>'
  const rows = report.itemsSold
    .map(
      (i) =>
        `<tr><td class="n">${escapeHtml(i.name)}</td><td class="q">${qtyFormat.format(i.qty)}</td><td class="t">${currency.format(i.total)}</td></tr>`
    )
    .join('')
  const totalQty = report.itemsSold.reduce((s, i) => s + i.qty, 0)
  const total = report.itemsSold.reduce((s, i) => s + i.total, 0)
  return `<table class="items-sold">
    <thead><tr><th class="n">الصنف</th><th class="q">الكمية</th><th class="t">الإجمالي</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="n">الإجمالي (${report.itemsSold.length} صنف)</td><td class="q">${qtyFormat.format(totalQty)}</td><td class="t">${currency.format(total)}</td></tr></tfoot>
  </table>`
}

function buildThermalShiftSummaryHtml(
  report: ShiftSummaryReport,
  printSettings: PrintSettings,
  store: StoreSettings,
  detailed = false
): string {
  const { widthMm, contentWidthMm, offsetMm } = thermalCalibration(printSettings)

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; }
  .receipt { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; text-align: center; }
  .logo { max-width: 55mm; max-height: 20mm; margin-bottom: 4px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  p.store-meta { margin: 0 0 2px; font-size: 10.5px; color: #333; }
  hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
  .info-line { display: flex; justify-content: space-between; font-size: 10.5px; text-align: start; margin: 2px 0; }
  .totals-row { display: flex; justify-content: space-between; font-size: 11.5px; padding: 1px 0; text-align: start; }
  .grand-total { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 4px; }
  .diff-ok { color: #146356; }
  .diff-bad { color: #a23a2e; }
  .items-sold { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 2px; }
  .items-sold th { border-bottom: 1px solid #000; padding: 2px 0; }
  .items-sold td { padding: 2px 0; border-bottom: 1px dotted #999; }
  .items-sold tfoot td { font-weight: bold; border-top: 1px solid #000; border-bottom: none; }
  .items-sold .n { text-align: start; }
  .items-sold .q { text-align: center; width: 18%; }
  .items-sold .t { text-align: end; width: 32%; }
</style>
</head>
<body>
  <div class="receipt">
    ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
    <h1>${escapeHtml(store.name)}</h1>
    <div class="quote-title">ملخص إقفال الوردية</div>
    <hr />
    <div class="info-line"><span>بداية الوردية</span><span>${escapeHtml(report.openedAt)}</span></div>
    <div class="info-line"><span>نهاية الوردية</span><span>${escapeHtml(report.closedAt ?? '—')}</span></div>
    <div class="info-line"><span>فتح الوردية</span><span>${escapeHtml(report.cashierName)}</span></div>
    <div class="info-line"><span>أغلق الوردية</span><span>${escapeHtml(report.closedByName ?? '—')}</span></div>
    <hr />
    <div class="info-line"><span>عدد الفواتير</span><span>${report.invoiceCount}</span></div>
    <div class="info-line"><span>إجمالي الأصناف المباعة</span><span>${report.totalItemsSold}</span></div>
    <hr />
    <div class="totals-row"><span>الرصيد الافتتاحي</span><span>${currency.format(report.openingBalance)}</span></div>
    ${shiftSummaryRowsHtml(report)}
    <div class="grand-total"><span>إجمالي المبيعات</span><span>${currency.format(report.totalSales)}</span></div>
    ${report.totalTips > 0 ? `<div class="totals-row"><span>🎁 إكراميات (تيبس)</span><span>${currency.format(report.totalTips)}</span></div>` : ''}
    ${report.eventPaymentCount > 0 ? `<div class="totals-row"><span>🎂 تحصيلات الحجوزات (${report.eventPaymentCount})</span><span>${currency.format(report.totalEventPayments)}</span></div>` : ''}
    <div class="totals-row"><span>إجمالي المصروفات</span><span>-${currency.format(report.totalExpenses)}</span></div>
    <div class="totals-row"><span>إجمالي المشتريات (${report.purchaseInvoiceCount})</span><span>-${currency.format(report.totalPurchases)}</span></div>
    <div class="totals-row"><span>إجمالي المرتجعات (${report.returnCount})</span><span>-${currency.format(report.totalReturns)}</span></div>
    <hr />
    <div class="totals-row"><span>الرصيد المتوقع بالدرج</span><span>${report.expectedCash != null ? currency.format(report.expectedCash) : '—'}</span></div>
    <div class="totals-row"><span>الرصيد الفعلي المُعدود</span><span>${report.actualCash != null ? currency.format(report.actualCash) : '—'}</span></div>
    <div class="grand-total ${report.cashDifference != null && report.cashDifference !== 0 ? (report.cashDifference > 0 ? 'diff-ok' : 'diff-bad') : ''}">
      <span>الفرق</span><span>${report.cashDifference != null ? currency.format(report.cashDifference) : '—'}</span>
    </div>
    ${detailed ? `<hr /><div class="quote-title">مبيعات الوردية تفصيلي (إجمالي الأصناف)</div>${shiftItemsTableHtml(report)}` : ''}
  </div>
</body>
</html>`
}

function buildFormalShiftSummaryHtml(
  report: ShiftSummaryReport,
  printSettings: PrintSettings,
  store: StoreSettings,
  detailed = false
): string {
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${printSettings.paperSize}; margin: 14mm 12mm; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; color: #16211c; font-size: 13px; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #146356; padding-bottom: 12px; margin-bottom: 16px; }
  .store-block { display: flex; gap: 12px; align-items: center; }
  .logo { max-width: 60px; max-height: 60px; }
  .store-name { font-size: 19px; font-weight: 800; margin: 0; }
  .title { text-align: end; }
  .title h2 { margin: 0; font-size: 20px; color: #146356; }

  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12.5px; }
  .meta .box { background: #f4f6f2; border-radius: 8px; padding: 8px 14px; }
  .meta .label { color: #6b7280; font-size: 11px; }

  .totals-wrap { display: flex; justify-content: center; margin-top: 10px; }
  .totals-box { width: 360px; font-size: 13px; }
  .totals-box .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #e2e6de; }
  .totals-box .grand { border-top: 2px solid #146356; margin-top: 6px; padding-top: 8px; font-weight: 800; font-size: 16px; color: #146356; }
  .totals-box .diff-ok { color: #146356; font-weight: bold; }
  .totals-box .diff-bad { color: #a23a2e; font-weight: bold; }
  .items-title { margin: 22px 0 8px; font-size: 15px; color: #146356; }
  .items-sold { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .items-sold th { background: #146356; color: #fff; padding: 6px 8px; }
  .items-sold td { padding: 5px 8px; border-bottom: 1px solid #e2e6de; }
  .items-sold tfoot td { font-weight: 800; background: #f4f6f2; }
  .items-sold .n { text-align: start; }
  .items-sold .q { text-align: center; width: 18%; }
  .items-sold .t { text-align: end; width: 26%; }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="store-block">
      ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
      <p class="store-name">${escapeHtml(store.name)}</p>
    </div>
    <div class="title"><h2>ملخص إقفال الوردية</h2></div>
  </div>

  <div class="meta">
    <div class="box"><span class="label">بداية الوردية</span><br/>${escapeHtml(report.openedAt)}</div>
    <div class="box"><span class="label">نهاية الوردية</span><br/>${escapeHtml(report.closedAt ?? '—')}</div>
    <div class="box"><span class="label">فتح الوردية</span><br/>${escapeHtml(report.cashierName)}</div>
    <div class="box"><span class="label">أغلق الوردية</span><br/>${escapeHtml(report.closedByName ?? '—')}</div>
  </div>

  <div class="totals-wrap">
    <div class="totals-box">
      <div class="row"><span>عدد الفواتير</span><span>${report.invoiceCount}</span></div>
      <div class="row"><span>إجمالي الأصناف المباعة</span><span>${report.totalItemsSold}</span></div>
      <div class="row"><span>الرصيد الافتتاحي</span><span>${currency.format(report.openingBalance)}</span></div>
      ${report.salesByMethod
        .map(
          (m) =>
            `<div class="row"><span>مبيعات ${escapeHtml(PAYMENT_METHOD_LABELS[m.method] ?? m.method)}</span><span>${currency.format(m.total)}</span></div>`
        )
        .join('')}
      <div class="row"><span>إجمالي المبيعات</span><span>${currency.format(report.totalSales)}</span></div>
      ${report.totalTips > 0 ? `<div class="row"><span>إكراميات (تيبس)</span><span>${currency.format(report.totalTips)}</span></div>` : ''}
      ${report.eventPaymentCount > 0 ? `<div class="row"><span>تحصيلات الحجوزات (${report.eventPaymentCount})</span><span>${currency.format(report.totalEventPayments)}</span></div>` : ''}
      ${report.expensesByMethod
        .map(
          (m) =>
            `<div class="row"><span>مصروفات ${escapeHtml(EXPENSE_METHOD_LABELS[m.method] ?? m.method)}</span><span>-${currency.format(m.total)}</span></div>`
        )
        .join('')}
      <div class="row"><span>إجمالي المصروفات</span><span>-${currency.format(report.totalExpenses)}</span></div>
      <div class="row"><span>إجمالي المشتريات (${report.purchaseInvoiceCount})</span><span>-${currency.format(report.totalPurchases)}</span></div>
      <div class="row"><span>إجمالي المرتجعات (${report.returnCount})</span><span>-${currency.format(report.totalReturns)}</span></div>
      <div class="row"><span>الرصيد المتوقع بالدرج</span><span>${report.expectedCash != null ? currency.format(report.expectedCash) : '—'}</span></div>
      <div class="row"><span>الرصيد الفعلي المُعدود</span><span>${report.actualCash != null ? currency.format(report.actualCash) : '—'}</span></div>
      <div class="row grand ${report.cashDifference != null && report.cashDifference !== 0 ? (report.cashDifference > 0 ? 'diff-ok' : 'diff-bad') : ''}">
        <span>الفرق</span><span>${report.cashDifference != null ? currency.format(report.cashDifference) : '—'}</span>
      </div>
    </div>
  </div>
  ${detailed ? `<h3 class="items-title">مبيعات الوردية تفصيلي (إجمالي الأصناف)</h3>${shiftItemsTableHtml(report)}` : ''}
</body>
</html>`
}

export async function openCashDrawer(): Promise<PrintResult> {
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

function loyaltyLinesHtml(invoice: InvoiceView): string {
  if (invoice.customerLoyaltyBalance === null) return ''
  if (invoice.loyaltyPointsEarned <= 0 && invoice.loyaltyPointsRedeemed <= 0) return ''
  const rows: string[] = []
  if (invoice.loyaltyPointsRedeemed > 0) {
    rows.push(`<div class="totals-row"><span>نقاط مستبدلة</span><span>-${invoice.loyaltyPointsRedeemed} ⭐</span></div>`)
  }
  if (invoice.loyaltyPointsEarned > 0) {
    rows.push(`<div class="totals-row"><span>نقاط مكتسبة</span><span>+${invoice.loyaltyPointsEarned} ⭐</span></div>`)
  }
  rows.push(`<div class="totals-row"><span>رصيد النقاط الحالي</span><span>${invoice.customerLoyaltyBalance} ⭐</span></div>`)
  return rows.join('')
}

function loyaltyRowsFormalHtml(invoice: InvoiceView): string {
  if (invoice.customerLoyaltyBalance === null) return ''
  if (invoice.loyaltyPointsEarned <= 0 && invoice.loyaltyPointsRedeemed <= 0) return ''
  const rows: string[] = []
  if (invoice.loyaltyPointsRedeemed > 0) {
    rows.push(`<div class="row"><span>نقاط مستبدلة</span><span>-${invoice.loyaltyPointsRedeemed} ⭐</span></div>`)
  }
  if (invoice.loyaltyPointsEarned > 0) {
    rows.push(`<div class="row"><span>نقاط مكتسبة</span><span>+${invoice.loyaltyPointsEarned} ⭐</span></div>`)
  }
  rows.push(`<div class="row"><span>رصيد النقاط الحالي</span><span>${invoice.customerLoyaltyBalance} ⭐</span></div>`)
  return rows.join('')
}

/** (ويب فقط) تفاصيل الدفع المقسّم + تاريخ استحقاق الباقي الآجل على الفاتورة المطبوعة */
function paymentDetailsHtml(invoice: InvoiceView, cls: 'totals-row' | 'row', withCreditRow = true): string {
  const parts = invoice.payments
    .map((p) => `<div class="${cls}"><span>${escapeHtml(PAYMENT_METHOD_LABELS[p.method] ?? p.method)}</span><span>${currency.format(p.amount)}</span></div>`)
    .join('')
  const outstanding = invoice.total - invoice.paid
  const credit =
    withCreditRow && invoice.payments.length && outstanding > 0.005
      ? `<div class="${cls}"><span>آجل</span><span>${currency.format(outstanding)}</span></div>`
      : ''
  const due =
    invoice.dueDate && outstanding > 0.005
      ? `<div class="${cls}"><span>تاريخ الاستحقاق</span><span>${escapeHtml(invoice.dueDate)}</span></div>`
      : ''
  return parts + credit + due
}

/** بيظهر بس في فواتير البيع الآجل — رصيد العميل قبل الفاتورة وبعدها (بعد إضافة قيمة الفاتورة كدين). */
function balanceLinesHtml(invoice: InvoiceView): string {
  if (invoice.customerBalanceBefore === null || invoice.customerBalanceAfter === null) return ''
  return `
    <div class="totals-row"><span>الرصيد السابق</span><span>${currency.format(invoice.customerBalanceBefore)}</span></div>
    <div class="totals-row"><span>الرصيد الحالي</span><span>${currency.format(invoice.customerBalanceAfter)}</span></div>`
}

function balanceRowsFormalHtml(invoice: InvoiceView): string {
  if (invoice.customerBalanceBefore === null || invoice.customerBalanceAfter === null) return ''
  return `
    <div class="row"><span>الرصيد السابق</span><span>${currency.format(invoice.customerBalanceBefore)}</span></div>
    <div class="row"><span>الرصيد الحالي</span><span>${currency.format(invoice.customerBalanceAfter)}</span></div>`
}

function statusBadge(status: InvoiceView['status']): string {
  if (status === 'returned') return '<div class="status-badge status-returned">فاتورة مرتجعة بالكامل</div>'
  if (status === 'partial_return') return '<div class="status-badge status-partial">مرتجع جزئي</div>'
  return ''
}

const BASE_STYLE = `
  * { box-sizing: border-box; }
  .status-badge {
    display: inline-block; font-weight: bold; padding: 3px 10px; border-radius: 5px;
    border: 1.5px solid currentColor; margin-bottom: 8px;
  }
  .status-returned { color: #a23a2e; }
  .status-partial { color: #a8701e; }
`

/* ---------------------------- إيصال حراري (80mm / 58mm) ---------------------------- */

function buildThermalReceiptHtml(
  invoice: InvoiceView,
  printSettings: PrintSettings,
  store: StoreSettings,
  tax: TaxSettings,
  qr: string | null,
  invoiceBarcode: string
): string {
  const { widthMm, contentWidthMm, offsetMm } = thermalCalibration(printSettings)

  const linesHtml = invoice.lines
    .map(
      (l) => `
      <div class="item">
        <div class="item-name">${escapeHtml(l.productName)}</div>
        ${l.serialNumber ? `<div class="item-serial">S/N: ${escapeHtml(l.serialNumber)}</div>` : ''}
        ${l.serviceAmount ? `<div class="item-serial">مبلغ العملية: ${currency.format(l.serviceAmount)} — العمولة</div>` : ''}
        <div class="item-row">
          <span>${l.qty} × ${currency.format(l.unitPrice)}</span>
          <span>${currency.format(l.total)}</span>
        </div>
        ${l.discount > 0 ? `<div class="item-serial">خصم الصنف -${currency.format(l.discount)}</div>` : ''}
      </div>`
    )
    .join('')

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 12px; }
  .receipt { width: ${contentWidthMm}mm; margin-left: ${offsetMm}mm; margin-right: auto; text-align: center; }
  .logo { max-width: 55mm; max-height: 20mm; margin-bottom: 4px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  p.store-meta { margin: 0 0 2px; font-size: 10.5px; color: #333; }
  hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
  .info-line { display: flex; justify-content: space-between; font-size: 10.5px; text-align: start; margin: 2px 0; }
  .item { text-align: start; margin-bottom: 3px; }
  .item-name { font-weight: bold; }
  .item-serial { font-size: 10px; color: #555; }
  .item-row { display: flex; justify-content: space-between; color: #333; }
  .totals-row { display: flex; justify-content: space-between; font-size: 11.5px; padding: 1px 0; }
  .grand-total { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 4px; }
  .qr { margin-top: 8px; }
  .thanks { margin-top: 10px; font-size: 11px; font-weight: bold; }
  .invoice-barcode { margin: 4px 0; max-width: 100%; max-height: 15mm; }
</style>
</head>
<body>
  <div class="receipt">
    ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
    <h1>${escapeHtml(store.name)}</h1>
    ${store.address ? `<p class="store-meta">${escapeHtml(store.address)}</p>` : ''}
    ${store.phone ? `<p class="store-meta">${escapeHtml(store.phone)}</p>` : ''}
    <img class="invoice-barcode" src="${invoiceBarcode}" />
    <hr />
    ${statusBadge(invoice.status)}
    <div class="info-line"><span>رقم الفاتورة</span><span>${escapeHtml(invoice.number)}</span></div>
    <div class="info-line"><span>التاريخ</span><span>${escapeHtml(invoice.createdAt)}</span></div>
    <div class="info-line"><span>العميل</span><span>${escapeHtml(invoice.customerName)}</span></div>
    <div class="info-line"><span>الكاشير</span><span>${escapeHtml(invoice.cashierName)}</span></div>
    ${orderTypeInfoLinesHtml(invoice)}
    <hr />
    ${linesHtml}
    <hr />
    <div class="totals-row"><span>الإجمالي الفرعي</span><span>${currency.format(invoice.subtotal)}</span></div>
    ${invoice.discountTotal > 0 ? `<div class="totals-row"><span>الخصم</span><span>-${currency.format(invoice.discountTotal)}</span></div>` : ''}
    ${invoice.taxTotal > 0 ? `<div class="totals-row"><span>${taxLabel(tax)}</span><span>${currency.format(invoice.taxTotal)}</span></div>` : ''}
    ${invoice.serviceChargeTotal > 0 ? `<div class="totals-row"><span>خدمة</span><span>${currency.format(invoice.serviceChargeTotal)}</span></div>` : ''}
    ${invoice.deliveryFee > 0 ? `<div class="totals-row"><span>رسوم التوصيل</span><span>${currency.format(invoice.deliveryFee)}</span></div>` : ''}
    <div class="grand-total"><span>الإجمالي</span><span>${currency.format(invoice.total)}</span></div>
    <div class="totals-row"><span>طريقة الدفع</span><span>${PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}</span></div>
    ${paymentDetailsHtml(invoice, 'totals-row')}
    ${balanceLinesHtml(invoice)}
    ${loyaltyLinesHtml(invoice)}
    ${qr ? `<div class="qr"><img src="${qr}" width="100" height="100" /></div>` : ''}
    <div class="thanks">${escapeHtml(store.thankYouMessage)}</div>
  </div>
</body>
</html>`
}

/* ---------------------------- فاتورة رسمية (A4 / A5) ---------------------------- */

function buildFormalInvoiceHtml(
  invoice: InvoiceView,
  printSettings: PrintSettings,
  store: StoreSettings,
  tax: TaxSettings,
  qr: string | null,
  invoiceBarcode: string
): string {
  const rowsHtml = invoice.lines
    .map(
      (l, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(l.productName)}${l.serialNumber ? `<br/><span class="serial">S/N: ${escapeHtml(l.serialNumber)}</span>` : ''}${l.serviceAmount ? `<br/><span class="serial">مبلغ العملية: ${currency.format(l.serviceAmount)}</span>` : ''}</td>
        <td>${escapeHtml(l.barcode)}</td>
        <td>${l.qty}</td>
        <td>${currency.format(l.unitPrice)}</td>
        <td>${l.discount > 0 ? currency.format(l.discount) : '—'}</td>
        <td>${currency.format(l.total)}</td>
      </tr>`
    )
    .join('')

  const outstanding = invoice.total - invoice.paid

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLE}
  @page { size: ${printSettings.paperSize}; margin: 14mm 12mm; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; color: #16211c; font-size: 13px; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #146356; padding-bottom: 12px; margin-bottom: 16px; }
  .store-block { display: flex; gap: 12px; align-items: center; }
  .logo { max-width: 60px; max-height: 60px; }
  .store-name { font-size: 19px; font-weight: 800; margin: 0; }
  .store-meta { font-size: 11.5px; color: #555; margin: 2px 0 0; line-height: 1.5; }
  .invoice-title { text-align: end; }
  .invoice-title h2 { margin: 0; font-size: 20px; color: #146356; }
  .invoice-meta { margin-top: 6px; font-size: 12px; color: #444; }
  .invoice-meta div { margin-bottom: 2px; }

  .parties { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12.5px; }
  .parties .box { background: #f4f6f2; border-radius: 8px; padding: 8px 14px; }
  .parties .label { color: #6b7280; font-size: 11px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12.5px; }
  th, td { border: 1px solid #d9ded7; padding: 7px 9px; text-align: center; }
  th { background: #eef0f6; font-size: 11.5px; }
  td:nth-child(2) { text-align: start; }
  .serial { font-size: 10.5px; color: #6b7280; }

  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { width: 280px; font-size: 13px; }
  .totals-box .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals-box .grand { border-top: 2px solid #146356; margin-top: 4px; padding-top: 6px; font-weight: 800; font-size: 17px; color: #146356; }
  .totals-box .due { color: #a23a2e; font-weight: bold; }

  .footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px dashed #c3cdc0; padding-top: 14px; }
  .thanks { font-size: 13px; font-weight: bold; }
  .qr { text-align: center; }
  .qr p { font-size: 10px; color: #777; margin: 4px 0 0; }
  .invoice-barcode { max-width: 170px; max-height: 18mm; margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="store-block">
      ${store.logoDataUrl ? `<img class="logo" src="${store.logoDataUrl}" />` : ''}
      <div>
        <p class="store-name">${escapeHtml(store.name)}</p>
        <p class="store-meta">
          ${store.address ? escapeHtml(store.address) + '<br/>' : ''}
          ${store.phone ? 'ت: ' + escapeHtml(store.phone) : ''}
          ${store.website ? ' — ' + escapeHtml(store.website) : ''}
        </p>
        ${tax.enabled && tax.taxNumber ? `<p class="store-meta">الرقم الضريبي: ${escapeHtml(tax.taxNumber)}</p>` : ''}
      </div>
    </div>
    <div class="invoice-title">
      <h2>${tax.eInvoiceEnabled ? 'فاتورة ضريبية' : 'فاتورة مبيعات'}</h2>
      <img class="invoice-barcode" src="${invoiceBarcode}" />
      ${statusBadge(invoice.status)}
      <div class="invoice-meta">
        <div>رقم الفاتورة: <b>${escapeHtml(invoice.number)}</b></div>
        <div>التاريخ: ${escapeHtml(invoice.createdAt)}</div>
        <div>الكاشير: ${escapeHtml(invoice.cashierName)}</div>
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <div class="label">العميل</div>
      <div><b>${escapeHtml(invoice.customerName)}</b></div>
      ${invoice.orderType === 'delivery' && invoice.customerPhone ? `<div>${escapeHtml(invoice.customerPhone)}</div>` : ''}
      ${invoice.orderType === 'delivery' && invoice.deliveryAddress ? `<div>${escapeHtml(invoice.deliveryAddress)}</div>` : ''}
    </div>
    <div class="box">
      <div class="label">طريقة الدفع</div>
      <div><b>${PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}</b></div>
    </div>
    ${invoice.orderType !== 'retail' ? `<div class="box">
      <div class="label">نوع الطلب</div>
      <div><b>${ORDER_TYPE_LABELS[invoice.orderType] ?? invoice.orderType}</b></div>
      ${invoice.orderType === 'dine_in' && invoice.tableName ? `<div>ترابيزة: ${escapeHtml(invoice.tableName)}</div>` : ''}
      ${invoice.orderType === 'dine_in' && invoice.captainName ? `<div>الكابتن: ${escapeHtml(invoice.captainName)}</div>` : ''}
      ${invoice.orderType === 'delivery' && invoice.deliveryDriverName ? `<div>السائق: ${escapeHtml(invoice.deliveryDriverName)}</div>` : ''}
    </div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>م</th><th>الصنف</th><th>الباركود</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals-box">
      <div class="row"><span>الإجمالي الفرعي</span><span>${currency.format(invoice.subtotal)}</span></div>
      ${invoice.discountTotal > 0 ? `<div class="row"><span>الخصم</span><span>-${currency.format(invoice.discountTotal)}</span></div>` : ''}
      ${invoice.taxTotal > 0 ? `<div class="row"><span>${taxLabel(tax)}</span><span>${currency.format(invoice.taxTotal)}</span></div>` : ''}
      ${invoice.serviceChargeTotal > 0 ? `<div class="row"><span>خدمة</span><span>${currency.format(invoice.serviceChargeTotal)}</span></div>` : ''}
      ${invoice.deliveryFee > 0 ? `<div class="row"><span>رسوم التوصيل</span><span>${currency.format(invoice.deliveryFee)}</span></div>` : ''}
      <div class="row grand"><span>الإجمالي</span><span>${currency.format(invoice.total)}</span></div>
      <div class="row"><span>المدفوع</span><span>${currency.format(invoice.paid)}</span></div>
      ${outstanding > 0.01 ? `<div class="row due"><span>المتبقي</span><span>${currency.format(outstanding)}</span></div>` : ''}
      ${paymentDetailsHtml(invoice, 'row', false)}
      ${balanceRowsFormalHtml(invoice)}
      ${loyaltyRowsFormalHtml(invoice)}
    </div>
  </div>

  <div class="footer">
    <div class="thanks">${escapeHtml(store.thankYouMessage)}</div>
    ${qr ? `<div class="qr"><img src="${qr}" width="90" height="90" /><p>Quick Cash Plus</p></div>` : ''}
  </div>
</body>
</html>`
}

function buildLabelHtml(
  item: { barcode: string; name: string; price: number },
  img: string,
  settings: BarcodeLabelSettings
): string {
  return `<div class="label">
    ${settings.showName ? `<div class="name">${escapeHtml(item.name)}</div>` : ''}
    <img src="${img}" class="barcode-img" />
    ${settings.showBarcodeNumber ? `<div class="code">${escapeHtml(item.barcode)}</div>` : ''}
    ${settings.showPrice ? `<div class="price">${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(item.price)}</div>` : ''}
  </div>`
}

function wrapLabelsHtml(labelsHtml: string, settings: BarcodeLabelSettings): string {
  const pageW = settings.orientation === 'vertical' ? settings.labelWidthMm : settings.labelHeightMm
  const pageH = settings.orientation === 'vertical' ? settings.labelHeightMm : settings.labelWidthMm
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  /* مقاس صفحة صريح = مقاس الملصق الواحد + هوامش صفر: ضروري لطابعات الملصقات المخصصة زي Zebra ZD100.
     كل ملصق يبدأ في صفحة جديدة (page-break-after) عشان الطابعة تفهرس للملصق التالي صح. */
  @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
  html, body { margin: 0; padding: 0; font-family: Tahoma, Arial, sans-serif; }
  .label {
    width: ${pageW}mm;
    height: ${pageH}mm;
    box-sizing: border-box;
    padding: 1mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
    page-break-inside: avoid;
    page-break-after: always;
  }
  .label:last-child { page-break-after: auto; }
  .name { font-size: 8px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .barcode-img { max-width: 100%; max-height: 60%; }
  .code { font-size: 7px; }
  .price { font-size: 9px; font-weight: bold; }
</style>
</head>
<body>${labelsHtml}</body>
</html>`
}
