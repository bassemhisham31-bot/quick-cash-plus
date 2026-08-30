import { KeyboardEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { InvoiceDetailModal } from './InvoiceDetailModal'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import type { InvoiceListFilter, InvoiceListItem, InvoiceView, PaymentMethod } from '../../../../shared/types'

const defaultFilter: InvoiceListFilter = {
  search: '',
  dateFrom: '',
  dateTo: '',
  paymentMethod: 'all',
  includeDeleted: false,
  serial: ''
}

function statusPill(status: InvoiceListItem['status'], t: (k: string) => string): JSX.Element {
  if (status === 'returned') return <span className="qcp-pill critical">{t('invoices.statusReturned')}</span>
  if (status === 'partial_return') return <span className="qcp-pill warn">{t('invoices.statusPartialReturn')}</span>
  return <span className="qcp-pill success">{t('invoices.statusCompleted')}</span>
}

export function InvoicesPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [filter, setFilter] = useState(defaultFilter)
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([])
  const [selected, setSelected] = useState<InvoiceView | null>(null)

  async function refresh(): Promise<void> {
    setInvoices(await window.api.invoices.list(filter))
  }

  useEffect(() => {
    const id = setTimeout(refresh, 200)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function openInvoice(id: number): Promise<void> {
    const view = await window.api.invoices.getView(id)
    setSelected(view)
  }

  async function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>): Promise<void> {
    if (e.key !== 'Enter') return
    const term = filter.search.trim()
    if (!term) return
    const results = await window.api.invoices.list({ ...filter, search: term })
    const exact = results.find((r) => r.number === term)
    if (exact) {
      await openInvoice(exact.id)
      setFilter((f) => ({ ...f, search: '' }))
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (!user) return
    if (!window.confirm(t('invoices.confirmDelete') ?? '')) return
    await window.api.invoices.delete(id, user.id)
    playSound('delete')
    refresh()
  }

  async function handleRestore(id: number): Promise<void> {
    if (!user) return
    if (!window.confirm(t('invoices.confirmRestore') ?? '')) return
    await window.api.invoices.restore(id, user.id)
    refresh()
  }

  return (
    <div>
      <div className="qcp-page-header">
        <h1>{t('invoices.title')}</h1>
      </div>

      <div className="qcp-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <input
          className="qcp-input"
          style={{ flex: '1 1 220px' }}
          placeholder={t('invoices.searchPlaceholder') ?? ''}
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => void handleSearchKeyDown(e)}
          autoFocus
        />
        <input
          className="qcp-input"
          style={{ flex: '1 1 180px' }}
          placeholder={t('invoices.searchSerial') ?? ''}
          value={filter.serial ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, serial: e.target.value }))}
        />
        <input
          className="qcp-input"
          type="date"
          value={filter.dateFrom}
          onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value }))}
        />
        <input
          className="qcp-input"
          type="date"
          value={filter.dateTo}
          onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value }))}
        />
        <select
          className="qcp-select"
          value={filter.paymentMethod}
          onChange={(e) => setFilter((f) => ({ ...f, paymentMethod: e.target.value as PaymentMethod | 'all' }))}
        >
          <option value="all">{t('invoices.allMethods')}</option>
          <option value="cash">{t('pos.cash')}</option>
          <option value="credit">{t('pos.credit')}</option>
          <option value="card">{t('pos.card')}</option>
          <option value="wallet">{t('pos.wallet')}</option>
          <option value="mixed">{t('pos.mixed')}</option>
          <option value="vodafone_cash">{t('pos.vodafoneCash')}</option>
          <option value="instapay">{t('pos.instapay')}</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={filter.includeDeleted}
            onChange={(e) => setFilter((f) => ({ ...f, includeDeleted: e.target.checked }))}
          />
          {t('invoices.showDeleted')}
        </label>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('invoices.number')}</th>
              <th>{t('invoices.customer')}</th>
              <th>{t('invoices.total')}</th>
              <th>{t('invoices.status')}</th>
              <th>{t('invoices.date')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} style={{ opacity: inv.deletedAt ? 0.55 : 1 }}>
                <td style={{ fontFamily: 'var(--qcp-mono)' }}>{inv.number}</td>
                <td>{inv.customerName}</td>
                <td>{currency(inv.total)}</td>
                <td>{statusPill(inv.status, t)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{inv.createdAt}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="qcp-btn qcp-btn-secondary" onClick={() => openInvoice(inv.id)}>
                    {t('invoices.view')}
                  </button>
                  {inv.deletedAt ? (
                    <button className="qcp-btn qcp-btn-secondary" onClick={() => handleRestore(inv.id)}>
                      {t('invoices.restore')}
                    </button>
                  ) : (
                    <button className="qcp-btn qcp-btn-secondary" onClick={() => handleDelete(inv.id)}>
                      {t('invoices.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <InvoiceDetailModal
          invoice={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            refresh()
            openInvoice(selected.id)
          }}
        />
      )}
    </div>
  )
}
