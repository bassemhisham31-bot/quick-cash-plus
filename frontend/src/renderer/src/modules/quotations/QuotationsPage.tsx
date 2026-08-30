import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import type {
  CartLine,
  CustomerView,
  PaymentMethod,
  Product,
  QuotationListItem,
  QuotationStatus,
  QuotationView,
  Warehouse
} from '../../../../shared/types'

const STATUS_LABELS: Record<QuotationStatus, { label: string; pill: string }> = {
  draft: { label: 'مسودة', pill: '' },
  sent: { label: 'مُرسل', pill: 'accent' },
  accepted: { label: 'تم التحويل لفاتورة', pill: 'success' },
  expired: { label: 'منتهي', pill: 'critical' }
}

export function QuotationsPage(): JSX.Element {
  const { t } = useTranslation()
  const [quotations, setQuotations] = useState<QuotationListItem[]>([])
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<QuotationView | null>(null)

  async function refresh(): Promise<void> {
    setQuotations(await window.api.quotations.list())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function openQuotation(id: number): Promise<void> {
    setSelected(await window.api.quotations.getView(id))
  }

  return (
    <div>
      <div
        className="qcp-page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1>{t('nav.quotations')}</h1>
        <button className="qcp-btn qcp-btn-primary" onClick={() => setShowNew(true)}>
          + {t('quotations.new')}
        </button>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('quotations.number')}</th>
              <th>{t('quotations.customer')}</th>
              <th>{t('quotations.total')}</th>
              <th>{t('quotations.status')}</th>
              <th>{t('quotations.validUntil')}</th>
              <th>{t('invoices.date')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => (
              <tr key={q.id}>
                <td style={{ fontFamily: 'var(--qcp-mono)' }}>{q.number}</td>
                <td>{q.customerName}</td>
                <td>{currency(q.total)}</td>
                <td>
                  <span className={`qcp-pill ${STATUS_LABELS[q.status].pill}`}>{STATUS_LABELS[q.status].label}</span>
                </td>
                <td>{q.validUntil || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{q.createdAt}</td>
                <td>
                  <button className="qcp-btn qcp-btn-secondary" onClick={() => openQuotation(q.id)}>
                    {t('invoices.view')}
                  </button>
                </td>
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewQuotationModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            refresh()
          }}
        />
      )}

      {selected && (
        <QuotationDetailModal
          quotation={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            refresh()
            openQuotation(selected.id)
          }}
        />
      )}
    </div>
  )
}

function NewQuotationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'value'>('value')
  const [discountValue, setDiscountValue] = useState('0')
  const [validUntil, setValidUntil] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.customers.list('').then(setCustomers)
    window.api.catalog.listProducts('').then(setProducts)
  }, [])

  useEffect(() => {
    const id = setTimeout(() => window.api.catalog.listProducts(search).then(setProducts), 200)
    return () => clearTimeout(id)
  }, [search])

  function addToCart(p: Product): void {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l))
      return [...prev, { productId: p.id, name: p.name, barcode: p.barcode, unitPrice: p.retailPrice, qty: 1, discount: 0 }]
    })
  }

  function updateQty(productId: number, qty: number): void {
    setCart((prev) =>
      qty <= 0 ? prev.filter((l) => l.productId !== productId) : prev.map((l) => (l.productId === productId ? { ...l, qty } : l))
    )
  }

  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.unitPrice - l.discount, 0)
  const discountTotal = discountType === 'percent' ? subtotal * (Number(discountValue) / 100) : Number(discountValue) || 0
  const total = Math.max(0, subtotal - discountTotal)

  async function handleSave(): Promise<void> {
    if (!user || cart.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await window.api.quotations.create(
        {
          customerId,
          customerName,
          lines: cart,
          discountType,
          discountValue: Number(discountValue) || 0,
          validUntil: validUntil || null,
          note
        },
        user.id
      )
      onCreated()
    } catch (e: any) {
      setError(e?.message ?? 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div
        className="qcp-modal"
        style={{ width: 'min(900px, 96vw)', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 style={{ marginTop: 0 }}>{t('quotations.new')}</h2>
          <input
            className="qcp-input"
            style={{ width: '100%', marginBottom: 10 }}
            placeholder={t('pos.searchPlaceholder') ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
            {products.map((p) => (
              <button
                key={p.id}
                className="qcp-card"
                style={{ textAlign: 'start', cursor: 'pointer', border: 'none' }}
                onClick={() => addToCart(p)}
              >
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{p.name}</div>
                <div style={{ marginTop: 6 }}>
                  <span className="qcp-pill accent">{currency(p.retailPrice)}</span>
                </div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            {cart.map((line) => (
              <div
                key={line.productId}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--qcp-border)', fontSize: 13 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{line.name}</div>
                  <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 11.5 }}>
                    {currency(line.unitPrice)} × {line.qty}
                  </div>
                </div>
                <input
                  className="qcp-input"
                  type="number"
                  style={{ width: 56, padding: '4px 6px', textAlign: 'center' }}
                  value={line.qty}
                  onChange={(e) => updateQty(line.productId, Number(e.target.value))}
                />
              </div>
            ))}
            {cart.length === 0 && <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>{t('pos.emptyCart')}</p>}
          </div>
        </div>

        <div>
          <div className="qcp-field">
            <label>{t('quotations.customer')}</label>
            <select className="qcp-select" value={customerId ?? ''} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('quotations.noCustomerLinked')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {!customerId && (
            <div className="qcp-field">
              <label>{t('quotations.customerNameFreeText')}</label>
              <input className="qcp-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
          )}
          <div className="qcp-field">
            <label>{t('pos.discount')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="qcp-select" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'value')}>
                <option value="value">ج.م</option>
                <option value="percent">%</option>
              </select>
              <input className="qcp-input" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
          </div>
          <div className="qcp-field">
            <label>{t('quotations.validUntil')}</label>
            <input className="qcp-input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="qcp-field">
            <label>{t('parties.notes')}</label>
            <input className="qcp-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ borderTop: '1px dashed var(--qcp-border)', paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{t('pos.subtotal')}</span>
              <span>{currency(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>{t('pos.total')}</span>
              <span>{currency(total)}</span>
            </div>
          </div>

          {error && (
            <div className="qcp-pill critical" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}

          <button
            className="qcp-btn qcp-btn-primary"
            style={{ width: '100%', marginTop: 14 }}
            disabled={saving || cart.length === 0}
            onClick={handleSave}
          >
            {t('quotations.save')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>
            {t('parties.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuotationDetailModal({
  quotation,
  onClose,
  onChanged
}: {
  quotation: QuotationView
  onClose: () => void
  onChanged: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [showConvert, setShowConvert] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.catalog.listWarehouses().then((list) => {
      setWarehouses(list)
      setWarehouseId(list.find((w) => w.isDefault)?.id ?? list[0]?.id ?? null)
    })
  }, [])

  async function handleMark(status: 'sent' | 'expired'): Promise<void> {
    await window.api.quotations.updateStatus(quotation.id, status)
    onChanged()
  }

  async function handleConvert(): Promise<void> {
    if (!user || !warehouseId) return
    setError(null)
    const result = await window.api.quotations.convertToInvoice(
      quotation.id,
      { warehouseId, paymentMethod, paid: quotation.total },
      user.id
    )
    if (!result.ok) {
      setError(result.error ?? 'حدث خطأ')
      return
    }
    setShowConvert(false)
    onChanged()
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(640px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>{quotation.number}</h2>
          <span className={`qcp-pill ${STATUS_LABELS[quotation.status].pill}`}>
            {STATUS_LABELS[quotation.status].label}
          </span>
        </div>
        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 12.5 }}>
          {quotation.customerName} — {quotation.createdAt}
        </p>

        <div className="qcp-table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>{t('quotations.item')}</th>
                <th>{t('pos.total')}</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((l, idx) => (
                <tr key={idx}>
                  <td>
                    {l.productName} × {l.qty}
                  </td>
                  <td>{currency(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, marginTop: 10 }}>
          <span>{t('pos.total')}</span>
          <span>{currency(quotation.total)}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            className="qcp-btn qcp-btn-secondary"
            style={{ flex: 1 }}
            onClick={() => window.api.print.quotation(quotation.id)}
          >
            🖨️ {t('common.print')}
          </button>
          <button
            className="qcp-btn qcp-btn-secondary"
            style={{ flex: 1 }}
            onClick={() => window.api.print.previewQuotation(quotation.id)}
          >
            👁️ {t('common.preview')}
          </button>
        </div>

        {quotation.convertedInvoiceId && (
          <div className="qcp-pill success" style={{ marginTop: 10 }}>
            {t('quotations.convertedNotice')} #{quotation.convertedInvoiceId}
          </div>
        )}

        {error && (
          <div className="qcp-pill critical" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        {!quotation.convertedInvoiceId && (
          <>
            {showConvert && (
              <div className="qcp-card" style={{ marginTop: 12 }}>
                <div className="qcp-field">
                  <label>{t('inventory.warehouse')}</label>
                  <select className="qcp-select" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(Number(e.target.value))}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="qcp-field">
                  <label>{t('pos.paymentMethod')}</label>
                  <select className="qcp-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                    <option value="cash">{t('pos.cash')}</option>
                    <option value="credit">{t('pos.credit')}</option>
                    <option value="card">{t('pos.card')}</option>
                    <option value="wallet">{t('pos.wallet')}</option>
                    <option value="vodafone_cash">{t('pos.vodafoneCash')}</option>
                    <option value="instapay">{t('pos.instapay')}</option>
                  </select>
                </div>
                <button className="qcp-btn qcp-btn-primary" style={{ width: '100%' }} onClick={handleConvert}>
                  {t('quotations.confirmConvert')}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {quotation.status === 'draft' && (
                <button className="qcp-btn qcp-btn-secondary" onClick={() => handleMark('sent')}>
                  {t('quotations.markSent')}
                </button>
              )}
              {quotation.status !== 'expired' && (
                <button className="qcp-btn qcp-btn-secondary" onClick={() => handleMark('expired')}>
                  {t('quotations.markExpired')}
                </button>
              )}
              <button className="qcp-btn qcp-btn-primary" onClick={() => setShowConvert(true)}>
                {t('quotations.convertToInvoice')}
              </button>
            </div>
          </>
        )}

        <button className="qcp-btn qcp-btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
