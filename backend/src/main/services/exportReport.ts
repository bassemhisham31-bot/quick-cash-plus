import ExcelJS from 'exceljs'
import type { ExportResult, ReportResult } from '../../shared/types'

/** نسخة الويب: مفيش حوار حفظ على السيرفر — الملف بيرجع base64 والمتصفح هو اللي بينزّله. */
export type WebExportResult = ExportResult & { fileName?: string; mimeType?: string; dataBase64?: string; html?: string }

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-')
}

export async function exportReportToExcel(report: ReportResult): Promise<WebExportResult> {
  try {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(report.title.slice(0, 31))
    sheet.views = [{ rightToLeft: true }]
    sheet.columns = report.columns.map((c) => ({ header: c.label, key: c.key, width: 20 }))
    sheet.addRows(report.rows)
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }

    if (report.totals) {
      const totalsRow: Record<string, string | number> = {}
      const firstKey = report.columns[0]?.key
      if (firstKey) totalsRow[firstKey] = 'الإجمالي'
      Object.assign(totalsRow, report.totals)
      sheet.addRow(totalsRow).font = { bold: true }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    return { ok: true, fileName: `${sanitizeFileName(report.title)}.xlsx`, mimeType: XLSX_MIME, dataBase64: buffer.toString('base64') }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'تعذر تصدير الملف' }
  }
}

/** PDF: السيرفر بيرجّع HTML الجاهز للطباعة، والمتصفح بيفتحه ويشغّل "طباعة ← حفظ كـPDF". */
export async function exportReportToPdf(report: ReportResult): Promise<WebExportResult> {
  return { ok: true, fileName: `${sanitizeFileName(report.title)}.pdf`, html: buildReportHtml(report) }
}

export function buildReportHtml(report: ReportResult): string {
  const escape = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const headHtml = report.columns.map((c) => `<th>${escape(c.label)}</th>`).join('')
  const rowsHtml = report.rows
    .map((row) => `<tr>${report.columns.map((c) => `<td>${escape(row[c.key])}</td>`).join('')}</tr>`)
    .join('')

  const totalsHtml = report.totals
    ? `<tr class="totals">${report.columns
        .map((c, idx) => `<td>${idx === 0 ? 'الإجمالي' : escape(report.totals?.[c.key] ?? '')}</td>`)
        .join('')}</tr>`
    : ''

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${escape(report.title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Tahoma, Arial, sans-serif; padding: 24px; color: #111827; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  p.meta { color: #6b7280; font-size: 12px; margin-top: 0; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: start; }
  th { background: #eef0f6; }
  tr.totals td { font-weight: bold; background: #f3f4f8; }
</style>
</head>
<body>
  <h1>Quick Cash Plus — ${escape(report.title)}</h1>
  <p class="meta">${new Date().toLocaleString('ar-EG')}</p>
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${rowsHtml}${totalsHtml}</tbody>
  </table>
</body>
</html>`
}
