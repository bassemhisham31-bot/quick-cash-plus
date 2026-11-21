import { buildLedger, type LedgerEntry, type LedgerLine } from './ledger'
import { listAccounts, loadResolver, makeFixedAssetMatcher, type AccountRow, type AccountType } from './accountsChart'
import { LEGACY_CODE_LINE, ROLE_LINE, TYPE_DEFAULT_LINE, lineAllowed, lineLabel } from './statementLines'
import type { ReportResult } from '../../shared/types'

/* ------------------------------ الميزانية وقائمة الدخل ------------------------------
 * كل سطر في القيود بيتحسب تحت "بند" (statementLines.ts) حسب: بند الحساب المحدد يدويًا ← دور الحركة ← نوع الحساب.
 * الصفوف: item (البند) + code (رقم الحساب) + amount، ومعاها علامات تنسيق: _heading عنوان قسم، _subtotal إجمالي، _detail تفصيل حساب تحت البند.
 */

type Row = Record<string, string | number>

const r2 = (v: number): number => Math.round(v * 100) / 100
const day = (ts: string): string => ts.slice(0, 10)

const COLUMNS: ReportResult['columns'] = [
  { key: 'item', label: 'البند' },
  { key: 'code', label: 'رقم الحساب' },
  { key: 'amount', label: 'المبلغ', align: 'end', format: 'currency' }
]

const PL_TYPES: AccountType[] = ['revenue', 'cogs', 'expense']
const BS_TYPES: AccountType[] = ['asset', 'liability', 'equity']

interface Ctx {
  accounts: Map<string, AccountRow>
  isFixed: (code: string) => boolean
  /** بند → أكواد الحسابات اللي "بتخدمه" (حتى لو رصيدها صفر) — عشان الرقم يظهر جنب البند حتى لو فاضي */
  belonging: Map<string, string[]>
}

const typeDefault = (acc: AccountRow, ctx: Ctx): string => (acc.type === 'asset' && ctx.isFixed(acc.code) ? 'fixed_assets' : TYPE_DEFAULT_LINE[acc.type])

/** بند الحساب لما مفيش دور واضح: حسابات النظام القديمة بالكود، وإلا الأصول الثابتة (نفس بداية كود الحساب المربوط)، وإلا النوع */
function fallbackLine(acc: AccountRow, ctx: Ctx): string {
  if (acc.isSystem) {
    const l = LEGACY_CODE_LINE[acc.code]
    if (l && lineAllowed(l, acc.type)) return l
    if (acc.type === 'asset' && /^11\d\d$/.test(acc.code)) return 'cash_bank'
  }
  return typeDefault(acc, ctx)
}

/** البنود اللي الحساب بيخدمها: المحدد يدويًا، وإلا بنود الأدوار المربوطة بيه، وإلا الافتراضي */
function accountLines(acc: AccountRow, ctx: Ctx): string[] {
  if (acc.statementLine && lineAllowed(acc.statementLine, acc.type)) return [acc.statementLine]
  const fromRoles = new Set<string>()
  for (const r of acc.roles) {
    const l = ROLE_LINE[r.split(':')[0]]
    if (l && lineAllowed(l, acc.type)) fromRoles.add(l)
  }
  if (fromRoles.size) return [...fromRoles]
  return [fallbackLine(acc, ctx)]
}

/** بند سطر القيد ده */
function lineOf(l: LedgerLine, acc: AccountRow, ctx: Ctx): string {
  if (acc.statementLine && lineAllowed(acc.statementLine, acc.type)) return acc.statementLine
  if (l.role) {
    const d = ROLE_LINE[l.role]
    if (d && lineAllowed(d, acc.type)) return d
  }
  // قيد يدوي على حساب فيه أكتر من حركة (مثلًا 5000 فيه خزائن وعملاء ومخزون): مش معروف أنهي واحد فيه → بند النوع
  const lines = accountLines(acc, ctx)
  return lines.length === 1 ? lines[0] : typeDefault(acc, ctx)
}

