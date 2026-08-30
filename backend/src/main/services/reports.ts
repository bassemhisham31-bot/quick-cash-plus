import { getDb } from '../db'
import { getDefaultWarehouseId } from '../db/seed'
import { getCustomerStatement } from './customers'
import { getVendorStatement } from './vendors'
import type { OverviewMetric, OverviewSummary, ReportFilter, ReportResult, ReportType } from '../../shared/types'

function dateConditions(filter: ReportFilter, column: string): { sql: string; args: unknown[] } {
  const parts: string[] = []
  const args: unknown[] = []
  if (filter.dateFrom) {
    parts.push(`date(${column}) >= date(?)`)
    args.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    parts.push(`date(${column}) <= date(?)`)
    args.push(filter.dateTo)
  }
  return { sql: parts.length ? `AND ${parts.join(' AND ')}` : '', args }
}

export async function runReport(type: ReportType, filter: ReportFilter): Promise<ReportResult> {
  switch (type) {
    case 'inventory_status':
      return inventoryStatus(filter)
    case 'sales_detailed':
      return salesDetailed(filter)
    case 'sales_summary':
      return salesSummary(filter)
    case 'vendors_report':
      return vendorsReport(filter)
    case 'customers_analysis':
      return customersAnalysis(filter)
    case 'stock_movement':
      return stockMovement(filter)
    case 'profit_loss':
      return profitLoss(filter)
    case 'monthly_expenses':
      return monthlyExpenses(filter)
    case 'product_performance':
      return productPerformance(filter)
    case 'payment_methods':
      return paymentMethods(filter)
    case 'tax_report':
      return taxReport(filter)
    case 'financial_summary':
      return financialSummary(filter)
    case 'receivables_payables':
      return receivablesPayables(filter)
    case 'cash_drawer_sessions':
      return cashDrawerSessions(filter)
    case 'top_customers':
      return topCustomers(filter)
    case 'sales_by_employee':
      return salesByEmployee(filter)
    case 'sales_rep_commission':
      return salesRepCommission(filter)
    case 'purchases_last_price':
      return purchasesLastPrice(filter)
    case 'purchases_detailed':
      return purchasesDetailed(filter)
    case 'account_statement':
      return accountStatementReport(filter)
    case 'restaurant_sales_by_order_type':
      return restaurantSalesByOrderType(filter)
    case 'restaurant_recipe_consumption':
      return restaurantRecipeConsumption(filter)
    case 'restaurant_table_activity':
      return restaurantTableActivity(filter)
    default:
      throw new Error('نوع تقرير غير معروف')
  }
}

async function inventoryStatus(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const warehouseId = filter.warehouseId ?? (await getDefaultWarehouseId(db))
  const rs = await db.execute({
    sql: `SELECT p.name, p.barcode, COALESCE(c.name, '-') AS category,
                 COALESCE(s.quantity, 0) AS qty, p.reorder_point AS reorderPoint,
                 p.cost_price AS costPrice, p.retail_price AS retailPrice,
                 COALESCE(s.quantity, 0) * p.cost_price AS stockValue
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = ?
          WHERE p.deleted_at IS NULL
          ORDER BY p.name`,
    args: [warehouseId]
  })
  const rows = rs.rows.map((r: any) => ({
    name: r.name,
    barcode: r.barcode,
    category: r.category,
    qty: Number(r.qty),
    reorderPoint: Number(r.reorderPoint),
    costPrice: Number(r.costPrice),
    retailPrice: Number(r.retailPrice),
    stockValue: Number(r.stockValue)
  }))
  return {
    title: 'حالة المخزون',
    columns: [
      { key: 'name', label: 'الصنف' },
      { key: 'barcode', label: 'الباركود' },
      { key: 'category', label: 'التصنيف' },
      { key: 'qty', label: 'الكمية', align: 'end' },
      { key: 'reorderPoint', label: 'حد التنبيه', align: 'end' },
      { key: 'costPrice', label: 'سعر الشراء', align: 'end' },
      { key: 'retailPrice', label: 'سعر البيع', align: 'end' },
      { key: 'stockValue', label: 'قيمة المخزون', align: 'end' }
    ],
    rows,
    totals: { stockValue: rows.reduce((s, r) => s + r.stockValue, 0) }
  }
}

