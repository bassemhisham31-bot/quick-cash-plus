import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCurrency as currency } from '../../lib/currency'
import type { CustomerView, OverviewSummary, ReportResult, ReportType, VendorView, Warehouse } from '../../../../shared/types'

const REPORT_OPTIONS: { type: ReportType; icon: string; label: string }[] = [
  { type: 'inventory_status', icon: '📦', label: 'حالة المخزون' },
  { type: 'sales_detailed', icon: '📄', label: 'المبيعات التفصيلي' },
  { type: 'sales_summary', icon: '📈', label: 'ملخص المبيعات' },
  { type: 'vendors_report', icon: '🚚', label: 'تقرير الموردين' },
  { type: 'customers_analysis', icon: '👥', label: 'تحليل العملاء' },
  { type: 'stock_movement', icon: '📊', label: 'حركة المخزون' },
  { type: 'profit_loss', icon: '💰', label: 'الأرباح والخسائر' },
  { type: 'monthly_expenses', icon: '🧾', label: 'المصروفات الشهرية' },
  { type: 'product_performance', icon: '⭐', label: 'أداء المنتجات' },
  { type: 'payment_methods', icon: '💳', label: 'طرق الدفع' },
  { type: 'tax_report', icon: '📑', label: 'تقرير الضرائب' },
  { type: 'financial_summary', icon: '🏦', label: 'الملخص المالي العام' },
  { type: 'receivables_payables', icon: '⚖️', label: 'كشف مديونيات العملاء والموردين' },
  { type: 'cash_drawer_sessions', icon: '🗄️', label: 'تقرير جلسات الخزنة' },
  { type: 'top_customers', icon: '🏆', label: 'أفضل العملاء شراءً' },
  { type: 'sales_by_employee', icon: '🧑‍💼', label: 'المبيعات حسب الكاشير' },
  { type: 'sales_rep_commission', icon: '🧾', label: 'عمولات المناديب' },
  { type: 'purchases_last_price', icon: '🧾', label: 'تقرير المشتريات الكامل (آخر سعر شراء)' },
  { type: 'purchases_detailed', icon: '📥', label: 'المشتريات التفصيلي' },
  { type: 'account_statement', icon: '📒', label: 'كشف حساب عميل/مورد' },
  { type: 'restaurant_sales_by_order_type', icon: '🍽️', label: 'مبيعات المطاعم حسب نوع الطلب' },
  { type: 'restaurant_recipe_consumption', icon: '🧂', label: 'استهلاك الخامات (الوصفات)' },
  { type: 'restaurant_table_activity', icon: '🪑', label: 'نشاط الترابيزات' }
]

