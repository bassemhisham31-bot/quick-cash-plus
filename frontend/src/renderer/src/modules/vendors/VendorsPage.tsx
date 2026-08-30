import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { StatementModal } from '../../components/StatementModal'
import { formatCurrency as currency } from '../../lib/currency'
import type { PaymentMethod, PurchaseInvoiceListItem, StatementView, VendorView } from '../../../../shared/types'

const emptyForm = { name: '', phone: '', address: '', notes: '', openingBalance: '0' }

export function VendorsPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [vendors, setVendors] = useState<VendorView[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [statementFor, setStatementFor] = useState<VendorView | null>(null)
  const [statement, setStatement] = useState<StatementView | null>(null)
  const [unpaidInvoices, setUnpaidInvoices] = useState<PurchaseInvoiceListItem[]>([])
  const [allVendors, setAllVendors] = useState<VendorView[]>([])

  async function refresh(): Promise<void> {
    setVendors(await window.api.vendors.list(search))
    setAllVendors(await window.api.vendors.list(''))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalVendors = allVendors.length
  const owedVendors = allVendors.filter((v) => v.balance > 0)
  const totalOwed = owedVendors.reduce((sum, v) => sum + v.balance, 0)

  useEffect(() => {
    const id = setTimeout(() => window.api.vendors.list(search).then(setVendors), 250)
    return () => clearTimeout(id)
  }, [search])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    await window.api.vendors.create({
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      openingBalance: Number(form.openingBalance) || 0
    })
    setForm(emptyForm)
    setShowForm(false)
    refresh()
  }

  async function openStatement(vendor: VendorView): Promise<void> {
    setStatementFor(vendor)
    setStatement(await window.api.vendors.getStatement(vendor.id))
    setUnpaidInvoices(await window.api.vendors.listUnpaidInvoices(vendor.id))
  }

  async function handleRecordPayment(
    amount: number,
    method: PaymentMethod,
    note: string,
    invoiceId?: number | null
  ): Promise<void> {
    if (!statementFor || !user) return
    const updated = await window.api.vendors.recordPayment(statementFor.id, amount, method, note, user.id, invoiceId)
    setStatementFor(updated)
    setStatement(await window.api.vendors.getStatement(updated.id))
    setUnpaidInvoices(await window.api.vendors.listUnpaidInvoices(updated.id))
    refresh()
  }

  return (
    <div>
      <div
        className="qcp-page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1>{t('parties.vendorsTitle')}</h1>
        <button className="qcp-btn qcp-btn-primary" onClick={() => setShowForm(true)}>
          + {t('parties.addVendor')}
        </button>
      </div>

      <div className="qcp-grid qcp-grid-4" style={{ marginBottom: 18 }}>
        <div className="qcp-card">
          <div className="qcp-icon-badge blue">🚚</div>
          <div className="qcp-kpi-value">{totalVendors}</div>
          <div className="qcp-kpi-label">{t('parties.totalVendors')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge orange">⚠️</div>
          <div className="qcp-kpi-value">{owedVendors.length}</div>
          <div className="qcp-kpi-label">{t('parties.owedVendors')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge pink">💰</div>
          <div className="qcp-kpi-value">{currency(totalOwed)}</div>
          <div className="qcp-kpi-label">{t('parties.totalOwed')}</div>
        </div>
      </div>

      <input
        className="qcp-input"
        style={{ width: 320, marginBottom: 16 }}
        placeholder={t('common.search') ?? ''}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="qcp-grid qcp-grid-4">
        {vendors.map((v) => (
          <div key={v.id} className="qcp-card" style={{ cursor: 'pointer' }} onClick={() => openStatement(v)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="qcp-icon-badge orange">🚚</div>
              <span className={`qcp-pill ${v.balance > 0 ? 'warn' : 'success'}`}>
                {v.balance > 0 ? t('parties.owed') : t('parties.settled')}
              </span>
            </div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{v.name}</div>
            <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 12 }}>{v.phone || '—'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
              <span>{t('parties.balance')}</span>
              <strong>{currency(v.balance)}</strong>
            </div>
          </div>
        ))}
        {vendors.length === 0 && <p style={{ color: 'var(--qcp-ink-faint)' }}>—</p>}
      </div>

      {showForm && (
        <div className="qcp-modal-backdrop" onClick={() => setShowForm(false)}>
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
            }}
          >
            <h2 style={{ marginTop: 0 }}>{t('parties.addVendor')}</h2>
            <div className="qcp-field">
              <label>{t('parties.name')}</label>
              <input
                className="qcp-input"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="qcp-field">
              <label>{t('parties.phone')}</label>
              <input
                className="qcp-input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="qcp-field">
              <label>{t('parties.address')}</label>
              <input
                className="qcp-input"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="qcp-field">
              <label>{t('parties.openingBalance')}</label>
              <input
                className="qcp-input"
                type="number"
                value={form.openingBalance}
                onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
              />
            </div>
            <div className="qcp-field">
              <label>{t('parties.notes')}</label>
              <input
                className="qcp-input"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="qcp-btn qcp-btn-primary" type="submit">
                {t('parties.save')}
              </button>
              <button className="qcp-btn qcp-btn-secondary" type="button" onClick={() => setShowForm(false)}>
                {t('parties.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {statementFor && statement && (
        <StatementModal
          partyName={statementFor.name}
          statement={statement}
          unpaidInvoices={unpaidInvoices}
          onClose={() => {
            setStatementFor(null)
            setStatement(null)
            setUnpaidInvoices([])
          }}
          onRecordPayment={handleRecordPayment}
        />
      )}
    </div>
  )
}
