/**
 * تقارير إضافية لنسخة الويب: مواعيد استحقاق العملاء/الموردين بالشهر، تفصيل عمولات المحلات المسوّقة، ومبيعات الخدمات.
 * بتتنادى من reports.ts (switch الأنواع).
 */
import { getDb } from '../db'
import { branchFilter } from './branchScope'
import type { ReportFilter, ReportResult } from '../../shared/types'

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100

/** فلتر تاريخ على عمود معين (من/إلى) + فلتر الفرع */
function dateAndBranch(filter: ReportFilter, column: string, branchColumn: string): { sql: string; args: unknown[] } {
  const parts: string[] = []
  const args: unknown[] = []
  if (filter.dateFrom) {
    parts.push(`date(${column}) >= date(?)`)
    args.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    parts.push(`date(${column}) <= date(?)`)
    args.push(filter.dateTo)
  }
  const bf = branchFilter(branchColumn)
  if (bf.args.length) {
    parts.push(bf.sql)
    args.push(...bf.args)
  }
  return { sql: parts.length ? `AND ${parts.join(' AND ')}` : '', args }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function dueStatus(dueDate: string | null): string {
  if (!dueDate) return 'بدون تاريخ'
  const today = todayStr()
  if (dueDate < today) {
    const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000)
    return `متأخر ${days} يوم`
  }
  if (dueDate === today) return 'مستحق اليوم'
  const days = Math.floor((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(today + 'T00:00:00Z')) / 86400000)
  return `باقي ${days} يوم`
}

interface DueRow {
  party: string
  number: string
  invoiceDate: string
  dueDate: string | null
  original: number
  outstanding: number
}

/** ترتيب حسب الشهر ثم تاريخ الاستحقاق + صف إجمالي لكل شهر */
function buildMonthlyReport(title: string, partyLabel: string, rows: DueRow[], filter: ReportFilter): ReportResult {
  const inRange = (d: string | null): boolean => {
    if (!filter.dateFrom && !filter.dateTo) return true
    if (!d) return false
    return (!filter.dateFrom || d >= filter.dateFrom) && (!filter.dateTo || d <= filter.dateTo)
  }
  const kept = rows.filter((r) => inRange(r.dueDate))
  kept.sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || a.party.localeCompare(b.party))

  const out: Record<string, string | number>[] = []
  let monthKey: string | null = null
  let monthSum = 0
  let monthOrig = 0
  const flush = (): void => {
    if (monthKey == null) return
    out.push({ month: `إجمالي ${monthKey}`, party: '', number: '', invoiceDate: '', dueDate: '', status: '', original: r2(monthOrig), outstanding: r2(monthSum), _subtotal: 1 })
  }
  for (const r of kept) {
    const key = r.dueDate ? r.dueDate.slice(0, 7) : 'بدون تاريخ استحقاق'
    if (key !== monthKey) {
      flush()
      monthKey = key
      monthSum = 0
      monthOrig = 0
    }
    monthSum += r.outstanding
    monthOrig += r.original
    out.push({
      month: key,
      party: r.party,
      number: r.number,
      invoiceDate: r.invoiceDate.slice(0, 10),
      dueDate: r.dueDate ?? '—',
      status: dueStatus(r.dueDate),
      original: r2(r.original),
      outstanding: r2(r.outstanding)
    })
  }
  flush()

  return {
    title,
    columns: [
      { key: 'month', label: 'الشهر' },
      { key: 'party', label: partyLabel },
      { key: 'number', label: 'رقم الفاتورة' },
      { key: 'invoiceDate', label: 'تاريخ الفاتورة' },
      { key: 'dueDate', label: 'تاريخ الاستحقاق' },
      { key: 'status', label: 'الحالة' },
      { key: 'original', label: 'قيمة الجزء الآجل', align: 'end' },
      { key: 'outstanding', label: 'المتبقي', align: 'end' }
    ],
    rows: out,
    totals: { original: r2(kept.reduce((s, r) => s + r.original, 0)), outstanding: r2(kept.reduce((s, r) => s + r.outstanding, 0)) }
  }
}

