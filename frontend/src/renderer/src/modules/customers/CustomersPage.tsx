import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { StatementModal } from '../../components/StatementModal'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import type { CustomerView, PaymentMethod, StatementView, VendorView } from '../../../../shared/types'

const emptyForm = { name: '', phone: '', address: '', notes: '', openingBalance: '0', loyaltyEnabled: true }

export function CustomersPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [statementFor, setStatementFor] = useState<CustomerView | null>(null)
  const [statement, setStatement] = useState<StatementView | null>(null)
  const [vendors, setVendors] = useState<VendorView[]>([])
  const [linkChoice, setLinkChoice] = useState<Record<number, string>>({})
  const [allCustomers, setAllCustomers] = useState<CustomerView[]>([])

  async function refresh(): Promise<void> {
    setCustomers(await window.api.customers.list(search))
    setAllCustomers(await window.api.customers.list(''))
  }

  useEffect(() => {
    refresh()
    window.api.vendors.list('').then(setVendors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalCustomers = allCustomers.length
  const debtors = allCustomers.filter((c) => c.balance > 0)
  const totalDebt = debtors.reduce((sum, c) => sum + c.balance, 0)

  useEffect(() => {
    const id = setTimeout(() => window.api.customers.list(search).then(setCustomers), 250)
    return () => clearTimeout(id)
  }, [search])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    await window.api.customers.create({
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      openingBalance: Number(form.openingBalance) || 0,
      loyaltyEnabled: form.loyaltyEnabled
    })
    playSound('save')
    setForm(emptyForm)
    setShowForm(false)
    refresh()
  }

  async function openStatement(customer: CustomerView): Promise<void> {
    setStatementFor(customer)
    setStatement(await window.api.customers.getStatement(customer.id))
  }

  async function handleRecordPayment(amount: number, method: PaymentMethod, note: string): Promise<void> {
    if (!statementFor || !user) return
    const updated = await window.api.customers.recordPayment(statementFor.id, amount, method, note, user.id)
    setStatementFor(updated)
    setStatement(await window.api.customers.getStatement(updated.id))
    refresh()
  }

  async function handleToggleLoyalty(customer: CustomerView): Promise<void> {
    await window.api.customers.updateLoyaltyEnabled(customer.id, !customer.loyaltyEnabled)
    refresh()
  }

  async function handleLinkVendor(customer: CustomerView): Promise<void> {
    const vendorId = Number(linkChoice[customer.id])
    if (!vendorId) return
    await window.api.customers.linkVendor(customer.id, vendorId)
    setLinkChoice((prev) => ({ ...prev, [customer.id]: '' }))
    refresh()
  }

  async function handleUnlinkVendor(customer: CustomerView): Promise<void> {
    await window.api.customers.unlinkVendor(customer.id)
    refresh()
  }

  return (
    <div>
      <div
        className="qcp-page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1>{t('parties.customersTitle')}</h1>
        <button className="qcp-btn qcp-btn-primary" onClick={() => setShowForm(true)}>
          + {t('parties.addCustomer')}
        </button>
      </div>

      <div className="qcp-grid qcp-grid-4" style={{ marginBottom: 18 }}>
        <div className="qcp-card">
          <div className="qcp-icon-badge blue">👥</div>
          <div className="qcp-kpi-value">{totalCustomers}</div>
          <div className="qcp-kpi-label">{t('parties.totalCustomers')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge orange">⚠️</div>
          <div className="qcp-kpi-value">{debtors.length}</div>
          <div className="qcp-kpi-label">{t('parties.debtorCustomers')}</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge pink">💰</div>
          <div className="qcp-kpi-value">{currency(totalDebt)}</div>
          <div className="qcp-kpi-label">{t('parties.totalDebt')}</div>
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
        {customers.map((c) => (
          <div key={c.id} className="qcp-card" style={{ cursor: 'pointer' }} onClick={() => openStatement(c)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="qcp-icon-badge purple">👤</div>
              <span className={`qcp-pill ${c.balance > 0 ? 'critical' : 'success'}`}>
                {c.balance > 0 ? t('parties.debtor') : t('parties.settled')}
              </span>
            </div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{c.name}</div>
            <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 12 }}>{c.phone || '—'}</div>
            {c.address && <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 11.5 }}>{c.address}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
              <span>{t('parties.balance')}</span>
              <strong>{currency(c.balance)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--qcp-ink-faint)' }}>
              <span>{t('parties.loyaltyPoints')}</span>
              <span>{c.loyaltyPoints}</span>
            </div>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, marginTop: 8, cursor: 'pointer' }}
              onClick={(e) => e.stopPropagation()}
            >
              <input type="checkbox" checked={c.loyaltyEnabled} onChange={() => handleToggleLoyalty(c)} />
              {t('parties.loyaltyEnabledForCustomer')}
            </label>

            <div style={{ marginTop: 8, fontSize: 11.5 }} onClick={(e) => e.stopPropagation()}>
              {c.linkedVendorId ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span>
                    {t('parties.linkedVendor')}: <strong>{c.linkedVendorName}</strong>
                  </span>
                  <button
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => handleUnlinkVendor(c)}
                  >
                    {t('parties.unlink')}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  <select
                    className="qcp-select"
                    style={{ flex: 1, padding: '3px 6px', fontSize: 11 }}
                    value={linkChoice[c.id] ?? ''}
                    onChange={(e) => setLinkChoice((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  >
                    <option value="">{t('parties.linkVendorPlaceholder')}</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    disabled={!linkChoice[c.id]}
                    onClick={() => handleLinkVendor(c)}
                  >
                    {t('parties.link')}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {customers.length === 0 && <p style={{ color: 'var(--qcp-ink-faint)' }}>—</p>}
      </div>

      {showForm && (
        <div className="qcp-modal-backdrop">
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
            }}
          >
            <h2 style={{ marginTop: 0 }}>{t('parties.addCustomer')}</h2>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={form.loyaltyEnabled}
                onChange={(e) => setForm((f) => ({ ...f, loyaltyEnabled: e.target.checked }))}
              />
              {t('parties.loyaltyEnabledForCustomer')}
            </label>
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
          onClose={() => {
            setStatementFor(null)
            setStatement(null)
          }}
          onRecordPayment={handleRecordPayment}
        />
      )}
    </div>
  )
}
