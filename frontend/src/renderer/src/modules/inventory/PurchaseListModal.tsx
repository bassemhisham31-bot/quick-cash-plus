import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency as currency } from '../../lib/currency'
import type { PurchaseLineInput, PurchaseRequestItem, ReportResult, VendorView } from '../../../../shared/types'

type Status = 'pending' | 'purchased' | 'cancelled'

const STATUS_LABELS: Record<Status, string> = { pending: 'مطلوب شراؤه', purchased: 'اتشترى', cancelled: 'ملغي' }

interface Props {
  onClose: () => void
  /** تجهيز فاتورة شراء من بنود مورد معيّن */
  onBuy: (init: { vendorId: number | null; lines: PurchaseLineInput[]; requestIds: number[] }) => void
}

/**
 * قائمة "مطلوب شراؤه": كل قطعة اتباعت بتتسجل هنا تلقائيًا. من هنا بتتجمع بالمورد وتتحوّل لفاتورة شراء
 * (والبنود بتتعلّم "اتشترى" أوتوماتيك بعد حفظ الفاتورة)، أو تتلغي، أو تتصدّر Excel.
 */
export function PurchaseListModal({ onClose, onBuy }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>('pending')
  const [items, setItems] = useState<PurchaseRequestItem[]>([])
  const [vendors, setVendors] = useState<VendorView[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await window.api.purchaseRequests.list({ status }))
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    window.api.vendors.list('').then(setVendors)
  }, [])

  const groups = useMemo(() => {
    const map = new Map<number | null, { vendorId: number | null; name: string; rows: PurchaseRequestItem[] }>()
    for (const it of items) {
      const g = map.get(it.vendorId) ?? { vendorId: it.vendorId, name: it.vendorName ?? 'بدون مورد محدد', rows: [] }
      g.rows.push(it)
      map.set(it.vendorId, g)
    }
    return [...map.values()]
  }, [items])

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(rows: PurchaseRequestItem[]): void {
    setSelected((prev) => {
      const next = new Set(prev)
      const allIn = rows.every((r) => next.has(r.id))
      for (const r of rows) {
        if (allIn) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })
  }

  async function patch(id: number, p: { qty?: number; unitCost?: number; vendorId?: number | null }): Promise<void> {
    try {
      await window.api.purchaseRequests.update(id, p)
      await load()
    } catch (err: any) {
      setMessage(err?.message ?? 'تعذر التعديل')
    }
  }

  async function setRowsStatus(ids: number[], next: 'pending' | 'cancelled'): Promise<void> {
    if (!ids.length) return
    await window.api.purchaseRequests.setStatus(ids, next)
    await load()
  }

  /** فاتورة شراء من بنود مورد: المحدد منها، أو كلها لو مفيش تحديد. نفس الصنف بيتجمّع (كمية + متوسط سعر مرجّح). */
  function buyFromGroup(g: { vendorId: number | null; rows: PurchaseRequestItem[] }): void {
    const picked = g.rows.filter((r) => selected.has(r.id))
    const rows = picked.length ? picked : g.rows
    const byProduct = new Map<number, PurchaseLineInput & { cost: number }>()
    for (const r of rows) {
      const cur = byProduct.get(r.productId)
      if (cur) {
        cur.cost += r.qty * r.unitCost
        cur.qty += r.qty
      } else {
        byProduct.set(r.productId, { productId: r.productId, name: r.productName, barcode: r.barcode ?? '', qty: r.qty, purchasePrice: 0, cost: r.qty * r.unitCost })
      }
    }
    const lines: PurchaseLineInput[] = [...byProduct.values()].map(({ cost, ...l }) => ({ ...l, purchasePrice: l.qty > 0 ? Math.round((cost / l.qty) * 100) / 100 : 0 }))
    onBuy({ vendorId: g.vendorId, lines, requestIds: rows.map((r) => r.id) })
  }

  async function exportExcel(): Promise<void> {
    const report: ReportResult = {
      title: `قائمة ${STATUS_LABELS[status]}`,
      columns: [
        { key: 'vendor', label: 'المورد' },
        { key: 'product', label: 'الصنف' },
        { key: 'barcode', label: 'الباركود' },
        { key: 'qty', label: 'الكمية', align: 'end', format: 'number' },
        { key: 'unitCost', label: 'سعر الشراء', align: 'end' },
        { key: 'total', label: 'الإجمالي', align: 'end' },
        { key: 'invoice', label: 'فاتورة البيع' },
        { key: 'date', label: 'تاريخ البيع' }
      ],
      rows: items.map((i) => ({
        vendor: i.vendorName ?? 'بدون مورد محدد',
        product: i.productName,
        barcode: i.barcode ?? '',
        qty: i.qty,
        unitCost: i.unitCost,
        total: Math.round(i.qty * i.unitCost * 100) / 100,
        invoice: i.salesInvoiceNumber ?? '',
        date: i.createdAt.slice(0, 10)
      })),
      totals: { total: Math.round(items.reduce((s, i) => s + i.qty * i.unitCost, 0) * 100) / 100 }
    }
    const res = await window.api.reports.exportExcel(report)
    if (res.canceled) return
    setMessage(res.ok ? `تم الحفظ: ${res.filePath}` : (res.error ?? 'حدث خطأ'))
  }

  const total = items.reduce((s, i) => s + i.qty * i.unitCost, 0)

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(1000px, 97vw)', maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>📝 مطلوب شراؤه</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['pending', 'purchased', 'cancelled'] as Status[]).map((s) => (
              <button key={s} type="button" className={`qcp-btn ${status === s ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setStatus(s)}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
            <button type="button" className="qcp-btn qcp-btn-secondary" disabled={!items.length} onClick={() => void exportExcel()}>
              📊 Excel
            </button>
            {status === 'pending' && (
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                disabled={!selected.size}
                onClick={() => void setRowsStatus([...selected], 'cancelled')}
              >
                🚫 إلغاء المحدد ({selected.size})
              </button>
            )}
            {status === 'cancelled' && (
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                disabled={!selected.size}
                onClick={() => void setRowsStatus([...selected], 'pending')}
              >
                ↩️ إرجاع للقائمة ({selected.size})
              </button>
            )}
          </div>
        </div>

        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 12.5, margin: '0 0 10px' }}>
          كل قطعة بتتباع بتتسجل هنا تلقائيًا. اختار بنود مورد واضغط «فاتورة شراء» وبعد حفظ الفاتورة بتتعلّم «اتشترى».
        </p>
        {message && <div className="qcp-pill accent" style={{ marginBottom: 10 }}>{message}</div>}
        {loading && <p>جاري التحميل...</p>}
        {!loading && !items.length && <div className="rst-empty" style={{ padding: 24, textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>مفيش بنود في «{STATUS_LABELS[status]}»</div>}

        {groups.map((g) => (
          <div key={g.vendorId ?? 'none'} className="qcp-card" style={{ marginBottom: 12, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              {status !== 'purchased' && (
                <input type="checkbox" checked={g.rows.every((r) => selected.has(r.id))} onChange={() => toggleGroup(g.rows)} />
              )}
              <strong>🚚 {g.name}</strong>
              <span className="qcp-pill">{g.rows.length} بند</span>
              <span className="qcp-pill accent">{currency(g.rows.reduce((s, r) => s + r.qty * r.unitCost, 0))}</span>
              {status === 'pending' && (
                <button type="button" className="qcp-btn qcp-btn-primary" style={{ marginInlineStart: 'auto' }} onClick={() => buyFromGroup(g)}>
                  🛒 فاتورة شراء ({g.rows.some((r) => selected.has(r.id)) ? 'المحدد' : 'الكل'})
                </button>
              )}
            </div>
            <div className="qcp-table-wrap">
              <table className="qcp-table">
                <thead>
                  <tr>
                    {status !== 'purchased' && <th></th>}
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>سعر الشراء</th>
                    <th>الإجمالي</th>
                    <th>المورد</th>
                    <th>فاتورة البيع</th>
                    <th>تاريخ البيع</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      {status !== 'purchased' && (
                        <td style={{ width: 28 }}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                        </td>
                      )}
                      <td>{r.productName}</td>
                      <td>
                        {status === 'pending' ? (
                          <input
                            key={`q${r.id}-${r.qty}`}
                            className="qcp-input"
                            type="number"
                            min={0}
                            style={{ width: 70, padding: '4px 6px' }}
                            defaultValue={r.qty}
                            onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== r.qty && void patch(r.id, { qty: Number(e.target.value) })}
                          />
                        ) : (
                          r.qty
                        )}
                      </td>
                      <td>
                        {status === 'pending' ? (
                          <input
                            key={`c${r.id}-${r.unitCost}`}
                            className="qcp-input"
                            type="number"
                            min={0}
                            style={{ width: 90, padding: '4px 6px' }}
                            defaultValue={r.unitCost}
                            onBlur={(e) => Number(e.target.value) !== r.unitCost && void patch(r.id, { unitCost: Number(e.target.value) || 0 })}
                          />
                        ) : (
                          currency(r.unitCost)
                        )}
                      </td>
                      <td>{currency(r.qty * r.unitCost)}</td>
                      <td>
                        {status === 'pending' ? (
                          <select
                            className="qcp-select"
                            style={{ padding: '4px 6px' }}
                            value={r.vendorId ?? ''}
                            onChange={(e) => void patch(r.id, { vendorId: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">بدون مورد</option>
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (r.vendorName ?? '—')
                        )}
                      </td>
                      <td style={{ fontFamily: 'var(--qcp-mono)' }}>{r.salesInvoiceNumber ?? '—'}</td>
                      <td>{r.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <strong>
            الإجمالي المتوقع: {currency(total)} ({items.length} بند)
          </strong>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}
