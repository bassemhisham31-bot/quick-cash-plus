import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCurrency as currency } from '../lib/currency'
import type { PaymentMethod, PurchaseInvoiceListItem, StatementView } from '../../../shared/types'

interface Props {
  partyName: string
  statement: StatementView
  onClose: () => void
  onRecordPayment: (amount: number, method: PaymentMethod, note: string, invoiceId?: number | null) => Promise<void>
  unpaidInvoices?: PurchaseInvoiceListItem[]
}

export function StatementModal({
  partyName,
  statement,
  onClose,
  onRecordPayment,
  unpaidInvoices
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [invoiceId, setInvoiceId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(): Promise<void> {
    const value = Number(amount)
    if (!value || value <= 0) return
    setSaving(true)
    try {
      await onRecordPayment(value, method, note, invoiceId || null)
      setAmount('')
      setNote('')
      setInvoiceId('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(640px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>{t('parties.statement')}</h2>
          <span style={{ fontWeight: 700 }}>{partyName}</span>
        </div>

        <div
          className="qcp-pill"
          style={{
            marginTop: 8,
            marginBottom: 16,
            fontSize: 14,
            padding: '6px 14px',
            background: statement.balance > 0 ? 'var(--qcp-critical-soft)' : 'var(--qcp-success-soft)',
            color: statement.balance > 0 ? 'var(--qcp-critical)' : 'var(--qcp-success)'
          }}
        >
          {t('parties.balance')}: {currency(statement.balance)}
        </div>

        <div className="qcp-table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>{t('invoices.date')}</th>
                <th>{t('parties.name')}</th>
                <th>مدين</th>
                <th>دائن</th>
              </tr>
            </thead>
            <tbody>
              {statement.entries.map((e) => (
                <tr key={`${e.type}-${e.id}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td>{e.description}</td>
                  <td>{e.debit ? currency(e.debit) : '—'}</td>
                  <td>{e.credit ? currency(e.credit) : '—'}</td>
                </tr>
              ))}
              {statement.entries.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    {t('parties.noEntries')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 20, marginBottom: 10, fontSize: 15 }}>{t('parties.recordPayment')}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="qcp-input"
            style={{ flex: 1 }}
            type="number"
            placeholder={t('parties.amount') ?? ''}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select className="qcp-select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="cash">نقدًا</option>
            <option value="card">بنكي</option>
            <option value="wallet">محفظة</option>
            <option value="vodafone_cash">فودافون كاش</option>
            <option value="instapay">InstaPay</option>
          </select>
        </div>
        {unpaidInvoices && unpaidInvoices.length > 0 && (
          <select
            className="qcp-select"
            style={{ width: '100%', marginTop: 8 }}
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">{t('parties.linkToInvoiceOptional')}</option>
            {unpaidInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.number} — {t('parties.remaining')}: {currency(inv.total - inv.paid)}
              </option>
            ))}
          </select>
        )}
        <input
          className="qcp-input"
          style={{ width: '100%', marginTop: 8 }}
          placeholder={t('parties.notes') ?? ''}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSubmit}>
            {t('parties.save')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
