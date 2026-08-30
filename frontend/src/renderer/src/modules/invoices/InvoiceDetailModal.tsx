import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import type { InvoiceView, PaymentMethod } from '../../../../shared/types'

interface Props {
  invoice: InvoiceView
  onClose: () => void
  onChanged: () => void
}

export function InvoiceDetailModal({ invoice, onClose, onChanged }: Props): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)

  const [editing, setEditing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(invoice.paymentMethod)
  const [paid, setPaid] = useState(String(invoice.paid))
  const [note, setNote] = useState(invoice.note ?? '')

  const [returnQtys, setReturnQtys] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function saveEdit(): Promise<void> {
    if (!user) return
    setSaving(true)
    try {
      await window.api.invoices.update(invoice.id, { paymentMethod, paid: Number(paid) || 0, note }, user.id)
      setEditing(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function submitReturn(): Promise<void> {
    if (!user) return
    const lines = Object.entries(returnQtys)
      .map(([salesItemId, qty]) => ({ salesItemId: Number(salesItemId), qty: Number(qty) }))
      .filter((l) => l.qty > 0)
    if (!lines.length) return

    setSaving(true)
    setMessage(null)
    try {
      const result = await window.api.invoices.returnLines(invoice.id, lines, user.id)
      if (result.ok) {
        setMessage(`${t('invoices.returnSuccess')}: ${currency(result.refundAmount ?? 0)}`)
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
          <span className="qcp-pill accent">{invoice.customerName}</span>
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
                <th>السعر</th>
                <th>الإجمالي</th>
                <th>{t('invoices.remainingQty')}</th>
                <th>{t('invoices.returnQty')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => {
                const remaining = line.qty - line.returnedQty
                return (
                  <tr key={line.salesItemId}>
                    <td>
                      {line.productName}
                      {line.serialNumber && (
                        <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>S/N: {line.serialNumber}</div>
                      )}
                    </td>
                    <td>{line.qty}</td>
                    <td>{currency(line.unitPrice)}</td>
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
                          value={returnQtys[line.salesItemId] ?? ''}
                          onChange={(e) =>
                            setReturnQtys((prev) => ({ ...prev, [line.salesItemId]: e.target.value }))
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
          <span>{t('invoices.total')}</span>
          <span>{currency(invoice.total)}</span>
        </div>

        {invoice.customerLoyaltyBalance !== null &&
          (invoice.loyaltyPointsEarned > 0 || invoice.loyaltyPointsRedeemed > 0) && (
            <div className="qcp-card" style={{ marginBottom: 14, fontSize: 13 }}>
              {invoice.loyaltyPointsRedeemed > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('pos.redeemedPoints')}</span>
                  <span>-{invoice.loyaltyPointsRedeemed} ⭐</span>
                </div>
              )}
              {invoice.loyaltyPointsEarned > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('pos.earnedPoints')}</span>
                  <span>+{invoice.loyaltyPointsEarned} ⭐</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>{t('pos.currentPointsBalance')}</span>
                <span>{invoice.customerLoyaltyBalance} ⭐</span>
              </div>
            </div>
          )}

        {message && (
          <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={submitReturn}>
            {t('invoices.submitReturn')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => window.api.print.receipt(invoice.id)}>
            {t('common.print')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => window.api.print.previewReceipt(invoice.id)}>
            {t('common.preview')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => setEditing((v) => !v)}>
            {t('invoices.edit')}
          </button>
        </div>

        {editing && (
          <div className="qcp-card" style={{ marginBottom: 10 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>{t('invoices.editTitle')}</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select
                className="qcp-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">نقدًا</option>
                <option value="credit">آجل</option>
                <option value="card">بنكي</option>
                <option value="wallet">محفظة</option>
                <option value="mixed">مختلط</option>
                <option value="vodafone_cash">فودافون كاش</option>
                <option value="instapay">InstaPay</option>
              </select>
              <input
                className="qcp-input"
                type="number"
                style={{ width: 140 }}
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder={t('pos.paid') ?? ''}
              />
            </div>
            <input
              className="qcp-input"
              style={{ width: '100%', marginBottom: 10 }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('parties.notes') ?? ''}
            />
            <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={saveEdit}>
              {t('parties.save')}
            </button>
          </div>
        )}

        <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