async function loadCtx(): Promise<Ctx> {
  const accounts = new Map((await listAccounts()).map((a) => [a.code, a]))
  const isFixed = makeFixedAssetMatcher((await loadResolver()).code('fixed_assets'))
  const ctx: Ctx = { accounts, isFixed, belonging: new Map() }
  // الحسابات اللي العميل حدد بندها بنفسه بتتقدّم على اللي بنده تلقائي (عشان مايظهرش حساب 1000 جنب 1100 مثلًا)
  const explicit = new Map<string, string[]>()
  const implicit = new Map<string, string[]>()
  for (const acc of accounts.values()) {
    const isExplicit = !!acc.statementLine && lineAllowed(acc.statementLine, acc.type)
    for (const line of accountLines(acc, ctx)) {
      const target = isExplicit ? explicit : implicit
      const list = target.get(line) ?? []
      list.push(acc.code)
      target.set(line, list)
    }
  }
  for (const key of new Set([...explicit.keys(), ...implicit.keys()])) {
    ctx.belonging.set(key, [...(explicit.get(key)?.length ? explicit.get(key)! : (implicit.get(key) ?? []))].sort())
  }
  return ctx
}

/** بند ← (كود حساب ← مدين − دائن) للقيود اللي تاريخها يعدّي الفلتر وحساباتها من الأنواع دي */
type Collected = Map<string, Map<string, number>>

function collect(entries: LedgerEntry[], ctx: Ctx, pass: (date: string) => boolean, types: AccountType[]): Collected {
  const out: Collected = new Map()
  for (const e of entries) {
    if (!pass(day(e.date))) continue
    for (const l of e.lines) {
      const acc = ctx.accounts.get(l.code)
      if (!acc || !types.includes(acc.type)) continue
      const key = lineOf(l, acc, ctx)
      let byAcc = out.get(key)
      if (!byAcc) out.set(key, (byAcc = new Map()))
      byAcc.set(l.code, (byAcc.get(l.code) ?? 0) + l.debit - l.credit)
    }
  }
  return out
}

/** صافي الربح (إيرادات − تكلفة − مصروفات) للقيود اللي تاريخها يعدّي الفلتر */
function profitOf(entries: LedgerEntry[], ctx: Ctx, pass: (date: string) => boolean): number {
  let t = 0
  for (const byAcc of collect(entries, ctx, pass, PL_TYPES).values()) for (const v of byAcc.values()) t -= v
  return r2(t)
}

interface LineOpts {
  label?: string
  /** يظهر بس لو فيه رصيد (بنود "أخرى") */
  optional?: boolean
  /** مبالغ مضافة للبند من حساب مش في الشجرة (بالإشارة النهائية) */
  extra?: { name: string; amount: number }[]
}

function makeBuilder(ctx: Ctx, data: Collected): {
  rows: Row[]
  heading: (title: string) => void
  sub: (label: string, amount: number) => number
  line: (key: string, sign: 1 | -1, opts?: LineOpts) => number
} {
  const rows: Row[] = []
  return {
    rows,
    heading: (title) => void rows.push({ item: title, code: '', amount: '', _heading: 1 }),
    sub: (label, amount) => {
      rows.push({ item: label, code: '', amount: r2(amount), _subtotal: 1 })
      return r2(amount)
    },
    /** sign: 1 للبنود المدينة (أصول/تكلفة/مصروفات) و-1 للدائنة (خصوم/حقوق ملكية/إيرادات) — النتيجة دايمًا بإشارتها في إجمالي القسم */
    line: (key, sign, opts = {}) => {
      const contrib = [...(data.get(key) ?? new Map<string, number>())].filter(([, v]) => r2(v) !== 0).sort(([a], [b]) => (a < b ? -1 : 1))
      const extras = (opts.extra ?? []).filter((x) => r2(x.amount) !== 0)
      const count = contrib.length + extras.length
      if (opts.optional && count === 0) return 0
      const total = r2(sign * contrib.reduce((s, [, v]) => s + v, 0) + extras.reduce((s, x) => s + x.amount, 0))
      const code = count >= 2 ? '' : count === 1 ? (contrib[0]?.[0] ?? '') : (ctx.belonging.get(key) ?? []).join('، ')
      rows.push({ item: opts.label ?? lineLabel(key), code, amount: total })
      if (count >= 2) {
        for (const [c, v] of contrib) rows.push({ item: `   ${ctx.accounts.get(c)?.name ?? c}`, code: c, amount: r2(sign * v), _detail: 1 })
        for (const x of extras) rows.push({ item: `   ${x.name}`, code: '', amount: r2(x.amount), _detail: 1 })
      }
      return total
    }
  }
}

