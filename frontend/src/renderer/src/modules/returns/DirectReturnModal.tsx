import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { alertDialog } from '../../components/ConfirmDialogHost'
import type { CustomerView, Product, Warehouse } from '../../../../shared/types'

interface Line {
  productId: number
  name: string
  qty: string
  unitPrice: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

/** مرتجع مبيعات بدون فاتورة: أصناف + عميل اختياري، رد نقدي أو خصم من رصيد العميل، وبيتطبع بعد الحفظ. */
export function DirectReturnModal({ onClose, onSaved }: Props): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customer, setCustomer] = useState<CustomerView | null>(null)
  const [customerLabel, setCustomerLabel] = useState('')
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Product[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [refundMethod, setRefundMethod] = useState<'cash' | 'credit'>('cash')
  const [note, setNote] = useState('')
  const [printAfter, setPrintAfter] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.catalog.listWarehouses().then((list) => {
      setWarehouses(list)
      setWarehouseId(list.find((w) => w.isDefault)?.id ?? list[0]?.id ?? null)
    })
    window.api.customers.list('').then(setCustomers)
  }, [])

  useEffect(() => {
    const term = search.trim()
    if (!term || !warehouseId) {
      setMatches([])
      return
    }
    const id = setTimeout(() => {
      window.api.catalog.listProducts(term, warehouseId).then((list) => setMatches(list.slice(0, 12)))
    }, 200)
    return () => clearTimeout(id)
  }, [search, warehouseId])

  const customerMatches = useMemo(() => {
    const term = customerSearch.trim().toLowerCase()
    if (!term) return []
    return customers.filter((c) => c.name.toLowerCase().includes(term) || (c.phone ?? '').includes(term)).slice(0, 8)
  }, [customerSearch, customers])

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)

  function addProduct(p: Product): void {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: String((Number(next[idx].qty) || 0) + 1) }
        return next
      }
      return [...prev, { productId: p.id, name: p.name, qty: '1', unitPrice: String(p.retailPrice ?? 0) }]
    })
    setSearch('')
    setMatches([])
    searchRef.current?.focus()
  }

  function updateLine(idx: number, patch: Partial<Line>): void {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function save(): Promise<void> {
    if (!user || !warehouseId || saving) return
    setError(null)
    const clean = lines
      .map((l) => ({ productId: l.productId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) }))
      .filter((l) => l.qty > 0)
    if (!clean.length) {
      setError('ضيف صنف واحد على الأقل بكمية أكبر من صفر')
      return
    }
    if (refundMethod === 'credit' && !customer) {
      setError('الخصم من الرصيد محتاج عميل مسجّل — اختار العميل الأول')
      return
    }
    setSaving(true)
    try {
      const result = await window.api.invoices.createDirectReturn(
        {
          customerId: customer?.id ?? null,
          customerLabel: customer ? undefined : customerLabel,
          warehouseId,
          refundMethod,
          note,
          lines: clean
        },
        user.id
      )
      if (!result.ok || !result.returnId) {
        setError(result.error ?? 'تعذر تسجيل المرتجع')
        return
      }
      if (printAfter) {
        const pr = await window.api.invoices.printDirectReturn(result.returnId, false)
        if (pr && !pr.ok && pr.error) await alertDialog(`المرتجع اتسجل (${result.number}) لكن الطباعة فشلت: ${pr.error}`)
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'تعذر تسجيل المرتجع')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(760px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>↩️ مرتجع مبيعات بدون فاتورة</h2>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: 2, minWidth: 220, position: 'relative' }}>
            {customer ? (
              <div className="qcp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
                <span>
                  👤 <strong>{customer.name}</strong> — الرصيد: {currency(customer.balance)}
                </span>
                <button
                  type="button"
                  className="qcp-btn qcp-btn-secondary"
                  onClick={() => {
                    setCustomer(null)
                    setRefundMethod('cash')
                  }}
                >
                  تغيير
                </button>
              </div>
            ) : (
              <>
                <input
                  className="qcp-input"
                  style={{ width: '100%' }}
                  placeholder="👤 العميل (اختياري) — ابحث بالاسم أو الموبايل"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setCustomerLabel(e.target.value)
                  }}
                />
                {customerMatches.length > 0 && (
                  <div className="qcp-card" style={{ position: 'absolute', zIndex: 5, insetInlineStart: 0, insetInlineEnd: 0, padding: 4, maxHeight: 220, overflowY: 'auto' }}>
                    {customerMatches.map((c) => (
                      <div
                        key={c.id}
                        style={{ padding: '6px 8px', cursor: 'pointer' }}
                        onClick={() => {
                          setCustomer(c)
                          setCustomerSearch('')
                          setCustomerLabel('')
                        }}
                      >
                        {c.name} {c.phone ? `— ${c.phone}` : ''} — {currency(c.balance)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {warehouses.length > 1 && (
            <select className="qcp-select" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(Number(e.target.value))}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  مخزن: {w.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            ref={searchRef}
            className="qcp-input"
            style={{ width: '100%' }}
            autoFocus
            placeholder="🔍 ابحث عن الصنف بالاسم أو الباركود وضيفه للمرتجع"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length) addProduct(matches[0])
            }}
          />
          {matches.length > 0 && (
            <div className="qcp-card" style={{ position: 'absolute', zIndex: 5, insetInlineStart: 0, insetInlineEnd: 0, padding: 4, maxHeight: 240, overflowY: 'auto' }}>
              {matches.map((p) => (
                <div key={p.id} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }} onClick={() => addProduct(p)}>
                  <span>{p.name}</span>
                  <span style={{ color: 'var(--qcp-ink-faint)' }}>{currency(p.retailPrice)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="qcp-table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th style={{ width: 110 }}>الكمية</th>
                <th style={{ width: 130 }}>السعر</th>
                <th style={{ width: 130 }}>القيمة</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td>
                    <input className="qcp-input" style={{ width: '100%' }} type="number" min="0" step="any" value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} />
                  </td>
                  <td>
                    <input className="qcp-input" style={{ width: '100%' }} type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: e.target.value })} />
                  </td>
                  <td>{currency((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}</td>
                  <td>
                    <button type="button" className="qcp-btn qcp-btn-secondary" title="حذف" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {!lines.length && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    ابحث عن الأصناف المرتجعة وضيفها
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            طريقة الرد
            <select className="qcp-select" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as 'cash' | 'credit')}>
              <option value="cash">رد نقدي من الخزينة</option>
              <option value="credit" disabled={!customer}>
                خصم من رصيد العميل
              </option>
            </select>
          </label>
          <input className="qcp-input" style={{ flex: 1, minWidth: 160 }} placeholder="ملاحظات / سبب المرتجع" value={note} onChange={(e) => setNote(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} />
            طباعة بعد الحفظ
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <strong style={{ fontSize: 18, color: 'var(--qcp-critical)' }}>إجمالي المرتجع: {currency(total)}</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="qcp-btn qcp-btn-primary" disabled={saving || !lines.length} onClick={save}>
              {saving ? '...جاري الحفظ' : printAfter ? '✓ حفظ وطباعة' : '✓ حفظ'}
            </button>
            <button type="button" className="qcp-btn qcp-btn-secondary" onClick={onClose}>
              إلغاء
            </button>
          </div>
        </div>
        {error && <div style={{ color: 'var(--qcp-critical)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  )
}
