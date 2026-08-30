import { useEffect, useState } from 'react'
import { formatCurrency as currency } from '../../lib/currency'
import type { DeliveryDriver, DeliveryOrderListRow, DeliveryStatus, DeliveryZone } from '../../../../shared/types'

type Tab = 'requests' | 'drivers' | 'zones'

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'قيد التحضير',
  with_driver: 'مع الطيار',
  delivered: 'تم التسليم'
}
const STATUS_FLOW: Record<DeliveryStatus, DeliveryStatus | null> = {
  pending: 'with_driver',
  with_driver: 'delivered',
  delivered: null
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function DeliveryPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('requests')

  return (
    <div>
      <div className="qcp-page-header">
        <h1>التوصيل والطيارين</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button
          type="button"
          className={`qcp-btn ${tab === 'requests' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('requests')}
        >
          📋 طلبات التوصيل والتسوية
        </button>
        <button
          type="button"
          className={`qcp-btn ${tab === 'drivers' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('drivers')}
        >
          🧑‍✈️ إدارة الطيارين
        </button>
        <button
          type="button"
          className={`qcp-btn ${tab === 'zones' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('zones')}
        >
          📍 مناطق التوصيل ورسومها
        </button>
      </div>

      {tab === 'requests' && <RequestsTab />}
      {tab === 'drivers' && <DriversTab />}
      {tab === 'zones' && <ZonesTab />}
    </div>
  )
}

function RequestsTab(): JSX.Element {
  const [orders, setOrders] = useState<DeliveryOrderListRow[]>([])
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([])
  const [from, setFrom] = useState(daysAgoIso(7))
  const [to, setTo] = useState(todayIso())

  function refresh(): void {
    window.api.delivery.listOrders({ from: from ? `${from} 00:00:00` : undefined, to: to ? `${to} 23:59:59` : undefined }).then(setOrders)
    window.api.settings.listDeliveryDrivers().then(setDrivers)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  async function advanceStatus(row: DeliveryOrderListRow): Promise<void> {
    const next = STATUS_FLOW[row.deliveryStatus]
    if (!next) return
    await window.api.delivery.updateStatus(row.invoiceId, next)
    refresh()
  }

  async function changeDriver(invoiceId: number, value: string): Promise<void> {
    await window.api.delivery.reassignDriver(invoiceId, value ? Number(value) : null)
    refresh()
  }

  const activeCount = orders.filter((o) => o.deliveryStatus !== 'delivered').length
  const deliveredCount = orders.filter((o) => o.deliveryStatus === 'delivered').length
  const totalFees = orders.filter((o) => o.deliveryStatus === 'delivered').reduce((s, o) => s + o.deliveryFee, 0)

  return (
    <>
      <div className="qcp-grid qcp-grid-3" style={{ marginBottom: 18 }}>
        <div className="qcp-card">
          <div className="qcp-icon-badge orange">🛵</div>
          <div className="qcp-kpi-value">{activeCount}</div>
          <div className="qcp-kpi-label">الطلبات الجارية حاليًا</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge blue">✅</div>
          <div className="qcp-kpi-value">
            {deliveredCount} <span style={{ fontSize: 13, color: 'var(--qcp-ink-faint)' }}>من إجمالي {orders.length} طلب</span>
          </div>
          <div className="qcp-kpi-label">عدد الطلبات المسلّمة</div>
        </div>
        <div className="qcp-card">
          <div className="qcp-icon-badge pink">💰</div>
          <div className="qcp-kpi-value">{currency(totalFees)}</div>
          <div className="qcp-kpi-label">إجمالي عمولات التوصيل (للطلبات المسلّمة)</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
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
              <th>الفاتورة</th>
              <th>المستلم</th>
              <th>العنوان</th>
              <th>الهاتف</th>
              <th>رسوم التوصيل</th>
              <th>الإجمالي الكلي</th>
              <th>الحالة</th>
              <th>تحديث الحالة</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.invoiceId}>
                <td>{o.invoiceNumber}</td>
                <td>{o.customerName}</td>
                <td>{o.deliveryAddress ?? '—'}</td>
                <td>{o.customerPhone ?? '—'}</td>
                <td>{currency(o.deliveryFee)}</td>
                <td>{currency(o.total)}</td>
                <td>
                  <span className={`qcp-pill ${o.deliveryStatus === 'delivered' ? 'success' : 'accent'}`}>
                    {STATUS_LABELS[o.deliveryStatus]}
                  </span>
                  <div style={{ marginTop: 4 }}>
                    <select
                      className="qcp-select"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      value={o.driverId ?? ''}
                      onChange={(e) => changeDriver(o.invoiceId, e.target.value)}
                    >
                      <option value="">— بدون طيار —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td>
                  {STATUS_FLOW[o.deliveryStatus] ? (
                    <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => advanceStatus(o)}>
                      {STATUS_FLOW[o.deliveryStatus] === 'with_driver' ? 'إرسال مع الطيار' : 'تأكيد التسليم'}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش طلبات ديلفري في المدى المحدد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DriversTab(): JSX.Element {
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([])
  const [form, setForm] = useState({ name: '', phone: '' })

  function refresh(): void {
    window.api.settings.listDeliveryDrivers(true).then(setDrivers)
  }

  useEffect(refresh, [])

  async function addDriver(): Promise<void> {
    if (!form.name.trim()) return
    await window.api.settings.upsertDeliveryDriver({ name: form.name, phone: form.phone, active: true })
    setForm({ name: '', phone: '' })
    refresh()
  }

  async function toggleActive(driver: DeliveryDriver): Promise<void> {
    await window.api.settings.upsertDeliveryDriver({ id: driver.id, name: driver.name, phone: driver.phone ?? '', active: !driver.active })
    refresh()
  }

  return (
    <>
      <div className="qcp-table-wrap" style={{ marginBottom: 12 }}>
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.phone ?? '—'}</td>
                <td>
                  <span className={`qcp-pill ${d.active ? 'accent' : ''}`}>{d.active ? 'نشط' : 'معطّل'}</span>
                </td>
                <td>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => toggleActive(d)}>
                    {d.active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </td>
              </tr>
            ))}
            {!drivers.length && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="qcp-input" placeholder="اسم السائق" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="qcp-input" placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button className="qcp-btn qcp-btn-secondary" onClick={addDriver}>
          + إضافة سائق
        </button>
      </div>
    </>
  )
}

function ZonesTab(): JSX.Element {
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [form, setForm] = useState({ name: '', fee: '0' })

  function refresh(): void {
    window.api.delivery.listZones(true).then(setZones)
  }

  useEffect(refresh, [])

  async function addZone(): Promise<void> {
    if (!form.name.trim()) return
    await window.api.delivery.upsertZone({ name: form.name, fee: Number(form.fee) || 0, active: true })
    setForm({ name: '', fee: '0' })
    refresh()
  }

  async function toggleActive(zone: DeliveryZone): Promise<void> {
    await window.api.delivery.upsertZone({ id: zone.id, name: zone.name, fee: zone.fee, active: !zone.active })
    refresh()
  }

  return (
    <>
      <div className="qcp-table-wrap" style={{ marginBottom: 12 }}>
        <table className="qcp-table">
          <thead>
            <tr>
              <th>المنطقة</th>
              <th>رسوم التوصيل</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td>{z.name}</td>
                <td>{currency(z.fee)}</td>
                <td>
                  <span className={`qcp-pill ${z.active ? 'accent' : ''}`}>{z.active ? 'نشطة' : 'معطّلة'}</span>
                </td>
                <td>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => toggleActive(z)}>
                    {z.active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </td>
              </tr>
            ))}
            {!zones.length && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="qcp-input" placeholder="اسم المنطقة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input
          className="qcp-input"
          type="number"
          placeholder="رسوم التوصيل"
          value={form.fee}
          onChange={(e) => setForm({ ...form, fee: e.target.value })}
        />
        <button className="qcp-btn qcp-btn-secondary" onClick={addZone}>
          + إضافة منطقة
        </button>
      </div>
    </>
  )
}
