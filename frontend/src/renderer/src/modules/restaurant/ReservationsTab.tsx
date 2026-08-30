import { useEffect, useState } from 'react'
import type { ReservationStatus, RestaurantTable, TableReservation } from '../../../../shared/types'

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'مؤكد',
  seated: 'تم الجلوس',
  cancelled: 'ملغي',
  no_show: 'لم يحضر'
}

function nowLocalDatetime(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const emptyForm = { tableId: '', customerName: '', customerPhone: '', partySize: '2', reservationAt: nowLocalDatetime(), note: '' }

export function ReservationsTab(): JSX.Element {
  const [reservations, setReservations] = useState<TableReservation[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    window.api.reservations.list().then(setReservations)
    window.api.restaurant.listTables().then(setTables)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function submit(): Promise<void> {
    if (!form.customerName.trim()) return
    setError(null)
    try {
      await window.api.reservations.create({
        tableId: form.tableId ? Number(form.tableId) : null,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        partySize: Number(form.partySize) || 1,
        reservationAt: form.reservationAt.replace('T', ' '),
        note: form.note
      })
      setForm(emptyForm)
      setShowForm(false)
      refresh()
    } catch (err: any) {
      setError(err?.message ?? 'تعذر حفظ الحجز')
    }
  }

  async function setStatus(id: number, status: ReservationStatus): Promise<void> {
    await window.api.reservations.updateStatus(id, status)
    refresh()
  }

  const upcoming = reservations.filter((r) => r.status === 'confirmed')
  const others = reservations.filter((r) => r.status !== 'confirmed')

  function renderRow(r: TableReservation): JSX.Element {
    return (
      <tr key={r.id}>
        <td>{r.reservationAt}</td>
        <td>{r.customerName}</td>
        <td>{r.customerPhone ?? '—'}</td>
        <td>{r.partySize}</td>
        <td>{r.tableName ?? '— بدون تحديد —'}</td>
        <td>{r.note ?? '—'}</td>
        <td>
          <span className={`qcp-pill ${r.status === 'seated' ? 'success' : r.status === 'cancelled' || r.status === 'no_show' ? 'critical' : 'accent'}`}>
            {STATUS_LABELS[r.status]}
          </span>
        </td>
        <td>
          {r.status === 'confirmed' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setStatus(r.id, 'seated')}>
                تم الجلوس
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setStatus(r.id, 'no_show')}>
                لم يحضر
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setStatus(r.id, 'cancelled')}>
                إلغاء
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button type="button" className="qcp-btn qcp-btn-primary" onClick={() => setShowForm(true)}>
          + حجز جديد
        </button>
      </div>

      {error && (
        <div className="qcp-pill critical" style={{ marginBottom: 10, width: 'fit-content' }}>
          {error}
        </div>
      )}

      <div className="qcp-table-wrap" style={{ marginBottom: 24 }}>
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الموعد</th>
              <th>اسم العميل</th>
              <th>الهاتف</th>
              <th>عدد الأشخاص</th>
              <th>الترابيزة</th>
              <th>ملاحظة</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map(renderRow)}
            {!upcoming.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش حجوزات مؤكدة قادمة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {others.length > 0 && (
        <>
          <h3>حجوزات سابقة</h3>
          <div className="qcp-table-wrap">
            <table className="qcp-table">
              <thead>
                <tr>
                  <th>الموعد</th>
                  <th>اسم العميل</th>
                  <th>الهاتف</th>
                  <th>عدد الأشخاص</th>
                  <th>الترابيزة</th>
                  <th>ملاحظة</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>{others.map(renderRow)}</tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <div className="qcp-modal-backdrop" onClick={() => setShowForm(false)}>
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <h3 style={{ marginTop: 0 }}>حجز جديد</h3>
            <div className="qcp-field">
              <label>اسم العميل</label>
              <input className="qcp-input" required autoFocus value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </div>
            <div className="qcp-field">
              <label>رقم التليفون</label>
              <input className="qcp-input" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            </div>
            <div className="qcp-field">
              <label>عدد الأشخاص</label>
              <input className="qcp-input" type="number" min={1} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} />
            </div>
            <div className="qcp-field">
              <label>الموعد</label>
              <input className="qcp-input" type="datetime-local" value={form.reservationAt} onChange={(e) => setForm({ ...form, reservationAt: e.target.value })} />
            </div>
            <div className="qcp-field">
              <label>الترابيزة (اختياري)</label>
              <select className="qcp-select" value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
                <option value="">— بدون تحديد —</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="qcp-field">
              <label>ملاحظة</label>
              <input className="qcp-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }}>
                حفظ الحجز
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
