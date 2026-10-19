import { useEffect, useState } from 'react'
import { formatCurrency as currency } from '../../lib/currency'
import { InvoiceDetailModal } from '../invoices/InvoiceDetailModal'
import type { InvoiceListItem, InvoiceView } from '../../../../shared/types'

const STATUS_LABELS: Record<InvoiceListItem['status'], string> = {
  completed: '',
  partial_return: 'مرتجع جزئي',
  returned: 'مرتجع بالكامل'
}

/**
 * مرتجع مبيعات سريع من شاشة البيع: ابحث عن الفاتورة (أو اختار من آخر الفواتير) ← نافذة الفاتورة
 * بخانات كمية المرتجع (نفس InvoiceDetailModal بتاع صفحة الفواتير والمرتجعات).
 */
export function SalesReturnFlow({
  allowEdit,
  onClose,
  onReturned
}: {
  allowEdit: boolean
  onClose: () => void
  /** بعد تسجيل مرتجع (المخزون والعميل اتغيروا) */
  onReturned: () => void
}): JSX.Element {
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<InvoiceListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [invoice, setInvoice] = useState<InvoiceView | null>(null)

  useEffect(() => {
    // من غير بحث: آخر الفواتير (غالبًا العميل راجع بفاتورة النهارده)
    const id = setTimeout(
      () => {
        setLoading(true)
        window.api.invoices
          .list({ search: search.trim(), dateFrom: '', dateTo: '', paymentMethod: 'all', includeDeleted: false })
          .then((list) => setMatches(list.slice(0, search.trim() ? 30 : 12)))
          .finally(() => setLoading(false))
      },
      search.trim() ? 250 : 0
    )
    return () => clearTimeout(id)
  }, [search])

  async function open(id: number): Promise<void> {
    setInvoice(await window.api.invoices.getView(id))
  }

  async function reloadInvoice(): Promise<void> {
    if (invoice) setInvoice(await window.api.invoices.getView(invoice.id))
    onReturned()
  }

  if (invoice) {
    return <InvoiceDetailModal invoice={invoice} allowEdit={allowEdit} onClose={() => setInvoice(null)} onChanged={reloadInvoice} />
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(560px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>↩️ مرتجع مبيعات</h3>
        <input
          className="qcp-input"
          style={{ width: '100%', marginBottom: 12 }}
          autoFocus
          placeholder="رقم الفاتورة أو اسم العميل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length) {
              e.preventDefault()
              // لو الرقم مطابق بالظبط (باركود الفاتورة مثلاً) افتحه، وإلا أول نتيجة
              const exact = matches.find((m) => m.number.toLowerCase() === search.trim().toLowerCase())
              void open((exact ?? matches[0]).id)
            }
            if (e.key === 'Escape') onClose()
          }}
        />
        {!search.trim() && <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginBottom: 6 }}>آخر الفواتير:</div>}
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {matches.map((inv) => (
            <button
              key={inv.id}
              type="button"
              className="qcp-btn qcp-btn-secondary"
              style={{ width: '100%', marginBottom: 6, display: 'flex', justifyContent: 'space-between', gap: 8, textAlign: 'start' }}
              disabled={inv.status === 'returned'}
              onClick={() => open(inv.id)}
            >
              <span>
                <strong>{inv.number}</strong> — {inv.customerName}
                <span style={{ display: 'block', fontSize: 11, color: 'var(--qcp-ink-faint)', fontWeight: 400 }}>
                  {inv.createdAt}
                  {STATUS_LABELS[inv.status] && ` · ${STATUS_LABELS[inv.status]}`}
                </span>
              </span>
              <span>{currency(inv.total)}</span>
            </button>
          ))}
          {!loading && search.trim() && !matches.length && <p style={{ color: 'var(--qcp-ink-faint)' }}>مفيش فواتير مطابقة</p>}
        </div>
        <button type="button" className="qcp-btn qcp-btn-secondary" style={{ marginTop: 8 }} onClick={onClose}>
          إغلاق
        </button>
      </div>
    </div>
  )
}
