import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import type { ExpenseCategory, ExpenseInput, ExpensesByMethodSummary, ExpenseView } from '../../../../shared/types'

const emptyForm = { categoryId: '' as number | '', amount: '', method: 'cash' as ExpenseInput['method'], note: '' }

const METHOD_LABEL_KEYS: Record<ExpenseInput['method'], string> = {
  cash: 'expenses.methodCash',
  card: 'expenses.methodCard',
  wallet: 'expenses.methodWallet',
  transfer: 'expenses.methodTransfer'
}

export function ExpenseLogTab(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [expenses, setExpenses] = useState<ExpenseView[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [byMethod, setByMethod] = useState<ExpensesByMethodSummary | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [attachment, setAttachment] = useState<{ path: string; name: string } | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    const [e, c, m] = await Promise.all([
      window.api.expenses.list(),
      window.api.expenses.listCategories(),
      window.api.expenses.byMethodSummary()
    ])
    setExpenses(e)
    setCategories(c)
    setByMethod(m)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleAddCategory(): Promise<void> {
    if (!newCategoryName.trim()) return
    const cat = await window.api.expenses.createCategory(newCategoryName.trim())
    setCategories((prev) => [...prev, cat])
    setForm((f) => ({ ...f, categoryId: cat.id }))
    setNewCategoryName('')
  }

  async function handleAttach(): Promise<void> {
    const result = await window.api.attachments.pick()
    if (result.ok && result.path && result.name) setAttachment({ path: result.path, name: result.name })
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!user) return
    setError(null)
    const result = await window.api.expenses.create(
      {
        categoryId: form.categoryId === '' ? null : Number(form.categoryId),
        amount: Number(form.amount) || 0,
        method: form.method,
        note: form.note,
        attachmentPath: attachment?.path ?? null,
        attachmentName: attachment?.name ?? null
      },
      user.id
    )
    if (!result.ok) {
      setError(result.error ?? 'حدث خطأ')
      return
    }
    setForm(emptyForm)
    setAttachment(null)
    setShowForm(false)
    refresh()
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="qcp-card" style={{ display: 'inline-block' }}>
          <div className="qcp-icon-badge orange">💸</div>
          <div className="qcp-kpi-value">{currency(total)}</div>
          <div className="qcp-kpi-label">{t('expenses.totalExpenses')}</div>
        </div>
        <button className="qcp-btn qcp-btn-primary" onClick={() => setShowForm(true)}>
          + {t('expenses.add')}
        </button>
      </div>

      {byMethod && byMethod.byMethod.length > 0 && (
        <div className="qcp-card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{t('expenses.byMethodTitle')}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {byMethod.byMethod.map((row) => (
              <div key={row.method} className="qcp-pill accent" style={{ fontSize: 14 }}>
                {t(METHOD_LABEL_KEYS[row.method as ExpenseInput['method']] ?? row.method)}: {currency(row.total)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('expenses.category')}</th>
              <th>{t('expenses.amount')}</th>
              <th>{t('expenses.method')}</th>
              <th>{t('expenses.note')}</th>
              <th>{t('expenses.attachment')}</th>
              <th>{t('expenses.cashier')}</th>
              <th>{t('expenses.date')}</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.categoryName}</td>
                <td>{currency(e.amount)}</td>
                <td>{e.method}</td>
                <td>{e.note ?? '—'}</td>
                <td>
                  {e.attachmentPath ? (
                    <button
                      type="button"
                      className="qcp-btn qcp-btn-secondary"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => window.api.attachments.open(e.attachmentPath!)}
                    >
                      📎 {e.attachmentName ?? t('expenses.attachment')}
                    </button>
                  ) : (
                    t('expenses.noAttachment')
                  )}
                </td>
                <td>{e.cashierName}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{e.createdAt}</td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
            <h2 style={{ marginTop: 0 }}>{t('expenses.add')}</h2>

            <div className="qcp-field">
              <label>{t('expenses.category')}</label>
              <select
                className="qcp-select"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value ? Number(e.target.value) : '' }))}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="qcp-input"
                style={{ flex: 1 }}
                placeholder={t('expenses.newCategory') ?? ''}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={handleAddCategory}>
                +
              </button>
            </div>

            <div className="qcp-field">
              <label>{t('expenses.amount')}</label>
              <input
                className="qcp-input"
                type="number"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>

            <div className="qcp-field">
              <label>{t('expenses.method')}</label>
              <select
                className="qcp-select"
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as ExpenseInput['method'] }))}
              >
                <option value="cash">نقدًا</option>
                <option value="card">بنكي</option>
                <option value="wallet">محفظة</option>
                <option value="transfer">تحويل</option>
              </select>
            </div>

            <div className="qcp-field">
              <label>{t('expenses.note')}</label>
              <input
                className="qcp-input"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={handleAttach}>
                📎 {t('expenses.attachFile')}
              </button>
              {attachment && <span className="qcp-pill accent">{attachment.name}</span>}
            </div>

            {error && (
              <div className="qcp-pill critical" style={{ marginBottom: 10 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="qcp-btn qcp-btn-primary" type="submit">
                {t('expenses.save')}
              </button>
              <button
                className="qcp-btn qcp-btn-secondary"
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setAttachment(null)
                }}
              >
                {t('expenses.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
