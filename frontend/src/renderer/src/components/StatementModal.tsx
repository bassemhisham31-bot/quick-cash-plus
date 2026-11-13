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
  /** كارت حساب العميل الكامل: فلتر تاريخ + عمود الرصيد + طباعة الكشف */
  filter?: { from: string; to: string }
  onFilterChange?: (filter: { from: string; to: string }) => void
  onPrint?: () => void
}

export function StatementModal({
  partyName,
  statement,
  onClose,
  onRecordPayment,
  unpaidInvoices,
  filter,
  onFilterChange,
  onPrint
}: Props): JSX.Element {
  const withBalance = statement.openingBalance !== undefined
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
      <div className="qcp-modal" style={{ width: withBalance ? 'min(820px, 96vw)' : 'min(640px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
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

        {(filter && onFilterChange) || onPrint ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            {filter && onFilterChange && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  من
                  <input className="qcp-input" type="date" value={filter.from} onChange={(e) => onFilterChange({ ...filter, from: e.target.value })} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  إلى
                  <input className="qcp-input" type="date" value={filter.to} onChange={(e) => onFilterChange({ ...filter, to: e.target.value })} />
                </label>
                {(filter.from || filter.to) && (
                  <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => onFilterChange({ from: '', to: '' })}>
                    كل الحركات
                  </button>
                )}
              </>
            )}
            {onPrint && (
              <button type="button" className="qcp-btn qcp-btn-primary" style={{ marginInlineStart: 'auto' }} onClick={onPrint}>
                🖨 طباعة كشف الحساب
              </button>
            )}
          </div>
        ) : null}

        <div className="qcp-table-wrap" style={{ maxHeight: withBalance ? 320 : 260, overflowY: 'auto' }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>{t('invoices.date')}</th>
                <th>{withBalance ? 'البيان' : t('parties.name')}</th>
                <th>مدين</th>
                <th>دائن</th>
                {withBalance && <th>الرصيد</th>}
              </tr>
            </thead>
            <tbody>
              {withBalance && (
                <tr style={{ fontWeight: 700 }}>
                  <td></td>
                  <td>رصيد سابق</td>
                  <td></td>
                  <td></td>
                  <td>{currency(statement.openingBalance ?? 0)}</td>
                </tr>
              )}
              {statement.entries.map((e) => (
                <tr key={`${e.type}-${e.id}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td>{e.description}</td>
                  <td>{e.debit ? currency(e.debit) : '—'}</td>
                  <td>{e.credit ? currency(e.credit) : '—'}</td>
                  {withBalance && <td style={{ fontWeight: 700 }}>{currency(e.balance ?? 0)}</td>}
                </tr>
              ))}
              {withBalance && statement.entries.length > 0 && (
                <tr style={{ fontWeight: 700 }}>
                  <td></td>
                  <td>الإجمالي</td>
                  <td>{currency(statement.totalDebit ?? 0)}</td>
                  <td>{currency(statement.totalCredit ?? 0)}</td>
                  <td></td>
                </tr>
              )}
              {statement.entries.length === 0 && (
                <tr>
                  <td colSpan={withBalance ? 5 : 4} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
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
