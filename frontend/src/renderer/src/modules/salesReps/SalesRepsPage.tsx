import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SalesRep } from '../../../../shared/types'

const emptyForm = { id: null as number | null, name: '', phone: '', commissionPercent: '0' }

export function SalesRepsPage(): JSX.Element {
  const { t } = useTranslation()
  const [reps, setReps] = useState<SalesRep[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function refresh(): Promise<void> {
    setReps(await window.api.salesReps.list(true))
  }

  useEffect(() => {
    refresh()
  }, [])

  function startEdit(rep: SalesRep): void {
    setForm({ id: rep.id, name: rep.name, phone: rep.phone ?? '', commissionPercent: String(rep.commissionPercent) })
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const input = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      commissionPercent: Number(form.commissionPercent) || 0
    }
    if (form.id) {
      await window.api.salesReps.update(form.id, input)
    } else {
      await window.api.salesReps.create(input)
    }
    setForm(emptyForm)
    setShowForm(false)
    refresh()
  }

  async function handleToggleActive(rep: SalesRep): Promise<void> {
    await window.api.salesReps.setActive(rep.id, !rep.active)
    refresh()
  }

  return (
    <div>
      <div
        className="qcp-page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1>{t('salesReps.title')}</h1>
        <button
          className="qcp-btn qcp-btn-primary"
          onClick={() => {
            setForm(emptyForm)
            setShowForm(true)
          }}
        >
          + {t('salesReps.add')}
        </button>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('salesReps.name')}</th>
              <th>{t('salesReps.phone')}</th>
              <th>{t('salesReps.commissionPercent')}</th>
              <th>{t('salesReps.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                <td>{r.name}</td>
                <td>{r.phone || '—'}</td>
                <td>{r.commissionPercent}%</td>
                <td>
                  <span className={`qcp-pill ${r.active ? 'success' : ''}`}>
                    {r.active ? t('salesReps.active') : t('salesReps.inactive')}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="qcp-btn qcp-btn-secondary" onClick={() => startEdit(r)}>
                    {t('common.edit')}
                  </button>
                  <button className="qcp-btn qcp-btn-secondary" onClick={() => handleToggleActive(r)}>
                    {r.active ? t('salesReps.deactivate') : t('salesReps.activate')}
                  </button>
                </td>
              </tr>
            ))}
            {reps.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
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
            <h2 style={{ marginTop: 0 }}>{form.id ? t('salesReps.edit') : t('salesReps.add')}</h2>
            <div className="qcp-field">
              <label>{t('salesReps.name')}</label>
              <input
                className="qcp-input"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="qcp-field">
              <label>{t('salesReps.phone')}</label>
              <input
                className="qcp-input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="qcp-field">
              <label>{t('salesReps.commissionPercent')}</label>
              <input
                className="qcp-input"
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={form.commissionPercent}
                onChange={(e) => setForm((f) => ({ ...f, commissionPercent: e.target.value }))}
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
    </div>
  )
}
