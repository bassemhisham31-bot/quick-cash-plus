import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import type { Product, TransferLineInput, Warehouse } from '../../../../shared/types'

interface Props {
  warehouses: Warehouse[]
  defaultWarehouseId: number
  onClose: () => void
  onSaved: () => void
}

export function TransferModal({ warehouses, defaultWarehouseId, onClose, onSaved }: Props): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)

  const otherWarehouse = warehouses.find((w) => w.id !== defaultWarehouseId)
  const [fromWarehouseId, setFromWarehouseId] = useState(defaultWarehouseId)
  const [toWarehouseId, setToWarehouseId] = useState(otherWarehouse?.id ?? defaultWarehouseId)
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [lines, setLines] = useState<(TransferLineInput & { name: string })[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      return
    }
    const id = setTimeout(() => {
      window.api.catalog.listProducts(search, fromWarehouseId).then(setResults)
    }, 200)
    return () => clearTimeout(id)
  }, [search, fromWarehouseId])

  function addLine(product: Product): void {
    setLines((prev) => {
      if (prev.some((l) => l.productId === product.id)) return prev
      return [...prev, { productId: product.id, name: product.name, qty: 1 }]
    })
    setSearch('')
    setResults([])
  }

  function updateQty(productId: number, qty: number): void {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty } : l)))
  }

  function removeLine(productId: number): void {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  async function handleSave(): Promise<void> {
    if (!user || !lines.length) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.stock.transfer(
        { fromWarehouseId, toWarehouseId, note, lines: lines.map(({ productId, qty }) => ({ productId, qty })) },
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
      <div className="qcp-modal" style={{ width: 'min(620px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>نقل بين المخازن</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <select className="qcp-select" style={{ flex: 1 }} value={fromWarehouseId} onChange={(e) => setFromWarehouseId(Number(e.target.value))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <span>←</span>
          <select className="qcp-select" style={{ flex: 1 }} value={toWarehouseId} onChange={(e) => setToWarehouseId(Number(e.target.value))}>
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
                <div key={p.id} style={{ padding: '6px 4px', cursor: 'pointer', fontSize: 13 }} onClick={() => addLine(p)}>
                  {p.name} — <span style={{ color: 'var(--qcp-ink-faint)' }}>متاح: {p.quantity}</span>
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
                      style={{ width: 80, padding: '4px 6px' }}
                      value={l.qty}
                      onChange={(e) => updateQty(l.productId, Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <button className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 8px' }} onClick={() => removeLine(l.productId)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    لا توجد أصناف بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <input className="qcp-input" style={{ width: '100%', marginBottom: 12 }} placeholder={t('parties.notes') ?? ''} value={note} onChange={(e) => setNote(e.target.value)} />

        {error && (
          <div className="qcp-pill critical" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={saving || lines.length === 0} onClick={handleSave}>
            تنفيذ النقل
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            {t('parties.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
