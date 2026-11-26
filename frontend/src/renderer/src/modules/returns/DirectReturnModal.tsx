import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
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

/** مرتجع مبيعات بدون فاتورة: أصناف + عميل (مطلوب)، والمرتجع بيتخصم من رصيد العميل دايمًا (مفيش رد نقدي من الخزينة) — حفظ بس من غير طباعة. */
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
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // الصنف اللي لسه متضاف: المؤشر ينط على خانة كميته (زي شاشة البيع)
  const focusQtyRef = useRef<number | null>(null)
  // البحث اللي قايمة matches اتجابت بيه — لو نفس اللي اتكتب لما يدوس Enter بنضيف من غير ما نستنى السيرفر
  const matchesTermRef = useRef('')

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
      matchesTermRef.current = ''
      return
    }
    const id = setTimeout(() => {
      window.api.catalog.listProducts(term, warehouseId).then((list) => {
        matchesTermRef.current = term
        setMatches(list.slice(0, 12))
      })
    }, 200)
    return () => clearTimeout(id)
  }, [search, warehouseId])

  // بعد إضافة صنف: المؤشر على كميته. وبعد اختيار العميل: المؤشر على خانة بحث الصنف
  useEffect(() => {
    const id = focusQtyRef.current
    if (id == null) return
    focusQtyRef.current = null
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-ret-qty="${id}"]`)
      input?.focus()
      input?.select()
    }, 0)
  }, [lines])
  useEffect(() => {
    if (customer) setTimeout(() => searchRef.current?.focus(), 0)
  }, [customer])

  const customerMatches = useMemo(() => {
    const term = customerSearch.trim().toLowerCase()
    if (!term) return []
    return customers.filter((c) => c.name.toLowerCase().includes(term) || (c.phone ?? '').includes(term)).slice(0, 8)
  }, [customerSearch, customers])

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)

  /** زي شاشة البيع: الصنف بيتضاف بكمية صفر وسعر صفر والمؤشر على الكمية (Enter ← السعر ← Enter ← بحث الصنف اللي بعده) */
  function addProduct(p: Product): void {
    focusQtyRef.current = p.id
    setLines((prev) => {
      if (prev.some((l) => l.productId === p.id)) return [...prev]
      return [...prev, { productId: p.id, name: p.name, qty: '0', unitPrice: '0' }]
    })
    setSearch('')
    setMatches([])
    matchesTermRef.current = ''
  }

  async function addFromSearch(): Promise<void> {
    const term = search.trim()
    if (!term || !warehouseId) return
    let list = matches
    if (matchesTermRef.current !== term) list = await window.api.catalog.listProducts(term, warehouseId)
    const exact = list.find((p) => p.barcode === term)
    const pick = exact ?? list[0]
    if (pick) addProduct(pick)
  }

  function updateLine(idx: number, patch: Partial<Line>): void {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function save(): Promise<void> {
    if (!user || !warehouseId || saving) return
    setError(null)
    if (!lines.length) {
      setError('ضيف صنف واحد على الأقل')
      return
    }
    const bad = lines.find((l) => !(Number(l.qty) > 0) || !(Number(l.unitPrice) > 0))
    if (bad) {
      setError(`الصنف «${bad.name}»: اكتب الكمية والسعر (مينفعش يبقوا صفر)`)
      return
    }
    const clean = lines.map((l) => ({ productId: l.productId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) }))
    if (!customer) {
      setError('اختار العميل الأول — المرتجع بيتخصم من رصيده')
      return
    }
    setSaving(true)
    try {
      const result = await window.api.invoices.createDirectReturn(
        {
          customerId: customer.id,
          warehouseId,
          refundMethod: 'credit',
          note,
          lines: clean
        },
        user.id
      )
      if (!result.ok || !result.returnId) {
        setError(result.error ?? 'تعذر تسجيل المرتجع')
        return
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
                  onClick={() => setCustomer(null)}
                >
                  تغيير
                </button>
              </div>
            ) : (
              <>
                <input
                  className="qcp-input"
                  style={{ width: '100%' }}
                  placeholder="👤 العميل (مطلوب) — ابحث بالاسم أو الموبايل"
                  value={customerSearch}
                  autoFocus
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setCustomerLabel(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    // Enter: اختار أول عميل في النتايج وانقل لبحث الصنف
                    if (e.key === 'Enter' && customerMatches.length >= 1) {
                      e.preventDefault()
                      setCustomer(customerMatches[0])
                      setCustomerSearch('')
                      setCustomerLabel('')
                    }
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
            placeholder="🔍 ابحث عن الصنف بالاسم أو الباركود وضيفه للمرتجع"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addFromSearch()
              }
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
                    <input
                      className="qcp-input"
                      style={{ width: '100%' }}
                      type="number"
                      min="0"
                      step="any"
                      value={l.qty}
                      data-ret-qty={l.productId}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateLine(idx, { qty: e.target.value })}
                      onKeyDown={(e) => {
                        // Enter بعد الكمية: السعر
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          document.querySelector<HTMLInputElement>(`[data-ret-price="${l.productId}"]`)?.focus()
                        }
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="qcp-input"
                      style={{ width: '100%' }}
                      type="number"
                      min="0"
                      step="any"
                      value={l.unitPrice}
                      data-ret-price={l.productId}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                      onKeyDown={(e) => {
                        // Enter بعد السعر: ارجع لبحث الصنف اللي بعده
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          searchRef.current?.focus()
                        }
                      }}
                    />
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
          <span className="qcp-pill accent" style={{ fontSize: 13 }}>
            ↩️ بيتخصم من رصيد العميل
          </span>
          <input className="qcp-input" style={{ flex: 1, minWidth: 160 }} placeholder="ملاحظات / سبب المرتجع" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <strong style={{ fontSize: 18, color: 'var(--qcp-critical)' }}>إجمالي المرتجع: {currency(total)}</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="qcp-btn qcp-btn-primary" disabled={saving || !lines.length || !customer} onClick={save}>
              {saving ? '...جاري الحفظ' : '✓ حفظ'}
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
