import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { playSound } from '../../lib/sounds'
import type { Product, StockPermitListItem, StockPermitLineInput, StockPermitType, StockPermitView, Warehouse } from '../../../../shared/types'

const TYPE_ICON: Record<StockPermitType, string> = { addition: '➕', deduction: '➖' }

export function StockPermitsPage(): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<StockPermitListItem[]>([])
  const [filter, setFilter] = useState<StockPermitType | 'all'>('all')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<number | null>(null)
  const [createType, setCreateType] = useState<StockPermitType | null>(null)
  const [viewingId, setViewingId] = useState<number | null>(null)

  async function refresh(): Promise<void> {
    setItems(await window.api.stockPermits.list(filter === 'all' ? undefined : filter))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  useEffect(() => {
    window.api.catalog.listWarehouses().then((list) => {
      setWarehouses(list)
      setDefaultWarehouseId(list.find((w) => w.isDefault)?.id ?? list[0]?.id ?? null)
    })
  }, [])

  return (
    <div>
      <div className="qcp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('stockPermits.title')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="qcp-btn qcp-btn-primary" onClick={() => setCreateType('addition')}>
            + {t('stockPermits.newAddition')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => setCreateType('deduction')}>
            + {t('stockPermits.newDeduction')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'addition', 'deduction'] as const).map((f) => (
          <button
            key={f}
            className={`qcp-btn ${filter === f ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? t('stockPermits.filterAll') : f === 'addition' ? t('stockPermits.filterAddition') : t('stockPermits.filterDeduction')}
          </button>
        ))}
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('stockPermits.number')}</th>
              <th>{t('stockPermits.type')}</th>
              <th>{t('stockPermits.warehouse')}</th>
              <th>{t('stockPermits.reason')}</th>
              <th>{t('stockPermits.totalQty')}</th>
              <th>{t('stockPermits.user')}</th>
              <th>{t('stockPermits.date')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setViewingId(p.id)}>
                <td style={{ fontFamily: 'var(--qcp-mono)' }}>{p.number}</td>
                <td>
                  <span className={`qcp-pill ${p.type === 'addition' ? 'success' : 'critical'}`}>
                    {TYPE_ICON[p.type]} {p.type === 'addition' ? t('stockPermits.filterAddition') : t('stockPermits.filterDeduction')}
                  </span>
                </td>
                <td>{p.warehouseName}</td>
                <td>{p.reason || '—'}</td>
                <td>{p.totalQty}</td>
                <td>{p.userName}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{p.createdAt}</td>
                <td>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 10px' }} onClick={(e) => { e.stopPropagation(); setViewingId(p.id) }}>
                    {t('stockPermits.view')}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  {t('stockPermits.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {createType && defaultWarehouseId != null && (
        <StockPermitModal
          type={createType}
          warehouses={warehouses}
          defaultWarehouseId={defaultWarehouseId}
          onClose={() => setCreateType(null)}
          onSaved={() => {
            refresh()
          }}
        />
      )}

      {viewingId != null && (
        <StockPermitViewModal
          permitId={viewingId}
          onClose={() => setViewingId(null)}
          onDeleted={() => {
            setViewingId(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function StockPermitModal({
  type,
  warehouses,
  defaultWarehouseId,
  onClose,
  onSaved
}: {
  type: StockPermitType
  warehouses: Warehouse[]
  defaultWarehouseId: number
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)

  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [lines, setLines] = useState<StockPermitLineInput[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      return [...prev, { productId: product.id, name: product.name, barcode: product.barcode, qty: 1, note: '' }]
    })
    setSearch('')
    setResults([])
  }

  function updateLineQty(productId: number, qty: number): void {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty } : l)))
  }

  function updateLineNote(productId: number, note: string): void {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, note } : l)))
  }

  function removeLine(productId: number): void {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0)

  async function handleSave(): Promise<void> {
    if (!user || !lines.length) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.stockPermits.create({ type, warehouseId, reason, note, lines }, user.id)
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
        <h2 style={{ marginTop: 0 }}>{type === 'addition' ? t('stockPermits.newAddition') : t('stockPermits.newDeduction')}</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <select className="qcp-select" style={{ flex: 1 }} value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            className="qcp-input"
            style={{ flex: 1 }}
            placeholder={t('stockPermits.reasonPlaceholder') ?? ''}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            className="qcp-input"
            style={{ width: '100%' }}
            placeholder={t('stockPermits.searchProductPlaceholder') ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results.length > 0 && (
            <div className="qcp-card" style={{ position: 'absolute', zIndex: 5, width: '100%', marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
              {results.map((p) => (
                <div key={p.id} style={{ padding: '6px 4px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between' }} onClick={() => addLine(p)}>
                  <span>
                    {p.name} — <span style={{ color: 'var(--qcp-ink-faint)' }}>{p.barcode}</span>
                  </span>
                  <span className="qcp-pill">{p.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="qcp-table-wrap" style={{ marginBottom: 12 }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>{t('stockPermits.product')}</th>
                <th>{t('stockPermits.qty')}</th>
                <th>{t('stockPermits.lineNote')}</th>
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
                      onChange={(e) => updateLineQty(l.productId, Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      className="qcp-input"
                      style={{ width: 140, padding: '4px 6px' }}
                      value={l.note}
                      onChange={(e) => updateLineNote(l.productId, e.target.value)}
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
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    {t('stockPermits.noLinesYet')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="qcp-field">
          <label>{t('parties.notes')}</label>
          <input className="qcp-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: 14 }}>
          <span>{t('stockPermits.totalQty')}</span>
          <span>{totalQty}</span>
        </div>

        {error && (
          <div className="qcp-pill critical" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={saving || lines.length === 0} onClick={handleSave}>
            {t('stockPermits.saveAndUpdateStock')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            {t('parties.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

function StockPermitViewModal({
  permitId,
  onClose,
  onDeleted
}: {
  permitId: number
  onClose: () => void
  onDeleted: () => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [permit, setPermit] = useState<StockPermitView | null>(null)
  const [printing, setPrinting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.stockPermits.getView(permitId).then(setPermit)
  }, [permitId])

  async function handlePrint(preview: boolean): Promise<void> {
    setPrinting(true)
    try {
      if (preview) await window.api.print.previewStockPermit(permitId)
      else await window.api.print.stockPermit(permitId)
    } finally {
      setPrinting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!user) return
    if (!window.confirm(t('stockPermits.confirmDelete') ?? '')) return
    setDeleting(true)
    setError(null)
    try {
      const result = await window.api.stockPermits.delete(permitId, user.id)
      if (!result.ok) {
        setError(result.error ?? 'حدث خطأ')
        return
      }
      playSound('delete')
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  if (!permit) return null

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(600px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>
          {permit.type === 'addition' ? t('stockPermits.filterAddition') : t('stockPermits.filterDeduction')} — {permit.number}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('stockPermits.warehouse')}</span>
            <strong>{permit.warehouseName}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('stockPermits.reason')}</span>
            <strong>{permit.reason || '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('stockPermits.user')}</span>
            <strong>{permit.userName}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('stockPermits.date')}</span>
            <strong>{permit.createdAt}</strong>
          </div>
        </div>

        <div className="qcp-table-wrap" style={{ marginBottom: 14 }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>{t('stockPermits.product')}</th>
                <th>{t('stockPermits.qty')}</th>
                <th>{t('stockPermits.lineNote')}</th>
              </tr>
            </thead>
            <tbody>
              {permit.lines.map((l, idx) => (
                <tr key={idx}>
                  <td>{l.productName}</td>
                  <td>{l.qty}</td>
                  <td>{l.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: 14 }}>
          <span>{t('stockPermits.totalQty')}</span>
          <span>{permit.totalQty}</span>
        </div>

        {permit.note && <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>{permit.note}</p>}

        {error && (
          <div className="qcp-pill critical" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={printing} onClick={() => handlePrint(false)}>
            🖨️ {t('common.print')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" disabled={printing} onClick={() => handlePrint(true)}>
            👁️ {t('common.preview')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" disabled={deleting} onClick={handleDelete} style={{ color: 'var(--qcp-critical)' }}>
            🗑️ {t('stockPermits.delete')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