export async function incomeStatementReport(from?: string, to?: string): Promise<ReportResult> {
  const ctx = await loadCtx()
  const entries = await buildLedger()
  const data = collect(entries, ctx, (d) => (!from || d >= from) && (!to || d <= to), PL_TYPES)
  const b = makeBuilder(ctx, data)

  const sales = b.line('sales', -1)
  const returns = b.line('sales_returns', -1)
  const discounts = b.line('sales_discounts', -1, { optional: true })
  const netSales = b.sub('صافي المبيعات', sales + returns + discounts)
  const services = b.line('service_revenue', -1)
  const receivablesRevenue = b.line('receivables_revenue', -1)
  const otherRevenue = b.line('other_revenue', -1)
  const revenue = b.sub('الإيرادات', netSales + services + receivablesRevenue + otherRevenue)
  const cogs = b.line('cogs', 1)
  const gross = b.sub('مجمل الربح', revenue - cogs)
  const selling = b.line('selling_expenses', 1)
  const admin = b.line('admin_expenses', 1)
  const expenses = b.sub('المصروفات', selling + admin)
  const beforeTax = b.sub('صافي الربح (الخسارة) قبل الضرائب', gross - expenses)
  const tax = b.line('income_tax', 1)
  b.sub('صافي الربح', beforeTax - tax)

  return { title: `قائمة الدخل ${from ?? ''} → ${to ?? ''}`, columns: COLUMNS, rows: b.rows }
}

export async function balanceSheetReport(to?: string, from?: string): Promise<ReportResult> {
  const ctx = await loadCtx()
  const entries = await buildLedger()
  const upTo = (d: string): boolean => !to || d <= to
  const data = collect(entries, ctx, upTo, BS_TYPES)
  const b = makeBuilder(ctx, data)

  // أرباح وخسائر الفترة: من بداية الفترة (لو اتحددت) لحد التاريخ، وأرباح اللي قبلها بتتضاف للأرباح المحتجزة
  const periodProfit = profitOf(entries, ctx, (d) => upTo(d) && (!from || d >= from))
  const priorProfit = from ? profitOf(entries, ctx, (d) => d < from && upTo(d)) : 0

  b.heading('الأصول')
  const fixedGross = b.line('fixed_assets', 1)
  const accumulated = b.line('accumulated_depreciation', 1)
  const netFixed = b.sub('صافي الأصول الثابتة', fixedGross + accumulated)
  let current = 0
  for (const key of ['cash_bank', 'receivables', 'vat_recoverable', 'inventory']) current += b.line(key, 1)
  current += b.line('other_current_assets', 1, { optional: true })
  const currentAssets = b.sub('الأصول المتداولة', current)
  b.sub('إجمالي الأصول', netFixed + currentAssets)

  b.heading('الخصوم')
  let liabilities = 0
  for (const key of ['suppliers', 'accrued_expenses', 'advances']) liabilities += b.line(key, -1)
  liabilities += b.line('vat_payable', -1, { optional: true })
  liabilities += b.line('other_current_liabilities', -1, { optional: true })
  const currentLiabilities = b.sub('الخصوم المتداولة', liabilities)

  b.heading('حقوق الملكية')
  const capital = b.line('capital', -1)
  const partners = b.line('partners_current', -1)
  b.rows.push({ item: 'أرباح وخسائر الفترة', code: '', amount: periodProfit })
  const retained = b.line('retained_earnings', -1, { extra: [{ name: 'أرباح الفترات السابقة', amount: priorProfit }] })
  const equity = b.sub('حقوق الملكية', capital + partners + periodProfit + retained)
  b.sub('إجمالي الخصوم وحقوق الملكية', currentLiabilities + equity)

  return {
    title: `الميزانية العمومية حتى ${to ?? 'اليوم'}${from ? ` (الفترة من ${from})` : ''}`,
    columns: COLUMNS,
    rows: b.rows,
    totals: undefined
  }
}
