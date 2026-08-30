import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { OrderScreen } from './OrderScreen'
import type { RestaurantOrderListItem } from '../../../../shared/types'

const ORDER_TYPE_LABELS: Record<string, string> = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'ديلفري' }
const KITCHEN_STATUS_LABELS: Record<string, string> = {
  pending: 'في الانتظار',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  out_for_delivery: 'خرج للتوصيل',
  completed: 'تم'
}

export function RestaurantPage(): JSX.Element {
  const user = useAppStore((s) => s.user)
  const activeOrderId = useAppStore((s) => s.activeRestaurantOrderId)
  const setActiveOrderId = useAppStore((s) => s.setActiveRestaurantOrderId)
  const setView = useAppStore((s) => s.setView)
  const [openOrders, setOpenOrders] = useState<RestaurantOrderListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [preparingOnly, setPreparingOnly] = useState(false)

  function refreshOpenOrders(): void {
    window.api.restaurant.listOpenOrders().then(setOpenOrders)
  }

  useEffect(() => {
    if (!activeOrderId) refreshOpenOrders()
  }, [activeOrderId])

  async function newOrder(type: 'takeaway' | 'delivery'): Promise<void> {
    if (!user) return
    const result = await window.api.restaurant.openOrder({ orderType: type }, user.id)
    if (result.ok && result.orderId) {
      setActiveOrderId(result.orderId)
    } else {
      setError(result.error ?? 'تعذر فتح الطلب')
    }
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

  return (
    <div>
      <div className="qcp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>المطاعم</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setView('restaurantTables')}>
            + طلب صالة
          </button>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => newOrder('takeaway')}>
            + طلب تيك أواي
          </button>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => newOrder('delivery')}>
            + طلب ديلفري
          </button>
        </div>
      </div>

      {error && (
        <div className="qcp-pill critical" style={{ marginBottom: 10, width: 'fit-content' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`qcp-btn ${preparingOnly ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setPreparingOnly((v) => !v)}
        >
          🍳 الطلبات تحت التجهيز ({openOrders.filter((o) => o.kitchenStatus === 'preparing').length})
        </button>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>النوع</th>
              <th>الترابيزة</th>
              <th>عدد الأصناف</th>
              <th>الإجمالي</th>
              <th>حالة التجهيز</th>
              <th>الوقت</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {openOrders
              .filter((o) => !preparingOnly || o.kitchenStatus === 'preparing')
              .map((o) => (
                <tr key={o.id}>
                  <td>{o.number}</td>
                  <td>{ORDER_TYPE_LABELS[o.orderType] ?? o.orderType}</td>
                  <td>{o.tableNames.join(' + ') || '—'}</td>
                  <td>{o.itemsCount}</td>
                  <td>{currency(o.total)}</td>
                  <td>
                    <span className={`qcp-pill ${o.kitchenStatus === 'ready' ? 'success' : 'accent'}`}>
                      {KITCHEN_STATUS_LABELS[o.kitchenStatus] ?? o.kitchenStatus}
                    </span>
                  </td>
                  <td>{o.createdAt}</td>
                  <td>
                    <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setActiveOrderId(o.id)}>
                      فتح
                    </button>
                  </td>
                </tr>
              ))}
            {!openOrders.filter((o) => !preparingOnly || o.kitchenStatus === 'preparing').length && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  {preparingOnly
                    ? 'مفيش طلبات تحت التجهيز دلوقتي'
                    : 'مفيش طلبات مفتوحة — الطلبات الخاصة بالصالة تقدري تبدأيها من تاب "الترابيزات"'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
