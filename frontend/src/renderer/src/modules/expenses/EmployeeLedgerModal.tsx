import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import type { Employee, EmployeeLedger, EmployeeTransactionType } from '../../../../shared/types'

interface Props {
  employee: Employee
  onClose: () => void
  onChanged: () => void
}

type PeriodFilter = 'all' | 'current'

export function EmployeeLedgerModal({ employee, onClose, onChanged }: Props): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [ledger, setLedger] = useState<EmployeeLedger | null>(null)
  const [type, setType] = useState<EmployeeTransactionType>('salary')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [attachment, setAttachment] = useState<{ path: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')

  async function refresh(): Promise<void> {
    setLedger(await window.api.employees.getLedger(employee.id))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id])

  async function handleSubmit(): Promise<void> {
    if (!user) return
    const value = Number(amount)
    if (!value || value <= 0) return
    setSaving(true)
    try {
      await window.api.employees.recordTransaction(
        {
          employeeId: employee.id,
          type,
          amount: value,
          note,
          attachmentPath: attachment?.path ?? null,
          attachmentName: attachment?.name ?? null
        },
        user.id
      )
      playSound('save')
      setAmount('')
      setNote('')
      setAttachment(null)
      await refresh()
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function handleAttach(): Promise<void> {
    const result = await window.api.attachments.pick()
    if (result.ok && result.path && result.name) setAttachment({ path: result.path, name: result.name })
  }

  async function handleStartNewPeriod(): Promise<void> {
    if (!window.confirm(t('expenses.confirmNewPeriod') ?? '')) return
    await window.api.employees.startNewPeriod(employee.id)
    await refresh()
  }

  function startEdit(txId: number, currentAmount: number, currentNote: string | null): void {
    setEditingId(txId)
    setEditAmount(String(currentAmount))
    setEditNote(currentNote ?? '')
  }

  async function saveEdit(): Promise<void> {
    if (editingId === null) return
    const value = Number(editAmount)
    if (!value || value <= 0) return
    await window.api.employees.updateTransaction(editingId, { amount: value, note: editNote })
    setEditingId(null)
    await refresh()
    onChanged()
  }

  async function handleDelete(txId: number): Promise<void> {
    if (!window.confirm(t('expenses.confirmDeleteTransaction') ?? '')) return
    await window.api.employees.deleteTransaction(txId)
    playSound('delete')
    await refresh()
    onChanged()
  }

  const visibleTransactions =
    periodFilter === 'current' && ledger?.currentPeriod
      ? ledger.transactions.filter((tx) => tx.periodId === ledger.currentPeriod?.id)
      : ledger?.transactions ?? []

  const visibleTotals = periodFilter === 'current' ? ledger?.currentPeriodTotals : ledger?.totals

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(720px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>{t('expenses.ledger')}</h2>
          <span style={{ fontWeight: 700 }}>{employee.name}</span>
        </div>
        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 12.5, margin: '4px 0 10px' }}>
          {employee.role ?? '—'} · {t('expenses.baseSalary')}: {currency(employee.baseSalary)}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="qcp-select" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}>
              <option value="all">{t('expenses.allPeriods')}</option>
              <option value="current">{t('expenses.currentPeriod')}</option>
            </select>
            {ledger?.currentPeriod && (
              <span className="qcp-pill accent">
                {t('expenses.periodStartedAt')}: {ledger.currentPeriod.startedAt}
              </span>
            )}
          </div>
          <button className="qcp-btn qcp-btn-secondary" onClick={handleStartNewPeriod}>
            🔄 {t('expenses.startNewPeriod')}
          </button>
        </div>

        {visibleTotals && (
          <div className="qcp-grid qcp-grid-4" style={{ marginBottom: 16 }}>
            <div className="qcp-card">
              <div className="qcp-kpi-value" style={{ fontSize: '1.1rem' }}>{currency(visibleTotals.salary)}</div>
              <div className="qcp-kpi-label">{t('expenses.totalSalary')}</div>
            </div>
            <div className="qcp-card">
              <div className="qcp-kpi-value" style={{ fontSize: '1.1rem' }}>{currency(visibleTotals.bonus)}</div>
              <div className="qcp-kpi-label">{t('expenses.totalBonus')}</div>
            </div>
            <div className="qcp-card">
              <div className="qcp-kpi-value" style={{ fontSize: '1.1rem' }}>{currency(visibleTotals.advance)}</div>
              <div className="qcp-kpi-label">{t('expenses.totalAdvance')}</div>
            </div>
            <div className="qcp-card">
              <div className="qcp-kpi-value" style={{ fontSize: '1.1rem' }}>
                {currency(visibleTotals.deduction + visibleTotals.damage)}
              </div>
              <div className="qcp-kpi-label">{t('expenses.totalDeductionAndDamage')}</div>
            </div>
          </div>
        )}

        <div className="qcp-table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>{t('expenses.date')}</th>
                <th>{t('expenses.transactionType')}</th>
                <th>{t('expenses.amount')}</th>
                <th>{t('expenses.note')}</th>
                <th>{t('expenses.attachment')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{tx.createdAt}</td>
                  <td>{t(`expenses.${tx.type}`)}</td>
                  <td>
                    {editingId === tx.id ? (
                      <input
                        className="qcp-input"
                        type="number"
                        style={{ width: 90 }}
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                      />
                    ) : (
                      currency(tx.amount)
                    )}
                  </td>
                  <td>
                    {editingId === tx.id ? (
                      <input className="qcp-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                    ) : (
                      tx.note ?? '—'
                    )}
                  </td>
                  <td>
                    {tx.attachmentPath ? (
                      <button
                        className="qcp-btn qcp-btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => window.api.attachments.open(tx.attachmentPath!)}
                      >
                        📎 {tx.attachmentName ?? t('expenses.attachment')}
                      </button>
                    ) : (
                      t('expenses.noAttachment')
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    {editingId === tx.id ? (
                      <button className="qcp-btn qcp-btn-secondary" style={{ padding: '2px 8px' }} onClick={saveEdit}>
                        ✔
                      </button>
                    ) : (
                      <button
                        className="qcp-btn qcp-btn-secondary"
                        style={{ padding: '2px 8px' }}
                        onClick={() => startEdit(tx.id, tx.amount, tx.note)}
                      >
                        {t('expenses.edit')}
                      </button>
                    )}
                    <button
                      className="qcp-btn qcp-btn-secondary"
                      style={{ padding: '2px 8px' }}
                      onClick={() => handleDelete(tx.id)}
                    >
                      {t('expenses.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {visibleTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    {t('parties.noEntries')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginBottom: 10, fontSize: 15 }}>{t('expenses.recordTransaction')}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="qcp-select" value={type} onChange={(e) => setType(e.target.value as EmployeeTransactionType)}>
            <option value="salary">{t('expenses.salary')}</option>
            <option value="bonus">{t('expenses.bonus')}</option>
            <option value="advance">{t('expenses.advance')}</option>
            <option value="deduction">{t('expenses.deduction')}</option>
            <option value="damage">{t('expenses.damage')}</option>
          </select>
          <input
            className="qcp-input"
            style={{ flex: 1 }}
            type="number"
            placeholder={t('expenses.amount') ?? ''}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <input
          className="qcp-input"
          style={{ width: '100%', marginTop: 8 }}
          placeholder={t('expenses.note') ?? ''}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={handleAttach}>
            📎 {t('expenses.attachFile')}
          </button>
          {attachment && <span className="qcp-pill accent">{attachment.name}</span>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSubmit}>
            {t('expenses.save')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
