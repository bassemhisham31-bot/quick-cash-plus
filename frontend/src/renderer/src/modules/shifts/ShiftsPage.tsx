import { useEffect, useState } from 'react'
import { formatCurrency as currency } from '../../lib/currency'
import type { ShiftListRow } from '../../../../shared/types'

const STATUS_LABELS: Record<ShiftListRow['status'], string> = { open: 'مفتوحة', closed: 'مقفولة' }

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function ShiftsPage(): JSX.Element {
  const [shifts, setShifts] = useState<ShiftListRow[]>([])
  const [from, setFrom] = useState(daysAgoIso(7))
  const [to, setTo] = useState(todayIso())
  const [search, setSearch] = useState('')

  function refresh(): void {
    window.api.cash.listShifts({ from: from ? `${from} 00:00:00` : undefined, to: to ? `${to} 23:59:59` : undefined }).then(setShifts)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  const filtered = search.trim()
    ? shifts.filter((s) => s.cashierName.toLowerCase().includes(search.trim().toLowerCase()))
    : shifts

  const activeCount = shifts.filter((s) => s.status === 'open').length
  const totalDifference = shifts.reduce((sum, s) => sum + (s.cashDifference ?? 0), 0)

  return (
    <div>
      <div className="qcp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>الورديات</h1>
        <button type="button" className="qcp-btn qcp-btn-secondary" onClick={refresh}>
          🔄 تحديث
        </button>
      </div>

      <div className="qcp-grid qcp-grid-3" style={{ marginBottom: 18 }}>
        <div className="qcp-card">
          <div className="qcp-icon-badge pink">📷</div>
          <div className="qcp-kpi-value">{currency(totalDifference)}</div>
          <div className="qcp-kpi-label">فروقات الصندوق</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge orange">⏱️</div>
          <div className="qcp-kpi-value">{activeCount}</div>
          <div className="qcp-kpi-label">الورديات المفتوحة</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge blue">📅</div>
          <div className="qcp-kpi-value">{shifts.length}</div>
          <div className="qcp-kpi-label">إجمالي الورديات</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="qcp-input"
          style={{ width: 220 }}
          placeholder="البحث باسم الموظف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          من
          <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          إلى
          <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>رقم الوردية</th>
              <th>الموظف</th>
              <th>بداية الوردية</th>
              <th>نهاية الوردية</th>
              <th>الرصيد الافتتاحي</th>
              <th>الرصيد المتوقع</th>
              <th>الفرق</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.cashierName}</td>
                <td>{s.openedAt}</td>
                <td>{s.closedAt ?? '—'}</td>
                <td>{currency(s.openingBalance)}</td>
                <td>{s.expectedCash != null ? currency(s.expectedCash) : '—'}</td>
                <td style={{ color: s.cashDifference && s.cashDifference !== 0 ? 'var(--qcp-critical)' : undefined }}>
                  {s.cashDifference != null ? currency(s.cashDifference) : '—'}
                </td>
                <td>
                  <span className={`qcp-pill ${s.status === 'open' ? 'accent' : ''}`}>{STATUS_LABELS[s.status]}</span>
                </td>
                <td>
                  {s.status === 'closed' && (
                    <button
                      type="button"
                      className="qcp-btn qcp-btn-secondary"
                      style={{ padding: '4px 10px' }}
                      onClick={() => window.api.print.previewShiftSummary(s.id)}
                    >
                      معاينة
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش ورديات في المدى المحدد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
