import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExpenseLogTab } from './ExpenseLogTab'
import { EmployeesTab } from './EmployeesTab'

export function ExpensesPage(): JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'expenses' | 'employees'>('expenses')

  return (
    <div>
      <div className="qcp-page-header">
        <h1>{t('expenses.title')}</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button
          className={`qcp-btn ${tab === 'expenses' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('expenses')}
        >
          {t('expenses.tabExpenses')}
        </button>
        <button
          className={`qcp-btn ${tab === 'employees' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('employees')}
        >
          {t('expenses.tabEmployees')}
        </button>
      </div>

      {tab === 'expenses' ? <ExpenseLogTab /> : <EmployeesTab />}
    </div>
  )
}
