import { getInvoiceView, getReceiptQr } from './invoices'
import { getQuotationView } from './quotations'
import { getStockPermitView } from './stockPermits'
import { getShiftSummaryReport } from './cashSession'
import {
  getBarcodeLabelSettings,
  getPosUiSettings,
  getPrintSettings,
  getStoreSettings,
  getTaxSettings
} from './settings'
import { generateBarcodeDataUrl } from './barcode'
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
 * بناء HTML الفاتورة (حراري أو رسمي حسب إعدادات الطباعة) — نفس منطق الأوفلاين بالظبط
 * (services/print.ts هناك)، منقول هنا لأنه كود بناء نص/HTML خالص بدون أي اعتماد على Electron.
 * الفرق الوحيد عن الأوفلاين: هنا بنرجّع الـHTML للمتصفح بدل ما نطبعه مباشرة من داخل Electron —
 * الطباعة الفعلية هتتم من المتصفح عبر QZ Tray (services/print.ts القديم فيه أنواع طباعة تانية
 * زي عروض الأسعار والتقارير وبونات المطبخ لسه مش منقولة، الإيصال بس دلوقتي).
 */
export async function buildInvoiceHtml(
  invoiceId: number
): Promise<{ html: string; printSettings: PrintSettings } | null> {
  const invoice = await getInvoiceView(invoiceId)
  if (!invoice) return null

  const [printSettings, taxSettings, storeSettings, posUiSettings] = await Promise.all([
    getPrintSettings(),
    getTaxSettings(),
    getStoreSettings(),
    getPosUiSettings()
  ])
  currentCurrencySymbol = posUiSettings.currencySymbol
  const qr = taxSettings.qrEnabled ? await getReceiptQr(invoiceId) : null
  const invoiceBarcode = await generateBarcodeDataUrl(invoice.number, 'CODE128')
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'

  const html = isThermal
    ? buildThermalReceiptHtml(invoice, printSettings, storeSettings, taxSettings, qr, invoiceBarcode)
    : buildFormalInvoiceHtml(invoice, printSettings, storeSettings, taxSettings, qr, invoiceBarcode)

  return { html, printSettings }
}

function thermalCalibration(printSettings: PrintSettings): { widthMm: number; contentWidthMm: number; offsetMm: number } {
  if (printSettings.paperSize === '80mm') {
    return { widthMm: 80, contentWidthMm: printSettings.thermalContentWidth80mm, offsetMm: printSettings.thermalOffset80mm }
  }
  return { widthMm: 58, contentWidthMm: printSettings.thermalContentWidth58mm, offsetMm: printSettings.thermalOffset58mm }
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

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'صالة',
  takeaway: 'تيك أواي',
  delivery: 'ديلفري'
}

const EXPENSE_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  card: 'بنكي',
  wallet: 'محفظة',
  transfer: 'تحويل'
}

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
  }
  return rows.join('')
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
    ${invoice.taxTotal > 0 ? `<div class="totals-row"><span>${escapeHtml(tax.taxName)} (${tax.rate}%)</span><span>${currency.format(invoice.taxTotal)}</span></div>` : ''}
    ${invoice.deliveryFee > 0 ? `<div class="totals-row"><span>رسوم التوصيل</span><span>${currency.format(invoice.deliveryFee)}</span></div>` : ''}
    <div class="grand-total"><span>الإجمالي</span><span>${currency.format(invoice.total)}</span></div>
    <div class="totals-row"><span>طريقة الدفع</span><span>${PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}</span></div>
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
        <td>${escapeHtml(l.productName)}${l.serialNumber ? `<br/><span class="serial">S/N: ${escapeHtml(l.serialNumber)}</span>` : ''}</td>
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
      ${invoice.taxTotal > 0 ? `<div class="row"><span>${escapeHtml(tax.taxName)} (${tax.rate}%)</span><span>${currency.format(invoice.taxTotal)}</span></div>` : ''}
      ${invoice.deliveryFee > 0 ? `<div class="row"><span>رسوم التوصيل</span><span>${currency.format(invoice.deliveryFee)}</span></div>` : ''}
      <div class="row grand"><span>الإجمالي</span><span>${currency.format(invoice.total)}</span></div>
      <div class="row"><span>المدفوع</span><span>${currency.format(invoice.paid)}</span></div>
      ${outstanding > 0.01 ? `<div class="row due"><span>المتبقي</span><span>${currency.format(outstanding)}</span></div>` : ''}
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

/* ---------------------------- بون تجهيز مطبخ ---------------------------- */