async function purchasesLastPrice(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const warehouseId = filter.warehouseId ?? (await getDefaultWarehouseId(db))
  const rs = await db.execute({
    sql: `WITH ranked AS (
            SELECT pi.product_id, pi.purchase_price, pi.qty, piv.vendor_id, piv.created_at,
                   ROW_NUMBER() OVER (PARTITION BY pi.product_id ORDER BY piv.created_at DESC, piv.id DESC) AS rn
            FROM purchase_items pi
            JOIN purchase_invoices piv ON piv.id = pi.purchase_invoice_id
          )
          SELECT p.name, p.barcode, COALESCE(c.name, '-') AS category,
                 COALESCE(s.quantity, 0) AS qty, p.cost_price AS costPrice,
                 r.purchase_price AS lastPurchasePrice, r.qty AS lastPurchaseQty,
                 r.created_at AS lastPurchaseDate, COALESCE(v.name, '-') AS vendorName
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = ?
          LEFT JOIN ranked r ON r.product_id = p.id AND r.rn = 1
          LEFT JOIN vendors v ON v.id = r.vendor_id
          WHERE p.deleted_at IS NULL
          ORDER BY p.name`,
    args: [warehouseId]
  })
  const rows = rs.rows.map((r: any) => ({
    name: r.name,
    barcode: r.barcode,
    category: r.category,
    qty: Number(r.qty),
    costPrice: Number(r.costPrice),
    lastPurchasePrice: r.lastPurchasePrice != null ? Number(r.lastPurchasePrice) : '-',
    lastPurchaseQty: r.lastPurchaseQty != null ? Number(r.lastPurchaseQty) : '-',
    lastPurchaseDate: r.lastPurchaseDate ?? '-',
    vendorName: r.vendorName
  }))
  return {
    title: 'تقرير المشتريات الكامل (آخر سعر شراء)',
    columns: [
      { key: 'name', label: 'الصنف' },
      { key: 'barcode', label: 'الباركود' },
      { key: 'category', label: 'التصنيف' },
      { key: 'qty', label: 'الكمية الحالية', align: 'end' },
      { key: 'costPrice', label: 'سعر الشراء الحالي', align: 'end' },
      { key: 'lastPurchasePrice', label: 'آخر سعر شراء', align: 'end' },
      { key: 'lastPurchaseQty', label: 'آخر كمية مُشتراة', align: 'end' },
      { key: 'lastPurchaseDate', label: 'تاريخ آخر شراء' },
      { key: 'vendorName', label: 'المورد' }
    ],
    rows
  }
}

async function purchasesDetailed(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'piv.created_at')
  const warehouseSql = filter.warehouseId ? 'AND piv.warehouse_id = ?' : ''
  const args = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const rs = await db.execute({
    sql: `SELECT piv.number, piv.created_at AS date, COALESCE(v.name, '-') AS vendorName,
                 pi.product_name AS product, pi.qty, pi.purchase_price AS unitPrice, pi.total
          FROM purchase_items pi
          JOIN purchase_invoices piv ON piv.id = pi.purchase_invoice_id
          LEFT JOIN vendors v ON v.id = piv.vendor_id
          WHERE 1=1 ${dateSql} ${warehouseSql}
          ORDER BY piv.created_at DESC
          LIMIT 1000`,
    args
  })
  const rows = rs.rows.map((r: any) => ({
    number: r.number,
    date: r.date,
    vendorName: r.vendorName,
    product: r.product,
    qty: Number(r.qty),
    unitPrice: Number(r.unitPrice),
    total: Number(r.total)
  }))
  return {
    title: 'المشتريات التفصيلي',
    columns: [
      { key: 'number', label: 'رقم فاتورة الشراء' },
      { key: 'date', label: 'التاريخ' },
      { key: 'vendorName', label: 'المورد' },
      { key: 'product', label: 'الصنف' },
      { key: 'qty', label: 'الكمية', align: 'end' },
      { key: 'unitPrice', label: 'سعر الشراء', align: 'end' },
      { key: 'total', label: 'الإجمالي', align: 'end' }
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0) }
  }
}

async function accountStatementReport(filter: ReportFilter): Promise<ReportResult> {
  if (!filter.partyType || !filter.partyId) {
    return {
      title: 'كشف حساب',
      columns: [
        { key: 'date', label: 'التاريخ' },
        { key: 'description', label: 'البيان' },
        { key: 'debit', label: 'مدين', align: 'end' },
        { key: 'credit', label: 'دائن', align: 'end' },
        { key: 'balance', label: 'الرصيد', align: 'end' }
      ],
      rows: []
    }
  }

  const statement =
    filter.partyType === 'vendor' ? await getVendorStatement(filter.partyId) : await getCustomerStatement(filter.partyId)

  let running = 0
  const rows = statement.entries.map((e) => {
    running += e.debit - e.credit
    return { date: e.date, description: e.description, debit: e.debit, credit: e.credit, balance: running }
  })

  return {
    title: 'كشف حساب',
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'description', label: 'البيان' },
      { key: 'debit', label: 'مدين', align: 'end' },
      { key: 'credit', label: 'دائن', align: 'end' },
      { key: 'balance', label: 'الرصيد', align: 'end' }
    ],
    rows,
    totals: {
      debit: rows.reduce((s, r) => s + r.debit, 0),
      credit: rows.reduce((s, r) => s + r.credit, 0),
      balance: statement.balance
    }
  }
}

async function salesDetailed(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'i.created_at')
  const warehouseSql = filter.warehouseId ? 'AND i.warehouse_id = ?' : ''
  const serialSql = filter.serial?.trim() ? 'AND si.serial_number LIKE ?' : ''
  const args = [
    ...dateArgs,
    ...(filter.warehouseId ? [filter.warehouseId] : []),
    ...(filter.serial?.trim() ? [`%${filter.serial.trim()}%`] : [])
  ]

  const rs = await db.execute({
    sql: `SELECT i.number, i.created_at AS date, si.product_name AS product, si.qty,
                 si.unit_price AS unitPrice, si.discount, si.total, si.serial_number AS serialNumber
          FROM sales_items si
          JOIN sales_invoices i ON i.id = si.invoice_id
          WHERE i.deleted_at IS NULL ${dateSql} ${warehouseSql} ${serialSql}
          ORDER BY i.created_at DESC
          LIMIT 1000`,
    args
  })
  const rows = rs.rows.map((r: any) => ({
    number: r.number,
    date: r.date,
    product: r.product,
    qty: Number(r.qty),
    unitPrice: Number(r.unitPrice),
    discount: Number(r.discount),
    total: Number(r.total),
    serialNumber: r.serialNumber ?? '—'
  }))
  return {
    title: 'المبيعات التفصيلي',
    columns: [
      { key: 'number', label: 'رقم الفاتورة' },
      { key: 'date', label: 'التاريخ' },
      { key: 'product', label: 'الصنف' },
      { key: 'qty', label: 'الكمية', align: 'end' },
      { key: 'unitPrice', label: 'السعر', align: 'end' },
      { key: 'discount', label: 'الخصم', align: 'end' },
      { key: 'total', label: 'الإجمالي', align: 'end' },
      { key: 'serialNumber', label: 'السيريال نمبر' }
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0) }
  }
}

