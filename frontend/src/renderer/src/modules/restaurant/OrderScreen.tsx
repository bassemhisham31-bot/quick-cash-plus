import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import type {
  Captain,
  Category,
  CustomerView,
  DeliveryDriver,
  DeliveryZone,
  PaymentMethod,
  PosUiSettings,
  PrintSettings,
  Product,
  RestaurantOrderView,
  RestaurantTable
} from '../../../../shared/types'

const ORDER_TYPE_LABELS: Record<string, string> = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'ديلفري' }
const KITCHEN_STATUS_LABELS: Record<string, string> = {
  pending: 'في الانتظار',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  out_for_delivery: 'خرج للتوصيل',
  completed: 'تم'
}
const KITCHEN_STATUS_FLOW: Record<string, string | null> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'out_for_delivery',
  out_for_delivery: 'completed',
  completed: null
}

export function OrderScreen({ orderId, onClose }: { orderId: number; onClose: () => void }): JSX.Element {
  const user = useAppStore((s) => s.user)
  const setActiveOrderId = useAppStore((s) => s.setActiveRestaurantOrderId)
  const [order, setOrder] = useState<RestaurantOrderView | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([])
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [deliveryDriverId, setDeliveryDriverId] = useState<number | null>(null)
  const [captainId, setCaptainId] = useState<number | null>(null)
  const [captains, setCaptains] = useState<Captain[]>([])
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [specialMark, setSpecialMark] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'value'>('value')
  const [discountValue, setDiscountValue] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paid, setPaid] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [closedInvoice, setClosedInvoice] = useState<{ invoiceId: number; number: string; total: number } | null>(null)
  const [availableTables, setAvailableTables] = useState<RestaurantTable[]>([])
  const [pickTableId, setPickTableId] = useState('')
  const [posUiSettings, setPosUiSettings] = useState<PosUiSettings | null>(null)
  const [printSettings, setPrintSettings] = useState<PrintSettings | null>(null)
  const metaInitialized = useRef(false)

  function refreshOrder(): void {
    window.api.restaurant.getOrderView(orderId).then((view) => {
      setOrder(view)
      if (view && !metaInitialized.current) {
        metaInitialized.current = true
        setCustomerId(view.customerId)
        setDeliveryDriverId(view.deliveryDriverId)
        setDeliveryAddress(view.deliveryAddress ?? '')
        setDeliveryFee(String(view.deliveryFee ?? 0))
        setSpecialMark(view.specialMark ?? '')
        setGuestCount(view.guestCount != null ? String(view.guestCount) : '')
        setOrderNote(view.orderNote ?? '')
        setCaptainId(view.captainId)
      }
    })
  }

  function refreshAvailableTables(): void {
    window.api.restaurant.listTables().then((list) => setAvailableTables(list.filter((t) => t.status === 'available')))
  }

  useEffect(() => {
    metaInitialized.current = false
    refreshOrder()
    refreshAvailableTables()
    window.api.catalog.listCategories().then(setCategories)
    window.api.catalog.listWarehouses().then((list) => {
      setWarehouseId(list.find((w) => w.isDefault)?.id ?? list[0]?.id ?? null)
    })
    window.api.customers.list('').then(setCustomers)
    window.api.settings.listDeliveryDrivers().then(setDrivers)
    window.api.delivery.listZones().then(setZones)
    window.api.settings.listCaptains().then(setCaptains)
    window.api.settings.getPosUi().then(setPosUiSettings)
    window.api.settings.getPrint().then(setPrintSettings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  useEffect(() => {
    if (warehouseId) window.api.catalog.listProducts('', warehouseId).then(setProducts)
  }, [warehouseId])

  if (!order) return <p>...جاري التحميل</p>

  const phoneMatches =
    phoneSearch.trim().length >= 2
      ? customers.filter((c) => {
          const q = phoneSearch.trim()
          return (c.phone && c.phone.replace(/\s/g, '').includes(q)) || c.name.toLowerCase().includes(q.toLowerCase())
        })
      : []

  const itemsTotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0)
  const total = order.orderType === 'delivery' ? itemsTotal + order.deliveryFee : itemsTotal
  const splitGroups = Array.from(new Set(order.items.map((i) => i.splitGroup))).sort()

  async function addItem(product: Product): Promise<void> {
    await window.api.restaurant.addItems(orderId, [
      { productId: product.id, name: product.name, qty: 1, unitPrice: product.retailPrice, note: '' }
    ])
    playSound('save')
    refreshOrder()
  }

  async function updateQty(itemId: number, qty: number): Promise<void> {
    if (qty <= 0) {
      await window.api.restaurant.removeItem(itemId)
    } else {
      await window.api.restaurant.updateItem(itemId, { qty })
    }
    refreshOrder()
  }

  async function updateNote(itemId: number, note: string): Promise<void> {
    await window.api.restaurant.updateItem(itemId, { note })
    refreshOrder()
  }

  async function removeItem(itemId: number): Promise<void> {
    await window.api.restaurant.removeItem(itemId)
    refreshOrder()
  }

  // تيك أواي وديلفري بطبيعتهم سريعين — بعد ما الطلب يتبعت للمطبخ أو يتقفل نفتح طلب جديد على طول
  // عشان الكاشير يكمل مع العميل اللي بعده من غير ما يرجع للقائمة يدوي كل مرة.
  async function openFollowUpOrder(type: 'takeaway' | 'delivery'): Promise<boolean> {
    if (!user) return false
    const next = await window.api.restaurant.openOrder({ orderType: type }, user.id)
    if (next.ok && next.orderId) {
      setActiveOrderId(next.orderId)
      return true
    }
    return false
  }

  async function sendToKitchen(): Promise<void> {
    const result = await window.api.restaurant.sendToKitchen(orderId)
    if (!result.ok) {
      setError(result.error ?? 'تعذر إرسال الطلب للمطبخ')
      return
    }
    playSound('save')
    refreshOrder()
    if (order && (order.orderType === 'takeaway' || order.orderType === 'delivery')) {
      await openFollowUpOrder(order.orderType)
    }
  }

  async function advanceKitchenStatus(): Promise<void> {
    const next = KITCHEN_STATUS_FLOW[order!.kitchenStatus]
    if (!next) return
    await window.api.restaurant.setKitchenStatus(orderId, next)
    refreshOrder()
  }

  async function handleClose(splitGroup?: number): Promise<void> {
    if (!user || !warehouseId) return
    setClosing(true)
    setError(null)
    try {
      const result = await window.api.restaurant.closeOrder(
        {
          orderId,
          customerId,
          warehouseId,
          discountType,
          discountValue: Number(discountValue) || 0,
          paymentMethod,
          paid: Number(paid) || total,
          splitGroup
        },
        user.id
      )
      if (!result.ok) {
        setError(result.error ?? 'تعذر إتمام الدفع')
        return
      }
      playSound('sell')
      if (printSettings?.autoPrintAfterSale && result.invoiceId) {
        window.api.print.receipt(result.invoiceId)
      }
      refreshOrder()
      if (result.invoiceId) {
        setClosedInvoice({ invoiceId: result.invoiceId, number: result.invoiceNumber ?? '', total: result.total ?? total })
      }
    } finally {
      setClosing(false)
    }
  }

  // بعد قفل ودفع الفاتورة، بنوقف قبل ما نكمل (طلب جديد تلقائي أو رجوع) عشان نضمن إن الكاشير عنده فرصة
  // يطبع/يعاين الفاتورة يدويًا دايمًا — حتى لو "الطباعة التلقائية" في الإعدادات مقفولة أو فشلت بصمت.
  async function continueAfterClose(): Promise<void> {
    setClosedInvoice(null)
    const stillOpen = await window.api.restaurant.getOrderView(orderId)
    if (!stillOpen || stillOpen.status !== 'open') {
      const reopened =
        order && (order.orderType === 'takeaway' || order.orderType === 'delivery')
          ? await openFollowUpOrder(order.orderType)
          : false
      if (!reopened) onClose()
    }
  }

  async function handleCancel(): Promise<void> {
    if (!window.confirm('إلغاء الطلب بالكامل؟')) return
    await window.api.restaurant.cancelOrder(orderId)
    onClose()
  }

  function selectCustomer(id: number | null): void {
    setCustomerId(id)
    const patch: { customerId: number | null; deliveryAddress?: string } = { customerId: id }
    const customer = id ? customers.find((c) => c.id === id) : null
    if (customer?.address) {
      setDeliveryAddress(customer.address)
      patch.deliveryAddress = customer.address
    }
    window.api.restaurant.updateOrderMeta(orderId, patch)
    setPhoneSearch('')
  }

  function changeCustomer(value: string): void {
    selectCustomer(value ? Number(value) : null)
  }

  function changeDriver(value: string): void {
    const id = value ? Number(value) : null
    setDeliveryDriverId(id)
    window.api.restaurant.updateOrderMeta(orderId, { deliveryDriverId: id })
  }

  function changeCaptain(value: string): void {
    const id = value ? Number(value) : null
    setCaptainId(id)
    window.api.restaurant.updateOrderMeta(orderId, { captainId: id })
  }

  function saveAddress(): void {
    window.api.restaurant.updateOrderMeta(orderId, { deliveryAddress })
  }

  function saveDeliveryFee(): void {
    window.api.restaurant.updateOrderMeta(orderId, { deliveryFee: Number(deliveryFee) || 0 })
  }

  function applyZoneFee(zoneId: string): void {
    const zone = zones.find((z) => z.id === Number(zoneId))
    if (!zone) return
    setDeliveryFee(String(zone.fee))
    window.api.restaurant.updateOrderMeta(orderId, { deliveryFee: zone.fee })
  }

  function saveSpecialMark(): void {
    window.api.restaurant.updateOrderMeta(orderId, { specialMark })
  }

  function saveGuestCount(): void {
    window.api.restaurant.updateOrderMeta(orderId, { guestCount: guestCount === '' ? null : Number(guestCount) || null })
  }

  function saveOrderNote(): void {
    window.api.restaurant.updateOrderMeta(orderId, { orderNote })
  }

  async function mergeTable(): Promise<void> {
    if (!pickTableId) return
    const result = await window.api.restaurant.mergeTables(orderId, [Number(pickTableId)])
    if (!result.ok) setError(result.error ?? 'تعذر دمج الترابيزة')
    setPickTableId('')
    refreshOrder()
    refreshAvailableTables()
  }

  async function transferTable(): Promise<void> {
    if (!pickTableId) return
    const result = await window.api.restaurant.transferTable(orderId, Number(pickTableId))
    if (!result.ok) setError(result.error ?? 'تعذر نقل الترابيزة')
    setPickTableId('')
    refreshOrder()
    refreshAvailableTables()
  }

  const categorySidebarEnabled = !!posUiSettings?.categorySidebarEnabled

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: categorySidebarEnabled ? '180px minmax(0, 1fr) 380px' : 'minmax(0, 1fr) 380px',
        gap: 18,
        height: '100%',
        minHeight: 0
      }}
    >
      {categorySidebarEnabled && (
        <div className="qcp-card" style={{ padding: 10, overflowY: 'auto', minHeight: 0 }}>
          <button
            type="button"
            className="qcp-btn qcp-btn-secondary"
            style={{ width: '100%', marginBottom: 6, fontWeight: categoryFilter === null ? 700 : 400 }}
            onClick={() => setCategoryFilter(null)}
          >
            كل الأصناف
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="qcp-btn qcp-btn-secondary"
              style={{ width: '100%', marginBottom: 6, fontWeight: categoryFilter === c.id ? 700 : 400 }}
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="qcp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>{order.number}</h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span className="qcp-pill accent">{ORDER_TYPE_LABELS[order.orderType]}</span>
              {order.tableNames.length > 0 && <span className="qcp-pill">{order.tableNames.join(' + ')}</span>}
              <span className="qcp-pill">{KITCHEN_STATUS_LABELS[order.kitchenStatus]}</span>
            </div>
          </div>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            ← رجوع
          </button>
        </div>

        {error && (
          <div className="qcp-pill critical" style={{ marginBottom: 10, width: 'fit-content' }}>
            {error}
          </div>
        )}

        {order.orderType === 'dine_in' && (
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <select className="qcp-select" style={{ maxWidth: 180 }} value={pickTableId} onChange={(e) => setPickTableId(e.target.value)}>
              <option value="">اختار ترابيزة</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="button" className="qcp-btn qcp-btn-secondary" disabled={!pickTableId} onClick={mergeTable}>
              🔗 دمج ترابيزة
            </button>
            <button type="button" className="qcp-btn qcp-btn-secondary" disabled={!pickTableId} onClick={transferTable}>
              ↔️ نقل لترابيزة
            </button>
          </div>
        )}

        {!categorySidebarEnabled && (
          <div style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className="qcp-btn qcp-btn-secondary"
              style={{ fontWeight: categoryFilter === null ? 700 : 400 }}
              onClick={() => setCategoryFilter(null)}
            >
              كل الأصناف
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="qcp-btn qcp-btn-secondary"
                style={{ fontWeight: categoryFilter === c.id ? 700 : 400 }}
                onClick={() => setCategoryFilter(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {products
              .filter((p) => p.showInPos && (categoryFilter === null || p.categoryId === categoryFilter))
              .map((p) => (
                <button key={p.id} className="qcp-card" style={{ textAlign: 'start', cursor: 'pointer', border: 'none' }} onClick={() => addItem(p)}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 12 }}>{currency(p.retailPrice)}</div>
                </button>
              ))}
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="qcp-btn qcp-btn-primary" onClick={sendToKitchen}>
            🍳 تجهيز الطلب (إرسال للمطبخ)
          </button>
          {KITCHEN_STATUS_FLOW[order.kitchenStatus] && (
            <button type="button" className="qcp-btn qcp-btn-secondary" onClick={advanceKitchenStatus}>
              التالي: {KITCHEN_STATUS_LABELS[KITCHEN_STATUS_FLOW[order.kitchenStatus] as string]}
            </button>
          )}
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={handleCancel}>
            إلغاء الطلب
          </button>
        </div>
      </div>

      <div className="qcp-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <h3 style={{ marginTop: 0 }}>أصناف الطلب</h3>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', marginBottom: 12 }}>
          {order.items.length === 0 && <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>لسه مفيش أصناف</p>}
          {order.items.map((item) => (
            <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--qcp-border)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>
                  {item.productName} {item.kitchenSent && <span style={{ fontSize: 10, color: 'var(--qcp-ink-faint)' }}>✓ اتبعت للمطبخ</span>}
                </div>
                <button className="qcp-btn qcp-btn-secondary" style={{ padding: '2px 8px' }} onClick={() => removeItem(item.id)}>
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <input
                  className="qcp-input"
                  type="number"
                  style={{ width: 56, padding: '2px 6px' }}
                  value={item.qty}
                  onChange={(e) => updateQty(item.id, Number(e.target.value))}
                />
                <span style={{ color: 'var(--qcp-ink-faint)' }}>× {currency(item.unitPrice)}</span>
              </div>
              <input
                className="qcp-input"
                style={{ width: '100%', marginTop: 4, padding: '2px 6px', fontSize: 11.5 }}
                placeholder="ملاحظة للمطبخ (متظهرش في فاتورة العميل)"
                defaultValue={item.note ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (item.note ?? '')) updateNote(item.id, e.target.value)
                }}
              />
            </div>
          ))}
        </div>

        {order.orderType === 'dine_in' && (
          <>
            <div className="qcp-field">
              <label>الكابتن</label>
              <select className="qcp-select" value={captainId ?? ''} onChange={(e) => changeCaptain(e.target.value)}>
                <option value="">— بدون —</option>
                {captains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="qcp-field">
              <label>عدد الضيوف</label>
              <input
                className="qcp-input"
                type="number"
                min={0}
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                onBlur={saveGuestCount}
                placeholder="عدد الأشخاص الفعلي على الترابيزة"
              />
            </div>
          </>
        )}

        <div className="qcp-field">
          <label>ملاحظة عامة على الطلب (اختياري، داخلية فقط)</label>
          <input
            className="qcp-input"
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            onBlur={saveOrderNote}
            placeholder="مثلاً: عميل VIP"
          />
        </div>

        {order.orderType === 'delivery' && (
          <>
            <div className="qcp-field">
              <label>بحث برقم تليفون العميل</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="qcp-input"
                  style={{ width: '100%' }}
                  type="tel"
                  placeholder="اكتب رقم التليفون أو الاسم"
                  value={phoneSearch}
                  onChange={(e) => setPhoneSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && phoneMatches.length >= 1) selectCustomer(phoneMatches[0].id)
                  }}
                />
                {phoneMatches.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      insetInlineStart: 0,
                      insetInlineEnd: 0,
                      zIndex: 20,
                      background: 'var(--qcp-bg)',
                      border: '1px solid var(--qcp-border)',
                      borderRadius: 8,
                      marginTop: 4,
                      maxHeight: 180,
                      overflowY: 'auto',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.12)'
                    }}
                  >
                    {phoneMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'start',
                          padding: '7px 10px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                        onClick={() => selectCustomer(c.id)}
                      >
                        <strong>{c.name}</strong> — {c.phone}
                        {c.address && <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>{c.address}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="qcp-field">
              <label>السائق</label>
              <select className="qcp-select" value={deliveryDriverId ?? ''} onChange={(e) => changeDriver(e.target.value)}>
                <option value="">— بدون —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="qcp-field">
              <label>عنوان التوصيل</label>
              <input
                className="qcp-input"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                onBlur={saveAddress}
                placeholder="العنوان بالتفصيل"
              />
            </div>
            <div className="qcp-field">
              <label>علامة مميزة (اختياري)</label>
              <input
                className="qcp-input"
                value={specialMark}
                onChange={(e) => setSpecialMark(e.target.value)}
                onBlur={saveSpecialMark}
                placeholder="أقرب علامة مميزة للعنوان"
              />
            </div>
            <div className="qcp-field">
              <label>رسوم التوصيل</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="qcp-input"
                  type="number"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  onBlur={saveDeliveryFee}
                />
                {zones.length > 0 && (
                  <select className="qcp-select" style={{ maxWidth: 140 }} value="" onChange={(e) => applyZoneFee(e.target.value)}>
                    <option value="">حسب منطقة...</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({currency(z.fee)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </>
        )}

        <div className="qcp-field">
          <label>العميل</label>
          <select className="qcp-select" value={customerId ?? ''} onChange={(e) => changeCustomer(e.target.value)}>
            <option value="">عميل عابر</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` — ${c.phone}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="qcp-field">
          <label>الخصم</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="qcp-select" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'value')}>
              <option value="value">ج.م</option>
              <option value="percent">%</option>
            </select>
            <input className="qcp-input" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          </div>
        </div>

        <div className="qcp-field">
          <label>طريقة الدفع</label>
          <select className="qcp-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="cash">نقدًا</option>
            <option value="card">بنكي</option>
            <option value="wallet">محفظة</option>
            <option value="vodafone_cash">فودافون كاش</option>
            <option value="instapay">InstaPay</option>
            <option value="credit">آجل</option>
          </select>
        </div>

        <div className="qcp-field">
          <label>المدفوع</label>
          <input className="qcp-input" type="number" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>

        <div style={{ borderTop: '1px dashed var(--qcp-border)', paddingTop: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
            <span>الإجمالي</span>
            <span>{currency(total)}</span>
          </div>
        </div>

        <button
          className="qcp-btn qcp-btn-primary"
          style={{ marginTop: 12, width: '100%', padding: 12 }}
          disabled={!order.items.length || closing}
          onClick={() => handleClose(undefined)}
        >
          قفل ودفع الفاتورة كاملة
        </button>

        {splitGroups.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginBottom: 6 }}>تقسيم الفاتورة حسب المجموعة:</div>
            {splitGroups.map((g) => (
              <button
                key={g}
                type="button"
                className="qcp-btn qcp-btn-secondary"
                style={{ width: '100%', marginBottom: 6 }}
                disabled={closing}
                onClick={() => handleClose(g)}
              >
                قفل مجموعة {g} فقط
              </button>
            ))}
          </div>
        )}
      </div>

      {closedInvoice && (
        <div className="qcp-modal-backdrop">
          <div className="qcp-modal" style={{ textAlign: 'center', maxWidth: 380 }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
            <h2 style={{ margin: '0 0 4px' }}>تم الدفع بنجاح</h2>
            {closedInvoice.number && <p style={{ color: 'var(--qcp-ink-faint)', margin: '0 0 4px' }}>{closedInvoice.number}</p>}
            <p style={{ fontWeight: 800, fontSize: 20, margin: '4px 0 18px' }}>{currency(closedInvoice.total)}</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button
                className="qcp-btn qcp-btn-primary"
                style={{ flex: 1 }}
                onClick={() => window.api.print.receipt(closedInvoice.invoiceId)}
              >
                🖨️ طباعة
              </button>
              <button
                className="qcp-btn qcp-btn-secondary"
                style={{ flex: 1 }}
                onClick={() => window.api.print.previewReceipt(closedInvoice.invoiceId)}
              >
                👁️ معاينة
              </button>
            </div>
            <button className="qcp-btn qcp-btn-secondary" style={{ width: '100%' }} onClick={continueAfterClose}>
              متابعة →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
