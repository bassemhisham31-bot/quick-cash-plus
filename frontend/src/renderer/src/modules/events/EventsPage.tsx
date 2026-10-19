import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { confirmDialog, alertDialog } from '../../components/ConfirmDialogHost'
import type {
  CustomerView,
  EventBooking,
  EventBookingInput,
  EventBookingStatus,
  EventPackage,
  EventPackageInput,
  PaymentMethod
} from '../../../../shared/types'

type Tab = 'bookings' | 'packages'

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'نقدًا' },
  { value: 'card', label: 'بنكي/فيزا' },
  { value: 'wallet', label: 'محفظة' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'InstaPay' }
]
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.value, m.label])) as Record<string, string>

const STATUS_LABEL: Record<EventBookingStatus, string> = { booked: 'محجوز', completed: 'تم التنفيذ', cancelled: 'ملغي' }
const STATUS_PILL: Record<EventBookingStatus, string> = { booked: 'accent', completed: 'success', cancelled: 'critical' }

const EVENT_TYPES = ['عيد ميلاد', 'خطوبة', 'حفلة', 'اجتماع', 'أخرى']

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EventsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('bookings')
  return (
    <div>
      <div className="qcp-page-header">
        <h1>🎂 حجوزات المناسبات</h1>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className={`qcp-btn ${tab === 'bookings' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab('bookings')}>
          📅 الحجوزات
        </button>
        <button className={`qcp-btn ${tab === 'packages' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab('packages')}>
          🎁 الباكدجات
        </button>
      </div>
      {tab === 'bookings' ? <BookingsTab /> : <PackagesTab />}
    </div>
  )
}

/* ------------------------------ الحجوزات ------------------------------ */

