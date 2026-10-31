import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { hasPermission } from '../../lib/permissions'
import { formatCurrency as currency } from '../../lib/currency'
import { confirmDialog } from '../../components/ConfirmDialogHost'
import { ReportView } from '../../components/ReportView'
import type { ReportResult, Warehouse } from '../../../../shared/types'

/** نفس قايمة main/services/accountingReports.ts (ACCOUNTING_REPORTS) — بتتحمّل من الـmain */
interface ReportDef {
  type: string
  icon: string
  label: string
  needsWarehouse?: boolean
  noDates?: boolean
  needsAccount?: boolean
}

interface AccountDef {
  code: string
  name: string
  type: string
  isSystem: boolean
  active: boolean
  /** الحركات المربوطة بالحساب ده (الشجرة المبسّطة) */
  roles?: string[]
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  cogs: 'تكلفة مبيعات',
  expense: 'مصروفات'
}

type Tab = 'reports' | 'entries' | 'accounts'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function monthStartIso(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
}

export function AccountingPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('reports')
  const user = useAppStore((s) => s.user)
  const canManage = hasPermission(user, 'accounting.manage')

  return (
    <div>
      <div className="qcp-page-header">
        <h1>التقارير المحاسبية ودفتر القيود</h1>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(
          [
            ['reports', '📊 التقارير والقوائم'],
            ['entries', '📝 القيود اليدوية'],
            ['accounts', '🗂 شجرة الحسابات']
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} className={`qcp-btn ${tab === key ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'reports' && <ReportsTab />}
      {tab === 'entries' && <EntriesTab canManage={canManage} />}
      {tab === 'accounts' && <AccountsTab canManage={canManage} />}
    </div>
  )
}

/* ------------------------------ التقارير ------------------------------ */

function ReportsTab(): JSX.Element {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [defs, setDefs] = useState<ReportDef[]>([])
  const [type, setType] = useState('trial_balance')
  const [from, setFrom] = useState(monthStartIso())
  const [to, setTo] = useState(todayIso())
  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [accountCode, setAccountCode] = useState('1200')
  const [accounts, setAccounts] = useState<AccountDef[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [report, setReport] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.accounting.listReports().then(setDefs)
    window.api.catalog.listWarehouses().then(setWarehouses)
    window.api.ledger.listAccounts().then((a) => {
      setAccounts(a)
      // الشجرة المبسّطة مفيهاش 1200 — لو الكود الحالي مش موجود نختار أول حساب
      setAccountCode((c) => (a.some((x) => x.code === c) ? c : (a[0]?.code ?? c)))
    })
  }, [])

  const def = defs.find((d) => d.type === type)
  // الميزانية بتاخد تاريخ النهاية بس
  const showFrom = !def?.noDates && type !== 'balance_sheet'

  useEffect(() => {
    setLoading(true)
    window.api.accounting
      .run(type, {
        from: def?.noDates || type === 'balance_sheet' ? undefined : from,
        to: def?.noDates ? undefined : to,
        warehouseId: warehouseId === '' ? null : warehouseId,
        accountCode
      })
      .then(setReport)
      .finally(() => setLoading(false))
  }, [type, from, to, warehouseId, accountCode, dataVersion, def?.noDates])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 16, alignItems: 'start' }}>
      <div className="qcp-card" style={{ padding: 8, display: 'grid', gap: 4 }}>
        {defs.map((d) => (
          <button
            key={d.type}
            className={`qcp-btn ${type === d.type ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
            style={{ textAlign: 'start', justifyContent: 'flex-start' }}
            onClick={() => setType(d.type)}
          >
            {d.icon} {d.label}
          </button>
        ))}
        <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', margin: '8px 6px 0' }}>
          القيود بتتولّد تلقائيًا من الفواتير والسندات والمصروفات والتحصيلات والتحويلات وفروقات الخزينة — مفيش حاجة بتتكتب مرتين. تقارير أخرى (ضرائب، كشف حساب عميل/مورد، حركة مخزون) في شاشة "التقارير"، وحركة الخزائن في "الخزائن والسندات".
        </p>
      </div>
      <div>
        <div className="qcp-card" style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {showFrom && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              من <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
          )}
          {!def?.noDates && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              {type === 'balance_sheet' ? 'حتى' : 'إلى'} <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          )}
          {def?.needsAccount && (
            <select className="qcp-select" style={{ width: 280 }} value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          )}
          {def?.needsWarehouse && (
            <select className="qcp-select" style={{ width: 200 }} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">كل المخازن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          {def?.noDates && !def.needsWarehouse && <span style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>التقرير ده بالأرصدة الحالية</span>}
          {loading && <span style={{ fontSize: 12.5 }}>⏳ جاري التحميل...</span>}
        </div>
        <ReportView report={report} />
      </div>
    </div>
  )
}

/* ------------------------------ القيود اليدوية ------------------------------ */

interface EntryLine {
  code: string
  debit: string
  credit: string
  memo: string
}

