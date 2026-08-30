import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, type ViewName } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import type {
  CashSessionSummary,
  CategorySalesItem,
  DashboardSummary,
  ExpiringProductItem,
  PaymentMethod,
  PaymentMethodBreakdownItem,
  ShiftSummaryReport,
  TopProductItem
} from '../../../../shared/types'

const CHART_COLORS = [
  'var(--qcp-icon-blue)',
  'var(--qcp-icon-green)',
  'var(--qcp-icon-purple)',
  'var(--qcp-icon-orange)',
  'var(--qcp-icon-pink)',
  'var(--qcp-accent)',
  'var(--qcp-warn)',
  'var(--qcp-critical)'
]

const PAYMENT_METHOD_KEYS: Record<PaymentMethod, string> = {
  cash: 'pos.cash',
  credit: 'pos.credit',
  card: 'pos.card',
  wallet: 'pos.wallet',
  mixed: 'pos.mixed',
  vodafone_cash: 'pos.vodafoneCash',
  instapay: 'pos.instapay'
}

export function DashboardPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const setView = useAppStore((s) => s.setView)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [expiring, setExpiring] = useState<ExpiringProductItem[]>([])
  const [topProducts, setTopProducts] = useState<TopProductItem[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentMethodBreakdownItem[]>([])
  const [categorySales, setCategorySales] = useState<CategorySalesItem[]>([])
  const [openingBalance, setOpeningBalance] = useState('0')
  const [showOpenForm, setShowOpenForm] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)

  async function refresh(): Promise<void> {
    const data = await window.api.dashboard.getSummary()
    setSummary(data)
    setExpiring(await window.api.dashboard.getExpiringSoon(10))
    setTopProducts(await window.api.dashboard.getTopProducts(5))
    setPaymentBreakdown(await window.api.dashboard.getPaymentMethodsBreakdown())
    setCategorySales(await window.api.dashboard.getSalesByCategory())
  }

  useEffect(() => {
    refresh()
  }, [])

  const quickActions: { key: string; icon: string; labelKey: string; view: ViewName }[] = [
    { key: 'reports', icon: '📊', labelKey: 'dashboard.quickActionReports', view: 'reports' },
    { key: 'newCustomer', icon: '👥', labelKey: 'dashboard.quickActionNewCustomer', view: 'customers' },
    { key: 'addProduct', icon: '📦', labelKey: 'dashboard.quickActionAddProduct', view: 'inventory' },
    { key: 'newSale', icon: '🛒', labelKey: 'dashboard.quickActionNewSale', view: 'pos' }
  ]

  async function handleStartDay(): Promise<void> {
    if (!user) return
    await window.api.cash.openDay(user.id, Number(openingBalance) || 0)
    setShowOpenForm(false)
    refresh()
  }

  if (!summary) return <p>{t('common.loading')}</p>

  return (
    <div>
      <div className="qcp-page-header">
        <h1>{t('dashboard.title')}</h1>
      </div>

      {!summary.dayIsOpen ? (
        <div className="qcp-callout" style={{ marginBottom: 18 }}>
          <span>{t('dashboard.dayClosedWarning')}</span>
          {!showOpenForm ? (
            <button className="qcp-btn qcp-btn-primary" onClick={() => setShowOpenForm(true)}>
              {t('dashboard.startDay')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="qcp-input"
                style={{ width: 140 }}
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder={t('dashboard.openingBalance') ?? ''}
              />
              <button className="qcp-btn qcp-btn-primary" onClick={handleStartDay}>
                {t('dashboard.confirmOpen')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="qcp-callout" style={{ marginBottom: 18, borderInlineStartColor: 'var(--qcp-success)', background: 'var(--qcp-success-soft)' }}>
          <span>✅ {t('dashboard.dayOpenBanner')}</span>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => setShowCloseModal(true)}>
            {t('dashboard.closeDay')}
          </button>
        </div>
      )}

      <div className="qcp-grid qcp-grid-4">
        <div className="qcp-card">
          <div className="qcp-icon-badge blue">🛒</div>
          <div className="qcp-kpi-value">{currency(summary.todaySales)}</div>
          <div className="qcp-kpi-label">{t('dashboard.todaySales')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge green">📈</div>
          <div className="qcp-kpi-value">{currency(summary.todayProfit)}</div>
          <div className="qcp-kpi-label">{t('dashboard.todayProfit')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge purple">🧾</div>
          <div className="qcp-kpi-value">{summary.todayInvoiceCount}</div>
          <div className="qcp-kpi-label">{t('dashboard.todayInvoices')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge orange">📦</div>
          <div className="qcp-kpi-value">{summary.lowStockCount}</div>
          <div className="qcp-kpi-label">{t('dashboard.lowStock')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge orange">⏰</div>
          <div className="qcp-kpi-value">{summary.expiringSoonCount}</div>
          <div className="qcp-kpi-label">{t('dashboard.expiringSoon')}</div>
        </div>
      </div>

      <div className="qcp-card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>⏰ {t('dashboard.expiringSoonTitle')}</h3>
        {expiring.length === 0 ? (
          <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>{t('dashboard.noExpiringProducts')}</p>
        ) : (
          <div className="qcp-table-wrap">
            <table className="qcp-table">
              <tbody>
                {expiring.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.expiryDate}</td>
                    <td>
                      <span className={`qcp-pill ${p.daysLeft <= 0 ? 'critical' : p.daysLeft <= 7 ? 'critical' : 'accent'}`}>
                        {p.daysLeft <= 0 ? t('dashboard.expired') : `${p.daysLeft} ${t('dashboard.daysLeft')}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="qcp-grid qcp-grid-3" style={{ marginTop: 18 }}>
        <TopProductsCard items={topProducts} />
        <PaymentMethodsCard items={paymentBreakdown} />
        <CategorySalesCard items={categorySales} />
      </div>

      <div className="qcp-card" style={{ marginTop: 18, background: 'var(--qcp-gradient)', border: 'none' }}>
        <h3 style={{ marginTop: 0, color: 'white' }}>⚡ {t('dashboard.quickActions')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          {quickActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setView(a.view)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '16px 10px',
                borderRadius: 12,
                border: 'none',
                background: 'rgba(255,255,255,0.16)',
                color: 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700
              }}
            >
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              {t(a.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {showCloseModal && (
        <CloseDayModal
          onClose={() => setShowCloseModal(false)}
          onClosed={() => {
            setShowCloseModal(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function CloseDayModal({ onClose, onClosed }: { onClose: () => void; onClosed: () => void }): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [summary, setSummary] = useState<CashSessionSummary | null>(null)
  const [actualCash, setActualCash] = useState('')
  const [saving, setSaving] = useState(false)
  const [closedReport, setClosedReport] = useState<ShiftSummaryReport | null>(null)
  const [printing, setPrinting] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  useEffect(() => {
    window.api.cash.getSummary().then((s) => {
      setSummary(s)
      if (s) setActualCash(String(s.expectedCash))
    })
  }, [])

  const difference = summary ? (Number(actualCash) || 0) - summary.expectedCash : 0

  async function handleConfirm(): Promise<void> {
    if (!user) return
    setSaving(true)
    setCloseError(null)
    try {
      const report = await window.api.cash.closeDay(user.id, Number(actualCash) || 0)
      if (!report) {
        setCloseError(t('dashboard.closeDayFailed') ?? 'تعذر إقفال الوردية — لا توجد وردية مفتوحة')
        return
      }
      setClosedReport(report)
    } finally {
      setSaving(false)
    }
  }

  async function handlePrint(preview: boolean): Promise<void> {
    if (!closedReport) return
    setPrinting(true)
    try {
      if (preview) await window.api.print.previewShiftSummary(closedReport.sessionId)
      else await window.api.print.shiftSummary(closedReport.sessionId)
    } finally {
      setPrinting(false)
    }
  }

  if (closedReport) {
    return (
      <div className="qcp-modal-backdrop" onClick={onClosed}>
        <div className="qcp-modal" onClick={(e) => e.stopPropagation()}>
          <h2 style={{ marginTop: 0 }}>✅ {t('dashboard.dayClosedSuccess')}</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('dashboard.invoiceCount')}</span>
              <span>{closedReport.invoiceCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('dashboard.totalItemsSold')}</span>
              <span>{closedReport.totalItemsSold}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('dashboard.totalSales')}</span>
              <span>{currency(closedReport.totalSales)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('dashboard.totalExpenses')}</span>
              <span>-{currency(closedReport.totalExpenses)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {t('dashboard.totalPurchases')} ({closedReport.purchaseInvoiceCount})
              </span>
              <span>-{currency(closedReport.totalPurchases)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {t('dashboard.totalReturns')} ({closedReport.returnCount})
              </span>
              <span>-{currency(closedReport.totalReturns)}</span>
            </div>
            <div
              className={`qcp-pill ${
                closedReport.cashDifference === 0 ? 'success' : (closedReport.cashDifference ?? 0) > 0 ? 'accent' : 'critical'
              }`}
            >
              {t('dashboard.difference')}: {currency(closedReport.cashDifference ?? 0)}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="qcp-btn qcp-btn-primary" disabled={printing} onClick={() => handlePrint(false)}>
              🖨️ {t('dashboard.printShiftSummary')}
            </button>
            <button className="qcp-btn qcp-btn-secondary" disabled={printing} onClick={() => handlePrint(true)}>
              👁️ {t('common.preview')}
            </button>
            <button className="qcp-btn qcp-btn-secondary" onClick={onClosed}>
              {t('dashboard.done')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{t('dashboard.closeDayTitle')}</h2>

        {summary ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('dashboard.openingBalanceLabel')}</span>
                <span>{currency(summary.openingBalance)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('dashboard.cashSales')}</span>
                <span>+{currency(summary.cashSales)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('dashboard.cashExpenses')}</span>
                <span>-{currency(summary.cashExpenses)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px dashed var(--qcp-border)', paddingTop: 6 }}>
                <span>{t('dashboard.expectedCash')}</span>
                <span>{currency(summary.expectedCash)}</span>
              </div>
            </div>

            <div className="qcp-field">
              <label>{t('dashboard.actualCash')}</label>
              <input className="qcp-input" type="number" value={actualCash} onChange={(e) => setActualCash(e.target.value)} />
            </div>

            <div
              className={`qcp-pill ${difference === 0 ? 'success' : difference > 0 ? 'accent' : 'critical'}`}
              style={{ marginBottom: 16 }}
            >
              {t('dashboard.difference')}: {currency(difference)}
            </div>

            {closeError && (
              <div className="qcp-pill critical" style={{ marginBottom: 16 }}>
                {closeError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleConfirm}>
                {t('dashboard.confirmClose')}
              </button>
              <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
                {t('parties.cancel')}
              </button>
            </div>
          </>
        ) : (
          <p>{t('common.loading')}</p>
        )}
      </div>
    </div>
  )
}

function TopProductsCard({ items }: { items: TopProductItem[] }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="qcp-card">
      <h3 style={{ marginTop: 0 }}>🏆 {t('dashboard.topProductsTitle')}</h3>
      {items.length === 0 ? (
        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>{t('dashboard.noSalesToday')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((p, idx) => (
            <div key={p.productId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="qcp-pill accent"
                style={{ minWidth: 22, textAlign: 'center', fontWeight: 800 }}
              >
                {idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>
                  {p.qty} {t('dashboard.unitsSold')}
                </div>
              </div>
              <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{currency(p.revenue)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PaymentMethodsCard({ items }: { items: PaymentMethodBreakdownItem[] }): JSX.Element {
  const { t } = useTranslation()
  const max = Math.max(1, ...items.map((d) => d.total))
  return (
    <div className="qcp-card">
      <h3 style={{ marginTop: 0 }}>💳 {t('dashboard.paymentMethodsTitle')}</h3>
      {items.length === 0 ? (
        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>{t('dashboard.noSalesToday')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((d, idx) => (
            <div key={d.method}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                <span>{t(PAYMENT_METHOD_KEYS[d.method])}</span>
                <strong>{currency(d.total)}</strong>
              </div>
              <div style={{ height: 10, borderRadius: 6, background: 'var(--qcp-bg-sunken)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(d.total / max) * 100}%`,
                    height: '100%',
                    borderRadius: 6,
                    background: CHART_COLORS[idx % CHART_COLORS.length]
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CategorySalesCard({ items }: { items: CategorySalesItem[] }): JSX.Element {
  const { t } = useTranslation()
  const total = items.reduce((s, d) => s + d.total, 0)
  const radius = 46
  const strokeWidth = 16
  const circumference = 2 * Math.PI * radius
  let offsetAcc = 0

  return (
    <div className="qcp-card">
      <h3 style={{ marginTop: 0 }}>🍩 {t('dashboard.categorySalesTitle')}</h3>
      {total === 0 ? (
        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>{t('dashboard.noSalesToday')}</p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <svg width={120} height={120} viewBox="0 0 120 120" style={{ flex: '0 0 auto' }}>
            <g transform="rotate(-90 60 60)">
              {items.map((d, idx) => {
                const fraction = d.total / total
                const dash = fraction * circumference
                const el = (
                  <circle
                    key={idx}
                    cx={60}
                    cy={60}
                    r={radius}
                    fill="none"
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offsetAcc}
                  />
                )
                offsetAcc += dash
                return el
              })}
            </g>
            <text x={60} y={65} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--qcp-ink)">
              {currency(total)}
            </text>
          </svg>
          <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((d, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: CHART_COLORS[idx % CHART_COLORS.length],
                    flex: '0 0 auto'
                  }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.categoryName}
                </span>
                <span style={{ color: 'var(--qcp-ink-faint)' }}>{Math.round((d.total / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
