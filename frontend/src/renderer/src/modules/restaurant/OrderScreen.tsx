import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import { isViewAllowed } from '../../lib/permissions'
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
  RestaurantOrderItemView,
  RestaurantOrderView,
  RestaurantSettings,
  RestaurantTable,
  TaxSettings
} from '../../../../shared/types'
import { lineDiscountAmount } from '../../../../shared/types'
import { DiscountField } from './DiscountField'
import { discountRules } from '../../lib/discount'
import { KITCHEN_STATUS_LABELS, ORDER_TYPE_ICONS, ORDER_TYPE_LABELS, colorFor } from './restaurantUi'
import './restaurant.css'
import { ensureDeleteAllowed } from '../../lib/deleteGuard'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: '💵 نقدًا' },
  { value: 'card', label: '💳 بطاقة' },
  { value: 'wallet', label: '👛 محفظة' },
  { value: 'vodafone_cash', label: '📱 فودافون كاش' },
  { value: 'instapay', label: '⚡ InstaPay' },
  { value: 'credit', label: '📒 آجل' }
]

// رسالة نجاح بتعدّي من طلب للطلب اللي بعده (الشاشة بتتعمل لها remount مع كل طلب جديد بسبب key={orderId})
let flashMessage: string | null = null

export function OrderScreen({ orderId, onClose }: { orderId: number; onClose: () => void }): JSX.Element {
  const user = useAppStore((s) => s.user)
  const setActiveOrderId = useAppStore((s) => s.setActiveRestaurantOrderId)
  const setView = useAppStore((s) => s.setView)
  const setRestaurantFlash = useAppStore((s) => s.setRestaurantFlash)
  const disabledFeatures = useAppStore((s) => s.disabledFeatures)
  const [order, setOrder] = useState<RestaurantOrderView | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([])
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [captains, setCaptains] = useState<Captain[]>([])
  const [availableTables, setAvailableTables] = useState<RestaurantTable[]>([])
  const [posUiSettings, setPosUiSettings] = useState<PosUiSettings | null>(null)
  const [printSettings, setPrintSettings] = useState<PrintSettings | null>(null)
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null)
  const [restaurantSettings, setRestaurantSettings] = useState<RestaurantSettings | null>(null)

  // بيانات الطلب اللي بتتحفظ فورًا في الطلب نفسه
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [deliveryDriverId, setDeliveryDriverId] = useState<number | null>(null)
  const [captainId, setCaptainId] = useState<number | null>(null)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [specialMark, setSpecialMark] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [orderNote, setOrderNote] = useState('')
  // خصم الطلب كله — بيتحفظ في الطلب عشان يظهر في الشيك وفي نافذة الدفع
  const [customerLabel, setCustomerLabel] = useState('')
  const [orderDiscType, setOrderDiscType] = useState<'percent' | 'value'>('value')
  const [orderDiscValue, setOrderDiscValue] = useState('')
  /** الصنف اللي خانة الخصم بتاعته مفتوحة */
  const [discountOpenFor, setDiscountOpenFor] = useState<number | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [noteOpenFor, setNoteOpenFor] = useState<number | null>(null)
  const [splitMode, setSplitMode] = useState(false)
  /** تقسيم الشيك: عدد الوحدات اللي هتتنقل من كل سطر كميته أكتر من 1 (الافتراضي واحدة) */
  const [moveUnits, setMoveUnits] = useState<Record<number, number>>({})
  const [checkGroup, setCheckGroup] = useState(1)
  const [showDelivery, setShowDelivery] = useState(false)
  const [showOrderNote, setShowOrderNote] = useState(false)
  const [tableAction, setTableAction] = useState<'merge' | 'transfer' | null>(null)
  const [payGroup, setPayGroup] = useState<number | 'all' | null>(null)
  const [closedInvoice, setClosedInvoice] = useState<{ invoiceId: number; number: string; total: number } | null>(null)
  const metaInitialized = useRef(false)

  async function refreshOrder(): Promise<RestaurantOrderView | null> {
    const view = await window.api.restaurant.getOrderView(orderId)
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
      setOrderDiscType(view.discountType)
      setCustomerLabel(view.customerLabel ?? '')
      setOrderDiscValue(view.discountValue ? String(view.discountValue) : '')
    }
    return view
  }

  function refreshAvailableTables(): void {
    window.api.restaurant.listTables().then((list) => setAvailableTables(list.filter((t) => t.currentOrderId !== orderId)))
  }

  useEffect(() => {
    metaInitialized.current = false
    if (flashMessage) {
      setToast(flashMessage)
      flashMessage = null
    }
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
    window.api.settings.getTax().then(setTaxSettings)
    window.api.settings.getRestaurant().then(setRestaurantSettings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  useEffect(() => {
    if (warehouseId) window.api.catalog.listProducts('', warehouseId).then(setProducts)
  }, [warehouseId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const qtyByProduct = useMemo(() => {
    const map = new Map<number, number>()
    for (const i of order?.items ?? []) map.set(i.productId, (map.get(i.productId) ?? 0) + i.qty)
    return map
  }, [order])

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(
      (p) =>
        p.showInPos &&
        (categoryFilter === null || p.categoryId === categoryFilter) &&
        (!q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q))
    )
  }, [products, categoryFilter, search])

  if (!order) {
    return (
      <div className="rst-root rst-empty">
        <span className="big">⏳</span>
        جاري تحميل الطلب...
      </div>
    )
  }

  const isDelivery = order.orderType === 'delivery'
  const isDineIn = order.orderType === 'dine_in'
  const currentCustomer = customerId ? customers.find((c) => c.id === customerId) ?? null : null
  const itemsGross = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0)
  const itemsDiscount = order.items.reduce((s, i) => s + lineDiscountAmount(i.qty, i.unitPrice, i.discountType, i.discountValue), 0)
  const itemsTotal = itemsGross - itemsDiscount
  const { allowed: canDiscount, maxPercent: maxDiscountPercent } = discountRules(user, posUiSettings)
  const itemsCount = order.items.reduce((s, i) => s + i.qty, 0)
  const unsentCount = order.items.filter((i) => !i.kitchenSent).length
  const splitGroups = Array.from(new Set(order.items.map((i) => i.splitGroup))).sort((a, b) => a - b)
  const fee = isDelivery ? Number(deliveryFee) || 0 : 0

  /** نفس restaurantTaxOverride() في الـbackend: ضريبة المطعم لو مفعّلة بتحل محل الضريبة العامة */
  function computeTax(preTax: number, isFinal: boolean): number {
    if (restaurantSettings?.taxEnabled) {
      const applies =
        (order!.orderType === 'dine_in' && restaurantSettings.taxDineIn) ||
        (order!.orderType === 'takeaway' && restaurantSettings.taxTakeaway) ||
        (order!.orderType === 'delivery' && restaurantSettings.taxDelivery)
      if (!applies) return 0
      if (restaurantSettings.taxType === 'value') return isFinal ? restaurantSettings.taxValue : 0
      return preTax * (restaurantSettings.taxValue / 100)
    }
    return taxSettings?.enabled ? preTax * (taxSettings.rate / 100) : 0
  }
  const taxLabel = restaurantSettings?.taxEnabled ? restaurantSettings.taxName : taxSettings?.taxName || 'الضريبة'

  /** نفس حسبة checkout() في الـbackend بالظبط (خصم ← ضريبة ← خدمة ← توصيل) عشان الرقم اللي الكاشير يشوفه = الفاتورة */
  function computeTotals(subtotal: number, discountType: 'percent' | 'value', discountValue: number, isFinal: boolean) {
    const discount = discountType === 'percent' ? subtotal * (discountValue / 100) : discountValue
    const preTax = Math.max(0, subtotal - discount)
    const tax = computeTax(preTax, isFinal)
    const service =
      isFinal && isDineIn && restaurantSettings?.serviceChargeEnabled && restaurantSettings.serviceChargeValue
        ? restaurantSettings.serviceChargeType === 'percent'
          ? preTax * (restaurantSettings.serviceChargeValue / 100)
          : restaurantSettings.serviceChargeValue
        : 0
    const delivery = isFinal ? fee : 0
    return { discount: Math.min(discount, subtotal), tax, service, delivery, total: preTax + tax + service + delivery }
  }
  const summary = computeTotals(itemsTotal, orderDiscType, Number(orderDiscValue) || 0, true)

  /* ------------------------------ الأصناف ------------------------------ */

  async function addItem(product: Product): Promise<void> {
    setError(null)
    // نفس الصنف لسه ما اتبعتش للمطبخ ومن غير ملاحظة → نزود الكمية بدل سطر جديد مكرر
    const existing = order!.items.find(
      (i) => i.productId === product.id && !i.kitchenSent && !i.note && i.splitGroup === 1
    )
    if (existing) {
      await window.api.restaurant.updateItem(existing.id, { qty: existing.qty + 1 })
    } else {
      const result = await window.api.restaurant.addItems(orderId, [
        { productId: product.id, name: product.name, qty: 1, unitPrice: product.retailPrice, note: '' }
      ])
      if (!result.ok) {
        setError(result.error ?? 'تعذر إضافة الصنف')
        return
      }
    }
    playSound('save')
    await refreshOrder()
  }

  async function changeQty(item: RestaurantOrderItemView, delta: number): Promise<void> {
    const qty = item.qty + delta
    if (qty <= 0) {
      await removeItem(item)
      return
    }
    // تقليل الكمية = حذف جزء من الصنف → نفس صلاحية الحذف (أو باسورد الأدمن)
    if (delta < 0) {
      const ok = await ensureDeleteAllowed(
        user,
        `تقليل كمية "${item.productName}" من ${item.qty} إلى ${qty}${item.kitchenSent ? ' (اتبعت للمطبخ)' : ''}`,
        `طلب ${order?.number ?? ''}: تقليل ${item.productName} من ${item.qty} إلى ${qty}${item.kitchenSent ? ' (اتبعت للمطبخ)' : ''}`
      )
      if (!ok) return
    }
    await window.api.restaurant.updateItem(item.id, { qty })
    await refreshOrder()
  }

  async function removeItem(item: RestaurantOrderItemView): Promise<void> {
    const ok = await ensureDeleteAllowed(
      user,
      item.kitchenSent ? `"${item.productName}" اتبعت للمطبخ بالفعل — إلغاؤه من الطلب؟` : `حذف "${item.productName}" من الطلب`,
      `طلب ${order?.number ?? ''}: حذف ${item.productName} × ${item.qty}${item.kitchenSent ? ' (اتبعت للمطبخ)' : ''}`,
      { confirmIfAllowed: item.kitchenSent }
    )
    if (!ok) return
    await window.api.restaurant.removeItem(item.id)
    await refreshOrder()
  }

  async function saveNote(item: RestaurantOrderItemView, note: string): Promise<void> {
    if (note === (item.note ?? '')) return
    await window.api.restaurant.updateItem(item.id, { note })
    await refreshOrder()
  }

  async function saveItemDiscount(item: RestaurantOrderItemView, type: 'percent' | 'value', value: string): Promise<void> {
    const num = Number(value) || 0
    if (type === item.discountType && num === item.discountValue) return
    await window.api.restaurant.updateItem(item.id, { discountType: type, discountValue: num })
    await refreshOrder()
  }

  function changeOrderDiscount(type: 'percent' | 'value', value: string): void {
    setOrderDiscType(type)
    setOrderDiscValue(value)
    window.api.restaurant.updateOrderMeta(orderId, { discountType: type, discountValue: Number(value) || 0 })
  }

  function unitsToMove(item: RestaurantOrderItemView): number {
    return Math.min(Math.max(moveUnits[item.id] ?? 1, 1), item.qty)
  }

  async function setItemGroup(item: RestaurantOrderItemView, group: number): Promise<void> {
    if (item.splitGroup === group) return
    await window.api.restaurant.moveItem(item.id, group, unitsToMove(item))
    await refreshOrder()
  }

  /* ------------------------------ بيانات الطلب ------------------------------ */

  function selectCustomer(id: number | null, list: CustomerView[] = customers): void {
    setCustomerId(id)
    const patch: { customerId: number | null; deliveryAddress?: string } = { customerId: id }
    const customer = id ? list.find((c) => c.id === id) : null
    if (customer?.address && !deliveryAddress.trim()) {
      setDeliveryAddress(customer.address)
      patch.deliveryAddress = customer.address
    }
    window.api.restaurant.updateOrderMeta(orderId, patch)
  }

  function changeDriver(id: number | null): void {
    setDeliveryDriverId(id)
    window.api.restaurant.updateOrderMeta(orderId, { deliveryDriverId: id })
  }

  function changeCaptain(value: string): void {
    const id = value ? Number(value) : null
    setCaptainId(id)
    window.api.restaurant.updateOrderMeta(orderId, { captainId: id })
  }

  function saveGuestCount(): void {
    window.api.restaurant.updateOrderMeta(orderId, { guestCount: guestCount === '' ? null : Number(guestCount) || null })
  }

  function saveCustomerLabel(): void {
    window.api.restaurant.updateOrderMeta(orderId, { customerLabel })
  }

  function saveOrderNote(): void {
    window.api.restaurant.updateOrderMeta(orderId, { orderNote })
  }

  async function saveDeliveryInfo(info: {
    customerId: number | null
    address: string
    mark: string
    fee: string
    driverId: number | null
  }): Promise<void> {
    setCustomerId(info.customerId)
    setDeliveryAddress(info.address)
    setSpecialMark(info.mark)
    setDeliveryFee(info.fee)
    setDeliveryDriverId(info.driverId)
    await window.api.restaurant.updateOrderMeta(orderId, {
      customerId: info.customerId,
      deliveryAddress: info.address,
      specialMark: info.mark,
      deliveryFee: Number(info.fee) || 0,
      deliveryDriverId: info.driverId
    })
    setShowDelivery(false)
    await refreshOrder()
  }

  async function applyTableAction(tableId: number): Promise<void> {
    const result =
      tableAction === 'merge'
        ? await window.api.restaurant.mergeTables(orderId, [tableId])
        : await window.api.restaurant.transferTable(orderId, tableId)
    if (!result.ok) setError(result.error ?? 'تعذر تنفيذ العملية')
    else if (result.orderId && result.orderId !== orderId) setActiveOrderId(result.orderId)
    setTableAction(null)
    await refreshOrder()
    refreshAvailableTables()
  }

  /* ------------------------------ المطبخ والدفع ------------------------------ */

  // تيك أواي وديلفري سريعين — بعد الإرسال للمطبخ أو الدفع بنفتح طلب جديد على طول للعميل اللي بعده،
  // والطلب اللي اتبعت بيفضل موجود في "لوحة الطلبات" و"التوصيل" لحد ما يتدفع.
  async function openFollowUpOrder(type: 'takeaway' | 'delivery'): Promise<boolean> {
    if (!user) return false
    const next = await window.api.restaurant.openOrder({ orderType: type }, user.id)
    if (next.ok && next.orderId) {
      setActiveOrderId(next.orderId)
      return true
    }
    return false
  }

  /** إعادة طباعة تذكرة التجهيز لكل أصناف الطلب في أي وقت (من غير ما تتعلّم كإرسال جديد) */
  async function reprintKitchen(): Promise<void> {
    if (!order?.items.length) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.restaurant.reprintKitchen(orderId)
      if (!result.ok) setError(result.error ?? 'تعذر طباعة تذكرة التجهيز')
      else if (result.printWarning) setError(result.printWarning)
      else setToast('🖨 تذكرة التجهيز اتطبعت تاني')
    } finally {
      setBusy(false)
    }
  }

  async function sendToKitchen(): Promise<void> {
    if (!order || !unsentCount) return
    if (isDelivery && !customerId && !deliveryAddress.trim()) {
      setError('طلب الديلفري محتاج عميل أو عنوان توصيل الأول')
      setShowDelivery(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.restaurant.sendToKitchen(orderId)
      if (!result.ok) {
        setError(result.error ?? 'تعذر إرسال الطلب للمطبخ')
        return
      }
      playSound('save')
      // فاتورة جديدة تلقائي بعد التجهيز (من إعدادات المطعم — مفعّلة افتراضيًا): تيك أواي/ديلفري بيفتح طلب جديد
      // على طول، والصالة بترجع لخريطة الترابيزات عشان تختار الترابيزة الجاية. حتى لو تذكرة المطبخ ما اتطبعتش
      // الطلب نفسه اتبعت، فبنكمّل ونعرض التحذير في الطلب الجديد بدل ما نقف.
      const autoNext = restaurantSettings?.autoNewOrderAfterKitchen !== false
      const sentMsg = `✓ الطلب ${order.number} اتبعت للمطبخ (${unsentCount} صنف)`
      if (autoNext && (order.orderType === 'takeaway' || order.orderType === 'delivery')) {
        flashMessage =
          (result.printWarning ? `⚠️ ${result.printWarning} — ` : '') +
          `${sentMsg} — تلاقيه في لوحة الطلبات${isDelivery ? ' وصفحة التوصيل' : ''} لحد ما يتدفع`
        if (await openFollowUpOrder(order.orderType)) return
        flashMessage = null
      }
      // الصالة: الطلب بيتقفل ونرجع لخريطة الترابيزات على طول (حتى لو تذكرة المطبخ ما اتطبعتش — التحذير بيظهر هناك)
      if (autoNext && isDineIn) {
        setRestaurantFlash(
          (result.printWarning ? `⚠️ ${result.printWarning} — ` : '') +
            `${sentMsg}${order.tableNames.length ? ` — ترابيزة ${order.tableNames.join(' + ')}` : ''}`
        )
        setActiveOrderId(null)
        if (isViewAllowed(user, 'restaurantTables', disabledFeatures)) setView('restaurantTables')
        onClose()
        return
      }
      if (result.printWarning) {
        // الطلب اتبعت فعلًا — بس لازم الكاشير يعرف إن التذكرة ما اتطبعتش عشان يبلّغ المطبخ
        setError(result.printWarning)
        setToast(`✓ اتبعت للمطبخ (${unsentCount} صنف)`)
        await refreshOrder()
        return
      }
      setToast(`✓ اتبعت للمطبخ (${unsentCount} صنف)`)
      await refreshOrder()
    } catch (err: any) {
      setError(err?.message ?? 'تعذر إرسال الطلب للمطبخ')
    } finally {
      setBusy(false)
    }
  }

  // الشيك: الزبون يعرف حسابه قبل الدفع — الطلب بيفضل مفتوح، ولما يدفع بندوس "حفظ نهائي" من شاشة الدفع
  async function printCheck(preview: boolean, group?: number): Promise<void> {
    if (!order?.items.length) return
    setError(null)
    const res = await window.api.restaurant.printCheck(orderId, preview, group)
    if (!res.ok) {
      setError(res.error ?? 'تعذر طباعة الشيك')
      return
    }
    if (!preview) {
      setToast('🧾 الشيك اتطبع — لما الزبون يدفع دوس "دفع" ثم "حفظ نهائي"')
      await refreshOrder()
    }
  }

  async function advanceKitchenStatus(): Promise<void> {
    const next = nextKitchenStatus()
    if (!next) return
    await window.api.restaurant.setKitchenStatus(orderId, next)
    await refreshOrder()
  }

  function nextKitchenStatus(): string | null {
    if (!order) return null
    switch (order.kitchenStatus) {
      case 'preparing':
        return 'ready'
      case 'ready':
        return isDelivery ? 'out_for_delivery' : 'completed'
      case 'out_for_delivery':
        return 'completed'
      default:
        return null
    }
  }

  async function pay(input: {
    group: number | 'all'
    discountType: 'percent' | 'value'
    discountValue: number
    paymentMethod: PaymentMethod
    paid: number
    tipAmount?: number
    total: number
  }): Promise<void> {
    if (!user) return
    if (!warehouseId) {
      setError('مفيش مخزن افتراضي متعرّف — راجع إعدادات المخازن')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.restaurant.closeOrder(
        {
          orderId,
          customerId,
          customerLabel: customerId === null ? customerLabel : undefined,
          warehouseId,
          discountType: input.discountType,
          discountValue: input.discountValue,
          paymentMethod: input.paymentMethod,
          paid: input.paid,
          tipAmount: input.tipAmount,
          splitGroup: input.group === 'all' ? undefined : input.group
        },
        user.id
      )
      if (!result.ok) {
        throw new Error(result.error ?? 'تعذر إتمام الدفع')
      }
      playSound('sell')
      setPayGroup(null)
      // خصم بقيمة ثابتة اتحسب على الفاتورة دي بس — ما يتكررش على فاتورة التقسيم الجاية
      if (input.group !== 'all' && orderDiscType === 'value' && orderDiscValue) changeOrderDiscount('value', '')
      if (printSettings?.autoPrintAfterSale && result.invoiceId) {
        window.api.print.receipt(result.invoiceId)
      }
      await refreshOrder()
      if (result.invoiceId) {
        setClosedInvoice({ invoiceId: result.invoiceId, number: result.invoiceNumber ?? '', total: result.total ?? input.total })
      }
    } finally {
      setBusy(false)
    }
  }

  // بعد الدفع بنوقف عند نافذة النجاح عشان الكاشير يقدر يطبع/يعاين دايمًا — حتى لو الطباعة التلقائية مقفولة.
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
    const msg = order!.items.some((i) => i.kitchenSent)
      ? 'الطلب فيه أصناف اتبعت للمطبخ بالفعل — إلغاء الطلب بالكامل؟'
      : 'إلغاء الطلب بالكامل؟'
    if (
      order!.items.length &&
      !(await ensureDeleteAllowed(user, msg, `طلب ${order!.number}: إلغاء الطلب بالكامل (${order!.items.length} صنف)`, { confirmIfAllowed: true }))
    )
      return
    await window.api.restaurant.cancelOrder(orderId)
    onClose()
  }

  // لو المستخدم رجع من طلب تيك أواي/ديلفري فاضي خالص، نلغيه بدل ما يفضل طلب فاضي معلّق في اللوحة
  async function handleBack(): Promise<void> {
    if (!order!.items.length && !isDineIn) {
      await window.api.restaurant.cancelOrder(orderId)
    }
    onClose()
  }

  const categorySidebarEnabled = !!posUiSettings?.categorySidebarEnabled
  const nextStatus = nextKitchenStatus()
  const deliveryMissing = isDelivery && !customerId && !deliveryAddress.trim()

  return (
    <div
      className="rst-root rst-order"
      style={{
        gridTemplateColumns: categorySidebarEnabled ? '170px minmax(0, 1fr) 400px' : 'minmax(0, 1fr) 400px'
      }}
    >
      {categorySidebarEnabled && (
        <div className="rst-cats-side">
          <button type="button" className={`rst-cat ${categoryFilter === null ? 'active' : ''}`} onClick={() => setCategoryFilter(null)}>
            كل الأصناف
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`rst-cat ${categoryFilter === c.id ? 'active' : ''}`}
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------ المنيو ------------------------------ */}
      <div className="rst-menu">
        <div className="rst-order-head">
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={handleBack}>
            → رجوع
          </button>
          <h1>{order.number}</h1>
          <span className={`rst-chip ${order.orderType}`}>
            {ORDER_TYPE_ICONS[order.orderType]} {ORDER_TYPE_LABELS[order.orderType]}
          </span>
          {order.tableNames.length > 0 && <span className="rst-chip">🪑 {order.tableNames.join(' + ')}</span>}
          <span className={`rst-kstatus ${order.kitchenStatus}`}>{KITCHEN_STATUS_LABELS[order.kitchenStatus]}</span>
          {order.checkPrintedAt && (
            <span className="rst-chip" title={`اتطبع ${order.checkPrintedAt}`}>
              🧾 الشيك اتطبع — في انتظار الدفع
            </span>
          )}
          {isDineIn && (
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setTableAction('merge')}>
                🔗 دمج ترابيزة
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setTableAction('transfer')}>
                ↔️ نقل
              </button>
            </div>
          )}
        </div>

        {toast && <div className="rst-toast">{toast}</div>}
        {error && <div className="rst-error">⚠️ {error}</div>}

        <input
          className="qcp-input rst-search"
          placeholder="🔍 ابحث عن صنف بالاسم أو الباركود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && visibleProducts.length === 1) {
              addItem(visibleProducts[0])
              setSearch('')
            }
          }}
        />

        {!categorySidebarEnabled && (
          <div className="rst-cats">
            <button type="button" className={`rst-cat ${categoryFilter === null ? 'active' : ''}`} onClick={() => setCategoryFilter(null)}>
              كل الأصناف
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`rst-cat ${categoryFilter === c.id ? 'active' : ''}`}
                onClick={() => setCategoryFilter(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="rst-products">
          {visibleProducts.map((p) => {
            const inOrder = qtyByProduct.get(p.id)
            return (
              <button key={p.id} type="button" className="rst-product" onClick={() => addItem(p)}>
                <div className="rst-product-img" style={{ background: p.imageDataUrl ? 'var(--qcp-bg-sunken)' : colorFor(p.name) }}>
                  {p.imageDataUrl ? <img src={p.imageDataUrl} alt="" /> : p.name.trim().charAt(0)}
                </div>
                <div className="rst-product-body">
                  <div className="rst-product-name">{p.name}</div>
                  <div className="rst-product-price">{currency(p.retailPrice)}</div>
                </div>
                {inOrder ? <span className="rst-product-qty">{inOrder}</span> : null}
              </button>
            )
          })}
          {!visibleProducts.length && (
            <div className="rst-empty" style={{ gridColumn: '1 / -1' }}>
              <span className="big">🍽️</span>
              {products.length ? 'مفيش أصناف مطابقة' : 'مفيش أصناف ظاهرة في نقطة البيع — فعّل "إظهار في نقطة البيع" من المخزون'}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------ سلة الطلب ------------------------------ */}
      <div className="rst-cart">
        <div className="rst-cart-head">
          <div className="rst-cart-title">
            <span>🧾 الطلب ({itemsCount})</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="rst-icon-btn"
                title="ملاحظة عامة على الطلب"
                style={{ color: orderNote ? 'var(--qcp-accent)' : undefined }}
                onClick={() => setShowOrderNote((v) => !v)}
              >
                📝
              </button>
              {order.items.length > 1 && (
                <button
                  type="button"
                  className="rst-icon-btn"
                  title="تقسيم الفاتورة"
                  style={{ color: splitMode ? 'var(--qcp-accent)' : undefined }}
                  onClick={() => setSplitMode((v) => !v)}
                >
                  ✂️
                </button>
              )}
            </div>
          </div>

          {showOrderNote && (
            <input
              className="qcp-input"
              style={{ padding: '6px 10px', fontSize: 12.5 }}
              value={orderNote}
              autoFocus
              onChange={(e) => setOrderNote(e.target.value)}
              onBlur={saveOrderNote}
              placeholder="ملاحظة داخلية على الطلب (مثلاً: عميل VIP)"
            />
          )}

          {isDelivery && (
            <div className={`rst-info-card ${deliveryMissing ? 'warn' : ''}`} onClick={() => setShowDelivery(true)}>
              <span style={{ fontSize: 18 }}>🛵</span>
              <div className="grow">
                {deliveryMissing ? (
                  <strong>اضغط لإدخال بيانات العميل والتوصيل</strong>
                ) : (
                  <>
                    <div className="line">
                      <strong>{currentCustomer?.name ?? 'عميل عابر'}</strong>
                      {currentCustomer?.phone ? ` — ${currentCustomer.phone}` : ''}
                    </div>
                    <div className="line">📍 {deliveryAddress || '— بدون عنوان —'}</div>
                    <div className="line" style={{ color: 'var(--qcp-ink-muted)' }}>
                      🧑‍✈️ {drivers.find((d) => d.id === deliveryDriverId)?.name ?? 'لم يُحدد طيار'} · رسوم {currency(fee)}
                    </div>
                  </>
                )}
              </div>
              <span style={{ color: 'var(--qcp-accent)', fontWeight: 700, fontSize: 12 }}>تعديل</span>
            </div>
          )}

          {isDineIn && (
            <div className="rst-mini-fields">
              <select className="qcp-select" value={captainId ?? ''} onChange={(e) => changeCaptain(e.target.value)}>
                <option value="">🧑‍🍳 الكابتن — بدون</option>
                {captains.map((c) => (
                  <option key={c.id} value={c.id}>
                    🧑‍🍳 {c.name}
                  </option>
                ))}
              </select>
              <input
                className="qcp-input"
                type="number"
                min={0}
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                onBlur={saveGuestCount}
                placeholder="👥 ضيوف"
                title="عدد الضيوف"
              />
            </div>
          )}

          {order.orderType === 'takeaway' && (
            <select className="qcp-select" style={{ padding: '5px 8px', fontSize: 12.5 }} value={customerId ?? ''} onChange={(e) => selectCustomer(e.target.value ? Number(e.target.value) : null)}>
              <option value="">👤 عميل عابر</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  👤 {c.name}
                  {c.phone ? ` — ${c.phone}` : ''}
                </option>
              ))}
            </select>
          )}

          {customerId === null && order.orderType !== 'delivery' && (
            <input
              className="qcp-input"
              style={{ padding: '5px 8px', fontSize: 12.5 }}
              maxLength={80}
              placeholder="👤 اسم العميل (اختياري)"
              value={customerLabel}
              onChange={(e) => setCustomerLabel(e.target.value)}
              onBlur={saveCustomerLabel}
            />
          )}
        </div>

        <div className="rst-items">
          {order.items.length === 0 && (
            <div className="rst-empty">
              <span className="big">🛒</span>
              دوس على أي صنف من المنيو عشان يتضاف هنا
            </div>
          )}
          {order.items.map((item) => (
            <div key={item.id} className="rst-item">
              <div className="rst-item-row">
                <div className="rst-item-name">
                  {item.productName}
                  {item.kitchenSent && <span className="rst-sent">✓ في المطبخ</span>}
                  <small>{currency(item.unitPrice)}</small>
                </div>
                <div className="rst-qty">
                  <button type="button" onClick={() => changeQty(item, 1)}>
                    +
                  </button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => changeQty(item, -1)}>
                    −
                  </button>
                </div>
                <div className="rst-item-total" style={{ minWidth: 70, textAlign: 'end' }}>
                  {currency(item.qty * item.unitPrice - lineDiscountAmount(item.qty, item.unitPrice, item.discountType, item.discountValue))}
                </div>
                {canDiscount && (
                  <button
                    type="button"
                    className="rst-icon-btn"
                    title="خصم على الصنف"
                    style={{ color: item.discountValue > 0 ? 'var(--qcp-critical)' : undefined }}
                    onClick={() => setDiscountOpenFor(discountOpenFor === item.id ? null : item.id)}
                  >
                    🏷
                  </button>
                )}
                <button
                  type="button"
                  className="rst-icon-btn"
                  title="ملاحظة للمطبخ"
                  style={{ color: item.note ? 'var(--qcp-accent)' : undefined }}
                  onClick={() => setNoteOpenFor(noteOpenFor === item.id ? null : item.id)}
                >
                  📝
                </button>
                <button type="button" className="rst-icon-btn danger" title="حذف" onClick={() => removeItem(item)}>
                  🗑
                </button>
              </div>
              {item.discountValue > 0 && discountOpenFor !== item.id && (
                <div className="rst-disc-tag">
                  🏷 خصم -{currency(lineDiscountAmount(item.qty, item.unitPrice, item.discountType, item.discountValue))}
                  {item.discountType === 'percent' ? ` (${item.discountValue}%)` : ''}
                </div>
              )}
              {canDiscount && discountOpenFor === item.id && (
                <ItemDiscountEditor item={item} maxPercent={maxDiscountPercent} onCommit={saveItemDiscount} onClose={() => setDiscountOpenFor(null)} />
              )}
              {item.note && noteOpenFor !== item.id && (
                <div style={{ fontSize: 11.5, color: 'var(--qcp-accent)', marginTop: 3 }}>📝 {item.note}</div>
              )}
              {noteOpenFor === item.id && (
                <input
                  className="qcp-input rst-item-note"
                  autoFocus
                  placeholder="ملاحظة للمطبخ (مثلاً: بدون بصل) — مش بتظهر في فاتورة العميل"
                  defaultValue={item.note ?? ''}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  onBlur={(e) => {
                    saveNote(item, e.target.value)
                    setNoteOpenFor(null)
                  }}
                />
              )}
              {splitMode && item.qty > 1 && (
                <div className="rst-group-pick">
                  <span style={{ fontSize: 11, color: 'var(--qcp-ink-faint)', alignSelf: 'center' }}>الكمية المنقولة:</span>
                  <button
                    type="button"
                    onClick={() => setMoveUnits((m) => ({ ...m, [item.id]: Math.max(1, unitsToMove(item) - 1) }))}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 18, textAlign: 'center', alignSelf: 'center' }}>
                    {unitsToMove(item)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMoveUnits((m) => ({ ...m, [item.id]: Math.min(item.qty, unitsToMove(item) + 1) }))}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={unitsToMove(item) === item.qty ? 'active' : ''}
                    onClick={() => setMoveUnits((m) => ({ ...m, [item.id]: item.qty }))}
                  >
                    الكل
                  </button>
                </div>
              )}
              {splitMode && (
                <div className="rst-group-pick">
                  <span style={{ fontSize: 11, color: 'var(--qcp-ink-faint)', alignSelf: 'center' }}>فاتورة:</span>
                  {[1, 2, 3, 4].map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={item.splitGroup === g ? 'active' : ''}
                      onClick={() => setItemGroup(item, g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rst-totals">
          <div className="row">
            <span>المجموع</span>
            <span>{currency(itemsGross)}</span>
          </div>
          {itemsDiscount > 0 && (
            <div className="row" style={{ color: 'var(--qcp-critical)' }}>
              <span>خصم الأصناف</span>
              <span>-{currency(itemsDiscount)}</span>
            </div>
          )}
          {canDiscount && (
            <div className="row disc-row">
              <span>خصم الفاتورة</span>
              <DiscountField
                type={orderDiscType}
                value={orderDiscValue}
                base={itemsTotal}
                maxPercent={maxDiscountPercent}
                onChange={changeOrderDiscount}
              />
            </div>
          )}
          {summary.discount > 0 && (
            <div className="row" style={{ color: 'var(--qcp-critical)' }}>
              <span>الخصم</span>
              <span>-{currency(summary.discount)}</span>
            </div>
          )}
          {summary.tax > 0 && (
            <div className="row">
              <span>{taxLabel}</span>
              <span>{currency(summary.tax)}</span>
            </div>
          )}
          {summary.service > 0 && (
            <div className="row">
              <span>خدمة</span>
              <span>{currency(summary.service)}</span>
            </div>
          )}
          {summary.delivery > 0 && (
            <div className="row">
              <span>رسوم التوصيل</span>
              <span>{currency(summary.delivery)}</span>
            </div>
          )}
          <div className="row grand">
            <span>الإجمالي</span>
            <span>{currency(summary.total)}</span>
          </div>
        </div>

        <div className="rst-actions">
          <button type="button" className="rst-big-btn kitchen" disabled={!unsentCount || busy} onClick={sendToKitchen}>
            🍳 للمطبخ {unsentCount ? `(${unsentCount})` : ''}
          </button>
          <button
            type="button"
            className="rst-big-btn ghost"
            disabled={!order.items.length || busy}
            title="إعادة طباعة تذكرة التجهيز لكل أصناف الطلب"
            onClick={reprintKitchen}
          >
            🖨 إعادة طباعة التجهيز
          </button>
          <button
            type="button"
            className="rst-big-btn pay"
            disabled={!order.items.length || busy}
            onClick={() => setPayGroup(splitGroups.length > 1 ? splitGroups[0] : 'all')}
          >
            💳 دفع {currency(summary.total)}
          </button>
          <div className="rst-check-btns">
            <button
              type="button"
              className="rst-big-btn check"
              disabled={!order.items.length || busy}
              title="طباعة الشيك للزبون قبل الدفع"
              onClick={() => printCheck(false, splitGroups.length > 1 ? checkGroup : undefined)}
            >
              🧾 طباعة الشيك{splitGroups.length > 1 ? ` (فاتورة ${checkGroup})` : ''}
            </button>
            <button
              type="button"
              className="rst-big-btn ghost"
              disabled={!order.items.length}
              title="معاينة الشيك"
              onClick={() => printCheck(true, splitGroups.length > 1 ? checkGroup : undefined)}
            >
              👁️
            </button>
          </div>
          {splitGroups.length > 1 && (
            <div className="rst-check-btns">
              {splitGroups.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`rst-big-btn ghost ${checkGroup === g ? 'active' : ''}`}
                  title={`الشيك يطبع فاتورة ${g} بس`}
                  onClick={() => setCheckGroup(g)}
                >
                  فاتورة {g}
                </button>
              ))}
              <button type="button" className="rst-big-btn ghost" title="شيك لكل الطلب" onClick={() => printCheck(false)}>
                الكل
              </button>
            </div>
          )}
          {nextStatus && (
            <button type="button" className="rst-big-btn ghost" onClick={advanceKitchenStatus}>
              ➜ {KITCHEN_STATUS_LABELS[nextStatus as keyof typeof KITCHEN_STATUS_LABELS]}
            </button>
          )}
          <button type="button" className={`rst-big-btn ghost ${nextStatus ? 'wide' : ''}`} onClick={handleCancel}>
            ✕ إلغاء الطلب
          </button>
        </div>
      </div>

      {showDelivery && (
        <DeliveryInfoModal
          customers={customers}
          drivers={drivers}
          zones={zones}
          initial={{ customerId, address: deliveryAddress, mark: specialMark, fee: deliveryFee, driverId: deliveryDriverId }}
          onCustomerCreated={(c) => setCustomers((prev) => [c, ...prev])}
          onCancel={() => setShowDelivery(false)}
          onSave={saveDeliveryInfo}
        />
      )}

      {tableAction && (
        <div className="qcp-modal-backdrop" onClick={() => setTableAction(null)}>
          <div className="qcp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{tableAction === 'merge' ? '🔗 دمج ترابيزة مع الطلب' : '↔️ نقل الطلب لترابيزة تانية'}</h3>
            <p style={{ color: 'var(--qcp-ink-muted)', fontSize: 13, marginTop: 0 }}>
              {tableAction === 'merge'
                ? 'الترابيزة اللي هتختارها هتنضم لنفس الطلب (مناسب للمجموعات الكبيرة). لو مشغولة، طلبها هيتدمج مع الطلب ده.'
                : 'الطلب كله هيتنقل للترابيزة الجديدة، والترابيزة الحالية هتفضى. لو الترابيزة مشغولة، الطلبين هيتدمجوا في طلبها.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
              {availableTables.map((t) => (
                <button key={t.id} type="button" className="rst-cat" style={{ padding: '14px 8px' }} onClick={() => applyTableAction(t.id)}>
                  🪑 {t.name}{t.status === 'occupied' ? ' 🔴' : ''}
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--qcp-ink-faint)' }}>
                    {t.seats} كرسي{t.zone ? ` · ${t.zone}` : ''}
                  </div>
                </button>
              ))}
              {!availableTables.length && <div className="rst-empty">مفيش ترابيزات تانية</div>}
            </div>
            <button type="button" className="qcp-btn qcp-btn-secondary" style={{ width: '100%', marginTop: 14 }} onClick={() => setTableAction(null)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {payGroup !== null && (
        <PaymentModal
          groups={splitGroups}
          initialGroup={payGroup}
          items={order.items}
          customerLabel={customerLabel}
          onCustomerLabelChange={setCustomerLabel}
          onCustomerLabelSave={saveCustomerLabel}
          discountType={orderDiscType}
          discountValue={Number(orderDiscValue) || 0}
          customers={customers}
          customerId={customerId}
          onCustomerChange={(id) => selectCustomer(id)}
          computeTotals={computeTotals}
          taxLabel={taxLabel}
          busy={busy}
          onCancel={() => setPayGroup(null)}
          onPay={pay}
        />
      )}

      {closedInvoice && (
        <div className="qcp-modal-backdrop">
          <div className="qcp-modal" style={{ textAlign: 'center', maxWidth: 380 }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>✅</div>
            <h2 style={{ margin: '0 0 4px' }}>تم الدفع بنجاح</h2>
            {closedInvoice.number && <p style={{ color: 'var(--qcp-ink-faint)', margin: '0 0 4px' }}>{closedInvoice.number}</p>}
            <p style={{ fontWeight: 900, fontSize: 24, margin: '4px 0 18px' }}>{currency(closedInvoice.total)}</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button className="qcp-btn qcp-btn-primary" style={{ flex: 1 }} onClick={() => window.api.print.receipt(closedInvoice.invoiceId)}>
                🖨️ طباعة
              </button>
              <button className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => window.api.print.previewReceipt(closedInvoice.invoiceId)}>
                👁️ معاينة
              </button>
            </div>
            <button className="qcp-btn qcp-btn-secondary" style={{ width: '100%' }} autoFocus onClick={continueAfterClose}>
              متابعة →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================ بيانات التوصيل ================================ */

/** بيانات العميل والتوصيل — مستخدمة في طلب المطعم وفي شاشة البيع العادية */
export function DeliveryInfoModal({
  customers,
  drivers,
  zones,
  initial,
  onCustomerCreated,
  onCancel,
  onSave
}: {
  customers: CustomerView[]
  drivers: DeliveryDriver[]
  zones: DeliveryZone[]
  initial: { customerId: number | null; address: string; mark: string; fee: string; driverId: number | null }
  onCustomerCreated: (c: CustomerView) => void
  onCancel: () => void
  onSave: (info: { customerId: number | null; address: string; mark: string; fee: string; driverId: number | null }) => void
}): JSX.Element {
  const [customerId, setCustomerId] = useState<number | null>(initial.customerId)
  const [address, setAddress] = useState(initial.address)
  const [mark, setMark] = useState(initial.mark)
  const [fee, setFee] = useState(initial.fee)
  const [driverId, setDriverId] = useState<number | null>(initial.driverId)
  const [phone, setPhone] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [localCustomers, setLocalCustomers] = useState(customers)
  const [err, setErr] = useState<string | null>(null)

  const selected = customerId ? localCustomers.find((c) => c.id === customerId) ?? null : null
  const q = phone.trim()
  const matches =
    q.length >= 2
      ? localCustomers
          .filter((c) => (c.phone && c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))) || c.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 8)
      : []
  const looksLikePhone = /^[0-9+\s]{6,}$/.test(q)

  function pick(c: CustomerView): void {
    setCustomerId(c.id)
    if (c.address) setAddress(c.address)
    setPhone('')
  }

  async function createCustomer(): Promise<void> {
    if (!newName.trim()) {
      setErr('اكتب اسم العميل')
      return
    }
    setCreating(true)
    try {
      const c = await window.api.customers.create({
        name: newName.trim(),
        phone: q,
        address: address.trim(),
        notes: '',
        openingBalance: 0
      })
      setLocalCustomers((prev) => [c, ...prev])
      onCustomerCreated(c)
      setCustomerId(c.id)
      setPhone('')
      setNewName('')
      setErr(null)
    } catch (e: any) {
      setErr(e?.message ?? 'تعذر إضافة العميل')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onCancel}>
      <form
        className="qcp-modal"
        style={{ width: 'min(620px, 94vw)' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!customerId && !address.trim()) {
            setErr('لازم تختار عميل أو تكتب عنوان التوصيل')
            return
          }
          onSave({ customerId, address, mark, fee, driverId })
        }}
      >
        <h3 style={{ marginTop: 0 }}>🛵 بيانات العميل والتوصيل</h3>

        {selected ? (
          <div className="rst-info-card" style={{ marginBottom: 12, cursor: 'default' }}>
            <span style={{ fontSize: 18 }}>👤</span>
            <div className="grow">
              <strong>{selected.name}</strong>
              <div style={{ color: 'var(--qcp-ink-muted)' }}>{selected.phone || '— بدون رقم —'}</div>
            </div>
            <button type="button" className="qcp-btn qcp-btn-secondary" style={{ padding: '3px 10px' }} onClick={() => setCustomerId(null)}>
              تغيير
            </button>
          </div>
        ) : (
          <div className="qcp-field" style={{ position: 'relative' }}>
            <label>رقم تليفون العميل أو اسمه</label>
            <input
              className="qcp-input"
              type="text"
              autoFocus
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches.length) {
                  e.preventDefault()
                  pick(matches[0])
                }
              }}
            />
            {matches.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--qcp-border)',
                  borderRadius: 10,
                  marginTop: 6,
                  maxHeight: 190,
                  overflowY: 'auto'
                }}
              >
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'start',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--qcp-border)',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'var(--qcp-ink)'
                    }}
                  >
                    <strong>{c.name}</strong> — {c.phone || '—'}
                    {c.address && <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>📍 {c.address}</div>}
                  </button>
                ))}
              </div>
            )}
            {looksLikePhone && !matches.length && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  className="qcp-input"
                  style={{ flex: 1 }}
                  placeholder="رقم جديد — اكتب اسم العميل لإضافته"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button type="button" className="qcp-btn qcp-btn-primary" disabled={creating} onClick={createCustomer}>
                  + عميل جديد
                </button>
              </div>
            )}
          </div>
        )}

        <div className="qcp-field">
          <label>عنوان التوصيل</label>
          <textarea
            className="qcp-input"
            rows={2}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="الشارع، رقم العمارة، الدور، الشقة"
          />
        </div>
        <div className="qcp-field">
          <label>علامة مميزة (اختياري)</label>
          <input className="qcp-input" value={mark} onChange={(e) => setMark(e.target.value)} placeholder="مثلاً: جنب صيدلية..." />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="qcp-field">
            <label>منطقة التوصيل</label>
            <select
              className="qcp-select"
              value=""
              onChange={(e) => {
                const z = zones.find((x) => x.id === Number(e.target.value))
                if (z) setFee(String(z.fee))
              }}
            >
              <option value="">{zones.length ? 'اختار المنطقة لتحديد الرسوم...' : 'مفيش مناطق — ضيفها من صفحة التوصيل'}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({currency(z.fee)})
                </option>
              ))}
            </select>
          </div>
          <div className="qcp-field">
            <label>رسوم التوصيل</label>
            <input className="qcp-input" type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
        </div>

        <div className="qcp-field">
          <label>الطيار</label>
          <div className="rst-seg" style={{ display: 'flex' }}>
            <button type="button" className={driverId === null ? 'active' : ''} onClick={() => setDriverId(null)}>
              لاحقًا
            </button>
            {drivers.map((d) => (
              <button key={d.id} type="button" className={driverId === d.id ? 'active' : ''} onClick={() => setDriverId(d.id)}>
                🧑‍✈️ {d.name}
              </button>
            ))}
          </div>
        </div>

        {err && <div className="rst-error">{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }}>
            حفظ
          </button>
          <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onCancel}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

