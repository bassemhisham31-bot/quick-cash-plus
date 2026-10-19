import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { isViewAllowed } from '../../lib/permissions'
import { formatCurrency as currency } from '../../lib/currency'
import { OrderScreen } from './OrderScreen'
import type { RestaurantOrderListItem, RestaurantOrderType, RestaurantSettings } from '../../../../shared/types'
import { KITCHEN_STATUS_LABELS, ORDER_TYPE_ICONS, ORDER_TYPE_LABELS, formatElapsed, minutesSince } from './restaurantUi'
import './restaurant.css'

type Filter = 'all' | RestaurantOrderType | 'preparing' | 'ready'

export function RestaurantPage(): JSX.Element {
  const user = useAppStore((s) => s.user)
  const activeOrderId = useAppStore((s) => s.activeRestaurantOrderId)
  const setActiveOrderId = useAppStore((s) => s.setActiveRestaurantOrderId)
  const setView = useAppStore((s) => s.setView)
  const disabledFeatures = useAppStore((s) => s.disabledFeatures)
  const [openOrders, setOpenOrders] = useState<RestaurantOrderListItem[]>([])
  const [settings, setSettings] = useState<RestaurantSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [, setTick] = useState(0)

  function refreshOpenOrders(): void {
    window.api.restaurant.listOpenOrders().then(setOpenOrders)
  }

  useEffect(() => {
    window.api.settings.getRestaurant().then(setSettings)
  }, [])

  useEffect(() => {
    if (activeOrderId) return
    refreshOpenOrders()
    const timer = setInterval(() => {
      setTick((n) => n + 1)
      refreshOpenOrders()
    }, 20000)
    return () => clearInterval(timer)
  }, [activeOrderId])

  async function newOrder(type: 'takeaway' | 'delivery'): Promise<void> {
    if (!user) return
    setError(null)
    const result = await window.api.restaurant.openOrder({ orderType: type }, user.id)
    if (result.ok && result.orderId) setActiveOrderId(result.orderId)
    else setError(result.error ?? 'تعذر فتح الطلب')
  }

  async function advance(o: RestaurantOrderListItem): Promise<void> {
    const next =
      o.kitchenStatus === 'preparing'
        ? 'ready'
        : o.kitchenStatus === 'ready'
          ? o.orderType === 'delivery'
            ? 'out_for_delivery'
            : 'completed'
          : o.kitchenStatus === 'out_for_delivery'
            ? 'completed'
            : null
    if (!next) return
    await window.api.restaurant.setKitchenStatus(o.id, next)
    refreshOpenOrders()
  }

  if (activeOrderId) {
    return (
      <OrderScreen
        key={activeOrderId}
        orderId={activeOrderId}
        onClose={() => {
          setActiveOrderId(null)
          refreshOpenOrders()
        }}
      />
    )
  }

  // الطلبات الفاضية (اتفتحت ومحدش ضاف فيها حاجة) مالهاش لازمة في اللوحة غير لو صالة (الترابيزة محجوزة بيها)
  const meaningful = openOrders.filter((o) => o.itemsCount > 0 || o.orderType === 'dine_in')
  const q = search.trim().toLowerCase()
  const shown = meaningful.filter((o) => {
    if (filter === 'preparing' && o.kitchenStatus !== 'preparing') return false
    if (filter === 'ready' && o.kitchenStatus !== 'ready') return false
    if ((filter === 'dine_in' || filter === 'takeaway' || filter === 'delivery') && o.orderType !== filter) return false
    if (!q) return true
    return (
      o.number.toLowerCase().includes(q) ||
      (o.customerName ?? '').toLowerCase().includes(q) ||
      (o.customerPhone ?? '').includes(q) ||
      o.tableNames.some((t) => t.toLowerCase().includes(q))
    )
  })
  const count = (f: Filter): number =>
    meaningful.filter((o) =>
      f === 'all' ? true : f === 'preparing' || f === 'ready' ? o.kitchenStatus === f : o.orderType === f
    ).length

  // "طلب صالة" بيودّي لشاشة الترابيزات — يظهر بس لو المستخدم مسموحله بيها
  const dineIn = (settings?.dineInEnabled ?? true) && isViewAllowed(user, 'restaurantTables', disabledFeatures)
  const takeaway = settings?.takeawayEnabled ?? true
  const delivery = settings?.deliveryEnabled ?? true

  return (
    <div className="rst-root">
      <div className="qcp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>المطاعم — الطلبات</h1>
        <span style={{ color: 'var(--qcp-ink-muted)', fontSize: 13 }}>
          {meaningful.length} طلب مفتوح · {currency(meaningful.reduce((s, o) => s + o.total, 0))}
        </span>
      </div>

      <div className="rst-new-orders">
        {dineIn && (
          <button type="button" className="rst-new-order dine_in" onClick={() => setView('restaurantTables')}>
            <span className="ic">🍽️</span>
            <span>
              <div className="t">طلب صالة</div>
              <div className="s">اختار الترابيزة من مخطط الصالة</div>
            </span>
          </button>
        )}
        {takeaway && (
          <button type="button" className="rst-new-order takeaway" onClick={() => newOrder('takeaway')}>
            <span className="ic">🥡</span>
            <span>
              <div className="t">تيك أواي</div>
              <div className="s">طلب سريع للاستلام</div>
            </span>
          </button>
        )}
        {delivery && (
          <button type="button" className="rst-new-order delivery" onClick={() => newOrder('delivery')}>
            <span className="ic">🛵</span>
            <span>
              <div className="t">ديلفري</div>
              <div className="s">طلب توصيل للعميل</div>
            </span>
          </button>
        )}
      </div>

      {error && <div className="rst-error">{error}</div>}

      <div className="rst-toolbar" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="rst-seg">
          {(
            [
              ['all', 'الكل'],
              ['dine_in', '🍽️ صالة'],
              ['takeaway', '🥡 تيك أواي'],
              ['delivery', '🛵 ديلفري'],
              ['preparing', '🍳 تحت التجهيز'],
              ['ready', '🔔 جاهز']
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} type="button" className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {label} <span className="rst-count">{count(f)}</span>
            </button>
          ))}
        </div>
        <input
          className="qcp-input"
          style={{ maxWidth: 260 }}
          placeholder="🔍 رقم الطلب / العميل / الترابيزة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rst-board">
        {shown.map((o) => {
          const mins = minutesSince(o.createdAt)
          const preview = o.itemsPreview ?? []
          return (
            <div key={o.id} className={`rst-ocard ${o.orderType}`}>
              <div className="rst-ocard-head">
                <span className="rst-ocard-num">
                  {ORDER_TYPE_ICONS[o.orderType]} {o.number}
                </span>
                <span className={`rst-ocard-time ${mins >= 30 && o.kitchenStatus !== 'ready' ? 'late' : ''}`}>⏱ {formatElapsed(mins)}</span>
              </div>
              <div className="rst-ocard-meta">
                <span>
                  {ORDER_TYPE_LABELS[o.orderType]}
                  {o.tableNames.length > 0 && ` · 🪑 ${o.tableNames.join(' + ')}`}
                  {o.captainName && ` · 🧑‍🍳 ${o.captainName}`}
                </span>
                {o.orderType === 'delivery' && (
                  <>
                    <span>
                      👤 {o.customerName ?? 'عميل عابر'}
                      {o.customerPhone ? ` — ${o.customerPhone}` : ''}
                    </span>
                    {o.deliveryAddress && <span>📍 {o.deliveryAddress}</span>}
                    <span>🧑‍✈️ {o.driverName ?? 'لم يُحدد طيار'}</span>
                  </>
                )}
                {o.orderType === 'takeaway' && o.customerName && <span>👤 {o.customerName}</span>}
              </div>
              <div className="rst-ocard-items">
                {preview.slice(0, 5).map((it, idx) => (
                  <div key={idx}>
                    <b>{it.qty}×</b>
                    <span>{it.name}</span>
                  </div>
                ))}
                {preview.length > 5 && <div style={{ color: 'var(--qcp-ink-faint)' }}>+ {preview.length - 5} أصناف أخرى</div>}
                {!preview.length && <div style={{ color: 'var(--qcp-ink-faint)' }}>لسه مفيش أصناف</div>}
              </div>
              <div className="rst-ocard-foot">
                <div>
                  <div className="rst-ocard-total">{currency(o.total + (o.orderType === 'delivery' ? o.deliveryFee ?? 0 : 0))}</div>
                  <span className={`rst-kstatus ${o.kitchenStatus}`}>{KITCHEN_STATUS_LABELS[o.kitchenStatus]}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {o.kitchenStatus !== 'pending' && o.kitchenStatus !== 'completed' && (
                    <button type="button" className="qcp-btn qcp-btn-secondary" style={{ padding: '5px 10px' }} onClick={() => advance(o)}>
                      {o.kitchenStatus === 'preparing' ? '✓ جاهز' : o.kitchenStatus === 'ready' && o.orderType === 'delivery' ? '🛵 خرج' : '✓ تم'}
                    </button>
                  )}
                  <button type="button" className="qcp-btn qcp-btn-primary" style={{ padding: '5px 14px' }} onClick={() => setActiveOrderId(o.id)}>
                    فتح
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {!shown.length && (
        <div className="rst-empty qcp-card">
          <span className="big">🧾</span>
          {meaningful.length ? 'مفيش طلبات مطابقة للفلتر' : 'مفيش طلبات مفتوحة دلوقتي — ابدأ طلب جديد من الأزرار فوق'}
        </div>
      )}
    </div>
  )
}
