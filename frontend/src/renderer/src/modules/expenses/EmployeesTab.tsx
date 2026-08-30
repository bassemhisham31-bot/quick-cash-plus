import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Employee, EmployeesSummary } from '../../../../shared/types'
import { EmployeeLedgerModal } from './EmployeeLedgerModal'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'

const emptyForm = { name: '', phone: '', role: '', baseSalary: '0' }

export function EmployeesTab(): JSX.Element {
  const { t } = useTranslation()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [selected, setSelected] = useState<Employee | null>(null)
  const [summary, setSummary] = useState<EmployeesSummary | null>(null)

  async function refresh(): Promise<void> {
    setEmployees(await window.api.employees.list())
    setSummary(await window.api.employees.getSummary())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    await window.api.employees.create({
      name: form.name.trim(),
      phone: form.phone.trim(),
      role: form.role.trim(),
      baseSalary: Number(form.baseSalary) || 0
    })
    playSound('save')
    setForm(emptyForm)
    setShowForm(false)
    refresh()
  }

  return (
    <div>
      {summary && (
        <div className="qcp-grid qcp-grid-4" style={{ marginBottom: 16 }}>
          <div className="qcp-card">
            <div className="qcp-kpi-value" style={{ fontSize: '1.1rem' }}>{currency(summary.totalBaseSalaryAllPeriods)}</div>
            <div className="qcp-kpi-label">{t('expenses.summaryBaseSalary')}</div>
          </div>
          <div className="qcp-card">
            <div className="qcp-kpi-value" style={{ fontSize: '1.1rem' }}>{currency(summary.totalPaid)}</div>
            <div className="qcp-kpi-label">{t('expenses.summaryPaid')}</div>
          </div>
          <div className="qcp-card">
            <div className="qcp-kpi-value" style={{ fontSize: '1.1rem' }}>{currency(summary.totalWithdrawalsDeductionsDamage)}</div>
            <div className="qcp-kpi-label">{t('expenses.summaryWithdrawalsEtc')}</div>
          </div>
          <div className="qcp-card">
            <div
              className="qcp-kpi-value"
              style={{ fontSize: '1.1rem', color: summary.totalRemaining < 0 ? 'var(--qcp-critical)' : undefined }}
            >
              {currency(summary.totalRemaining)}
            </div>
            <div className="qcp-kpi-label">{t('expenses.summaryRemaining')}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="qcp-btn qcp-btn-primary" onClick={() => setShowForm(true)}>
          + {t('expenses.addEmployee')}
        </button>
      </div>

      <div className="qcp-grid qcp-grid-4">
        {employees.map((emp) => (
          <div key={emp.id} className="qcp-card" style={{ cursor: 'pointer' }} onClick={() => setSelected(emp)}>
            <div className="qcp-icon-badge purple">🧑‍💼</div>
            <div style={{ fontWeight: 700 }}>{emp.name}</div>
            <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 12 }}>{emp.role ?? '—'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
              <span>{t('expenses.baseSalary')}</span>
              <strong>{currency(emp.baseSalary)}</strong>
            </div>
          </div>
        ))}
        {employees.length === 0 && <p style={{ color: 'var(--qcp-ink-faint)' }}>—</p>}
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
            <h2 style={{ marginTop: 0 }}>{t('expenses.addEmployee')}</h2>
            <div className="qcp-field">
              <label>{t('expenses.employeeName')}</label>
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
              <label>{t('expenses.role')}</label>
              <input
                className="qcp-input"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              />
            </div>
            <div className="qcp-field">
              <label>{t('expenses.baseSalary')}</label>
              <input
                className="qcp-input"
                type="number"
                value={form.baseSalary}
                onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="qcp-btn qcp-btn-primary" type="submit">
                {t('expenses.save')}
              </button>
              <button className="qcp-btn qcp-btn-secondary" type="button" onClick={() => setShowForm(false)}>
                {t('expenses.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <EmployeeLedgerModal employee={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </div>
  )
}