/* ==================================== الدفع ==================================== */

/** خانة خصم الصنف: بتتحفظ لما الكاشير يخرج منها أو يدوس Enter (مش مع كل رقم) */
function ItemDiscountEditor({
  item,
  maxPercent,
  onCommit,
  onClose
}: {
  item: RestaurantOrderItemView
  maxPercent: number
  onCommit: (item: RestaurantOrderItemView, type: 'percent' | 'value', value: string) => Promise<void>
  onClose: () => void
}): JSX.Element {
  const [type, setType] = useState<'percent' | 'value'>(item.discountType)
  const [value, setValue] = useState(item.discountValue ? String(item.discountValue) : '')
  return (
    <div
      className="rst-item-disc"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        onCommit(item, type, value)
        onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLElement).blur()
      }}
    >
      <DiscountField
        label="خصم الصنف"
        autoFocus
        base={item.qty * item.unitPrice}
        maxPercent={maxPercent}
        type={type}
        value={value}
        onChange={(t, v) => {
          setType(t)
          setValue(v)
        }}
      />
    </div>
  )
}

function PaymentModal({
  groups,
  initialGroup,
  items,
  customerLabel,
  onCustomerLabelChange,
  onCustomerLabelSave,
  discountType,
  discountValue,
  customers,
  customerId,
  onCustomerChange,
  computeTotals,
  taxLabel,
  busy,
  onCancel,
  onPay
}: {
  taxLabel: string
  groups: number[]
  initialGroup: number | 'all'
  items: RestaurantOrderItemView[]
  customerLabel: string
  onCustomerLabelChange: (v: string) => void
  onCustomerLabelSave: () => void
  discountType: 'percent' | 'value'
  discountValue: number
  customers: CustomerView[]
  customerId: number | null
  onCustomerChange: (id: number | null) => void
  computeTotals: (
    subtotal: number,
    discountType: 'percent' | 'value',
    discountValue: number,
    isFinal: boolean
  ) => { discount: number; tax: number; service: number; delivery: number; total: number }
  busy: boolean
  onCancel: () => void
  onPay: (input: {
    group: number | 'all'
    discountType: 'percent' | 'value'
    discountValue: number
    paymentMethod: PaymentMethod
    paid: number
    tipAmount?: number
    total: number
  }) => Promise<void>
}): JSX.Element {
  const [group, setGroup] = useState<number | 'all'>(initialGroup)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paid, setPaid] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const groupItems = group === 'all' ? items : items.filter((i) => i.splitGroup === group)
  const subtotal = groupItems.reduce(
    (s, i) => s + i.qty * i.unitPrice - lineDiscountAmount(i.qty, i.unitPrice, i.discountType, i.discountValue),
    0
  )
  const isFinal = group === 'all' || groupItems.length === items.length
  const t = computeTotals(subtotal, discountType, discountValue, isFinal)
  const total = Math.round(t.total * 100) / 100
  const paidNum = paid === '' ? total : Number(paid) || 0
  const diff = paidNum - total
  const [tipMode, setTipMode] = useState<'return' | 'tip'>('return')
  const [tipStr, setTipStr] = useState('')
  const changeAmt = method === 'cash' ? Math.max(0, diff) : 0
  const tipAmount =
    method === 'credit'
      ? 0
      : method !== 'cash'
        ? Math.max(0, Number(tipStr) || 0)
        : tipMode === 'tip'
          ? Math.min(changeAmt, tipStr === '' ? changeAmt : Math.max(0, Number(tipStr) || 0))
          : 0

  const quick = Array.from(new Set([total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 200) * 200])).filter(
    (v) => v >= total
  )

  async function submit(): Promise<void> {
    setErr(null)
    if (method === 'credit' && !customerId) {
      setErr('الدفع الآجل محتاج تختار عميل')
      return
    }
    if (method !== 'credit' && paidNum < total - 0.001) {
      setErr('المبلغ المستلم أقل من الإجمالي — لو العميل هيدفع بعدين اختار "آجل"')
      return
    }
    try {
      await onPay({
        group,
        discountType,
        discountValue,
        paymentMethod: method,
        // الآجل بيتسجل بالكامل على رصيد العميل، والمدفوع بيتجمع في درج الوردية — فالفكة اللي رجعت للعميل ما تتحسبش
        paid: method === 'credit' ? 0 : total,
        tipAmount,
        total
      })
    } catch (e: any) {
      setErr(e?.message ?? 'تعذر إتمام الدفع')
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onCancel}>
      <div className="qcp-modal" style={{ width: 'min(560px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>💳 الدفع</h3>

        {groups.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div className="rst-seg">
              {groups.map((g) => (
                <button key={g} type="button" className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>
                  فاتورة {g}
                </button>
              ))}
              <button type="button" className={group === 'all' ? 'active' : ''} onClick={() => setGroup('all')}>
                الكل مرة واحدة
              </button>
            </div>
          </div>
        )}

        <div className="rst-pay-total">
          <div className="label">المطلوب</div>
          <div className="value">{currency(total)}</div>
          <div style={{ fontSize: 12, color: 'var(--qcp-ink-muted)' }}>
            المجموع {currency(subtotal)}
            {t.discount > 0 && ` − خصم ${currency(t.discount)}`}
            {t.tax > 0 && ` + ${taxLabel} ${currency(t.tax)}`}
            {t.service > 0 && ` + خدمة ${currency(t.service)}`}
            {t.delivery > 0 && ` + توصيل ${currency(t.delivery)}`}
          </div>
        </div>

        <div className="rst-methods">
          {PAYMENT_METHODS.map((m) => (
            <button key={m.value} type="button" className={method === m.value ? 'active' : ''} onClick={() => setMethod(m.value)}>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div className="qcp-field">
            <label>العميل</label>
            <select className="qcp-select" value={customerId ?? ''} onChange={(e) => onCustomerChange(e.target.value ? Number(e.target.value) : null)}>
              <option value="">عميل عابر</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` — ${c.phone}` : ''}
                </option>
              ))}
            </select>
            {customerId === null && (
              <input
                className="qcp-input"
                style={{ marginTop: 6 }}
                maxLength={80}
                placeholder="اكتب اسم العميل (اختياري)"
                value={customerLabel}
                onChange={(e) => onCustomerLabelChange(e.target.value)}
                onBlur={onCustomerLabelSave}
              />
            )}
          </div>
        </div>

        {method !== 'credit' && (
        <div className="qcp-field">
          <label>المبلغ المستلم</label>
          <input
            className="qcp-input"
            type="number"
            min={0}
            value={paid}
            placeholder={String(total)}
            onChange={(e) => setPaid(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            style={{ fontSize: 18, fontWeight: 800 }}
          />
          {method === 'cash' && (
            <div className="rst-quick-cash">
              {quick.map((v) => (
                <button key={v} type="button" onClick={() => setPaid(String(v))}>
                  {currency(v)}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {method === 'credit' && (
          <div className="rst-change due">
            <span>هيتسجل على حساب العميل</span>
            <span>{currency(total)}</span>
          </div>
        )}

        {method !== 'credit' && Math.abs(diff) >= 0.01 && (
          <div className={`rst-change ${diff < 0 ? 'due' : ''}`}>
            <span>{diff < 0 ? 'متبقي على العميل' : 'الباقي'}</span>
            <span>{currency(Math.abs(diff))}</span>
          </div>
        )}
        {method !== 'cash' && method !== 'credit' && (
          <div className="qcp-field" style={{ marginTop: 8 }}>
            <label>🎁 إكرامية (تيبس) — اختياري</label>
            <input className="qcp-input" type="number" min={0} value={tipStr} onChange={(e) => setTipStr(e.target.value)} />
          </div>
        )}
        {changeAmt >= 0.01 && (
          <>
            <div className="rst-methods" style={{ marginTop: 8 }}>
              <button type="button" className={tipMode === 'return' ? 'active' : ''} onClick={() => setTipMode('return')}>
                ↩️ رد الباقي للعميل
              </button>
              <button type="button" className={tipMode === 'tip' ? 'active' : ''} onClick={() => setTipMode('tip')}>
                🎁 إكرامية (تيبس)
              </button>
            </div>
            {tipMode === 'tip' && (
              <div className="qcp-field" style={{ marginTop: 8 }}>
                <label>قيمة الإكرامية (الباقي يتردّ للعميل: {currency(changeAmt - tipAmount)})</label>
                <input
                  className="qcp-input"
                  type="number"
                  min={0}
                  max={changeAmt}
                  value={tipStr}
                  placeholder={String(Math.round(changeAmt * 100) / 100)}
                  onChange={(e) => setTipStr(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {err && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="rst-big-btn pay" style={{ flex: 2 }} disabled={busy || !groupItems.length} onClick={submit}>
            {busy ? '...جاري الحفظ' : `💾 حفظ نهائي ${currency(total)}`}
          </button>
          <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onCancel}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