function BookingsTab(): JSX.Element {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [rows, setRows] = useState<EventBooking[]>([])
  const [status, setStatus] = useState<EventBookingStatus | 'all'>('booked')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EventBooking | 'new' | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  function refresh(): void {
    window.api.events
      .listBookings({ status: status === 'all' ? undefined : status, from: from || undefined, to: to || undefined })
      .then(setRows)
  }
  useEffect(refresh, [status, from, to, dataVersion])

  const shown = useMemo(() => {
    const q = search.trim()
    if (!q) return rows
    return rows.filter((r) => r.customerName.includes(q) || (r.customerPhone ?? '').includes(q) || r.number.includes(q) || (r.honoree ?? '').includes(q))
  }, [rows, search])

  const totalRemaining = shown.filter((r) => r.status === 'booked').reduce((s, r) => s + r.remaining, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>الحالة</label>
          <select className="qcp-select" value={status} onChange={(e) => setStatus(e.target.value as EventBookingStatus | 'all')}>
            <option value="all">الكل</option>
            <option value="booked">محجوز</option>
            <option value="completed">تم التنفيذ</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>من تاريخ</label>
          <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="qcp-field" style={{ margin: 0 }}>
          <label>إلى تاريخ</label>
          <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="qcp-field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
          <label>بحث</label>
          <input className="qcp-input" placeholder="اسم / موبايل / رقم الحجز" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="qcp-btn qcp-btn-primary" onClick={() => setEditing('new')}>
          + حجز جديد
        </button>
      </div>

      {status === 'booked' && shown.length > 0 && (
        <div style={{ marginBottom: 10, color: 'var(--qcp-ink-muted)', fontSize: 13 }}>
          {shown.length} حجز — إجمالي المتبقي تحصيله: <strong>{currency(totalRemaining)}</strong>
        </div>
      )}

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الموعد</th>
              <th>العميل</th>
              <th>المناسبة</th>
              <th>الأفراد</th>
              <th>الباكدج</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.number}</td>
                <td>
                  {r.eventDate} {r.eventTime ?? ''}
                </td>
                <td>
                  {r.customerName}
                  {r.customerPhone && <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>{r.customerPhone}</div>}
                </td>
                <td>
                  {r.eventType}
                  {r.honoree && <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>{r.honoree}</div>}
                </td>
                <td>{r.guests}</td>
                <td>{r.packageName ?? '—'}</td>
                <td>{currency(r.total)}</td>
                <td>{currency(r.paid)}</td>
                <td style={{ fontWeight: 700, color: r.remaining > 0.001 && r.status === 'booked' ? 'var(--qcp-critical, #dc2626)' : undefined }}>
                  {currency(r.remaining)}
                </td>
                <td>
                  <span className={`qcp-pill ${STATUS_PILL[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setOpenId(r.id)}>
                    فتح
                  </button>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش حجوزات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <BookingFormModal
          booking={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(b) => {
            setEditing(null)
            refresh()
            setOpenId(b.id)
          }}
        />
      )}
      {openId != null && (
        <BookingDetailModal
          bookingId={openId}
          onClose={() => {
            setOpenId(null)
            refresh()
          }}
          onEdit={(b) => {
            setOpenId(null)
            setEditing(b)
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------ نموذج الحجز ------------------------------ */

function BookingFormModal({
  booking,
  onClose,
  onSaved
}: {
  booking: EventBooking | null
  onClose: () => void
  onSaved: (b: EventBooking) => void
}): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [packages, setPackages] = useState<EventPackage[]>([])
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    customerId: booking?.customerId ?? null,
    customerName: booking?.customerName ?? '',
    customerPhone: booking?.customerPhone ?? '',
    eventType: booking?.eventType ?? 'عيد ميلاد',
    honoree: booking?.honoree ?? '',
    eventDate: booking?.eventDate ?? todayIso(),
    eventTime: booking?.eventTime ?? '',
    guests: String(booking?.guests ?? 10),
    packageId: booking?.packageId != null ? String(booking.packageId) : '',
    basePrice: String(booking?.basePrice ?? 0),
    discount: String(booking?.discount ?? 0),
    notes: booking?.notes ?? '',
    depositAmount: '',
    depositMethod: 'cash' as PaymentMethod
  })

  useEffect(() => {
    window.api.events.listPackages(false).then(setPackages)
    window.api.customers.list('').then(setCustomers)
  }, [])

  function applyPackage(packageId: string, guestsStr: string): void {
    const pkg = packages.find((p) => String(p.id) === packageId)
    const guests = Math.max(1, Number(guestsStr) || 1)
    setForm((f) => ({
      ...f,
      packageId,
      guests: guestsStr,
      basePrice: pkg ? String(pkg.priceType === 'per_person' ? pkg.price * guests : pkg.price) : f.basePrice
    }))
  }

  function pickCustomer(idStr: string): void {
    const c = customers.find((x) => String(x.id) === idStr)
    setForm((f) => ({
      ...f,
      customerId: c ? c.id : null,
      customerName: c ? c.name : f.customerName,
      customerPhone: c ? c.phone ?? '' : f.customerPhone
    }))
  }

  const base = Number(form.basePrice) || 0
  const discount = Math.min(base, Number(form.discount) || 0)
  const total = base - discount
  const deposit = Number(form.depositAmount) || 0

  async function submit(): Promise<void> {
    if (!user) return
    setErr(null)
    if (deposit > total + 0.001) {
      setErr('العربون أكبر من إجمالي الحجز')
      return
    }
    setBusy(true)
    try {
      const input: EventBookingInput = {
        id: booking?.id,
        customerId: form.customerId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        eventType: form.eventType,
        honoree: form.honoree,
        eventDate: form.eventDate,
        eventTime: form.eventTime || null,
        guests: Number(form.guests) || 1,
        packageId: form.packageId ? Number(form.packageId) : null,
        basePrice: base,
        discount,
        notes: form.notes,
        depositAmount: booking ? 0 : deposit,
        depositMethod: form.depositMethod
      }
      const saved = await window.api.events.saveBooking(input, user.id)
      onSaved(saved)
    } catch (e: any) {
      setErr(e?.message ?? 'تعذر حفظ الحجز')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <form
        className="qcp-modal"
        style={{ width: 'min(640px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h3 style={{ marginTop: 0 }}>{booking ? `تعديل الحجز ${booking.number}` : '🎂 حجز جديد'}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="qcp-field" style={{ gridColumn: '1 / -1' }}>
            <label>عميل مسجّل (اختياري)</label>
            <select className="qcp-select" value={form.customerId ?? ''} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">— عميل جديد / غير مسجّل —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` — ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="qcp-field">
            <label>اسم العميل</label>
            <input className="qcp-input" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </div>
          <div className="qcp-field">
            <label>الموبايل</label>
            <input className="qcp-input" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          </div>
          <div className="qcp-field">
            <label>نوع المناسبة</label>
            <select className="qcp-select" value={EVENT_TYPES.includes(form.eventType) ? form.eventType : 'أخرى'} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
              {EVENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="qcp-field">
            <label>صاحب المناسبة (اسم الطفل/المحتفى به)</label>
            <input className="qcp-input" value={form.honoree} onChange={(e) => setForm({ ...form, honoree: e.target.value })} />
          </div>
          <div className="qcp-field">
            <label>تاريخ المناسبة</label>
            <input className="qcp-input" type="date" required value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
          </div>
          <div className="qcp-field">
            <label>الساعة</label>
            <input className="qcp-input" type="time" value={form.eventTime} onChange={(e) => setForm({ ...form, eventTime: e.target.value })} />
          </div>
          <div className="qcp-field">
            <label>عدد الأفراد</label>
            <input className="qcp-input" type="number" min={1} value={form.guests} onChange={(e) => applyPackage(form.packageId, e.target.value)} />
          </div>
          <div className="qcp-field">
            <label>الباكدج</label>
            <select className="qcp-select" value={form.packageId} onChange={(e) => applyPackage(e.target.value, form.guests)}>
              <option value="">— بدون باكدج (سعر يدوي) —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {currency(p.price)}
                  {p.priceType === 'per_person' ? ' / فرد' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="qcp-field">
            <label>السعر</label>
            <input className="qcp-input" type="number" min={0} value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} />
          </div>
          <div className="qcp-field">
            <label>خصم</label>
            <input className="qcp-input" type="number" min={0} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </div>
          <div className="qcp-field" style={{ gridColumn: '1 / -1' }}>
            <label>ملاحظات (تورتة، ديكور، طلبات خاصة…)</label>
            <input className="qcp-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="rst-change" style={{ margin: '8px 0' }}>
          <span>إجمالي الحجز</span>
          <span>{currency(total)}</span>
        </div>

        {!booking && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="qcp-field">
              <label>العربون (اختياري — بيدخل الخزينة)</label>
              <input className="qcp-input" type="number" min={0} value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} />
            </div>
            <div className="qcp-field">
              <label>طريقة دفع العربون</label>
              <select className="qcp-select" value={form.depositMethod} onChange={(e) => setForm({ ...form, depositMethod: e.target.value as PaymentMethod })}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {deposit > 0 && (
              <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--qcp-ink-muted)' }}>
                المتبقي بعد العربون: <strong>{currency(Math.max(0, total - deposit))}</strong>
              </div>
            )}
          </div>
        )}

        {err && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }} disabled={busy}>
            {busy ? '...جاري الحفظ' : 'حفظ الحجز'}
          </button>
          <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------ تفاصيل الحجز والدفعات ------------------------------ */

