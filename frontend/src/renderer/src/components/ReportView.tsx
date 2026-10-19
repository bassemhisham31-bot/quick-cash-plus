import { useState } from 'react'
import { formatCurrency as currency } from '../lib/currency'
import { isCountColumn, type ReportColumn, type ReportResult } from '../../../shared/types'

const plainNumber = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 })

function formatCell(value: string | number | undefined, col: ReportColumn): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return col.format === 'number' || (col.format !== 'currency' && isCountColumn(col)) ? plainNumber.format(value) : currency(value)
  return value
}

/** جدول تقرير عام (ReportResult) مع بحث وتصدير Excel/PDF — بيستخدمه الخزائن والتقارير المحاسبية */
export function ReportView({ report, searchable = true }: { report: ReportResult | null; searchable?: boolean }): JSX.Element {
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  if (!report) return <div className="rst-empty">اختار تقرير أو فترة</div>

  const term = search.trim().toLowerCase()
  const rows = term
    ? report.rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(term)))
    : report.rows

  async function exportAs(format: 'excel' | 'pdf'): Promise<void> {
    if (!report) return
    setMessage(null)
    const res = format === 'pdf' ? await window.api.reports.exportPdf(report) : await window.api.reports.exportExcel(report)
    if (res.canceled) return
    setMessage(res.ok ? `تم الحفظ في: ${res.filePath}` : (res.error ?? 'حدث خطأ'))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{report.title}</strong>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          {searchable && (
            <input className="qcp-input" style={{ width: 200 }} placeholder="بحث في النتائج..." value={search} onChange={(e) => setSearch(e.target.value)} />
          )}
          <button className="qcp-btn qcp-btn-secondary" onClick={() => exportAs('excel')}>
            📊 Excel
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => exportAs('pdf')}>
            📄 PDF
          </button>
        </div>
      </div>
      {message && <div className="qcp-card" style={{ marginBottom: 10, fontSize: 12.5 }}>{message}</div>}
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              {report.columns.map((c) => (
                <th key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {report.columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                    {formatCell(row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={report.columns.length} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش بيانات
                </td>
              </tr>
            )}
            {report.totals && (
              <tr style={{ fontWeight: 800, background: 'var(--qcp-bg-sunken)' }}>
                {report.columns.map((c, idx) => (
                  <td key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : 'start' }}>
                    {idx === 0 ? 'الإجمالي' : report.totals?.[c.key] != null ? formatCell(report.totals[c.key], c) : ''}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
