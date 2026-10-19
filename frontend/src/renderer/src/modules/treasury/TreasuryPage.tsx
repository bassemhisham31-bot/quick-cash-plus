import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { confirmDialog } from '../../components/ConfirmDialogHost'
import { ReportView } from '../../components/ReportView'
import type {
  CashDifferenceRow,
  CustomerView,
  ExpenseCategory,
  ReportResult,
  Treasury,
  TreasuryKind,
  TreasuryTransferView,
  VendorView,
  VoucherPartyType,
  VoucherType,
  VoucherView
} from '../../../../shared/types'

type Tab = 'treasuries' | 'receipts' | 'payments' | 'transfers' | 'differences' | 'statement'

const TABS: { key: Tab; label: string }[] = [
  { key: 'treasuries', label: '🏦 الخزائن' },
  { key: 'receipts', label: '📥 سندات القبض' },
  { key: 'payments', label: '📤 سندات الصرف' },
  { key: 'transfers', label: '🔁 تحويلات' },
  { key: 'differences', label: '⚖️ فروقات الخزينة' },
  { key: 'statement', label: '📒 حركة الخزينة' }
]

const KIND_LABELS: Record<TreasuryKind, string> = { cash: 'نقدية', bank: 'بنك', wallet: 'محفظة' }
const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'cash', label: 'نقدًا' },
  { value: 'card', label: 'بنكي/فيزا' },
  { value: 'transfer', label: 'تحويل' },
  { value: 'wallet', label: 'محفظة' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'InstaPay' }
]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function TreasuryPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('treasuries')
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [treasuries, setTreasuries] = useState<Treasury[]>([])

  function refreshTreasuries(): void {
    window.api.treasury.list().then(setTreasuries)
  }
  useEffect(refreshTreasuries, [dataVersion])

  return (
    <div>
      <div className="qcp-page-header">
        <h1>الخزائن والسندات</h1>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} className={`qcp-btn ${tab === t.key ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'treasuries' && <TreasuriesTab treasuries={treasuries} onChanged={refreshTreasuries} />}
      {tab === 'receipts' && <VouchersTab type="receipt" treasuries={treasuries} />}
      {tab === 'payments' && <VouchersTab type="payment" treasuries={treasuries} />}
      {tab === 'transfers' && <TransfersTab treasuries={treasuries} />}
      {tab === 'differences' && <DifferencesTab />}
      {tab === 'statement' && <StatementTab treasuries={treasuries} />}
    </div>
  )
}

/* ------------------------------ الخزائن ------------------------------ */

function TreasuriesTab({ treasuries, onChanged }: { treasuries: Treasury[]; onChanged: () => void }): JSX.Element {
  const [editing, setEditing] = useState<Treasury | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const total = treasuries.filter((t) => t.active).reduce((s, t) => s + t.balance, 0)

  async function remove(t: Treasury): Promise<void> {
    if (!(await confirmDialog(`مسح الخزينة "${t.name}"؟`, { danger: true, confirmLabel: 'مسح' }))) return
    try {
      await window.api.treasury.delete(t.id)
      onChanged()
    } catch (e: any) {
      setError(e?.message ?? 'تعذر المسح')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div className="qcp-card" style={{ padding: '8px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)' }}>إجمالي أرصدة الخزائن النشطة</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{currency(total)}</div>
        </div>
        <button className="qcp-btn qcp-btn-primary" style={{ marginInlineStart: 'auto' }} onClick={() => setEditing('new')}>
          ➕ خزينة جديدة
        </button>
      </div>
      {error && <div className="rst-error" style={{ marginBottom: 10 }}>⚠️ {error}</div>}
      <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginTop: 0 }}>
        كل وسيلة دفع بتروح للخزينة المربوطة بيها تلقائيًا (المبيعات والمصروفات والتحصيل والمشتريات) — والوسيلة اللي مش مربوطة بخزينة بتروح للخزينة الافتراضية.
      </p>
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الخزينة</th>
              <th>النوع</th>
              <th>وسائل الدفع المربوطة</th>
              <th>رصيد أول المدة</th>
              <th>الرصيد الحالي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {treasuries.map((t) => (
              <tr key={t.id} style={{ opacity: t.active ? 1 : 0.55 }}>
                <td>
                  {t.name} {t.isDefault && <span className="qcp-pill accent">افتراضية</span>} {!t.active && <span className="qcp-pill">موقوفة</span>}
                </td>
                <td>{KIND_LABELS[t.kind]}</td>
                <td>{t.methods.map((m) => METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m).join('، ') || '—'}</td>
                <td>{currency(t.openingBalance)}</td>
                <td style={{ fontWeight: 800 }}>{currency(t.balance)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setEditing(t)}>
                    تعديل
                  </button>
                  {!t.isDefault && (
                    <button
                      className="qcp-btn qcp-btn-secondary"
                      style={{ padding: '4px 10px', marginInlineStart: 6 }}
                      onClick={async () => {
                        await window.api.treasury.setDefault(t.id)
                        onChanged()
                      }}
                    >
                      جعلها افتراضية
                    </button>
                  )}
                  {!t.isDefault && (
                    <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px', marginInlineStart: 6 }} onClick={() => remove(t)}>
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <TreasuryForm
          treasury={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function TreasuryForm({ treasury, onClose, onSaved }: { treasury: Treasury | null; onClose: () => void; onSaved: () => void }): JSX.Element {
  const [name, setName] = useState(treasury?.name ?? '')
  const [kind, setKind] = useState<TreasuryKind>(treasury?.kind ?? 'cash')
  const [opening, setOpening] = useState(String(treasury?.openingBalance ?? 0))
  const [methods, setMethods] = useState<string[]>(treasury?.methods ?? [])
  const [active, setActive] = useState(treasury?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  async function save(): Promise<void> {
    setError(null)
    const input = { name, kind, openingBalance: Number(opening) || 0, methods, active }
    try {
      if (treasury) await window.api.treasury.update(treasury.id, input)
      else await window.api.treasury.create(input)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'تعذر الحفظ')
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(520px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{treasury ? 'تعديل خزينة' : 'خزينة جديدة'}</h3>
        <div className="qcp-field">
          <label>الاسم</label>
          <input className="qcp-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="qcp-field">
            <label>النوع</label>
            <select className="qcp-select" value={kind} onChange={(e) => setKind(e.target.value as TreasuryKind)}>
              <option value="cash">نقدية</option>
              <option value="bank">بنك</option>
              <option value="wallet">محفظة</option>
            </select>
          </div>
          <div className="qcp-field">
            <label>رصيد أول المدة</label>
            <input className="qcp-input" type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </div>
        </div>
        <div className="qcp-field">
          <label>وسائل الدفع اللي بتتسجل في الخزينة دي تلقائيًا</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {METHOD_OPTIONS.map((m) => (
              <label key={m.value} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={methods.includes(m.value)}
                  onChange={(e) => setMethods(e.target.checked ? [...methods, m.value] : methods.filter((x) => x !== m.value))}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> نشطة
        </label>
        {error && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="qcp-btn qcp-btn-primary" style={{ flex: 2 }} onClick={save}>
            حفظ
          </button>
          <button className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ السندات ------------------------------ */

function VouchersTab({ type, treasuries }: { type: VoucherType; treasuries: Treasury[] }): JSX.Element {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [from, setFrom] = useState(daysAgoIso(30))
  const [to, setTo] = useState(todayIso())
  const [vouchers, setVouchers] = useState<VoucherView[]>([])
  const [showForm, setShowForm] = useState(false)

  function refresh(): void {
    window.api.treasury.listVouchers({ type, from: `${from} 00:00:00`, to: `${to} 23:59:59` }).then(setVouchers)
  }
  useEffect(refresh, [type, from, to, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(v: VoucherView): Promise<void> {
    if (!(await confirmDialog(`إلغاء السند ${v.number}؟ هيتعكس أثره على رصيد العميل/المورد.`, { danger: true, confirmLabel: 'إلغاء السند' }))) return
    await window.api.treasury.deleteVoucher(v.id)
    refresh()
  }

  const total = vouchers.reduce((s, v) => s + v.amount, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          من <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          إلى <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <strong>الإجمالي: {currency(total)}</strong>
        <button className="qcp-btn qcp-btn-primary" style={{ marginInlineStart: 'auto' }} onClick={() => setShowForm(true)}>
          ➕ {type === 'receipt' ? 'سند قبض جديد' : 'سند صرف جديد'}
        </button>
      </div>
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>رقم السند</th>
              <th>التاريخ</th>
              <th>الخزينة</th>
              <th>{type === 'receipt' ? 'مستلم من' : 'مصروف إلى'}</th>
              <th>البيان</th>
              <th>المبلغ</th>
              <th>المستخدم</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td>{v.number}</td>
                <td>{v.createdAt}</td>
                <td>{v.treasuryName}</td>
                <td>{v.partyName}</td>
                <td>{v.note ?? ''}</td>
                <td style={{ fontWeight: 700 }}>{currency(v.amount)}</td>
                <td>{v.userName ?? ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 8px' }} title="طباعة" onClick={() => window.api.treasury.printVoucher(v.id, false)}>
                    🖨
                  </button>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 8px', marginInlineStart: 4 }} title="معاينة" onClick={() => window.api.treasury.printVoucher(v.id, true)}>
                    👁
                  </button>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 8px', marginInlineStart: 4 }} title="إلغاء" onClick={() => remove(v)}>
                    🗑
                  </button>
                </td>
              </tr>
            ))}
            {!vouchers.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش سندات في الفترة دي
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {showForm && (
        <VoucherForm
          type={type}
          treasuries={treasuries.filter((t) => t.active)}
          onClose={() => setShowForm(false)}
          onSaved={(id) => {
            setShowForm(false)
            refresh()
            window.api.treasury.printVoucher(id, true)
          }}
        />
      )}
    </div>
  )
}

function VoucherForm({
  type,
  treasuries,
  onClose,
  onSaved
}: {
  type: VoucherType
  treasuries: Treasury[]
  onClose: () => void
  onSaved: (id: number) => void
}): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [treasuryId, setTreasuryId] = useState<number | ''>(treasuries.find((t) => t.isDefault)?.id ?? treasuries[0]?.id ?? '')
  const [partyType, setPartyType] = useState<VoucherPartyType>(type === 'receipt' ? 'customer' : 'vendor')
  const [partyId, setPartyId] = useState<number | ''>('')
  const [partyName, setPartyName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [vendors, setVendors] = useState<VendorView[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.customers.list('').then(setCustomers)
    window.api.vendors.list('').then(setVendors)
    window.api.expenses.listCategories().then(setCategories)
  }, [])

  async function save(): Promise<void> {
    if (!user || treasuryId === '') return
    setError(null)
    setBusy(true)
    try {
      const v = await window.api.treasury.createVoucher(
        {
          type,
          treasuryId,
          amount: Number(amount),
          partyType,
          partyId: partyType === 'other' ? null : partyId === '' ? null : partyId,
          partyName: partyType === 'other' ? partyName : undefined,
          categoryId: partyType === 'other' && type === 'payment' && categoryId !== '' ? categoryId : null,
          note
        },
        user.id
      )
      onSaved(v.id)
    } catch (e: any) {
      setError(e?.message ?? 'تعذر حفظ السند')
    } finally {
      setBusy(false)
    }
  }

  const partyTypes: { value: VoucherPartyType; label: string }[] =
    type === 'receipt'
      ? [
          { value: 'customer', label: 'تحصيل من عميل' },
          { value: 'other', label: 'إيراد آخر' }
        ]
      : [
          { value: 'vendor', label: 'سداد لمورد' },
          { value: 'other', label: 'مصروف' }
        ]

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(520px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{type === 'receipt' ? 'سند قبض جديد' : 'سند صرف جديد'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="qcp-field">
            <label>الخزينة</label>
            <select className="qcp-select" value={treasuryId} onChange={(e) => setTreasuryId(Number(e.target.value))}>
              {treasuries.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="qcp-field">
            <label>النوع</label>
            <select className="qcp-select" value={partyType} onChange={(e) => setPartyType(e.target.value as VoucherPartyType)}>
              {partyTypes.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {partyType === 'customer' && (
          <div className="qcp-field">
            <label>العميل</label>
            <select className="qcp-select" value={partyId} onChange={(e) => setPartyId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— اختار —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (عليه {currency(c.balance)})
                </option>
              ))}
            </select>
          </div>
        )}
        {partyType === 'vendor' && (
          <div className="qcp-field">
            <label>المورد</label>
            <select className="qcp-select" value={partyId} onChange={(e) => setPartyId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— اختار —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} (له {currency(v.balance)})
                </option>
              ))}
            </select>
          </div>
        )}
        {partyType === 'other' && (
          <div style={{ display: 'grid', gridTemplateColumns: type === 'payment' ? '1fr 1fr' : '1fr', gap: 10 }}>
            <div className="qcp-field">
              <label>{type === 'receipt' ? 'مستلم من / البيان' : 'مصروف إلى'}</label>
              <input className="qcp-input" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
            </div>
            {type === 'payment' && (
              <div className="qcp-field">
                <label>تصنيف المصروف</label>
                <select className="qcp-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— بدون —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="qcp-field">
          <label>المبلغ</label>
          <input className="qcp-input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 18, fontWeight: 800 }} />
        </div>
        <div className="qcp-field">
          <label>البيان / ملاحظة</label>
          <input className="qcp-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div className="rst-error">⚠️ {error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="qcp-btn qcp-btn-primary" style={{ flex: 2 }} disabled={busy} onClick={save}>
            💾 حفظ ومعاينة
          </button>
          <button className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ التحويلات ------------------------------ */

function TransfersTab({ treasuries }: { treasuries: Treasury[] }): JSX.Element {
  const user = useAppStore((s) => s.user)
  const dataVersion = useAppStore((s) => s.dataVersion)
  const active = treasuries.filter((t) => t.active)
  const [list, setList] = useState<TreasuryTransferView[]>([])
  const [fromId, setFromId] = useState<number | ''>('')
  const [toId, setToId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    window.api.treasury.listTransfers().then(setList)
  }
  useEffect(refresh, [dataVersion])

  async function save(): Promise<void> {
    if (!user || fromId === '' || toId === '') return
    setError(null)
    try {
      await window.api.treasury.createTransfer({ fromTreasuryId: fromId, toTreasuryId: toId, amount: Number(amount), note }, user.id)
      setAmount('')
      setNote('')
      refresh()
    } catch (e: any) {
      setError(e?.message ?? 'تعذر التحويل')
    }
  }

  return (
    <div>
      <div className="qcp-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: 10, alignItems: 'end', marginBottom: 14 }}>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>من خزينة</label>
          <select className="qcp-select" value={fromId} onChange={(e) => setFromId(Number(e.target.value))}>
            <option value="">— اختار —</option>
            {active.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({currency(t.balance)})
              </option>
            ))}
          </select>
        </div>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>إلى خزينة</label>
          <select className="qcp-select" value={toId} onChange={(e) => setToId(Number(e.target.value))}>
            <option value="">— اختار —</option>
            {active.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>المبلغ</label>
          <input className="qcp-input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="qcp-field" style={{ margin: 0, gridColumn: 'span 2' }}>
          <label>ملاحظة</label>
          <input className="qcp-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="qcp-btn qcp-btn-primary" onClick={save}>
          تحويل
        </button>
      </div>
      {error && <div className="rst-error" style={{ marginBottom: 10 }}>⚠️ {error}</div>}
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>من</th>
              <th>إلى</th>
              <th>المبلغ</th>
              <th>ملاحظة</th>
              <th>المستخدم</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td>{t.createdAt}</td>
                <td>{t.fromName}</td>
                <td>{t.toName}</td>
                <td style={{ fontWeight: 700 }}>{currency(t.amount)}</td>
                <td>{t.note ?? ''}</td>
                <td>{t.userName ?? ''}</td>
                <td>
                  <button
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '4px 8px' }}
                    onClick={async () => {
                      if (!(await confirmDialog('إلغاء التحويل ده؟', { danger: true, confirmLabel: 'إلغاء' }))) return
                      await window.api.treasury.deleteTransfer(t.id)
                      refresh()
                    }}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش تحويلات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------ فروقات الخزينة ------------------------------ */

function DifferencesTab(): JSX.Element {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [from, setFrom] = useState(daysAgoIso(30))
  const [to, setTo] = useState(todayIso())
  const [rows, setRows] = useState<CashDifferenceRow[]>([])

  useEffect(() => {
    window.api.treasury.listDifferences({ from: `${from} 00:00:00`, to: `${to} 23:59:59` }).then(setRows)
  }, [from, to, dataVersion])

  const shortage = rows.filter((r) => r.difference < 0).reduce((s, r) => s + r.difference, 0)
  const surplus = rows.filter((r) => r.difference > 0).reduce((s, r) => s + r.difference, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          من <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          إلى <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <strong style={{ color: 'var(--qcp-critical)' }}>إجمالي العجز: {currency(shortage)}</strong>
        <strong>إجمالي الزيادة: {currency(surplus)}</strong>
      </div>
      <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginTop: 0 }}>
        عند قفل اليوم، الفرق بين المتوقع (الافتتاحي + كل الحركات النقدية) والمجرود فعليًا بيتسجّل هنا تلقائيًا كعجز أو زيادة على الخزينة النقدية الافتراضية.
      </p>
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الوردية</th>
              <th>الخزينة</th>
              <th>المتوقع</th>
              <th>الفعلي</th>
              <th>الفرق</th>
              <th>النوع</th>
              <th>المستخدم</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.createdAt}</td>
                <td>#{r.sessionId}</td>
                <td>{r.treasuryName}</td>
                <td>{currency(r.expected)}</td>
                <td>{currency(r.actual)}</td>
                <td style={{ fontWeight: 800, color: r.difference < 0 ? 'var(--qcp-critical)' : undefined }}>{currency(r.difference)}</td>
                <td>{r.difference < 0 ? 'عجز' : 'زيادة'}</td>
                <td>{r.userName ?? ''}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش فروقات في الفترة دي
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------ حركة الخزينة ------------------------------ */

function StatementTab({ treasuries }: { treasuries: Treasury[] }): JSX.Element {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [treasuryId, setTreasuryId] = useState<number | ''>('')
  const [from, setFrom] = useState(daysAgoIso(30))
  const [to, setTo] = useState(todayIso())
  const [report, setReport] = useState<ReportResult | null>(null)

  useEffect(() => {
    window.api.treasury.statement(treasuryId === '' ? null : treasuryId, from, to).then(setReport)
  }, [treasuryId, from, to, dataVersion])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="qcp-select" style={{ width: 220 }} value={treasuryId} onChange={(e) => setTreasuryId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">كل الخزائن</option>
          {treasuries.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          من <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          إلى <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <ReportView report={report} />
    </div>
  )
}