async function salesSummary(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'created_at')
  const warehouseSql = filter.warehouseId ? 'AND warehouse_id = ?' : ''
  const args = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const rs = await db.execute({
    sql: `SELECT date(created_at) AS day, COUNT(*) AS invoiceCount, SUM(subtotal) AS subtotal,
                 SUM(discount_total) AS discount, SUM(tax_total) AS tax, SUM(total) AS total
          FROM sales_invoices
          WHERE deleted_at IS NULL ${dateSql} ${warehouseSql}
          GROUP BY day ORDER BY day DESC`,
    args
  })
  const rows = rs.rows.map((r: any) => ({
    day: r.day,
    invoiceCount: Number(r.invoiceCount),
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    tax: Number(r.tax),
    total: Number(r.total)
  }))
  return {
    title: 'ملخص المبيعات',
    columns: [
      { key: 'day', label: 'التاريخ' },
      { key: 'invoiceCount', label: 'عدد الفواتير', align: 'end' },
      { key: 'subtotal', label: 'الإجمالي الفرعي', align: 'end' },
      { key: 'discount', label: 'الخصومات', align: 'end' },
      { key: 'tax', label: 'الضريبة', align: 'end' },
      { key: 'total', label: 'الصافي', align: 'end' }
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0) }
  }
}

async function vendorsReport(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'pi.created_at')
  const rs = await db.execute({
    sql: `SELECT v.name, v.balance, COUNT(pi.id) AS purchaseCount, COALESCE(SUM(pi.total), 0) AS totalPurchases
          FROM vendors v
          LEFT JOIN purchase_invoices pi ON pi.vendor_id = v.id ${dateSql}
          WHERE v.deleted_at IS NULL
          GROUP BY v.id
          ORDER BY v.name`,
    args: dateArgs
  })
  const rows = rs.rows.map((r: any) => ({
    name: r.name,
    balance: Number(r.balance),
    purchaseCount: Number(r.purchaseCount),
    totalPurchases: Number(r.totalPurchases)
  }))
  return {
    title: 'تقرير الموردين',
    columns: [
      { key: 'name', label: 'المورد' },
      { key: 'balance', label: 'عليك للمورد', align: 'end' },
      { key: 'purchaseCount', label: 'عدد فواتير الشراء', align: 'end' },
      { key: 'totalPurchases', label: 'إجمالي المشتريات', align: 'end' }
    ],
    rows,
    totals: { balance: rows.reduce((s, r) => s + r.balance, 0), totalPurchases: rows.reduce((s, r) => s + r.totalPurchases, 0) }
  }
}

async function customersAnalysis(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'i.created_at')
  const rs = await db.execute({
    sql: `SELECT c.name, c.balance, c.loyalty_points AS loyaltyPoints,
                 COUNT(i.id) AS invoiceCount, COALESCE(SUM(i.total), 0) AS totalPurchases
          FROM customers c
          LEFT JOIN sales_invoices i ON i.customer_id = c.id AND i.deleted_at IS NULL ${dateSql}
          WHERE c.deleted_at IS NULL AND c.is_walk_in = 0
          GROUP BY c.id
          ORDER BY totalPurchases DESC`,
    args: dateArgs
  })
  const rows = rs.rows.map((r: any) => ({
    name: r.name,
    balance: Number(r.balance),
    loyaltyPoints: Number(r.loyaltyPoints),
    invoiceCount: Number(r.invoiceCount),
    totalPurchases: Number(r.totalPurchases)
  }))
  return {
    title: 'تحليل العملاء',
    columns: [
      { key: 'name', label: 'العميل' },
      { key: 'balance', label: 'الرصيد', align: 'end' },
      { key: 'loyaltyPoints', label: 'نقاط الولاء', align: 'end' },
      { key: 'invoiceCount', label: 'عدد الفواتير', align: 'end' },
      { key: 'totalPurchases', label: 'إجمالي المشتريات', align: 'end' }
    ],
    rows,
    totals: { totalPurchases: rows.reduce((s, r) => s + r.totalPurchases, 0) }
  }
}