/**
 * فواتير العملاء الآجلة (والمقسّمة اللي فيها باقي آجل) متجمّعة بشهر تاريخ الاستحقاق.
 * المتبقي على كل فاتورة بيتحسب من رصيد العميل الحالي موزّع على أحدث الفواتير رجوعًا (نفس منطق تقرير أعمار الديون) —
 * يعني التحصيلات بتتخصم من الأقدم الأول.
 */
export async function customerDueDatesReport(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const bf = branchFilter('branch_id')
  const customers = await db.execute(
    'SELECT id, name, balance FROM customers WHERE deleted_at IS NULL AND is_walk_in = 0 AND balance > 0.005 ORDER BY name'
  )
  const rows: DueRow[] = []
  for (const c of customers.rows as any[]) {
    const inv = await db.execute({
      sql: `SELECT number, created_at, due_date, total - paid AS due FROM sales_invoices
            WHERE customer_id = ? AND deleted_at IS NULL AND payment_method IN ('credit', 'mixed') AND total - paid > 0.005 AND ${bf.sql}
            ORDER BY created_at DESC, id DESC`,
      args: [c.id, ...bf.args] as any
    })
    let remaining = Number(c.balance)
    for (const i of inv.rows as any[]) {
      if (remaining <= 0.005) break
      const due = Number(i.due)
      const take = Math.min(due, remaining)
      remaining -= take
      rows.push({ party: c.name, number: i.number, invoiceDate: i.created_at, dueDate: i.due_date ?? null, original: due, outstanding: take })
    }
    // رصيد سابق أو غير مرتبط بفواتير (افتتاحي / تسويات)
    if (remaining > 0.005) rows.push({ party: c.name, number: 'رصيد سابق', invoiceDate: '', dueDate: null, original: remaining, outstanding: remaining })
  }
  return buildMonthlyReport('مواعيد استحقاق العملاء (الفواتير الآجلة بالشهر)', 'العميل', rows, filter)
}

/** فواتير الشراء الآجلة بتاريخ السداد المتوقع، بالشهر. نفس منطق التوزيع على أحدث الفواتير. */
export async function vendorDueDatesReport(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const bf = branchFilter('branch_id')
  const vendors = await db.execute('SELECT id, name, balance FROM vendors WHERE deleted_at IS NULL AND balance > 0.005 ORDER BY name')
  const rows: DueRow[] = []
  for (const v of vendors.rows as any[]) {
    const inv = await db.execute({
      sql: `SELECT number, created_at, due_date, total - paid AS due FROM purchase_invoices
            WHERE vendor_id = ? AND total - paid > 0.005 AND ${bf.sql}
            ORDER BY created_at DESC, id DESC`,
      args: [v.id, ...bf.args] as any
    })
    let remaining = Number(v.balance)
    for (const i of inv.rows as any[]) {
      if (remaining <= 0.005) break
      const due = Number(i.due)
      const take = Math.min(due, remaining)
      remaining -= take
      rows.push({ party: v.name, number: i.number, invoiceDate: i.created_at, dueDate: i.due_date ?? null, original: due, outstanding: take })
    }
    if (remaining > 0.005) rows.push({ party: v.name, number: 'رصيد سابق', invoiceDate: '', dueDate: null, original: remaining, outstanding: remaining })
  }
  return buildMonthlyReport('مواعيد سداد مديونيات الموردين (بالشهر)', 'المورد', rows, filter)
}