function BookingDetailModal({
  bookingId,
  onClose,
  onEdit
}: {
  bookingId: number
  onClose: () => void
  onEdit: (b: EventBooking) => void
}): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [b, setB] = useState<EventBooking | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function load(): void {
    window.api.events.getBooking(bookingId).then(setB)
  }
  useEffect(load, [bookingId])

  async function pay(sign: 1 | -1): Promise<void> {
    if (!user || !b) return
    setErr(null)
    const value = Number(amount)
    if (!(value > 0)) {
      setErr('اكتب المبلغ')
      return
    }
    setBusy(true)
    try {
      const updated = await window.api.events.addPayment(b.id, sign * value, method, note || null, user.id)
      setB(updated)
      setAmount('')
      setNote('')
    } catch (e: any) {
      setErr(e?.message ?? 'تعذر تسجيل الدفعة')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(status: EventBookingStatus): Promise<void> {
    if (!b) return
    if (status === 'completed' && b.remaining > 0.001) {
      const ok = await confirmDialog(`لسه متبقي ${currency(b.remaining)} على الحجز. تأكيد التنفيذ من غير تحصيله؟`, { confirmLabel: 'تأكيد التنفيذ' })
      if (!ok) return
    }
    if (status === 'cancelled') {
      const msg =
        b.paid > 0.001
          ? `الحجز مدفوع منه ${currency(b.paid)}. بعد الإلغاء سجّل الاسترداد (لو هيتردّ) قبل ما تقفل. تأكيد الإلغاء؟`
          : 'تأكيد إلغاء الحجز؟'
      if (!(await confirmDialog(msg, { confirmLabel: 'إلغاء الحجز', danger: true }))) return
    }
    try {
      setB(await window.api.events.setStatus(b.id, status))
    } catch (e: any) {
      setErr(e?.message ?? 'تعذر تغيير الحالة')
    }
  }

  async function print(preview: boolean): Promise<void> {
    if (!b) return
    const res = await window.api.events.print(b.id, preview)
    if (!res.ok) await alertDialog(res.error ?? 'تعذرت الطباعة')
  }

  if (!b) return <div className="qcp-modal-backdrop" onClick={onClose} />

  const canPay = b.status !== 'cancelled'
  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(620px, 96vw)', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>
            {b.eventType} — {b.number}
          </h3>
          <span className={`qcp-pill ${STATUS_PILL[b.status]}`}>{STATUS_LABEL[b.status]}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', margin: '12px 0', fontSize: 14 }}>
          <div>العميل: <strong>{b.customerName}</strong></div>
          <div>الموبايل: {b.customerPhone ?? '—'}</div>
          <div>الموعد: <strong>{b.eventDate} {b.eventTime ?? ''}</strong></div>
          <div>عدد الأفراد: {b.guests}</div>
          {b.honoree && <div>صاحب المناسبة: {b.honoree}</div>}
          <div>الباكدج: {b.packageName ?? '—'}</div>
          {b.notes && <div style={{ gridColumn: '1 / -1' }}>ملاحظات: {b.notes}</div>}
        </div>

        <div className="rst-change" style={{ margin: '4px 0' }}>
          <span>الإجمالي{b.discount > 0 ? ` (بعد خصم ${currency(b.discount)})` : ''}</span>
          <span>{currency(b.total)}</span>
        </div>
        <div className="rst-change" style={{ margin: '4px 0' }}>
          <span>المدفوع</span>
          <span>{currency(b.paid)}</span>
        </div>
        <div className={`rst-change ${b.remaining > 0.001 ? 'due' : ''}`} style={{ margin: '4px 0' }}>
          <span>المتبقي</span>
          <span>{currency(b.remaining)}</span>
        </div>

        <h4 style={{ margin: '14px 0 6px' }}>الدفعات</h4>
        <div className="qcp-table-wrap">
          <table className="qcp-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الطريقة</th>
                <th>المبلغ</th>
                <th>بيان</th>
                <th>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {b.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.createdAt.slice(0, 16)}</td>
                  <td>{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td style={{ color: p.amount < 0 ? 'var(--qcp-critical, #dc2626)' : undefined, fontWeight: 700 }}>{currency(p.amount)}</td>
                  <td>{p.note ?? '—'}</td>
                  <td>{p.userName ?? '—'}</td>
                </tr>
              ))}
              {!b.payments.length && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    لا توجد دفعات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {canPay && (
          <div style={{ marginTop: 12, padding: 10, border: '1px dashed var(--qcp-border)', borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div className="qcp-field" style={{ margin: 0 }}>
                <label>المبلغ</label>
                <input className="qcp-input" type="number" min={0} value={amount} placeholder={b.remaining > 0 ? String(b.remaining) : ''} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="qcp-field" style={{ margin: 0 }}>
                <label>الطريقة</label>
                <select className="qcp-select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="qcp-field" style={{ margin: 0 }}>
                <label>بيان (اختياري)</label>
                <input className="qcp-input" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="qcp-btn qcp-btn-primary" disabled={busy} onClick={() => pay(1)}>
                💰 تسجيل دفعة (تدخل الخزينة)
              </button>
              {b.paid > 0 && (
                <button className="qcp-btn qcp-btn-secondary" disabled={busy} onClick={() => pay(-1)}>
                  ↩️ استرداد للعميل
                </button>
              )}
              {b.remaining > 0.001 && (
                <button className="qcp-btn qcp-btn-secondary" onClick={() => setAmount(String(b.remaining))}>
                  المتبقي كله
                </button>
              )}
            </div>
          </div>
        )}

        {err && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => print(false)}>
            🖨️ طباعة
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => print(true)}>
            👁️ معاينة
          </button>
          {b.status === 'booked' && (
            <>
              <button className="qcp-btn qcp-btn-secondary" onClick={() => onEdit(b)}>
                ✏️ تعديل
              </button>
              <button className="qcp-btn qcp-btn-primary" onClick={() => changeStatus('completed')}>
                ✅ تم التنفيذ
              </button>
              <button className="qcp-btn qcp-btn-secondary" onClick={() => changeStatus('cancelled')}>
                ✖ إلغاء الحجز
              </button>
            </>
          )}
          <button className="qcp-btn qcp-btn-secondary" style={{ marginInlineStart: 'auto' }} onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ الباكدجات ------------------------------ */

function PackagesTab(): JSX.Element {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [rows, setRows] = useState<EventPackage[]>([])
  const [editing, setEditing] = useState<EventPackage | 'new' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function refresh(): void {
    window.api.events.listPackages(true).then(setRows)
  }
  useEffect(refresh, [dataVersion])

  async function remove(p: EventPackage): Promise<void> {
    if (!(await confirmDialog(`حذف الباكدج "${p.name}"؟ (الحجوزات القديمة مش هتتأثر)`, { danger: true, confirmLabel: 'حذف' }))) return
    await window.api.events.deletePackage(p.id)
    refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="qcp-btn qcp-btn-primary" onClick={() => setEditing('new')}>
          + باكدج جديد
        </button>
      </div>
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الوصف / المحتويات</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.description ?? '—'}</td>
                <td>
                  {currency(p.price)}
                  {p.priceType === 'per_person' ? ' / فرد' : ''}
                </td>
                <td>
                  <span className={`qcp-pill ${p.isActive ? 'success' : 'critical'}`}>{p.isActive ? 'متاح' : 'موقوف'}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setEditing(p)}>
                      تعديل
                    </button>
                    <button className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => remove(p)}>
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش باكدجات — ضيف أول باكدج
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {err && <div className="rst-error">⚠️ {err}</div>}
      {editing && (
        <PackageModal
          pkg={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
          onError={setErr}
        />
      )}
    </div>
  )
}