async function stockMovement(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const warehouseId = filter.warehouseId ?? (await getDefaultWarehouseId(db))
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'sm.created_at')
  const rs = await db.execute({
    sql: `SELECT sm.created_at AS date, p.name AS product, sm.type, sm.qty
          FROM stock_movements sm
          JOIN products p ON p.id = sm.product_id
          WHERE sm.warehouse_id = ? ${dateSql}
          ORDER BY sm.created_at DESC
          LIMIT 1000`,
    args: [warehouseId, ...dateArgs]
  })
  const typeLabels: Record<string, string> = {
    opening: 'رصيد افتتاحي',
    sale: 'بيع',
    sale_return: 'مرتجع',
    purchase: 'شراء',
    transfer: 'نقل',
    adjustment: 'تسوية'
  }
  const rows = rs.rows.map((r: any) => ({
    date: r.date,
    product: r.product,
    type: typeLabels[r.type] ?? r.type,
    qty: Number(r.qty)
  }))
  return {
    title: 'حركة المخزون',
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'product', label: 'الصنف' },
      { key: 'type', label: 'نوع الحركة' },
      { key: 'qty', label: 'الكمية', align: 'end' }
    ],
    rows
  }
}

async function profitLoss(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'i.created_at')
  const warehouseSql = filter.warehouseId ? 'AND i.warehouse_id = ?' : ''
  const salesArgs = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const salesRs = await db.execute({
    sql: `SELECT date(i.created_at) AS day, SUM(i.total) AS sales,
                 COALESCE(SUM((SELECT COALESCE(SUM(si.qty * p.cost_price), 0)
                               FROM sales_items si JOIN products p ON p.id = si.product_id
                               WHERE si.invoice_id = i.id)), 0) AS cogs
          FROM sales_invoices i
          WHERE i.deleted_at IS NULL ${dateSql} ${warehouseSql}
          GROUP BY day`,
    args: salesArgs
  })

  const { sql: expenseDateSql, args: expenseDateArgs } = dateConditions(filter, 'created_at')
  const expensesRs = await db.execute({
    sql: `SELECT date(created_at) AS day, COALESCE(SUM(amount), 0) AS expenses
          FROM expenses WHERE deleted_at IS NULL ${expenseDateSql}
          GROUP BY day`,
    args: expenseDateArgs
  })

  const byDay = new Map<string, { sales: number; cogs: number; expenses: number }>()
  for (const r of salesRs.rows as any[]) {
    byDay.set(r.day, { sales: Number(r.sales), cogs: Number(r.cogs), expenses: 0 })
  }
  for (const r of expensesRs.rows as any[]) {
    const existing = byDay.get(r.day) ?? { sales: 0, cogs: 0, expenses: 0 }
    existing.expenses = Number(r.expenses)
    byDay.set(r.day, existing)
  }

  const rows = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, v]) => ({
      day,
      sales: v.sales,
      cogs: v.cogs,
      grossProfit: v.sales - v.cogs,
      expenses: v.expenses,
      netProfit: v.sales - v.cogs - v.expenses
    }))

  return {
    title: 'الأرباح والخسائر',
    columns: [
      { key: 'day', label: 'التاريخ' },
      { key: 'sales', label: 'المبيعات', align: 'end' },
      { key: 'cogs', label: 'تكلفة البضاعة', align: 'end' },
      { key: 'grossProfit', label: 'إجمالي الربح', align: 'end' },
      { key: 'expenses', label: 'المصروفات', align: 'end' },
      { key: 'netProfit', label: 'صافي الربح', align: 'end' }
    ],
    rows,
    totals: {
      sales: rows.reduce((s, r) => s + r.sales, 0),
      netProfit: rows.reduce((s, r) => s + r.netProfit, 0)
    }
  }
}

async function monthlyExpenses(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'e.created_at')
  const rs = await db.execute({
    sql: `SELECT strftime('%Y-%m', e.created_at) AS month, COALESCE(c.name, 'بدون تصنيف') AS category,
                 SUM(e.amount) AS amount
          FROM expenses e
          LEFT JOIN expense_categories c ON c.id = e.category_id
          WHERE e.deleted_at IS NULL ${dateSql}
          GROUP BY month, category
          ORDER BY month DESC, amount DESC`,
    args: dateArgs
  })
  const rows = rs.rows.map((r: any) => ({ month: r.month, category: r.category, amount: Number(r.amount) }))
  return {
    title: 'المصروفات الشهرية',
    columns: [
      { key: 'month', label: 'الشهر' },
      { key: 'category', label: 'التصنيف' },
      { key: 'amount', label: 'المبلغ', align: 'end' }
    ],
    rows,
    totals: { amount: rows.reduce((s, r) => s + r.amount, 0) }
  }
}

async function productPerformance(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'i.created_at')
  const warehouseSql = filter.warehouseId ? 'AND i.warehouse_id = ?' : ''
  const args = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const rs = await db.execute({
    sql: `SELECT p.name, SUM(si.qty) AS qtySold, SUM(si.total) AS revenue,
                 SUM(si.qty * p.cost_price) AS cost
          FROM sales_items si
          JOIN sales_invoices i ON i.id = si.invoice_id
          JOIN products p ON p.id = si.product_id
          WHERE i.deleted_at IS NULL ${dateSql} ${warehouseSql}
          GROUP BY p.id
          ORDER BY revenue DESC
          LIMIT 200`,
    args
  })
  const rows = rs.rows.map((r: any) => {
    const revenue = Number(r.revenue)
    const cost = Number(r.cost)
    return { name: r.name, qtySold: Number(r.qtySold), revenue, cost, profit: revenue - cost }
  })
  return {
    title: 'أداء المنتجات',
    columns: [
      { key: 'name', label: 'الصنف' },
      { key: 'qtySold', label: 'الكمية المباعة', align: 'end' },
      { key: 'revenue', label: 'الإيراد', align: 'end' },
      { key: 'cost', label: 'التكلفة', align: 'end' },
      { key: 'profit', label: 'الربح', align: 'end' }
    ],
    rows,
    totals: { revenue: rows.reduce((s, r) => s + r.revenue, 0), profit: rows.reduce((s, r) => s + r.profit, 0) }
  }
}

