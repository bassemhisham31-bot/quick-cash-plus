import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import type { PurchaseInvoiceView } from '../../../../shared/types'

interface Props {
  invoice: PurchaseInvoiceView
  onClose: () => void
  onChanged: () => void
}

export function PurchaseReturnModal({ invoice, onClose, onChanged }: Props): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [returnQtys, setReturnQtys] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submitReturn(): Promise<void> {
    if (!user) return
    const lines = Object.entries(returnQtys)
      .map(([purchaseItemId, qty]) => ({ purchaseItemId: Number(purchaseItemId), qty: Number(qty) }))
      .filter((l) => l.qty > 0)
    if (!lines.length) return

    setSaving(true)
    setMessage(null)
    try {
      const result = await window.api.purchases.returnLines(invoice.id, lines, user.id)
      if (result.ok) {
        setMessage(`تم الاسترجاع بنجاح: ${currency(result.refundAmount ?? 0)}`)
        setReturnQtys({})
        onChanged()
      } else {
        setMessage(result.error ?? 'حدث خطأ')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(720px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>{invoice.number}</h2>
          <span className="qcp-pill accent">{invoice.vendorName}</span>
        </div>
        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 12.5, margin: '4px 0 16px' }}>
          {invoice.createdAt} — {invoice.cashierName}
        </p>

        <div className="qcp-table-wrap" style={{ marginBottom: 16 }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الكمية</th>
                <th>سعر الشراء</th>
                <th>الإجمالي</th>
                <th>المتبقي</th>
                <th>كمية الاسترجاع</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => {
                const remaining = line.qty - line.returnedQty
                return (
                  <tr key={line.purchaseItemId}>
                    <td>{line.productName}</td>
                    <td>{line.qty}</td>
                    <td>{currency(line.purchasePrice)}</td>
                    <td>{currency(line.total)}</td>
                    <td>{remaining}</td>
                    <td>
                      {remaining > 0 ? (
                        <input
                          className="qcp-input"
                          type="number"
                          min={0}
                          max={remaining}
                          style={{ width: 70, padding: '4px 6px' }}
                          value={returnQtys[line.purchaseItemId] ?? ''}
                          onChange={(e) =>
                            setReturnQtys((prev) => ({ ...prev, [line.purchaseItemId]: e.target.value }))
                          }
                        />
                      ) : (
                        <span className="qcp-pill">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: 14 }}>
          <span>الإجمالي</span>
          <span>{currency(invoice.total)}</span>
        </div>

        {message && (
          <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={submitReturn}>
            تسجيل الاسترجاع
          </button>
        </div>

        <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
          إغلاق
        </button>
      </div>
    </div>
  )
}
