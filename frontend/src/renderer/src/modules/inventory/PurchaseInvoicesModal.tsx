import { useEffect, useState } from 'react'
import { formatCurrency as currency } from '../../lib/currency'
import type { PurchaseInvoiceListItem, PurchaseInvoiceView } from '../../../../shared/types'

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  credit: 'آجل',
  card: 'بنكي',
  wallet: 'محفظة',
  vodafone_cash: 'فودافون كاش',
  instapay: 'InstaPay'
}

function today(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** قائمة فواتير المشتريات مع المتبقي وتاريخ السداد (المتأخر بيتلوّن) وتفاصيل كل فاتورة. */
export function PurchaseInvoicesModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [invoices, setInvoices] = useState<PurchaseInvoiceListItem[]>([])
  const [search, setSearch] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [open, setOpen] = useState<PurchaseInvoiceView | null>(null)

  useEffect(() => {
    window.api.purchases.list().then(setInvoices)
  }, [])

  const t = today()
  const term = search.trim().toLowerCase()
  const rows = invoices.filter(
    (i) =>
      (!onlyOpen || i.total - i.paid > 0.005) &&
      (!term || i.number.toLowerCase().includes(term) || i.vendorName.toLowerCase().includes(term))
  )

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(920px, 97vw)', maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>🧾 فواتير المشتريات</h2>
          <input className="qcp-input" style={{ width: 220 }} placeholder="بحث بالرقم أو المورد" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            اللي عليها متبقي بس
          </label>
        </div>

        <div className="qcp-table-wrap">
          <table className="qcp-table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>المورد</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>تاريخ السداد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const remaining = i.total - i.paid
                const late = remaining > 0.005 && !!i.dueDate && i.dueDate < t
                return (
                  <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => window.api.purchases.getView(i.id).then(setOpen)}>
                    <td style={{ fontFamily: 'var(--qcp-mono)' }}>{i.number}</td>
                    <td>{i.vendorName}</td>
                    <td>{i.createdAt.slice(0, 10)}</td>
                    <td>{currency(i.total)}</td>
                    <td>
                      {currency(i.paid)} <small style={{ color: 'var(--qcp-ink-faint)' }}>({METHOD_LABELS[i.paymentMethod] ?? i.paymentMethod})</small>
                    </td>
                    <td>{remaining > 0.005 ? <span className="qcp-pill critical">{currency(remaining)}</span> : '—'}</td>
                    <td>{i.dueDate ? <span className={`qcp-pill ${late ? 'critical' : 'accent'}`}>{i.dueDate}{late ? ' (متأخر)' : ''}</span> : '—'}</td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    مفيش فواتير
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {open && (
          <div className="qcp-card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{open.number}</strong>
              <span className="qcp-pill accent">{open.vendorName}</span>
              <span style={{ color: 'var(--qcp-ink-faint)', fontSize: 12.5 }}>{open.createdAt} — {open.warehouseName}</span>
              {open.dueDate && <strong style={{ color: 'var(--qcp-accent)' }}>📅 تاريخ السداد: {open.dueDate}</strong>}
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ marginInlineStart: 'auto' }} onClick={() => setOpen(null)}>
                ✕
              </button>
            </div>
            {open.note && <div style={{ fontSize: 12.5, margin: '6px 0' }}>ملاحظة: {open.note}</div>}
            <table className="qcp-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>سعر الشراء</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {open.lines.map((l) => (
                  <tr key={l.purchaseItemId}>
                    <td>{l.productName}</td>
                    <td>{l.qty}</td>
                    <td>{currency(l.purchasePrice)}</td>
                    <td>{currency(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}