async function paymentMethods(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'created_at')
  const warehouseSql = filter.warehouseId ? 'AND warehouse_id = ?' : ''
  const args = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const rs = await db.execute({
    sql: `SELECT payment_method AS method, COUNT(*) AS invoiceCount, SUM(total) AS total
          FROM sales_invoices
          WHERE deleted_at IS NULL ${dateSql} ${warehouseSql}
          GROUP BY method
          ORDER BY total DESC`,
    args
  })
  const labels: Record<string, string> = {
    cash: 'نقدًا',
    credit: 'آجل',
    card: 'بنكي',
    wallet: 'محفظة',
    mixed: 'مختلط',
    vodafone_cash: 'فودافون كاش',
    instapay: 'InstaPay'
  }
  const rows = rs.rows.map((r: any) => ({
    method: labels[r.method] ?? r.method,
    invoiceCount: Number(r.invoiceCount),
    total: Number(r.total)
  }))
  return {
    title: 'طرق الدفع',
    columns: [
      { key: 'method', label: 'الطريقة' },
      { key: 'invoiceCount', label: 'عدد الفواتير', align: 'end' },
      { key: 'total', label: 'الإجمالي', align: 'end' }
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0) }
  }
}

async function restaurantSalesByOrderType(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'created_at')
  const warehouseSql = filter.warehouseId ? 'AND warehouse_id = ?' : ''
  const args = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const rs = await db.execute({
    sql: `SELECT order_type AS orderType, COUNT(*) AS invoiceCount, SUM(subtotal) AS subtotal,
                 SUM(service_charge_total) AS serviceCharge, SUM(delivery_fee) AS deliveryFee, SUM(total) AS total
          FROM sales_invoices
          WHERE deleted_at IS NULL ${dateSql} ${warehouseSql}
          GROUP BY order_type
          ORDER BY total DESC`,
    args
  })
  const labels: Record<string, string> = {
    retail: 'بيع عادي',
    dine_in: 'صالة',
    takeaway: 'تيك أواي',
    delivery: 'ديلفري'
  }
  const rows = rs.rows.map((r: any) => ({
    orderType: labels[r.orderType] ?? r.orderType,
    invoiceCount: Number(r.invoiceCount),
    subtotal: Number(r.subtotal),
    serviceCharge: Number(r.serviceCharge),
    deliveryFee: Number(r.deliveryFee),
    total: Number(r.total)
  }))
  return {
    title: 'مبيعات المطاعم حسب نوع الطلب',
    columns: [
      { key: 'orderType', label: 'نوع الطلب' },
      { key: 'invoiceCount', label: 'عدد الفواتير', align: 'end' },
      { key: 'subtotal', label: 'الإجمالي الفرعي', align: 'end' },
      { key: 'serviceCharge', label: 'ضريبة الخدمة', align: 'end' },
      { key: 'deliveryFee', label: 'رسوم التوصيل', align: 'end' },
      { key: 'total', label: 'الإجمالي', align: 'end' }
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0) }
  }
}

async function restaurantRecipeConsumption(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const warehouseId = filter.warehouseId ?? (await getDefaultWarehouseId(db))
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'sm.created_at')
  const rs = await db.execute({
    sql: `SELECT p.name AS material, SUM(-sm.qty) AS consumedQty, u.name AS unit
          FROM stock_movements sm
          JOIN products p ON p.id = sm.product_id
          LEFT JOIN units u ON u.id = p.unit_id
          WHERE sm.warehouse_id = ? AND sm.ref_type = 'recipe_consumption' ${dateSql}
          GROUP BY sm.product_id
          ORDER BY consumedQty DESC`,
    args: [warehouseId, ...dateArgs]
  })
  const rows = rs.rows.map((r: any) => ({
    material: r.material,
    consumedQty: Number(r.consumedQty),
    unit: r.unit ?? '—'
  }))
  return {
    title: 'استهلاك الخامات (الوصفات)',
    columns: [
      { key: 'material', label: 'الخامة' },
      { key: 'consumedQty', label: 'الكمية المستهلكة', align: 'end' },
      { key: 'unit', label: 'الوحدة' }
    ],
    rows
  }
}

async function restaurantTableActivity(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'si.created_at')
  const rs = await db.execute({
    sql: `SELECT t.name AS tableName, COUNT(*) AS ordersCount, SUM(si.total) AS total, AVG(si.total) AS avgTicket
          FROM sales_invoices si
          JOIN restaurant_tables t ON t.id = si.table_id
          WHERE si.deleted_at IS NULL AND si.order_type = 'dine_in' ${dateSql}
          GROUP BY t.id
          ORDER BY total DESC`,
    args: dateArgs
  })
  const rows = rs.rows.map((r: any) => ({
    tableName: r.tableName,
    ordersCount: Number(r.ordersCount),
    total: Number(r.total),
    avgTicket: Number(r.avgTicket)
  }))
  return {
    title: 'نشاط الترابيزات',
    columns: [
      { key: 'tableName', label: 'الترابيزة' },
      { key: 'ordersCount', label: 'عدد الطلبات', align: 'end' },
      { key: 'total', label: 'إجمالي المبيعات', align: 'end' },
      { key: 'avgTicket', label: 'متوسط الفاتورة', align: 'end' }
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0) }
  }
}