/** تفصيل عمولة كل محل/مندوب مسوّق فاتورة بفاتورة، مع إجمالي لكل واحد */
export async function salesRepCommissionDetailReport(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args } = dateAndBranch(filter, 'i.created_at', 'i.branch_id')
  const warehouseSql = filter.warehouseId ? 'AND i.warehouse_id = ?' : ''
  const rs = await db.execute({
    sql: `SELECT r.id AS repId, r.name AS repName, r.commission_percent AS pct, i.number, i.created_at AS createdAt,
                 c.name AS customerName, i.total, i.commission_amount AS commission
          FROM sales_invoices i
          JOIN sales_reps r ON r.id = i.sales_rep_id
          JOIN customers c ON c.id = i.customer_id
          WHERE i.deleted_at IS NULL ${dateSql} ${warehouseSql}
          ORDER BY r.name, i.created_at, i.id`,
    args: [...args, ...(filter.warehouseId ? [filter.warehouseId] : [])] as any
  })
  const out: Record<string, string | number>[] = []
  let current: number | null = null
  let name = ''
  let sumTotal = 0
  let sumCommission = 0
  let grandTotal = 0
  let grandCommission = 0
  const flush = (): void => {
    if (current == null) return
    out.push({ rep: `إجمالي ${name}`, date: '', number: '', customer: '', pct: '', total: r2(sumTotal), commission: r2(sumCommission), _subtotal: 1 })
  }
  for (const r of rs.rows as any[]) {
    if (Number(r.repId) !== current) {
      flush()
      current = Number(r.repId)
      name = r.repName
      sumTotal = 0
      sumCommission = 0
    }
    sumTotal += Number(r.total)
    sumCommission += Number(r.commission)
    grandTotal += Number(r.total)
    grandCommission += Number(r.commission)
    out.push({
      rep: r.repName,
      date: String(r.createdAt).slice(0, 10),
      number: r.number,
      customer: r.customerName,
      pct: Number(r.pct),
      total: r2(Number(r.total)),
      commission: r2(Number(r.commission))
    })
  }
  flush()
  return {
    title: 'تفصيل عمولات المحلات المسوّقة (فاتورة بفاتورة)',
    columns: [
      { key: 'rep', label: 'المحل / المندوب' },
      { key: 'date', label: 'التاريخ' },
      { key: 'number', label: 'رقم الفاتورة' },
      { key: 'customer', label: 'العميل' },
      { key: 'pct', label: 'نسبة العمولة %', align: 'end' },
      { key: 'total', label: 'قيمة الفاتورة', align: 'end' },
      { key: 'commission', label: 'العمولة', align: 'end' }
    ],
    rows: out,
    totals: { total: r2(grandTotal), commission: r2(grandCommission) }
  }
}

/** مبيعات الخدمات (تركيب، كشف أعطال، سحب فودافون كاش...): العدد، المبالغ الأساسية، وإيراد الخدمة/العمولة */
export async function serviceSalesReport(filter: ReportFilter): Promise<ReportResult> {
  const db = getDb()
  const { sql: dateSql, args } = dateAndBranch(filter, 'i.created_at', 'i.branch_id')
  const rs = await db.execute({
    sql: `SELECT p.name, COUNT(*) AS opCount, COALESCE(SUM(si.qty), 0) AS qty,
                 COALESCE(SUM(si.service_amount), 0) AS principal, COALESCE(SUM(si.total), 0) AS revenue
          FROM sales_items si
          JOIN sales_invoices i ON i.id = si.invoice_id
          JOIN products p ON p.id = si.product_id
          WHERE p.is_service = 1 AND i.deleted_at IS NULL ${dateSql}
          GROUP BY p.id
          ORDER BY revenue DESC`,
    args: args as any
  })
  const rows = rs.rows.map((r: any) => ({
    name: r.name,
    opCount: Number(r.opCount),
    principal: r2(Number(r.principal)),
    revenue: r2(Number(r.revenue))
  }))
  return {
    title: 'مبيعات الخدمات وعمولاتها',
    columns: [
      { key: 'name', label: 'الخدمة' },
      { key: 'opCount', label: 'عدد العمليات', align: 'end' },
      { key: 'principal', label: 'إجمالي المبالغ (قبل العمولة)', align: 'end', format: 'currency' },
      { key: 'revenue', label: 'إيراد الخدمة / العمولة', align: 'end' }
    ],
    rows,
    totals: { principal: r2(rows.reduce((s, r) => s + r.principal, 0)), revenue: r2(rows.reduce((s, r) => s + r.revenue, 0)) }
  }
}