function PackageModal({
  pkg,
  onClose,
  onSaved,
  onError
}: {
  pkg: EventPackage | null
  onClose: () => void
  onSaved: () => void
  onError: (m: string | null) => void
}): JSX.Element {
  const [form, setForm] = useState({
    name: pkg?.name ?? '',
    description: pkg?.description ?? '',
    price: String(pkg?.price ?? 0),
    priceType: (pkg?.priceType ?? 'fixed') as 'fixed' | 'per_person',
    isActive: pkg?.isActive ?? true
  })
  const [err, setErr] = useState<string | null>(null)

  async function submit(): Promise<void> {
    setErr(null)
    onError(null)
    const input: EventPackageInput = {
      id: pkg?.id,
      name: form.name,
      description: form.description,
      price: Number(form.price) || 0,
      priceType: form.priceType,
      isActive: form.isActive
    }
    try {
      await window.api.events.upsertPackage(input)
      onSaved()
    } catch (e: any) {
      setErr(e?.message ?? 'تعذر الحفظ')
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <form
        className="qcp-modal"
        style={{ width: 'min(480px, 94vw)' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h3 style={{ marginTop: 0 }}>{pkg ? 'تعديل باكدج' : 'باكدج جديد'}</h3>
        <div className="qcp-field">
          <label>اسم الباكدج</label>
          <input className="qcp-input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="qcp-field">
          <label>المحتويات / الوصف</label>
          <textarea className="qcp-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="qcp-field">
            <label>السعر</label>
            <input className="qcp-input" type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="qcp-field">
            <label>طريقة التسعير</label>
            <select className="qcp-select" value={form.priceType} onChange={(e) => setForm({ ...form, priceType: e.target.value as 'fixed' | 'per_person' })}>
              <option value="fixed">سعر ثابت للحجز</option>
              <option value="per_person">السعر × عدد الأفراد</option>
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          متاح للحجز
        </label>
        {err && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }}>
            حفظ
          </button>
          <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}