async function taxReport(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'created_at')
  const rs = await db.execute({
    sql: `SELECT date(created_at) AS day, SUM(subtotal - discount_total) AS taxableAmount, SUM(tax_total) AS taxCollected
          FROM sales_invoices
          WHERE deleted_at IS NULL ${dateSql}
          GROUP BY day
          ORDER BY day DESC`,
    args: dateArgs
  })
  const rows = rs.rows.map((r: any) => ({
    day: r.day,
    taxableAmount: Number(r.taxableAmount),
    taxCollected: Number(r.taxCollected)
  }))
  return {
    title: 'تقرير الضرائب',
    columns: [
      { key: 'day', label: 'التاريخ' },
      { key: 'taxableAmount', label: 'المبلغ الخاضع للضريبة', align: 'end' },
      { key: 'taxCollected', label: 'الضريبة المحصّلة', align: 'end' }
    ],
    rows,
    totals: { taxCollected: rows.reduce((s, r) => s + r.taxCollected, 0) }
  }
}

async function financialSummary(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'created_at')

  const salesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS invoiceCount
          FROM sales_invoices WHERE deleted_at IS NULL ${dateSql}`,
    args: dateArgs
  })
  const expensesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS expenses FROM expenses WHERE deleted_at IS NULL ${dateSql}`,
    args: dateArgs
  })
  const customersDebtRs = await db.execute(
    "SELECT COALESCE(SUM(balance), 0) AS debt FROM customers WHERE deleted_at IS NULL AND balance > 0"
  )
  const vendorsDebtRs = await db.execute(
    "SELECT COALESCE(SUM(balance), 0) AS debt FROM vendors WHERE deleted_at IS NULL AND balance > 0"
  )
  const warehouseId = filter.warehouseId ?? (await getDefaultWarehouseId(db))
  const stockValueRs = await db.execute({
    sql: `SELECT COALESCE(SUM(s.quantity * p.cost_price), 0) AS value
          FROM stock s JOIN products p ON p.id = s.product_id
          WHERE s.warehouse_id = ? AND p.deleted_at IS NULL`,
    args: [warehouseId]
  })

  const sales = Number((salesRs.rows[0] as any).sales)
  const invoiceCount = Number((salesRs.rows[0] as any).invoiceCount)
  const expenses = Number((expensesRs.rows[0] as any).expenses)
  const customersDebt = Number((customersDebtRs.rows[0] as any).debt)
  const vendorsDebt = Number((vendorsDebtRs.rows[0] as any).debt)
  const stockValue = Number((stockValueRs.rows[0] as any).value)

  const rows = [
    { metric: 'إجمالي المبيعات', value: sales },
    { metric: 'عدد الفواتير', value: invoiceCount },
    { metric: 'إجمالي المصروفات', value: expenses },
    { metric: 'صافي (تقديري)', value: sales - expenses },
    { metric: 'مديونية العملاء', value: customersDebt },
    { metric: 'مديونية الموردين (عليك)', value: vendorsDebt },
    { metric: 'قيمة المخزون الحالية', value: stockValue }
  ]

  return {
    title: 'الملخص المالي العام',
    columns: [
      { key: 'metric', label: 'المؤشر' },
      { key: 'value', label: 'القيمة', align: 'end' }
    ],
    rows
  }
}

async function receivablesPayables(_filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const customersRs = await db.execute(
    "SELECT name, balance FROM customers WHERE deleted_at IS NULL AND balance <> 0 ORDER BY balance DESC"
  )
  const vendorsRs = await db.execute(
    "SELECT name, balance FROM vendors WHERE deleted_at IS NULL AND balance <> 0 ORDER BY balance DESC"
  )
  const rows = [
    ...customersRs.rows.map((r: any) => ({
      partyType: 'عميل (مستحق لنا)',
      name: r.name,
      balance: Number(r.balance)
    })),
    ...vendorsRs.rows.map((r: any) => ({
      partyType: 'مورد (مستحق عليه لنا دفعه)',
      name: r.name,
      balance: Number(r.balance)
    }))
  ]
  return {
    title: 'كشف مديونيات العملاء والموردين',
    columns: [
      { key: 'partyType', label: 'النوع' },
      { key: 'name', label: 'الاسم' },
      { key: 'balance', label: 'الرصيد المستحق', align: 'end' }
    ],
    rows,
    totals: { balance: rows.reduce((s, r) => s + r.balance, 0) }
  }
}

