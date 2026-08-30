import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import type { Product, PurchaseLineInput, VendorView, Warehouse } from '../../../../shared/types'

interface Props {
  warehouses: Warehouse[]
  defaultWarehouseId: number
  onClose: () => void
  onSaved: () => void
}

export function PurchaseInvoiceModal({ warehouses, defaultWarehouseId, onClose, onSaved }: Props): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)

  const [vendors, setVendors] = useState<VendorView[]>([])
  const [vendorId, setVendorId] = useState<number | ''>('')
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId)
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'credit' | 'card' | 'wallet' | 'vodafone_cash' | 'instapay'
  >('cash')
  const [paid, setPaid] = useState('0')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [lines, setLines] = useState<PurchaseLineInput[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.vendors.list('').then(setVendors)
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      return
    }
    const id = setTimeout(() => {
      window.api.catalog.listProducts(search, warehouseId).then(setResults)
    }, 200)
    return () => clearTimeout(id)
  }, [search, warehouseId])

  function addLine(product: Product): void {
    setLines((prev) => {
      if (prev.some((l) => l.productId === product.id)) return prev
      return [
        ...prev,
        { productId: product.id, name: product.name, barcode: product.barcode, qty: 1, purchasePrice: product.costPrice }
      ]
    })
    setSearch('')
    setResults([])
  }

  function updateLine(productId: number, field: 'qty' | 'purchasePrice', value: number): void {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, [field]: value } : l)))
  }

  function removeLine(productId: number): void {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  const total = lines.reduce((sum, l) => sum + l.qty * l.purchasePrice, 0)

  async function handleSave(): Promise<void> {
    if (!user || !lines.length) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.purchases.create(
        {
          vendorId: vendorId === '' ? null : vendorId,
          warehouseId,
          lines,
          paymentMethod,
          paid: paymentMethod === 'cash' ? Number(paid) || total : paymentMethod === 'credit' ? 0 : total,
          note
        },
        user.id
      )
      if (!result.ok) {
        setError(result.error ?? 'حدث خطأ')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(760px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>فاتورة مشتريات</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <select className="qcp-select" style={{ flex: 1 }} value={vendorId} onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">بدون مورد محدد</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select className="qcp-select" style={{ flex: 1 }} value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            className="qcp-input"
            style={{ width: '100%' }}
            placeholder="ابحث بالاسم أو الباركود لإضافة صنف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results.length > 0 && (
            <div className="qcp-card" style={{ position: 'absolute', zIndex: 5, width: '100%', marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
              {results.map((p) => (
                <div
                  key={p.id}
                  style={{ padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => addLine(p)}
                >
                  {p.name} — <span style={{ color: 'var(--qcp-ink-faint)' }}>{p.barcode}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="qcp-table-wrap" style={{ marginBottom: 12 }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الكمية</th>
                <th>سعر الشراء</th>
                <th>الإجمالي</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td>
                    <input
                      className="qcp-input"
                      type="number"
                      style={{ width: 70, padding: '4px 6px' }}
                      value={l.qty}
                      onChange={(e) => updateLine(l.productId, 'qty', Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      className="qcp-input"
                      type="number"
                      style={{ width: 90, padding: '4px 6px' }}
                      value={l.purchasePrice}
                      onChange={(e) => updateLine(l.productId, 'purchasePrice', Number(e.target.value))}
                    />
                  </td>
                  <td>{currency(l.qty * l.purchasePrice)}</td>
                  <td>
                    <button className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 8px' }} onClick={() => removeLine(l.productId)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    لا توجد أصناف بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <select className="qcp-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
            <option value="cash">{t('pos.cash')}</option>
            <option value="credit">{t('pos.credit')}</option>
            <option value="card">{t('pos.card')}</option>
            <option value="wallet">{t('pos.wallet')}</option>
            <option value="vodafone_cash">{t('pos.vodafoneCash')}</option>
            <option value="instapay">{t('pos.instapay')}</option>
          </select>
          {paymentMethod === 'cash' && (
            <input className="qcp-input" type="number" placeholder={t('pos.paid') ?? ''} value={paid} onChange={(e) => setPaid(e.target.value)} />
          )}
          <input className="qcp-input" style={{ flex: 1 }} placeholder={t('parties.notes') ?? ''} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: 14 }}>
          <span>الإجمالي</span>
          <span>{currency(total)}</span>
        </div>

        {error && (
          <div className="qcp-pill critical" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={saving || lines.length === 0} onClick={handleSave}>
            حفظ وتحديث المخزون
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            {t('parties.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