function formatCell(value: string | number): string {
  if (typeof value === 'number') return currency(value)
  return value
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type ReportsTab = 'builder' | 'jard' | 'overview'

export function ReportsPage(): JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ReportsTab>('builder')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  useEffect(() => {
    window.api.catalog.listWarehouses().then(setWarehouses)
  }, [])

  return (
    <div>
      <div className="qcp-page-header">
        <h1>{t('reports.title')}</h1>
      </div>

      <div className="qcp-card" style={{ display: 'flex', gap: 8, marginBottom: 18, padding: 6 }}>
        <button
          className={`qcp-btn ${tab === 'builder' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          style={{ flex: 1 }}
          onClick={() => setTab('builder')}
        >
          📄 {t('reports.tabBuilder')}
        </button>
        <button
          className={`qcp-btn ${tab === 'jard' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          style={{ flex: 1 }}
          onClick={() => setTab('jard')}
        >
          📦 {t('reports.tabJard')}
        </button>
        <button
          className={`qcp-btn ${tab === 'overview' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          style={{ flex: 1 }}
          onClick={() => setTab('overview')}
        >
          📊 {t('reports.tabOverview')}
        </button>
      </div>

      {tab === 'builder' && <ReportBuilderTab warehouses={warehouses} />}
      {tab === 'jard' && <JardTab warehouses={warehouses} />}
      {tab === 'overview' && <OverviewTab warehouses={warehouses} />}
    </div>
  )
}

function ReportBuilderTab({ warehouses }: { warehouses: Warehouse[] }): JSX.Element {
  const { t } = useTranslation()
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [serial, setSerial] = useState('')
  const [selectedType, setSelectedType] = useState<ReportType>('financial_summary')
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [partyType, setPartyType] = useState<'customer' | 'vendor'>('customer')
  const [partyId, setPartyId] = useState<number | null>(null)
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [vendors, setVendors] = useState<VendorView[]>([])
  const [resultSearch, setResultSearch] = useState('')

  useEffect(() => {
    window.api.customers.list().then(setCustomers)
    window.api.vendors.list().then(setVendors)
  }, [])

  async function runReport(type: ReportType): Promise<void> {
    setSelectedType(type)
    setResultSearch('')
    if (type === 'account_statement' && !partyId) {
      setResult(null)
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const r = await window.api.reports.run(type, {
        dateFrom,
        dateTo,
        warehouseId,
        serial: type === 'sales_detailed' ? serial : undefined,
        partyType: type === 'account_statement' ? partyType : undefined,
        partyId: type === 'account_statement' ? (partyId ?? undefined) : undefined
      })
      setResult(r)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runReport(selectedType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = resultSearch.trim().toLowerCase()
  const filteredRows = result && q ? result.rows.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(q))) : (result?.rows ?? [])

  async function handleExport(format: 'pdf' | 'excel'): Promise<void> {
    if (!result) return
    setMessage(null)
    const res = format === 'pdf' ? await window.api.reports.exportPdf(result) : await window.api.reports.exportExcel(result)
    if (res.canceled) return
    setMessage(res.ok ? `تم الحفظ في: ${res.filePath}` : res.error ?? 'حدث خطأ')
  }

  return (
    <div>
      <div className="qcp-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
        {REPORT_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            className="qcp-card"
            style={{
              textAlign: 'start',
              cursor: 'pointer',
              border: selectedType === opt.type ? '2px solid var(--qcp-accent)' : '1px solid var(--qcp-border)'
            }}
            onClick={() => runReport(opt.type)}
          >
            <div style={{ fontSize: 20, marginBottom: 6 }}>{opt.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{opt.label}</div>
          </button>
        ))}
      </div>

      <div className="qcp-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <select className="qcp-select" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t('reports.allWarehouses')}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input className="qcp-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="qcp-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        {selectedType === 'account_statement' && (
          <>
            <select
              className="qcp-select"
              value={partyType}
              onChange={(e) => {
                setPartyType(e.target.value as 'customer' | 'vendor')
                setPartyId(null)
              }}
            >
              <option value="customer">{t('reports.partyTypeCustomer')}</option>
              <option value="vendor">{t('reports.partyTypeVendor')}</option>
            </select>
            <select
              className="qcp-select"
              style={{ minWidth: 180 }}
              value={partyId ?? ''}
              onChange={(e) => setPartyId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('reports.selectParty')}</option>
              {(partyType === 'customer' ? customers : vendors).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
        {selectedType === 'sales_detailed' && (
          <input
            className="qcp-input"
            style={{ width: 200 }}
            placeholder={t('reports.searchSerial') ?? ''}
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
          />
        )}
        <button className="qcp-btn qcp-btn-primary" onClick={() => runReport(selectedType)} disabled={loading}>
          {t('reports.run')}
        </button>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => handleExport('excel')} disabled={!result}>
            📊 Excel
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => handleExport('pdf')} disabled={!result}>
            📄 PDF
          </button>
        </div>
      </div>

      {message && (
        <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}

      {loading && <p>{t('common.loading')}</p>}

      {!loading && result && (
        <>
          {selectedType === 'restaurant_sales_by_order_type' && <RestaurantOrderTypeStatCards result={result} />}
          <input
            className="qcp-input"
            style={{ width: '100%', maxWidth: 320, marginBottom: 10 }}
            placeholder={t('reports.searchInResults') ?? ''}
            value={resultSearch}
            onChange={(e) => setResultSearch(e.target.value)}
          />
          <div className="qcp-table-wrap">
          <table className="qcp-table">
            <thead>
              <tr>
                {result.columns.map((c) => (
                  <th key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr key={idx}>
                  {result.columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                      {formatCell(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={result.columns.length} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    —
                  </td>
                </tr>
              )}
              {result.totals && (
                <tr style={{ fontWeight: 800, background: 'var(--qcp-bg-sunken)' }}>
                  {result.columns.map((c, idx) => (
                    <td key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                      {idx === 0 ? t('reports.total') : result.totals?.[c.key] != null ? currency(result.totals[c.key]) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  )
}

const ORDER_TYPE_CARD_META: { label: string; icon: string; badge: string }[] = [
  { label: 'صالة', icon: '🍽️', badge: 'purple' },
  { label: 'تيك أواي', icon: '🥡', badge: 'orange' },
  { label: 'ديلفري', icon: '🛵', badge: 'blue' }
]

/** بطاقات إحصائية ملخّصة فوق جدول تقرير "مبيعات المطاعم حسب نوع الطلب" — إجمالي كل نوع طلب بشكل بارز. */
function RestaurantOrderTypeStatCards({ result }: { result: ReportResult }): JSX.Element {
  const rowByLabel = new Map(result.rows.map((r) => [String(r.orderType), r]))
  const restaurantTotal = ORDER_TYPE_CARD_META.reduce((sum, m) => sum + Number(rowByLabel.get(m.label)?.total ?? 0), 0)

  return (
    <div className="qcp-grid qcp-grid-4" style={{ marginBottom: 18 }}>
      <div className="qcp-card">
        <div className="qcp-icon-badge green">💰</div>
        <div className="qcp-kpi-value">{currency(restaurantTotal)}</div>
        <div className="qcp-kpi-label">إجمالي مبيعات المطاعم (كل الأنواع)</div>
      </div>
      {ORDER_TYPE_CARD_META.map((m) => {
        const row = rowByLabel.get(m.label)
        return (
          <div className="qcp-card" key={m.label}>
            <div className={`qcp-icon-badge ${m.badge}`}>{m.icon}</div>
            <div className="qcp-kpi-value">{currency(Number(row?.total ?? 0))}</div>
            <div className="qcp-kpi-label">
              مبيعات {m.label} {row ? `(${row.invoiceCount} فاتورة)` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type JardType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

function jardRange(type: JardType, customFrom: string, customTo: string): { dateFrom: string; dateTo: string } {
  const today = new Date()
  const to = toDateStr(today)
  if (type === 'daily') return { dateFrom: to, dateTo: to }
  if (type === 'weekly') return { dateFrom: toDateStr(new Date(today.getTime() - 6 * 86400000)), dateTo: to }
  if (type === 'monthly') return { dateFrom: toDateStr(new Date(today.getTime() - 29 * 86400000)), dateTo: to }
  if (type === 'yearly') return { dateFrom: toDateStr(new Date(today.getTime() - 364 * 86400000)), dateTo: to }
  return { dateFrom: customFrom, dateTo: customTo }
}

function JardTab({ warehouses }: { warehouses: Warehouse[] }): JSX.Element {
  const { t } = useTranslation()
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [jardType, setJardType] = useState<JardType>('daily')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [inventoryResult, setInventoryResult] = useState<ReportResult | null>(null)
  const [salesSummary, setSalesSummary] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const { dateFrom, dateTo } = jardRange(jardType, customFrom, customTo)

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const filter = { dateFrom, dateTo, warehouseId }
      const [inv, sales] = await Promise.all([
        window.api.reports.run('inventory_status', filter),
        window.api.reports.run('sales_summary', filter)
      ])
      setInventoryResult(inv)
      setSalesSummary(sales)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (jardType !== 'custom' || (customFrom && customTo)) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jardType, warehouseId, customFrom, customTo])

  const stockSellValue = inventoryResult?.rows.reduce((s, r) => s + Number(r.qty) * Number(r.retailPrice), 0) ?? 0
  const stockBuyValue = inventoryResult?.totals?.stockValue ?? 0
  const outOfStockCount = inventoryResult?.rows.filter((r) => Number(r.qty) <= 0).length ?? 0
  const lowStockCount =
    inventoryResult?.rows.filter((r) => Number(r.qty) > 0 && Number(r.qty) <= Number(r.reorderPoint)).length ?? 0

  async function handleExport(format: 'pdf' | 'excel'): Promise<void> {
    if (!inventoryResult) return
    setMessage(null)
    const res =
      format === 'pdf' ? await window.api.reports.exportPdf(inventoryResult) : await window.api.reports.exportExcel(inventoryResult)
    if (res.canceled) return
    setMessage(res.ok ? `تم الحفظ في: ${res.filePath}` : res.error ?? 'حدث خطأ')
  }

  return (
    <div>
      <div className="qcp-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <select className="qcp-select" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t('reports.allWarehouses')}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>{t('reports.jardType')}</label>
          <select className="qcp-select" value={jardType} onChange={(e) => setJardType(e.target.value as JardType)}>
            <option value="daily">{t('reports.jardDaily')}</option>
            <option value="weekly">{t('reports.jardWeekly')}</option>
            <option value="monthly">{t('reports.jardMonthly')}</option>
            <option value="yearly">{t('reports.jardYearly')}</option>
            <option value="custom">{t('reports.jardCustom')}</option>
          </select>
        </div>
        {jardType === 'custom' && (
          <>
            <input className="qcp-input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input className="qcp-input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => handleExport('excel')} disabled={!inventoryResult}>
            💾 {t('reports.saveExcel')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => handleExport('pdf')} disabled={!inventoryResult}>
            🖨️ {t('reports.printJard')}
          </button>
        </div>
      </div>

      {message && (
        <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}

      {loading && <p>{t('common.loading')}</p>}

      {!loading && inventoryResult && (
        <>
          <div className="qcp-grid qcp-grid-4" style={{ marginBottom: 18 }}>
            <div className="qcp-card">
              <div className="qcp-kpi-value">{currency(stockSellValue)}</div>
              <div className="qcp-kpi-label">{t('reports.stockValueSell')}</div>
            </div>
            <div className="qcp-card">
              <div className="qcp-kpi-value">{currency(stockBuyValue)}</div>
              <div className="qcp-kpi-label">{t('reports.stockValueBuy')}</div>
            </div>
            <div className="qcp-card">
              <div className="qcp-kpi-value">{outOfStockCount}</div>
              <div className="qcp-kpi-label">{t('reports.outOfStockProducts')}</div>
            </div>
            <div className="qcp-card">
              <div className="qcp-kpi-value">{lowStockCount}</div>
              <div className="qcp-kpi-label">{t('reports.lowStockProducts')}</div>
            </div>
          </div>

          {salesSummary && (
            <div className="qcp-card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginTop: 0 }}>
                📈 {t('reports.salesSummaryForPeriod')} ({dateFrom} → {dateTo})
              </h3>
              <div className="qcp-table-wrap">
                <table className="qcp-table">
                  <thead>
                    <tr>
                      {salesSummary.columns.map((c) => (
                        <th key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {salesSummary.rows.slice(0, 10).map((row, idx) => (
                      <tr key={idx}>
                        {salesSummary.columns.map((c) => (
                          <td key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                            {formatCell(row[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {salesSummary.rows.length === 0 && (
                      <tr>
                        <td colSpan={salesSummary.columns.length} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                          —
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TrendBadge({ percent }: { percent: number | null }): JSX.Element | null {
  if (percent === null) return null
  const positive = percent >= 0
  return (
    <span className={`qcp-pill ${positive ? 'success' : 'critical'}`} style={{ fontSize: 11 }}>
      {positive ? '+' : ''}
      {percent}%
    </span>
  )
}

function OverviewTab({ warehouses }: { warehouses: Warehouse[] }): JSX.Element {
  const { t } = useTranslation()
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState(toDateStr(new Date(Date.now() - 29 * 86400000)))
  const [dateTo, setDateTo] = useState(toDateStr(new Date()))
  const [summary, setSummary] = useState<OverviewSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      setSummary(await window.api.reports.overview({ dateFrom, dateTo, warehouseId }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, dateFrom, dateTo])

  async function handleExport(format: 'pdf' | 'excel'): Promise<void> {
    if (!summary) return
    setMessage(null)
    const report: ReportResult = {
      title: `${t('reports.tabOverview')} (${dateFrom} → ${dateTo})`,
      columns: [
        { key: 'metric', label: t('reports.metricColumn') },
        { key: 'value', label: t('reports.valueColumn'), align: 'end' }
      ],
      rows: [
        { metric: t('reports.netProfitAfterExpenses'), value: summary.netProfitAfterExpenses.value },
        { metric: t('reports.totalExpenses'), value: summary.totalExpenses.value },
        { metric: t('reports.totalReturns'), value: summary.totalReturns.value },
        { metric: t('reports.totalSales'), value: summary.totalSales.value },
        { metric: t('reports.wholesaleSales'), value: summary.wholesaleSales.value },
        { metric: t('reports.vendorsDebtTotal'), value: summary.vendorsDebt },
        { metric: t('reports.customersDebtTotal'), value: summary.customersDebt },
        { metric: t('reports.stockValue'), value: summary.stockValue }
      ]
    }
    const res = format === 'pdf' ? await window.api.reports.exportPdf(report) : await window.api.reports.exportExcel(report)
    if (res.canceled) return
    setMessage(res.ok ? `تم الحفظ في: ${res.filePath}` : res.error ?? 'حدث خطأ')
  }

  return (
    <div>
      <div className="qcp-card" style={{ marginBottom: 16 }}>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>{t('reports.filterByWarehouse')}</label>
          <select className="qcp-select" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('reports.mainWarehouseDefault')}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', margin: '6px 0 0' }}>{t('reports.warehouseFilterNote')}</p>
      </div>

      <div className="qcp-card" style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="qcp-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span>→</span>
        <input className="qcp-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => handleExport('excel')} disabled={!summary}>
            📊 Excel
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => handleExport('pdf')} disabled={!summary}>
            📄 PDF
          </button>
        </div>
      </div>

      {message && (
        <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}

      <div className="qcp-pill accent" style={{ marginBottom: 16 }}>
        {t('reports.profitCalcMethod')}: {t('reports.profitCalcExpensesDeducted')}
      </div>

      {loading && <p>{t('common.loading')}</p>}

      {!loading && summary && (
        <div className="qcp-grid qcp-grid-4">
          <div className="qcp-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="qcp-icon-badge green">📈</span>
              <TrendBadge percent={summary.netProfitAfterExpenses.changePercent} />
            </div>
            <div className="qcp-kpi-value">{currency(summary.netProfitAfterExpenses.value)}</div>
            <div className="qcp-kpi-label">{t('reports.netProfitAfterExpenses')}</div>
          </div>
          <div className="qcp-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="qcp-icon-badge orange">💸</span>
              <TrendBadge percent={summary.totalExpenses.changePercent} />
            </div>
            <div className="qcp-kpi-value">{currency(summary.totalExpenses.value)}</div>
            <div className="qcp-kpi-label">{t('reports.totalExpenses')}</div>
          </div>
          <div className="qcp-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="qcp-icon-badge purple">↩️</span>
              <TrendBadge percent={summary.totalReturns.changePercent} />
            </div>
            <div className="qcp-kpi-value">{currency(summary.totalReturns.value)}</div>
            <div className="qcp-kpi-label">{t('reports.totalReturns')}</div>
          </div>
          <div className="qcp-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="qcp-icon-badge blue">🛒</span>
              <TrendBadge percent={summary.totalSales.changePercent} />
            </div>
            <div className="qcp-kpi-value">{currency(summary.totalSales.value)}</div>
            <div className="qcp-kpi-label">{t('reports.totalSales')}</div>
          </div>
          <div className="qcp-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="qcp-icon-badge blue">📦</span>
              <TrendBadge percent={summary.wholesaleSales.changePercent} />
            </div>
            <div className="qcp-kpi-value">{currency(summary.wholesaleSales.value)}</div>
            <div className="qcp-kpi-label">{t('reports.wholesaleSales')}</div>
          </div>
          <div className="qcp-card">
            <div className="qcp-icon-badge orange">🚚</div>
            <div className="qcp-kpi-value">{currency(summary.vendorsDebt)}</div>
            <div className="qcp-kpi-label">{t('reports.vendorsDebtTotal')}</div>
          </div>
          <div className="qcp-card">
            <div className="qcp-icon-badge pink">⏳</div>
            <div className="qcp-kpi-value">{currency(summary.customersDebt)}</div>
            <div className="qcp-kpi-label">{t('reports.customersDebtTotal')}</div>
          </div>
          <div className="qcp-card">
            <div className="qcp-icon-badge purple">📦</div>
            <div className="qcp-kpi-value">{currency(summary.stockValue)}</div>
            <div className="qcp-kpi-label">{t('reports.stockValue')}</div>
          </div>
        </div>
      )}
    </div>
  )
}