function EntriesTab({ canManage }: { canManage: boolean }): JSX.Element {
  const user = useAppStore((s) => s.user)
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [list, setList] = useState<{ id: number; date: string; description: string; debit: number }[]>([])
  const [accounts, setAccounts] = useState<AccountDef[]>([])
  const [date, setDate] = useState(todayIso())
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<EntryLine[]>([
    { code: '', debit: '', credit: '', memo: '' },
    { code: '', debit: '', credit: '', memo: '' }
  ])
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    window.api.ledger.listEntries().then(setList)
  }
  useEffect(() => {
    refresh()
    window.api.ledger.listAccounts().then((a) => setAccounts(a.filter((x) => x.active)))
  }, [dataVersion])

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balancedNow = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0

  function setLine(i: number, patch: Partial<EntryLine>): void {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function save(): Promise<void> {
    if (!user) return
    setError(null)
    try {
      await window.api.ledger.createEntry(
        {
          date,
          description,
          lines: lines.map((l) => ({ code: l.code, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo }))
        },
        user.id
      )
      setDescription('')
      setLines([
        { code: '', debit: '', credit: '', memo: '' },
        { code: '', debit: '', credit: '', memo: '' }
      ])
      refresh()
    } catch (e: any) {
      setError(e?.message ?? 'تعذر حفظ القيد')
    }
  }

  return (
    <div>
      {canManage && (
        <div className="qcp-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>قيد يومية جديد</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, marginBottom: 10 }}>
            <input className="qcp-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="qcp-input" placeholder="بيان القيد" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 120px 120px 1fr auto', gap: 8, marginBottom: 6 }}>
              <select className="qcp-select" value={l.code} onChange={(e) => setLine(i, { code: e.target.value })}>
                <option value="">— الحساب —</option>
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
              <input className="qcp-input" type="number" min={0} placeholder="مدين" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
              <input className="qcp-input" type="number" min={0} placeholder="دائن" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
              <input className="qcp-input" placeholder="ملاحظة" value={l.memo} onChange={(e) => setLine(i, { memo: e.target.value })} />
              <button className="qcp-btn qcp-btn-secondary" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <button className="qcp-btn qcp-btn-secondary" onClick={() => setLines([...lines, { code: '', debit: '', credit: '', memo: '' }])}>
              ➕ سطر
            </button>
            <strong>مدين {currency(totalDebit)}</strong>
            <strong>دائن {currency(totalCredit)}</strong>
            <span style={{ color: balancedNow ? 'inherit' : 'var(--qcp-critical)' }}>{balancedNow ? '✓ متوازن' : 'غير متوازن'}</span>
            <button className="qcp-btn qcp-btn-primary" style={{ marginInlineStart: 'auto' }} disabled={!balancedNow} onClick={save}>
              💾 حفظ القيد
            </button>
          </div>
          {error && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {error}</div>}
        </div>
      )}
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>رقم القيد</th>
              <th>التاريخ</th>
              <th>البيان</th>
              <th>المبلغ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td>JV-{String(e.id).padStart(5, '0')}</td>
                <td>{e.date.slice(0, 10)}</td>
                <td>{e.description}</td>
                <td>{currency(e.debit)}</td>
                <td>
                  {canManage && (
                    <button
                      className="qcp-btn qcp-btn-secondary"
                      style={{ padding: '4px 8px' }}
                      onClick={async () => {
                        if (!(await confirmDialog('مسح القيد ده؟', { danger: true, confirmLabel: 'مسح' }))) return
                        await window.api.ledger.deleteEntry(e.id)
                        refresh()
                      }}
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش قيود يدوية — القيود التلقائية بتظهر في "دفتر اليومية"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------ شجرة الحسابات ------------------------------ */

interface RoleDef {
  role: string
  label: string
  type: string
  accountCode: string
  defaultCode: string
}

function AccountsTab({ canManage }: { canManage: boolean }): JSX.Element {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [accounts, setAccounts] = useState<AccountDef[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [custom, setCustom] = useState(false)
  const [showRoles, setShowRoles] = useState(false)
  /** null = إضافة حساب جديد، غير كده = كود الحساب اللي بيتعدّل */
  const [editing, setEditing] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('expense')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function refresh(): void {
    window.api.ledger.listAccounts().then(setAccounts)
    window.api.ledger.listAccountRoles().then((r) => {
      setCustom(r.custom)
      setRoles(r.roles)
    })
  }
  useEffect(refresh, [dataVersion])

  function resetForm(): void {
    setEditing(null)
    setCode('')
    setName('')
    setType('expense')
  }

  async function save(): Promise<void> {
    setError(null)
    setMessage(null)
    try {
      if (editing === null) {
        await window.api.ledger.createAccount({ code, name, type })
        setMessage('تم إضافة الحساب')
      } else {
        await window.api.ledger.updateAccount(editing, { code, name, type })
        setMessage('تم حفظ التعديل')
      }
      resetForm()
      refresh()
    } catch (e: any) {
      setError(e?.message ?? (editing === null ? 'تعذر إضافة الحساب' : 'تعذر حفظ التعديل'))
    }
  }

  async function remove(a: AccountDef): Promise<void> {
    setError(null)
    setMessage(null)
    if (!(await confirmDialog(`مسح الحساب ${a.code} — ${a.name}؟`, { danger: true, confirmLabel: 'مسح' }))) return
    try {
      await window.api.ledger.deleteAccount(a.code)
      if (editing === a.code) resetForm()
      setMessage('تم مسح الحساب')
      refresh()
    } catch (e: any) {
      setError(e?.message ?? 'تعذر مسح الحساب')
    }
  }

  async function mapRole(role: string, accountCode: string): Promise<void> {
    setError(null)
    setMessage(null)
    try {
      await window.api.ledger.setAccountRoles({ [role]: accountCode })
      setMessage('تم تغيير الربط — التقارير بتتحسب على الحساب الجديد (القديم والجديد)')
      refresh()
    } catch (e: any) {
      setError(e?.message ?? 'تعذر تغيير الربط')
    }
  }

  return (
    <div>
      {canManage && (
        <div className="qcp-card" style={{ display: 'grid', gridTemplateColumns: '140px 1fr 180px auto', gap: 10, marginBottom: 14, alignItems: 'end' }}>
          <div className="qcp-field" style={{ margin: 0 }}>
            <label>كود الحساب</label>
            <input className="qcp-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: 1100" />
          </div>
          <div className="qcp-field" style={{ margin: 0 }}>
            <label>اسم الحساب</label>
            <input className="qcp-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="qcp-field" style={{ margin: 0 }}>
            <label>النوع</label>
            <select className="qcp-select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="qcp-btn qcp-btn-primary" onClick={save}>
              {editing === null ? '➕ إضافة' : '💾 حفظ التعديل'}
            </button>
            {editing !== null && (
              <button className="qcp-btn qcp-btn-secondary" onClick={resetForm}>
                إلغاء
              </button>
            )}
          </div>
        </div>
      )}
      {error && <div className="rst-error" style={{ marginBottom: 10 }}>⚠️ {error}</div>}
      {message && <div className="qcp-pill success" style={{ marginBottom: 10 }}>{message}</div>}
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الحساب</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.code} style={{ opacity: a.active ? 1 : 0.5, background: editing === a.code ? 'var(--qcp-accent-soft)' : undefined }}>
                <td>{a.code}</td>
                <td>{a.name}</td>
                <td>{TYPE_LABELS[a.type] ?? a.type}</td>
                <td>
                  {a.isSystem ? 'حساب نظام' : a.active ? 'نشط' : 'موقوف'}
                  {!!a.roles?.length && <span title="مربوط بحركات النظام (من ربط حسابات النظام)"> 🔗</span>}
                </td>
                <td>
                  {canManage && !a.isSystem && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="qcp-btn qcp-btn-secondary"
                        style={{ padding: '4px 8px' }}
                        title="تعديل"
                        onClick={() => {
                          setEditing(a.code)
                          setCode(a.code)
                          setName(a.name)
                          setType(a.type)
                          setError(null)
                          setMessage(null)
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="qcp-btn qcp-btn-secondary"
                        style={{ padding: '4px 8px' }}
                        onClick={async () => {
                          await window.api.ledger.setAccountActive(a.code, !a.active)
                          refresh()
                        }}
                      >
                        {a.active ? 'إيقاف' : 'تفعيل'}
                      </button>
                      <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 8px' }} title="مسح" onClick={() => remove(a)}>
                        🗑
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!accounts.length && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش حسابات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {custom && canManage && (
        <div className="qcp-card" style={{ marginTop: 16 }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => setShowRoles((v) => !v)}>
            🔗 ربط حسابات النظام {showRoles ? '▲' : '▼'}
          </button>
          <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', margin: '8px 0 0' }}>
            بيحدد كل نوع حركة في النظام (مبيعات، عملاء، مخزون، خزائن...) بيتسجّل على أنهي حساب في الشجرة. الافتراضي هو الحسابات الأساسية السبعة؛ لو أضفت حسابات فرعية (مثلًا 5100 خزينة) اربط الحركة بيها من هنا. شراء الأصول (معدات، أجهزة، سيارات) بيتسجّل على "الأصول الثابتة" من تصنيف المصروف "شراء أصول ثابتة" في المصروفات أو سند الصرف، وأي حساب أصل كوده يبدأ زيها (4100، 4200...) بيظهر تحت "الأصول الثابتة" في الميزانية. الحساب المربوط مينفعش يتمسح.
          </p>
          {showRoles && (
            <div className="qcp-table-wrap" style={{ marginTop: 10 }}>
              <table className="qcp-table">
                <thead>
                  <tr>
                    <th>الحركة</th>
                    <th>الحساب المربوط</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.role}>
                      <td>{r.label}</td>
                      <td>
                        <select className="qcp-select" style={{ width: 300 }} value={r.accountCode} onChange={(e) => mapRole(r.role, e.target.value)}>
                          {accounts
                            .filter((a) => a.type === r.type && (a.active || a.code === r.accountCode))
                            .map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.code} — {a.name}
                              </option>
                            ))}
                          {!accounts.some((a) => a.code === r.accountCode) && <option value={r.accountCode}>{r.accountCode}</option>}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