async function cashDrawerSessions(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'cs.opened_at')
  const rs = await db.execute({
    sql: `SELECT cs.opened_at AS openedAt, cs.closed_at AS closedAt, cs.status,
                 cs.opening_balance AS openingBalance, cs.expected_cash AS expectedCash, cs.actual_cash AS actualCash,
                 uo.full_name AS openedBy, uc.full_name AS closedBy
          FROM cash_sessions cs
          JOIN users uo ON uo.id = cs.opened_by
          LEFT JOIN users uc ON uc.id = cs.closed_by
          WHERE 1 = 1 ${dateSql}
          ORDER BY cs.opened_at DESC
          LIMIT 500`,
    args: dateArgs
  })
  const statusLabels: Record<string, string> = { open: 'مفتوحة', closed: 'مقفلة' }
  const rows = rs.rows.map((r: any) => {
    const expected = r.expectedCash !== null ? Number(r.expectedCash) : null
    const actual = r.actualCash !== null ? Number(r.actualCash) : null
    return {
      openedAt: r.openedAt,
      closedAt: r.closedAt ?? '—',
      status: statusLabels[r.status] ?? r.status,
      openedBy: r.openedBy,
      closedBy: r.closedBy ?? '—',
      openingBalance: Number(r.openingBalance),
      expectedCash: expected ?? 0,
      actualCash: actual ?? 0,
      difference: expected !== null && actual !== null ? actual - expected : 0
    }
  })
  return {
    title: 'تقرير جلسات الخزنة',
    columns: [
      { key: 'openedAt', label: 'وقت الفتح' },
      { key: 'closedAt', label: 'وقت الإقفال' },
      { key: 'status', label: 'الحالة' },
      { key: 'openedBy', label: 'فتحها' },
      { key: 'closedBy', label: 'أقفلها' },
      { key: 'openingBalance', label: 'رصيد البداية', align: 'end' },
      { key: 'expectedCash', label: 'المتوقع', align: 'end' },
      { key: 'actualCash', label: 'الفعلي', align: 'end' },
      { key: 'difference', label: 'الفرق', align: 'end' }
    ],
    rows,
    totals: { difference: rows.reduce((s, r) => s + r.difference, 0) }
  }
}

async function topCustomers(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'i.created_at')
  const rs = await db.execute({
    sql: `SELECT c.name, c.phone, COUNT(i.id) AS invoiceCount, COALESCE(SUM(i.total), 0) AS totalPurchases
          FROM customers c
          JOIN sales_invoices i ON i.customer_id = c.id AND i.deleted_at IS NULL ${dateSql}
          WHERE c.deleted_at IS NULL
          GROUP BY c.id
          HAVING totalPurchases > 0
          ORDER BY totalPurchases DESC
          LIMIT 30`,
    args: dateArgs
  })
  const rows = rs.rows.map((r: any, idx: number) => ({
    rank: idx + 1,
    name: r.name,
    phone: r.phone ?? '—',
    invoiceCount: Number(r.invoiceCount),
    totalPurchases: Number(r.totalPurchases)
  }))
  return {
    title: 'أفضل العملاء شراءً',
    columns: [
      { key: 'rank', label: '#', align: 'end' },
      { key: 'name', label: 'العميل' },
      { key: 'phone', label: 'التليفون' },
      { key: 'invoiceCount', label: 'عدد الفواتير', align: 'end' },
      { key: 'totalPurchases', label: 'إجمالي المشتريات', align: 'end' }
    ],
    rows,
    totals: { totalPurchases: rows.reduce((s, r) => s + r.totalPurchases, 0) }
  }
}

async function salesRepCommission(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'i.created_at')
  const warehouseSql = filter.warehouseId ? 'AND i.warehouse_id = ?' : ''
  const args = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const rs = await db.execute({
    sql: `SELECT r.name, r.commission_percent AS commissionPercent,
                 COUNT(i.id) AS invoiceCount, COALESCE(SUM(i.total), 0) AS totalSales,
                 COALESCE(SUM(i.commission_amount), 0) AS totalCommission
          FROM sales_reps r
          JOIN sales_invoices i ON i.sales_rep_id = r.id AND i.deleted_at IS NULL ${dateSql} ${warehouseSql}
          WHERE r.deleted_at IS NULL
          GROUP BY r.id
          ORDER BY totalCommission DESC`,
    args
  })
  const rows = rs.rows.map((r: any) => ({
    name: r.name,
    commissionPercent: Number(r.commissionPercent),
    invoiceCount: Number(r.invoiceCount),
    totalSales: Number(r.totalSales),
    totalCommission: Number(r.totalCommission)
  }))
  return {
    title: 'عمولات المناديب',
    columns: [
      { key: 'name', label: 'المندوب' },
      { key: 'commissionPercent', label: 'نسبة العمولة %', align: 'end' },
      { key: 'invoiceCount', label: 'عدد الفواتير', align: 'end' },
      { key: 'totalSales', label: 'إجمالي المبيعات', align: 'end' },
      { key: 'totalCommission', label: 'إجمالي العمولة', align: 'end' }
    ],
    rows,
    totals: {
      totalSales: rows.reduce((s, r) => s + r.totalSales, 0),
      totalCommission: rows.reduce((s, r) => s + r.totalCommission, 0)
    }
  }
}

async function salesByEmployee(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args: dateArgs } = dateConditions(filter, 'i.created_at')
  const warehouseSql = filter.warehouseId ? 'AND i.warehouse_id = ?' : ''
  const args = [...dateArgs, ...(filter.warehouseId ? [filter.warehouseId] : [])]

  const rs = await db.execute({
    sql: `SELECT u.full_name AS cashier, COUNT(i.id) AS invoiceCount, COALESCE(SUM(i.total), 0) AS total
          FROM sales_invoices i
          JOIN users u ON u.id = i.cashier_id
          WHERE i.deleted_at IS NULL ${dateSql} ${warehouseSql}
          GROUP BY i.cashier_id
          ORDER BY total DESC`,
    args
  })
  const rows = rs.rows.map((r: any) => ({
    cashier: r.cashier,
    invoiceCount: Number(r.invoiceCount),
    total: Number(r.total)
  }))
  return {
    title: 'المبيعات حسب الكاشير',
    columns: [
      { key: 'cashier', label: 'الكاشير' },
      { key: 'invoiceCount', label: 'عدد الفواتير', align: 'end' },
      { key: 'total', label: 'إجمالي المبيعات', align: 'end' }
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0) }
  }
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
}

