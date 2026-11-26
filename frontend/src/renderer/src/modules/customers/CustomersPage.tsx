import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { StatementModal } from '../../components/StatementModal'
import { StatementLinkModal } from '../../components/StatementLinkModal'
import { alertDialog } from '../../components/ConfirmDialogHost'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import type { CustomerView, PaymentMethod, StatementView, Treasury, VendorView } from '../../../../shared/types'

const emptyForm = { name: '', phone: '', address: '', notes: '', openingBalance: '0', loyaltyEnabled: true }
/** عدد الكروت اللي بتترسم في المرة — آلاف العملاء مرة واحدة بيتقّلوا فتح الشاشة */
const PAGE_SIZE = 60

export function CustomersPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState<CustomerView | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', notes: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [linkOpenFor, setLinkOpenFor] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [statementFor, setStatementFor] = useState<CustomerView | null>(null)
  const [statementLinkFor, setStatementLinkFor] = useState<CustomerView | null>(null)
  const [statement, setStatement] = useState<StatementView | null>(null)
  const [statementFilter, setStatementFilter] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [vendors, setVendors] = useState<VendorView[]>([])
  const [linkChoice, setLinkChoice] = useState<Record<number, string>>({})
  const [allCustomers, setAllCustomers] = useState<CustomerView[]>([])
  const [treasuries, setTreasuries] = useState<Treasury[] | undefined>(undefined)

  // تحميلة واحدة لكل العملاء، والبحث بيتفلتر محليًا (من غير نداء سيرفر مع كل حرف)
  async function refresh(): Promise<void> {
    try {
      setAllCustomers(await window.api.customers.list(''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    window.api.vendors.list('').then(setVendors)
    window.api.treasury.list().then(setTreasuries).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalCustomers = allCustomers.length
  const debtors = allCustomers.filter((c) => c.balance > 0)
  const totalDebt = debtors.reduce((sum, c) => sum + c.balance, 0)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allCustomers
    const digits = q.replace(/\s/g, '')
    return allCustomers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').replace(/\s/g, '').includes(digits))
  }, [allCustomers, search])
  const customers = filtered.slice(0, visibleCount)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search])

  function openEdit(customer: CustomerView): void {
    setEditError(null)
    setEditForm({ name: customer.name, phone: customer.phone ?? '', address: customer.address ?? '', notes: customer.notes ?? '' })
    setEditing(customer)
  }

  async function handleEditSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!editing || savingEdit) return
    setSavingEdit(true)
    setEditError(null)
    try {
      await window.api.customers.update(editing.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
        notes: editForm.notes.trim()
      })
      playSound('save')
      setEditing(null)
      refresh()
    } catch (err: any) {
      setEditError(err?.message ?? 'تعذر حفظ التعديل')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleExport(): Promise<void> {
    const r = await window.api.customers.exportExcel()
    if (!r.ok && r.error) await alertDialog(r.error)
  }

  async function handleImport(): Promise<void> {
    if (importing) return
    setImporting(true)
    try {
      const r = await window.api.customers.importExcel()
      if (r.canceled) return
      if (!r.ok) {
        await alertDialog(r.error ?? 'تعذر الاستيراد')
        return
      }
      const errors = r.rowErrors.slice(0, 12).map((e) => `• صف ${e.row}: ${e.message}`)
      const more = r.rowErrors.length > 12 ? [`... و ${r.rowErrors.length - 12} صف تاني`] : []
      await alertDialog(
        [
          `✅ الاستيراد خلص`,
          `عملاء اتحدّثت بياناتهم: ${r.updated}`,
          `عملاء جداد اتضافوا: ${r.created}`,
          ...(r.rowErrors.length ? ['', `⚠️ صفوف ما اتنفذتش (${r.rowErrors.length}):`, ...errors, ...more] : [])
        ].join('\n')
      )
      refresh()
    } finally {
      setImporting(false)
    }
  }

  async function sendStatementWhatsApp(): Promise<void> {
    if (!statementFor) return
    const r = await window.api.customers.sendStatementWhatsApp(statementFor.id, ledgerFilter(statementFilter))
    await alertDialog(r.ok ? `✅ كشف الحساب اتبعت على واتساب (${statementFor.phone ?? ''})` : (r.error ?? 'تعذر إرسال كشف الحساب'))
  }

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

  const ledgerFilter = (f: { from: string; to: string }): { from?: string; to?: string } => ({ from: f.from || undefined, to: f.to || undefined })

  async function openStatement(customer: CustomerView): Promise<void> {
    setStatementFor(customer)
    setStatementFilter({ from: '', to: '' })
    setStatement(await window.api.customers.getLedger(customer.id, {}))
  }

  async function changeStatementFilter(f: { from: string; to: string }): Promise<void> {
    setStatementFilter(f)
    if (statementFor) setStatement(await window.api.customers.getLedger(statementFor.id, ledgerFilter(f)))
  }

  async function printStatement(): Promise<void> {
    if (!statementFor) return
    const r = await window.api.customers.printStatement(statementFor.id, ledgerFilter(statementFilter))
    if (!r.ok && r.error) await alertDialog(r.error)
  }

  async function handleRecordPayment(amount: number, method: PaymentMethod, note: string, _invoiceId?: number | null, treasuryId?: number | null): Promise<void> {
    if (!statementFor || !user) return
    const updated = await window.api.customers.recordPayment(statementFor.id, amount, method, note, user.id, treasuryId ?? null)
    setStatementFor(updated)
    setStatement(await window.api.customers.getLedger(updated.id, ledgerFilter(statementFilter)))
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="qcp-btn qcp-btn-secondary" title="تنزيل كل العملاء في ملف إكسيل" onClick={handleExport}>
            ⬇️ تصدير إكسيل
          </button>
          <button
            className="qcp-btn qcp-btn-secondary"
            title="ارفع نفس ملف التصدير بعد تعديل الأرقام — العميل بيتحدّث بالكود"
            disabled={importing}
            onClick={handleImport}
          >
            {importing ? '...جاري الاستيراد' : '⬆️ استيراد إكسيل'}
          </button>
          <button className="qcp-btn qcp-btn-primary" onClick={() => setShowForm(true)}>
            + {t('parties.addCustomer')}
          </button>
        </div>
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
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="qcp-btn qcp-btn-secondary"
                  style={{ padding: '2px 10px', fontSize: 12 }}
                  title="تعديل بيانات العميل"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(c)
                  }}
                >
                  ✏️ تعديل
                </button>
                <span className={`qcp-pill ${c.balance > 0 ? 'critical' : 'success'}`}>
                  {c.balance > 0 ? t('parties.debtor') : t('parties.settled')}
                </span>
              </div>
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
              ) : linkOpenFor !== c.id ? (
                <button
                  className="qcp-btn qcp-btn-secondary"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => setLinkOpenFor(c.id)}
                >
                  🔗 {t('parties.linkVendorPlaceholder')}
                </button>
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
        {customers.length === 0 && <p style={{ color: 'var(--qcp-ink-faint)' }}>{loading ? 'جاري التحميل...' : '—'}</p>}
      </div>
      {filtered.length > customers.length && (
        <div style={{ textAlign: 'center', margin: '16px 0' }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE * 2)}>
            عرض المزيد ({customers.length} من {filtered.length})
          </button>
        </div>
      )}

      {editing && (
        <div className="qcp-modal-backdrop">
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleEditSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(null)
            }}
          >
            <h2 style={{ marginTop: 0 }}>✏️ تعديل بيانات العميل</h2>
            <div className="qcp-field">
              <label>{t('parties.name')}</label>
              <input className="qcp-input" required autoFocus value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="qcp-field">
              <label>{t('parties.phone')}</label>
              <input className="qcp-input" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="qcp-field">
              <label>{t('parties.address')}</label>
              <input className="qcp-input" value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="qcp-field">
              <label>{t('parties.notes')}</label>
              <input className="qcp-input" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {editError && <div style={{ color: 'var(--qcp-critical)', fontSize: 13, marginBottom: 10 }}>⚠️ {editError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="qcp-btn qcp-btn-primary" type="submit" disabled={savingEdit}>
                {t('parties.save')}
              </button>
              <button className="qcp-btn qcp-btn-secondary" type="button" onClick={() => setEditing(null)}>
                {t('parties.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

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
          treasuries={treasuries && treasuries.some((x) => x.active) ? treasuries : undefined}
          filter={statementFilter}
          onFilterChange={changeStatementFilter}
          onPrint={printStatement}
          onSendWhatsApp={sendStatementWhatsApp}
          onOpenLink={() => setStatementLinkFor(statementFor)}
        />
      )}

      {statementLinkFor && (
        <StatementLinkModal
          party={{ id: statementLinkFor.id, name: statementLinkFor.name, phone: statementLinkFor.phone }}
          onClose={() => setStatementLinkFor(null)}
        />
      )}
    </div>
  )
}