/**
 * بون تجهيز مطبخ: الصنف والملاحظة والكمية بس، من غير أسعار — مش فاتورة عميل. تفاصيل نوع الطلب بتتغيّر
 * حسب النوع: الصالة بتوضّح رقم الترابيزة، والديلفري بيوضّح اسم السائق وبيانات تواصل العميل.
 */
export async function buildKitchenTicketHtml(
  meta: KitchenTicketMeta,
  items: { name: string; qty: number; note: string | null }[]
): Promise<{ html: string; printSettings: PrintSettings }> {
  const printSettings = await getPrintSettings()
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

  const html = `<!doctype html>
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

  return { html, printSettings }
}

/* ---------------------------- عرض سعر ---------------------------- */

const QUOTATION_STATUS_LABELS: Record<QuotationView['status'], string> = {
  draft: 'مسودة',
  sent: 'مُرسل',
  accepted: 'تم التحويل لفاتورة',
  expired: 'منتهي'
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
      <tr><th>م</th><th>الصنف</th><th>الباركود</th><th>الكمية</th><th>ملاحظة</th></tr>
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

/* ---------------------------- ملخص إقفال الوردية ---------------------------- */

export async function buildShiftSummaryHtml(
  sessionId: number
): Promise<{ html: string; printSettings: PrintSettings } | null> {
  const report = await getShiftSummaryReport(sessionId)
  if (!report) return null

  const [printSettings, storeSettings, posUiSettings] = await Promise.all([
    getPrintSettings(),
    getStoreSettings(),
    getPosUiSettings()
  ])
  currentCurrencySymbol = posUiSettings.currencySymbol
  const isThermal = printSettings.paperSize === '80mm' || printSettings.paperSize === '58mm'

  const html = isThermal
    ? buildThermalShiftSummaryHtml(report, printSettings, storeSettings)
    : buildFormalShiftSummaryHtml(report, printSettings, storeSettings)

  return { html, printSettings }
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

function buildThermalShiftSummaryHtml(
  report: ShiftSummaryReport,
  printSettings: PrintSettings,
  store: StoreSettings
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
    <div class="totals-row"><span>إجمالي المصروفات</span><span>-${currency.format(report.totalExpenses)}</span></div>
    <div class="totals-row"><span>إجمالي المشتريات (${report.purchaseInvoiceCount})</span><span>-${currency.format(report.totalPurchases)}</span></div>
    <div class="totals-row"><span>إجمالي المرتجعات (${report.returnCount})</span><span>-${currency.format(report.totalReturns)}</span></div>
    <hr />
    <div class="totals-row"><span>الرصيد المتوقع بالدرج</span><span>${report.expectedCash != null ? currency.format(report.expectedCash) : '—'}</span></div>
    <div class="totals-row"><span>الرصيد الفعلي المُعدود</span><span>${report.actualCash != null ? currency.format(report.actualCash) : '—'}</span></div>
    <div class="grand-total ${report.cashDifference != null && report.cashDifference !== 0 ? (report.cashDifference > 0 ? 'diff-ok' : 'diff-bad') : ''}">
      <span>الفرق</span><span>${report.cashDifference != null ? currency.format(report.cashDifference) : '—'}</span>
    </div>
  </div>
</body>
</html>`
}

function buildFormalShiftSummaryHtml(
  report: ShiftSummaryReport,
  printSettings: PrintSettings,
  store: StoreSettings
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
</body>
</html>`
}

/* ---------------------------- ليبل باركود ---------------------------- */

export async function buildBarcodeLabelsHtml(
  items: { barcode: string; name: string; price: number }[]
): Promise<{ html: string; printSettings: PrintSettings }> {
  const [labelSettings, printSettings] = await Promise.all([getBarcodeLabelSettings(), getPrintSettings()])

  const labelsHtml = await Promise.all(
    items.map(async (item) => {
      const img = await generateBarcodeDataUrl(item.barcode, labelSettings.labelType)
      return buildLabelHtml(item, img, labelSettings)
    })
  )

  const html = wrapLabelsHtml(labelsHtml.join(''), labelSettings)
  return { html, printSettings }
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
  const w = settings.labelWidthMm
  const h = settings.labelHeightMm
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  @page { size: auto; margin: 2mm; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; }
  .sheet { display: flex; flex-wrap: wrap; gap: 2mm; }
  .label {
    width: ${settings.orientation === 'vertical' ? w : h}mm;
    height: ${settings.orientation === 'vertical' ? h : w}mm;
    border: 1px dashed #ccc;
    box-sizing: border-box;
    padding: 1mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .name { font-size: 8px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .barcode-img { max-width: 100%; max-height: 60%; }
  .code { font-size: 7px; }
  .price { font-size: 9px; font-weight: bold; }
</style>
</head>
<body>
  <div class="sheet">${labelsHtml}</div>
</body>
</html>`
}