async function periodFlowTotals(
  dateFrom: string,
  dateTo: string,
  warehouseId: number | null
): Promise<{ sales: number; returns: number; expenses: number; cogs: number; wholesaleSales: number }> {
  const db = getDb()
  const warehouseSql = warehouseId ? 'AND i.warehouse_id = ?' : ''
  const warehouseArgs = warehouseId ? [warehouseId] : []

  const salesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(i.total), 0) AS sales,
                 COALESCE(SUM((SELECT COALESCE(SUM(si.qty * p.cost_price), 0)
                               FROM sales_items si JOIN products p ON p.id = si.product_id
                               WHERE si.invoice_id = i.id)), 0) AS cogs
          FROM sales_invoices i
          WHERE i.deleted_at IS NULL AND date(i.created_at) >= date(?) AND date(i.created_at) <= date(?) ${warehouseSql}`,
    args: [dateFrom, dateTo, ...warehouseArgs]
  })

  const returnsRs = await db.execute({
    sql: `SELECT COALESCE(SUM(r.amount), 0) AS returns
          FROM sales_returns r
          JOIN sales_invoices i ON i.id = r.invoice_id
          WHERE date(r.created_at) >= date(?) AND date(r.created_at) <= date(?) ${warehouseSql}`,
    args: [dateFrom, dateTo, ...warehouseArgs]
  })

  const expensesRs = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS expenses
          FROM expenses WHERE deleted_at IS NULL AND date(created_at) >= date(?) AND date(created_at) <= date(?)`,
    args: [dateFrom, dateTo]
  })

  const wholesaleRs = await db.execute({
    sql: `SELECT COALESCE(SUM(si.total), 0) AS wholesaleSales
          FROM sales_items si
          JOIN sales_invoices i ON i.id = si.invoice_id
          JOIN product_prices pp ON pp.product_id = si.product_id AND pp.tier = 'wholesale' AND pp.price = si.unit_price
          WHERE i.deleted_at IS NULL AND date(i.created_at) >= date(?) AND date(i.created_at) <= date(?) ${warehouseSql}`,
    args: [dateFrom, dateTo, ...warehouseArgs]
  })

  return {
    sales: Number((salesRs.rows[0] as any).sales),
    cogs: Number((salesRs.rows[0] as any).cogs),
    returns: Number((returnsRs.rows[0] as any).returns),
    expenses: Number((expensesRs.rows[0] as any).expenses),
    wholesaleSales: Number((wholesaleRs.rows[0] as any).wholesaleSales)
  }
}

export async function getOverviewSummary(filter: ReportFilter): Promise<OverviewSummary> {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const dateTo = filter.dateTo || today
  const dateFrom = filter.dateFrom || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)

  const periodDays = Math.max(1, Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000) + 1)
  const prevDateTo = new Date(Date.parse(dateFrom) - 86400000).toISOString().slice(0, 10)
  const prevDateFrom = new Date(Date.parse(prevDateTo) - (periodDays - 1) * 86400000).toISOString().slice(0, 10)

  const [current, previous] = await Promise.all([
    periodFlowTotals(dateFrom, dateTo, filter.warehouseId),
    periodFlowTotals(prevDateFrom, prevDateTo, filter.warehouseId)
  ])

  const currentNetProfit = current.sales - current.returns - current.cogs - current.expenses
  const previousNetProfit = previous.sales - previous.returns - previous.cogs - previous.expenses

  function metric(currentValue: number, previousValue: number): OverviewMetric {
    return { value: currentValue, changePercent: changePercent(currentValue, previousValue) }
  }

  const vendorsDebtRs = await db.execute(
    "SELECT COALESCE(SUM(balance), 0) AS debt FROM vendors WHERE deleted_at IS NULL AND balance > 0"
  )
  const customersDebtRs = await db.execute(
    "SELECT COALESCE(SUM(balance), 0) AS debt FROM customers WHERE deleted_at IS NULL AND balance > 0"
  )
  const warehouseId = filter.warehouseId ?? (await getDefaultWarehouseId(db))
  const stockValueRs = await db.execute({
    sql: `SELECT COALESCE(SUM(s.quantity * p.cost_price), 0) AS value
          FROM stock s JOIN products p ON p.id = s.product_id
          WHERE s.warehouse_id = ? AND p.deleted_at IS NULL`,
    args: [warehouseId]
  })

  return {
    netProfitAfterExpenses: metric(currentNetProfit, previousNetProfit),
    totalExpenses: metric(current.expenses, previous.expenses),
    totalReturns: metric(current.returns, previous.returns),
    totalSales: metric(current.sales, previous.sales),
    wholesaleSales: metric(current.wholesaleSales, previous.wholesaleSales),
    vendorsDebt: Number((vendorsDebtRs.rows[0] as any).debt),
    customersDebt: Number((customersDebtRs.rows[0] as any).debt),
    stockValue: Number((stockValueRs.rows[0] as any).value),
    periodFrom: dateFrom,
    periodTo: dateTo
  }
}
