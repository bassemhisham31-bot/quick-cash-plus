import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { hasPermission, isViewLicensed } from '../../lib/permissions'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import { colorFor } from '../restaurant/restaurantUi'
import { DeliveryInfoModal } from '../restaurant/OrderScreen'
import { DiscountField } from '../restaurant/DiscountField'
import { discountRules } from '../../lib/discount'
import { confirmDialog } from '../../components/ConfirmDialogHost'
import { lineDiscountAmount } from '../../../../shared/types'
import { SalesReturnFlow } from '../returns/SalesReturnFlow'
import { ensureDeleteAllowed } from '../../lib/deleteGuard'
import '../restaurant/restaurant.css'
import './pos.css'
import type {
  CartLine,
  HeldInvoice,
  HeldInvoiceInput,
  Category,
  CustomerView,
  DeliveryDriver,
  DeliveryZone,
  InvoiceView,
  LoyaltySettings,
  PaymentMethod,
  PosUiSettings,
  PriceTier,
  PrintSettings,
  Product,
  RestaurantTable,
  SalesRep,
  TaxSettings,
  Warehouse
} from '../../../../shared/types'

const TIER_LABELS: Record<PriceTier, string> = {
  retail: 'قطاعي',
  wholesale: 'جملة',
  wholesale2: 'جملة الجملة',
  pack: 'عبوة'
}

const PAYMENT_ICONS: Record<string, string> = {
  cash: '💵',
  card: '💳',
  wallet: '👛',
  vodafone_cash: '📱',
  instapay: '⚡',
  mixed: '🔀',
  credit: '📒'
}

/** الكمية اللي تحتها الصنف يتعلّم "قرب يخلص" على كارت البيع */
const LOW_STOCK = 5

function priceForTier(product: Product, tier: PriceTier): number {
  if (tier === 'retail') return product.retailPrice
  return product.prices[tier] ?? product.retailPrice
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

export function PosPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const disabledFeatures = useAppStore((s) => s.disabledFeatures)

  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discountType, setDiscountType] = useState<'percent' | 'value'>('value')
  const [discountValue, setDiscountValue] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  /** رصيد كل صنف في السلة في كل مخزن (productId → warehouseId → qty) */
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [lineStocks, setLineStocks] = useState<Record<number, Record<number, number>>>({})
  const [heldList, setHeldList] = useState<HeldInvoice[]>([])
  const [showHeld, setShowHeld] = useState(false)
  const [heldMessage, setHeldMessage] = useState<string | null>(null)
  const posOpenHeld = useAppStore((s) => s.posOpenHeld)
  const setPosOpenHeld = useAppStore((s) => s.setPosOpenHeld)
  /** السطور اللي خانة الخصم بتاعتها مفتوحة (productId) */
  const [discountOpen, setDiscountOpen] = useState<Set<number>>(new Set())
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paid, setPaid] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<InvoiceView | null>(null)
  const [lastChange, setLastChange] = useState(0)
  const [lastTip, setLastTip] = useState(0)
  const [tipMode, setTipMode] = useState<'return' | 'tip'>('return')
  const [tipStr, setTipStr] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  const [dayOpen, setDayOpen] = useState(true)
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [priceTier, setPriceTier] = useState<PriceTier>('retail')
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null)
  const [printSettings, setPrintSettings] = useState<PrintSettings | null>(null)
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null)
  const [redeemPoints, setRedeemPoints] = useState('0')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [salesReps, setSalesReps] = useState<SalesRep[]>([])
  const [salesRepId, setSalesRepId] = useState<number | null>(null)
  const [vendorSettlement, setVendorSettlement] = useState('0')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [posUiSettings, setPosUiSettings] = useState<PosUiSettings | null>(null)
  const [showTempItem, setShowTempItem] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [drawerMessage, setDrawerMessage] = useState<string | null>(null)
  const [openingDrawer, setOpeningDrawer] = useState(false)
  const [restaurantTables, setRestaurantTables] = useState<RestaurantTable[]>([])
  const [dineInEnabled, setDineInEnabled] = useState(false)
  const [tableId, setTableId] = useState<number | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [notFound, setNotFound] = useState<string | null>(null)
  // ديلفري من شاشة البيع العادية: null = بيع عادي
  const [delivery, setDelivery] = useState<{ address: string; mark: string; fee: string; driverId: number | null } | null>(null)
  const [showDelivery, setShowDelivery] = useState(false)
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([])
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const deliveryAllowed = isViewLicensed('delivery', disabledFeatures)
  const [showReturn, setShowReturn] = useState(false)
  const canReturn = hasPermission(user, 'pos.return') || hasPermission(user, 'invoices.manage')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.cash.getOpenSession().then((s) => setDayOpen(!!s))
    window.api.customers.list('').then(setCustomers)
    window.api.settings.getTax().then(setTaxSettings)
    window.api.settings.getPrint().then(setPrintSettings)
    window.api.settings.getLoyalty().then(setLoyaltySettings)
    window.api.settings.getPosUi().then(setPosUiSettings)
    window.api.salesReps.list(false).then(setSalesReps)
    window.api.catalog.listCategories().then(setCategories)
    window.api.catalog.listWarehouses().then((list) => {
      setWarehouses(list)
      const defaultId = list.find((w) => w.isDefault)?.id ?? list[0]?.id ?? null
      setWarehouseId(defaultId)
    })
    window.api.settings.listDeliveryDrivers().then(setDrivers)
  }, [])

  // الطاولات ومناطق التوصيل مش موجودة في النسخ اللي من غير مطاعم (السيرفر بيرفض قنواتها) — منناديهاش أصلًا هناك
  const tablesAllowed = isViewLicensed('restaurantTables', disabledFeatures)
  useEffect(() => {
    if (tablesAllowed) {
      window.api.settings.getRestaurant().then((s) => setDineInEnabled(s.dineInEnabled)).catch(() => {})
      window.api.restaurant.listTables().then(setRestaurantTables).catch(() => {})
    } else {
      setDineInEnabled(false)
      setRestaurantTables([])
    }
  }, [tablesAllowed])
  useEffect(() => {
    if (deliveryAllowed) window.api.delivery.listZones().then(setZones).catch(() => {})
    else setZones([])
  }, [deliveryAllowed])

  useEffect(() => {
    // يحدّث كميات المخزون المعروضة فورًا لو جهاز تاني باع نفس الصنف، من غير ما يمس السلة الحالية
    return window.api.onDataChanged(() => {
      if (warehouseId) window.api.catalog.listProducts(search, warehouseId).then(setProducts)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, search])

  useEffect(() => {
    if (!warehouseId) return
    const id = setTimeout(() => {
      window.api.catalog.listProducts(search, warehouseId).then(setProducts)
    }, 200)
    return () => clearTimeout(id)
  }, [search, warehouseId])

  useEffect(() => {
    if (!notFound) return
    const id = setTimeout(() => setNotFound(null), 3500)
    return () => clearTimeout(id)
  }, [notFound])

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.qty * l.unitPrice - l.discount, 0),
    [cart]
  )
  const discountTotal = useMemo(
    () => (discountType === 'percent' ? subtotal * (Number(discountValue) / 100) : Number(discountValue) || 0),
    [discountType, discountValue, subtotal]
  )
  const preTaxTotal = Math.max(0, subtotal - discountTotal)
  const taxTotal = taxSettings?.enabled ? preTaxTotal * (taxSettings.rate / 100) : 0

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null
  const phoneMatches =
    phoneSearch.trim().length >= 2
      ? customers
          .filter((c) => {
            const q = phoneSearch.trim()
            return (c.phone && c.phone.replace(/\s/g, '').includes(q)) || c.name.toLowerCase().includes(q.toLowerCase())
          })
          .slice(0, 8)
      : []
  const loyaltyActive = !!loyaltySettings?.enabled && !!selectedCustomer && selectedCustomer.loyaltyEnabled
  const maxRedeemablePoints = selectedCustomer ? Math.floor(selectedCustomer.loyaltyPoints) : 0
  const redeemPointsUsed = loyaltyActive ? Math.min(Number(redeemPoints) || 0, maxRedeemablePoints) : 0
  const redeemDiscount = redeemPointsUsed * (loyaltySettings?.redemptionValue ?? 0)

  const deliveryFee = delivery ? Math.max(0, Number(delivery.fee) || 0) : 0
  const total = Math.max(0, preTaxTotal + taxTotal + deliveryFee - redeemDiscount)
  const paidNum = paid === '' ? total : Number(paid) || 0
  const change = Math.max(0, paidNum - total)
  // الباقي إما يتردّ للعميل أو كله/جزء منه إكرامية (تيبس) بتدخل الدرج
  const tipAmount =
    paymentMethod === 'credit'
      ? 0
      : paymentMethod !== 'cash'
        ? Math.max(0, Number(tipStr) || 0)
        : tipMode === 'tip'
          ? Math.min(change, tipStr === '' ? change : Math.max(0, Number(tipStr) || 0))
          : 0
  const changeToReturn = Math.max(0, change - tipAmount)
  const earnedPointsPreview =
    loyaltyActive && loyaltySettings ? Math.floor(total * loyaltySettings.pointsPerCurrency) : 0

  const maxVendorSettlement =
    selectedCustomer?.linkedVendorId && selectedCustomer.linkedVendorBalance
      ? Math.min(selectedCustomer.linkedVendorBalance, total)
      : 0
  const vendorSettlementUsed = maxVendorSettlement > 0 ? Math.min(Number(vendorSettlement) || 0, maxVendorSettlement) : 0

  const itemsCount = cart.reduce((s, l) => s + l.qty, 0)
  const qtyInCart = useMemo(() => {
    const map = new Map<number, number>()
    for (const l of cart) map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty)
    return map
  }, [cart])
  const visibleProducts = products.filter((p) => p.showInPos && (categoryFilter === null || p.categoryId === categoryFilter))
  const { allowed: canDiscount, maxPercent: maxDiscountPercent } = discountRules(user, posUiSettings)
  const canEditPrice = !!posUiSettings?.priceEditEnabled && hasPermission(user, 'pos.editPrice')

  /* ------------------------------ الفواتير المعلّقة ------------------------------ */

  const holdEnabled = posUiSettings?.holdInvoicesEnabled !== false
  const cartRef = useRef({ cart, discountType, discountValue, customerId, customerLabel, warehouseId, total: 0 })
  cartRef.current = { cart, discountType, discountValue, customerId, customerLabel, warehouseId, total }
  const autoHoldRef = useRef(false)
  autoHoldRef.current = !!posUiSettings && posUiSettings.holdInvoicesEnabled && posUiSettings.autoHoldOnLeave

  const cartProductKey = cart.filter((l) => !l.isTemp).map((l) => l.productId).join(',')
  useEffect(() => {
    if (!cartProductKey) {
      setLineStocks({})
      return
    }
    window.api.catalog.stockByWarehouse(cartProductKey.split(',').map(Number)).then((rows) => {
      const map: Record<number, Record<number, number>> = {}
      for (const r of rows) (map[r.productId] ??= {})[r.warehouseId] = r.quantity
      setLineStocks(map)
    })
  }, [cartProductKey, dataVersion])

  function refreshHeld(): void {
    window.api.held.list().then(setHeldList).catch(() => {})
  }

  function buildHeldInput(): HeldInvoiceInput {
    const c = cartRef.current
    return {
      payload: {
        lines: c.cart,
        discountType: c.discountType,
        discountValue: Number(c.discountValue) || 0,
        customerId: c.customerId,
        customerLabel: c.customerLabel,
        warehouseId: c.warehouseId
      },
      total: c.total
    }
  }

  function resetCart(): void {
    setCart([])
    setDiscountValue('')
    setCustomerLabel('')
    setDiscountOpen(new Set())
    setCustomerId(null)
  }

  async function holdCurrent(): Promise<void> {
    if (!user || !cart.length) return
    await window.api.held.hold(buildHeldInput(), user.id)
    resetCart()
    setHeldMessage('⏸ الفاتورة اتعلّقت — ترجعلها من زرار "معلّقة"')
    refreshHeld()
  }

  async function recallHeld(held: HeldInvoice): Promise<void> {
    if (!user) return
    // اللي في السلة دلوقتي يتعلّق الأول عشان ما يضيعش
    if (cart.length) await window.api.held.hold(buildHeldInput(), user.id)
    const p = held.payload
    setCart(p.lines)
    setDiscountType(p.discountType)
    setDiscountValue(p.discountValue ? String(p.discountValue) : '')
    setCustomerId(p.customerId)
    setCustomerLabel(p.customerLabel ?? '')
    if (p.warehouseId) setWarehouseId(p.warehouseId)
    await window.api.held.delete(held.id)
    setShowHeld(false)
    refreshHeld()
  }

  async function deleteHeld(held: HeldInvoice): Promise<void> {
    if (!(await confirmDialog(`مسح الفاتورة المعلّقة #${held.id}؟`, { danger: true, confirmLabel: 'مسح' }))) return
    await window.api.held.delete(held.id)
    refreshHeld()
  }

  useEffect(() => {
    refreshHeld()
    // خرج من الشاشة وفيها فاتورة ما اتحفظتش → تتعلّق تلقائيًا (لو الخيار مفعّل)
    return () => {
      const c = cartRef.current
      if (autoHoldRef.current && c.cart.length && user) {
        window.api.held
          .hold(
            {
              payload: {
                lines: c.cart,
                discountType: c.discountType,
                discountValue: Number(c.discountValue) || 0,
                customerId: c.customerId,
                customerLabel: c.customerLabel,
                warehouseId: c.warehouseId
              },
              total: c.total
            },
            user.id
          )
          .catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (posOpenHeld) {
      setShowHeld(true)
      setPosOpenHeld(false)
      refreshHeld()
    }
  }, [posOpenHeld, setPosOpenHeld])

  function selectCustomer(id: number | null): void {
    setCustomerId(id)
    setPhoneSearch('')
    setRedeemPoints('0')
    setVendorSettlement('0')
  }

  /** بيعيد حساب قيمة خصم السطر بالجنيه بعد أي تغيير في الكمية أو السعر أو الخصم نفسه */
  function withDiscount(l: CartLine): CartLine {
    return { ...l, discount: lineDiscountAmount(l.qty, l.unitPrice, l.discountType, l.discountValue) }
  }

  function addToCart(product: Product, qty = 1): void {
    if (product.quantity <= 0 && !posUiSettings?.allowNegativeStock) return
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? withDiscount({ ...l, qty: l.qty + qty }) : l))
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          unitPrice: priceForTier(product, priceTier),
          qty,
          discount: 0
        }
      ]
    })
    playSound('save')
  }

  async function updateQty(productId: number, qty: number): Promise<void> {
    if (qty <= 0) {
      await removeLine(productId)
      return
    }
    const line = cart.find((l) => l.productId === productId)
    if (!line) return
    // تقليل الكمية = حذف جزء من الصنف → نفس صلاحية الحذف (أو باسورد الأدمن)
    if (qty < line.qty) {
      const ok = await ensureDeleteAllowed(
        user,
        `تقليل كمية "${line.name}" من ${formatQty(line.qty)} إلى ${formatQty(qty)}`,
        `شاشة البيع: تقليل ${line.name} من ${formatQty(line.qty)} إلى ${formatQty(qty)}`
      )
      if (!ok) return
    }
    setCart((prev) => prev.map((l) => (l.productId === productId ? withDiscount({ ...l, qty }) : l)))
  }

  function updateLinePrice(productId: number, unitPrice: number): void {
    setCart((prev) => prev.map((l) => (l.productId === productId ? withDiscount({ ...l, unitPrice }) : l)))
  }

  function updateLineDiscount(productId: number, discountType: 'percent' | 'value', value: string): void {
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? withDiscount({ ...l, discountType, discountValue: Number(value) || 0 }) : l))
    )
  }

  function toggleLineDiscount(productId: number): void {
    setDiscountOpen((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  function setLineWarehouse(productId: number, lineWarehouseId: number): void {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, warehouseId: lineWarehouseId } : l)))
  }

  function updateLineSerial(productId: number, serialNumber: string): void {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, serialNumber } : l)))
  }

  async function removeLine(productId: number): Promise<void> {
    const line = cart.find((l) => l.productId === productId)
    if (!line) return
    const ok = await ensureDeleteAllowed(
      user,
      `حذف "${line.name}" من الفاتورة`,
      `شاشة البيع: حذف ${line.name} × ${formatQty(line.qty)} (${currency(line.qty * line.unitPrice)})`
    )
    if (!ok) return
    setCart((prev) => prev.filter((l) => l.productId !== productId))
    playSound('delete')
  }

  async function clearCart(): Promise<void> {
    if (!cart.length) return
    const ok = await ensureDeleteAllowed(
      user,
      'مسح كل الأصناف من الفاتورة؟',
      `شاشة البيع: مسح الفاتورة كلها (${cart.length} صنف، ${currency(subtotal)})`,
      { confirmIfAllowed: true }
    )
    if (!ok) return
    setCart([])
    setDiscountValue('')
    setDiscountOpen(new Set())
    playSound('delete')
    searchRef.current?.focus()
  }

  function addTempItem(name: string, price: number, qty: number): void {
    setCart((prev) => [
      ...prev,
      { productId: -Date.now(), name, barcode: '', unitPrice: price, qty, discount: 0, isTemp: true }
    ])
    setShowTempItem(false)
  }

  async function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>): Promise<void> {
    if (e.key !== 'Enter') return
    const term = search.trim()
    if (!term) {
      // Enter في خانة بحث فاضية = افتح الدفع على طول (أسرع للكاشير اللي شغال بالباركود)
      if (cart.length) openPayment()
      return
    }

    // القائمة المعروضة بتتحدّث بعد 200ms من الكتابة — الباركود سكانر بيكتب ويدوس Enter أسرع من كده،
    // فبنجيب نتيجة البحث طازة هنا بدل ما نطابق على قائمة قديمة (ممكن تضيف صنف غلط)
    const fresh = warehouseId ? await window.api.catalog.listProducts(term, warehouseId) : products
    const exact = fresh.find((p) => p.barcode === term)
    if (exact) {
      addToCart(exact)
      setSearch('')
      return
    }

    // باركود ميزان (وزن): {بادئة}{كود الصنف}{الوزن بالجرام}{رقم تحقق}
    if (/^\d{13}$/.test(term)) {
      const decoded = await window.api.barcode.decodeWeight(term)
      if (decoded.matched && decoded.productCode) {
        const byCode = await window.api.catalog.listProducts(decoded.productCode, warehouseId!)
        const product = byCode.find((p) => p.barcode === decoded.productCode)
        if (product) {
          addToCart(product, (decoded.weightGrams ?? 0) / 1000)
          setSearch('')
          return
        }
      }
    }

    // نتيجة بحث وحيدة بالاسم → نضيفها على طول
    const matches = fresh.filter((p) => p.showInPos)
    if (matches.length === 1) {
      addToCart(matches[0])
      setSearch('')
      return
    }
    if (!matches.length) {
      setNotFound(term)
      playSound('delete')
    }
  }

  async function handleOpenDrawer(): Promise<void> {
    setOpeningDrawer(true)
    setDrawerMessage(null)
    try {
      const result = await window.api.print.openDrawer()
      setDrawerMessage(result.ok ? null : (result.error ?? 'تعذر فتح الدرج'))
    } finally {
      setOpeningDrawer(false)
    }
  }

  function openPayment(): void {
    if (!cart.length) return
    setError(null)
    setPaid('')
    setTipMode('return')
    setTipStr('')
    setShowPayment(true)
  }

  async function handleCheckout(): Promise<void> {
    if (!user || !warehouseId || checkingOut) return
    setError(null)

    if (paymentMethod === 'credit' && customerId === null) {
      setError('لازم تختار عميل حقيقي عشان تسجل بيع آجل')
      return
    }
    if (paymentMethod === 'cash' && paidNum < total - 0.001) {
      setError('المبلغ المستلم أقل من الصافي — لو العميل هيدفع الباقي بعدين اختار "آجل"')
      return
    }

    setCheckingOut(true)
    try {
      const result = await window.api.pos.checkout(
        {
          customerId,
          customerLabel,
          warehouseId,
          lines: cart,
          discountType,
          discountValue: Number(discountValue) || 0,
          paymentMethod,
          // المدفوع = قيمة الفاتورة، مش المبلغ اللي العميل ادّاه — الفكة بترجع له، ودرج الوردية
          // بيجمع "paid" كفلوس داخلة فعلًا (قبل كده الفكة كانت بتتحسب زيادة في الدرج)
          paid: paymentMethod === 'credit' ? 0 : total,
          tipAmount,
          redeemPoints: redeemPointsUsed,
          salesRepId,
          vendorSettlementAmount: vendorSettlementUsed,
          orderType: delivery ? 'delivery' : tableId ? 'dine_in' : 'retail',
          tableId: delivery ? null : tableId,
          ...(delivery
            ? {
                deliveryFee,
                deliveryDriverId: delivery.driverId,
                deliveryAddress: delivery.address,
                deliveryMark: delivery.mark
              }
            : {})
        },
        user.id
      )

      if (!result.ok || !result.invoiceId) {
        setError(result.error ?? 'حدث خطأ')
        return
      }

      playSound('sell')
      setLastChange(paymentMethod === 'cash' ? changeToReturn : 0)
      setLastTip(tipAmount)
      setShowPayment(false)
      const view = await window.api.invoices.getView(result.invoiceId)
      setReceipt(view)
      if (printSettings?.autoPrintAfterSale) {
        window.api.print.receipt(result.invoiceId)
      }
      setCart([])
      setDiscountValue('')
      setCustomerLabel('')
      setDiscountOpen(new Set())
      setPaid('')
      setPaymentMethod('cash')
      setCustomerId(null)
      setRedeemPoints('0')
      setSalesRepId(null)
      setVendorSettlement('0')
      setPhoneSearch('')
      setTableId(null)
      setDelivery(null)
      window.api.customers.list('').then(setCustomers)
      window.api.catalog.listProducts(search, warehouseId).then(setProducts)
    } finally {
      setCheckingOut(false)
    }
  }

  const sidebarEnabled = !!posUiSettings?.categorySidebarEnabled
  const quickCash = Array.from(
    new Set([total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 200) * 200])
  )
    .filter((v) => v >= total && v > 0)
    .slice(0, 5)

  const paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: t('pos.cash') },
    { value: 'card', label: t('pos.card') },
    { value: 'wallet', label: t('pos.wallet') },
    { value: 'vodafone_cash', label: t('pos.vodafoneCash') },
    { value: 'instapay', label: t('pos.instapay') },
    { value: 'mixed', label: t('pos.mixed') },
    { value: 'credit', label: t('pos.credit') }
  ]

  return (
    <div
      className="rst-root rst-order"
      style={{
        gridTemplateColumns: sidebarEnabled ? '170px minmax(0, 1fr) 400px' : 'minmax(0, 1fr) 400px',
        overflow: 'hidden'
      }}
    >
      {sidebarEnabled && (
        <div className="rst-cats-side">
          <button type="button" className={`rst-cat ${categoryFilter === null ? 'active' : ''}`} onClick={() => setCategoryFilter(null)}>
            {t('posUi.allCategories')}
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

      {/* ------------------------------ الأصناف ------------------------------ */}
      <div className="rst-menu">
        <div className="pos-topbar">
          <h1 className="pos-title">🛒 {t('pos.title')}</h1>
          <div className="pos-tools">
            {posUiSettings?.multiWarehouseEnabled !== false && warehouses.length > 1 && (
              <select className="qcp-select" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(Number(e.target.value))} title="المخزن">
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    🏬 {w.name}
                  </option>
                ))}
              </select>
            )}
            <div className="rst-seg" title="شريحة السعر">
              {(Object.keys(TIER_LABELS) as PriceTier[]).map((tier) => (
                <button key={tier} type="button" className={priceTier === tier ? 'active' : ''} onClick={() => setPriceTier(tier)}>
                  {TIER_LABELS[tier]}
                </button>
              ))}
            </div>
            {deliveryAllowed && (
              <button
                type="button"
                className={`pos-tool-btn ${delivery ? 'active' : ''}`}
                onClick={() => setShowDelivery(true)}
                title="بيع ديلفري: عميل + عنوان + رسوم توصيل + طيار"
              >
                🛵 ديلفري
              </button>
            )}
            {canReturn && (
              <button type="button" className="pos-tool-btn" onClick={() => setShowReturn(true)} title="مرتجع من فاتورة بيع سابقة">
                ↩️ مرتجع
              </button>
            )}
            {!delivery && dineInEnabled && restaurantTables.length > 0 && (
              <select className="qcp-select" value={tableId ?? ''} onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">🪑 بدون ترابيزة</option>
                {restaurantTables
                  .filter((tb) => tb.status === 'available' || tb.id === tableId)
                  .map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      🪑 {tb.name}
                    </option>
                  ))}
              </select>
            )}
            {posUiSettings?.allowTempItem && (
              <button type="button" className="pos-tool-btn" onClick={() => setShowTempItem(true)}>
                ✚ {t('posUi.tempItemButton')}
              </button>
            )}
            <button type="button" className="pos-tool-btn" disabled={openingDrawer} onClick={handleOpenDrawer}>
              🗄️ {t('pos.openDrawer')}
            </button>
          </div>
        </div>

        {!dayOpen && <div className="rst-error">⚠️ {t('pos.dayNotStarted')}</div>}
        {drawerMessage && <div className="rst-error">{drawerMessage}</div>}

        <div className="pos-search">
          <span className="ic">🔍</span>
          <input
            ref={searchRef}
            placeholder={t('pos.searchPlaceholder') ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => void handleSearchKeyDown(e)}
            autoFocus
          />
          <span className="hint">{search ? 'Enter = إضافة' : cart.length ? 'Enter = دفع' : 'باركود / اسم'}</span>
        </div>
        {notFound && <div className="rst-error">مفيش صنف بالكود/الاسم "{notFound}"</div>}

        {!sidebarEnabled && categories.length > 0 && (
          <div className="rst-cats">
            <button type="button" className={`rst-cat ${categoryFilter === null ? 'active' : ''}`} onClick={() => setCategoryFilter(null)}>
              {t('posUi.allCategories')}
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
            const out = p.quantity <= 0 && !posUiSettings?.allowNegativeStock
            const inCart = qtyInCart.get(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={`rst-product ${out ? 'out' : ''}`}
                onClick={() => addToCart(p)}
                disabled={out}
                title={p.barcode}
              >
                <div className="rst-product-img" style={{ background: p.imageDataUrl ? 'var(--qcp-bg-sunken)' : colorFor(p.name) }}>
                  {p.imageDataUrl ? <img src={p.imageDataUrl} alt="" /> : p.name.trim().charAt(0)}
                </div>
                <div className="rst-product-body">
                  <div className="rst-product-name">{p.name}</div>
                  <div className="rst-product-price">{currency(priceForTier(p, priceTier))}</div>
                  <span className={`pos-stock ${out ? 'out' : p.quantity <= LOW_STOCK ? 'low' : ''}`}>
                    {out ? 'نفذ' : p.quantity <= 0 ? `رصيد ${formatQty(p.quantity)} (بالسالب)` : `متاح ${formatQty(p.quantity)}`}
                  </span>
                </div>
                {inCart ? <span className="rst-product-qty">{formatQty(inCart)}</span> : null}
              </button>
            )
          })}
          {!visibleProducts.length && (
            <div className="rst-empty" style={{ gridColumn: '1 / -1' }}>
              <span className="big">📦</span>
              {search ? 'مفيش أصناف مطابقة للبحث' : 'مفيش أصناف في التصنيف ده'}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------ الفاتورة ------------------------------ */}
      <div className="rst-cart">
        <div className="rst-cart-head">
          <div className="rst-cart-title">
            <span>🧾 الفاتورة ({formatQty(itemsCount)})</span>
            {cart.length > 0 && (
              <button type="button" className="rst-icon-btn danger" title="مسح الفاتورة" onClick={clearCart}>
                🗑 مسح
              </button>
            )}
          </div>

          {selectedCustomer ? (
            <div className="rst-info-card" style={{ cursor: 'default' }}>
              <span style={{ fontSize: 18 }}>👤</span>
              <div className="grow">
                <div className="line">
                  <strong>{selectedCustomer.name}</strong>
                  {selectedCustomer.phone ? ` — ${selectedCustomer.phone}` : ''}
                </div>
                <div className="pos-badges">
                  {selectedCustomer.balance !== 0 && (
                    <span className={`pos-badge ${selectedCustomer.balance > 0 ? 'due' : ''}`}>
                      {selectedCustomer.balance > 0 ? 'عليه' : 'له'} {currency(Math.abs(selectedCustomer.balance))}
                    </span>
                  )}
                  {loyaltyActive && <span className="pos-badge gold">⭐ {maxRedeemablePoints} نقطة</span>}
                  {selectedCustomer.linkedVendorId && maxVendorSettlement > 0 && (
                    <span className="pos-badge">🔁 مورد: {currency(selectedCustomer.linkedVendorBalance ?? 0)}</span>
                  )}
                </div>
              </div>
              <button type="button" className="rst-icon-btn" title="إزالة العميل" onClick={() => selectCustomer(null)}>
                ✕
              </button>
            </div>
          ) : (
            <div className="pos-customer-search">
              <input
                className="qcp-input"
                type="text"
                placeholder={`👤 ${t('pos.walkInCustomer')} — ابحث بالاسم أو الموبايل`}
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phoneMatches.length >= 1) selectCustomer(phoneMatches[0].id)
                  if (e.key === 'Escape') setPhoneSearch('')
                }}
              />
              <button type="button" className="pos-tool-btn" style={{ padding: '6px 10px' }} onClick={() => setShowAddCustomer(true)}>
                ✚ عميل
              </button>
              {phoneMatches.length > 0 && (
                <div className="pos-dropdown">
                  {phoneMatches.map((c) => (
                    <button key={c.id} type="button" onClick={() => selectCustomer(c.id)}>
                      <strong>{c.name}</strong> — {c.phone || '—'}
                      {c.balance !== 0 && (
                        <span style={{ fontSize: 11, color: c.balance > 0 ? 'var(--qcp-critical)' : 'var(--qcp-success)', marginInlineStart: 6 }}>
                          ({c.balance > 0 ? 'عليه' : 'له'} {currency(Math.abs(c.balance))})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {delivery && (
            <div className="rst-info-card" onClick={() => setShowDelivery(true)} title="تعديل بيانات التوصيل">
              <span style={{ fontSize: 18 }}>🛵</span>
              <div className="grow">
                <div className="line">
                  <strong>ديلفري</strong>
                  {delivery.driverId ? ` — ${drivers.find((d) => d.id === delivery.driverId)?.name ?? ''}` : ' — الطيار لاحقًا'}
                </div>
                <div className="line" style={{ color: 'var(--qcp-ink-muted)', fontSize: 12 }}>
                  📍 {delivery.address || selectedCustomer?.address || 'من غير عنوان'}
                  {delivery.mark ? ` (${delivery.mark})` : ''}
                </div>
              </div>
              <button
                type="button"
                className="rst-icon-btn"
                title="إلغاء الديلفري (بيع عادي)"
                onClick={(e) => {
                  e.stopPropagation()
                  setDelivery(null)
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div className="rst-items">
          {cart.length === 0 && (
            <div className="rst-empty">
              <span className="big">🛒</span>
              {t('pos.emptyCart')}
              <div style={{ fontSize: 12, marginTop: 6 }}>امسح باركود أو دوس على أي صنف</div>
            </div>
          )}
          {cart.map((line) => (
            <div key={line.productId} className="rst-item">
              <div className="rst-item-row">
                <div className="rst-item-name">
                  {line.name}
                  {line.isTemp && (
                    <span className="rst-sent" style={{ color: 'var(--qcp-accent)' }}>
                      {t('posUi.tempItemBadge')}
                    </span>
                  )}
                  {canEditPrice ? (
                    <input
                      className="qcp-input pos-price-edit"
                      type="number"
                      title="سعر الوحدة"
                      value={line.unitPrice}
                      onChange={(e) => updateLinePrice(line.productId, Number(e.target.value))}
                    />
                  ) : (
                    <small>{currency(line.unitPrice)}</small>
                  )}
                </div>
                <div className="rst-qty">
                  <button type="button" onClick={() => updateQty(line.productId, line.qty + 1)}>
                    +
                  </button>
                  <QtyInput qty={line.qty} onCommit={(v) => updateQty(line.productId, v)} />
                  <button type="button" onClick={() => updateQty(line.productId, line.qty - 1)}>
                    −
                  </button>
                </div>
                <div className="rst-item-total" style={{ minWidth: 72, textAlign: 'end' }}>
                  {currency(line.qty * line.unitPrice - line.discount)}
                </div>
                {canDiscount && (
                  <button
                    type="button"
                    className="rst-icon-btn"
                    title="خصم على الصنف"
                    style={{ color: line.discount > 0 ? 'var(--qcp-critical)' : undefined }}
                    onClick={() => toggleLineDiscount(line.productId)}
                  >
                    🏷
                  </button>
                )}
                <button type="button" className="rst-icon-btn danger" title="حذف" onClick={() => removeLine(line.productId)}>
                  🗑
                </button>
              </div>
              {!line.isTemp && posUiSettings?.multiWarehouseEnabled !== false && warehouses.length > 1 && (
                <div className="rst-item-disc" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="rst-disc-label">🏬 مخزن</span>
                  <select
                    className="qcp-select"
                    style={{ padding: '3px 6px', fontSize: 12 }}
                    value={line.warehouseId ?? warehouseId ?? ''}
                    onChange={(e) => setLineWarehouse(line.productId, Number(e.target.value))}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatQty(lineStocks[line.productId]?.[w.id] ?? 0)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {line.discount > 0 && !discountOpen.has(line.productId) && (
                <div className="rst-disc-tag">
                  🏷 خصم -{currency(line.discount)}
                  {line.discountType === 'percent' ? ` (${line.discountValue}%)` : ''}
                </div>
              )}
              {canDiscount && discountOpen.has(line.productId) && (
                <div className="rst-item-disc">
                  <DiscountField
                    label="خصم الصنف"
                    autoFocus
                    base={line.qty * line.unitPrice}
                    maxPercent={maxDiscountPercent}
                    type={line.discountType ?? 'value'}
                    value={line.discountValue ? String(line.discountValue) : ''}
                    onChange={(type, v) => updateLineDiscount(line.productId, type, v)}
                  />
                </div>
              )}
              {!line.isTemp && products.find((p) => p.id === line.productId)?.serialTrackingEnabled && (
                <input
                  className="qcp-input rst-item-note"
                  placeholder={t('pos.serialNumberPlaceholder') ?? ''}
                  value={line.serialNumber ?? ''}
                  onChange={(e) => updateLineSerial(line.productId, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="rst-totals">
          <div className="row">
            <span>{t('pos.subtotal')}</span>
            <span>{currency(subtotal)}</span>
          </div>
          {canDiscount && (
          <div className="row disc-row">
            <span>خصم الفاتورة</span>
            <DiscountField
              base={subtotal}
              maxPercent={maxDiscountPercent}
              type={discountType}
              value={discountValue}
              onChange={(type, v) => {
                setDiscountType(type)
                setDiscountValue(v)
              }}
            />
          </div>
          )}
          {discountTotal > 0 && (
            <div className="row" style={{ color: 'var(--qcp-critical)' }}>
              <span>{t('pos.discount')}</span>
              <span>-{currency(discountTotal)}</span>
            </div>
          )}
          {taxSettings?.enabled && (
            <div className="row">
              <span>
                {taxSettings.taxName} ({taxSettings.rate}%)
              </span>
              <span>+{currency(taxTotal)}</span>
            </div>
          )}
          {delivery && (
            <div className="row">
              <span>🛵 رسوم التوصيل</span>
              <span>+{currency(deliveryFee)}</span>
            </div>
          )}
          {redeemDiscount > 0 && (
            <div className="row" style={{ color: 'var(--qcp-critical)' }}>
              <span>
                {t('pos.redeemedPointsDiscount')} ({redeemPointsUsed} ⭐)
              </span>
              <span>-{currency(redeemDiscount)}</span>
            </div>
          )}
          <div className="row grand">
            <span>{t('pos.total')}</span>
            <span>{currency(total)}</span>
          </div>
          {loyaltyActive && earnedPointsPreview > 0 && (
            <div className="row" style={{ fontSize: 12 }}>
              <span>{t('pos.earnedPointsPreview')}</span>
              <span>+{earnedPointsPreview} ⭐</span>
            </div>
          )}
        </div>

        <div className="rst-actions" style={{ gridTemplateColumns: '1fr' }}>
          {error && !showPayment && <div className="rst-error" style={{ margin: 0 }}>⚠️ {error}</div>}
          <button type="button" className="rst-big-btn pay pos-pay-btn" disabled={cart.length === 0 || checkingOut} onClick={openPayment}>
            <span>💳 دفع</span>
            <span>{currency(total)}</span>
            <kbd>Enter</kbd>
          </button>
          {holdEnabled && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} disabled={!cart.length} onClick={holdCurrent}>
                ⏸ تعليق
              </button>
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  refreshHeld()
                  setShowHeld(true)
                }}
              >
                📋 معلّقة ({heldList.length})
              </button>
            </div>
          )}
          {heldMessage && <div style={{ fontSize: 12, color: 'var(--qcp-ink-muted)' }}>{heldMessage}</div>}
        </div>
      </div>

      {showHeld && (
        <div className="qcp-modal-backdrop" onClick={() => setShowHeld(false)}>
          <div className="qcp-modal" style={{ width: 'min(640px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>📋 الفواتير المعلّقة</h3>
            {heldList.length === 0 && <div className="rst-empty">مفيش فواتير معلّقة</div>}
            <div style={{ display: 'grid', gap: 8, maxHeight: '60vh', overflow: 'auto' }}>
              {heldList.map((h) => (
                <div key={h.id} className="qcp-card" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      #{h.id} · {formatQty(h.itemsCount)} صنف · {currency(h.total)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>
                      {h.createdAt}
                      {h.userName ? ` · ${h.userName}` : ''}
                      {h.customerLabel ? ` · ${h.customerLabel}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="qcp-btn qcp-btn-primary" onClick={() => recallHeld(h)}>
                      استرجاع
                    </button>
                    <button type="button" className="qcp-btn qcp-btn-secondary" title="طباعة" onClick={() => window.api.held.print(h.id, false)}>
                      🖨
                    </button>
                    <button type="button" className="qcp-btn qcp-btn-secondary" title="معاينة" onClick={() => window.api.held.print(h.id, true)}>
                      👁
                    </button>
                    <button type="button" className="qcp-btn qcp-btn-secondary" title="مسح" onClick={() => deleteHeld(h)}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="qcp-btn qcp-btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowHeld(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ نافذة الدفع ------------------------------ */}
      {showPayment && (
        <div className="qcp-modal-backdrop" onClick={() => !checkingOut && setShowPayment(false)}>
          <div
            className="qcp-modal"
            style={{ width: 'min(600px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowPayment(false)
            }}
          >
            <h3 style={{ marginTop: 0 }}>💳 الدفع</h3>

            <div className="rst-pay-total">
              <div className="label">المطلوب</div>
              <div className="value">{currency(total)}</div>
              <div style={{ fontSize: 12, color: 'var(--qcp-ink-muted)' }}>
                {formatQty(itemsCount)} صنف · المجموع {currency(subtotal)}
                {discountTotal > 0 && ` − خصم ${currency(discountTotal)}`}
                {taxTotal > 0 && ` + ${taxSettings?.taxName ?? 'ضريبة'} ${currency(taxTotal)}`}
                {deliveryFee > 0 && ` + توصيل ${currency(deliveryFee)}`}
                {redeemDiscount > 0 && ` − نقاط ${currency(redeemDiscount)}`}
              </div>
            </div>

            <div className="rst-methods" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {paymentMethods.map((m) => (
                <button key={m.value} type="button" className={paymentMethod === m.value ? 'active' : ''} onClick={() => setPaymentMethod(m.value)}>
                  {PAYMENT_ICONS[m.value]} {m.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div className="qcp-field">
                <label>{t('pos.customer')}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    className="qcp-select"
                    style={{ flex: 1, minWidth: 0 }}
                    value={customerId ?? ''}
                    onChange={(e) => selectCustomer(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{t('pos.walkInCustomer')}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="pos-tool-btn" style={{ padding: '6px 10px' }} onClick={() => setShowAddCustomer(true)}>
                    ✚
                  </button>
                </div>
                {customerId === null && (
                  <input
                    className="qcp-input"
                    style={{ marginTop: 6 }}
                    maxLength={80}
                    placeholder="اكتب اسم العميل (اختياري)"
                    value={customerLabel}
                    onChange={(e) => setCustomerLabel(e.target.value)}
                  />
                )}
              </div>
            </div>

            {(salesReps.length > 0 || loyaltyActive || maxVendorSettlement > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {salesReps.length > 0 && (
                  <div className="qcp-field">
                    <label>{t('salesReps.posLabel')}</label>
                    <select
                      className="qcp-select"
                      value={salesRepId ?? ''}
                      onChange={(e) => setSalesRepId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">{t('salesReps.posNone')}</option>
                      {salesReps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.commissionPercent}%)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {loyaltyActive && (
                  <div className="qcp-field">
                    <label>
                      ⭐ {t('pos.loyaltyPointsAvailable')}: {maxRedeemablePoints}
                    </label>
                    <input
                      className="qcp-input"
                      type="number"
                      min={0}
                      max={maxRedeemablePoints}
                      value={redeemPoints}
                      onChange={(e) => setRedeemPoints(e.target.value)}
                      placeholder={t('pos.redeemPointsPlaceholder') ?? ''}
                    />
                  </div>
                )}
                {maxVendorSettlement > 0 && (
                  <div className="qcp-field">
                    <label>
                      {t('parties.settleFromVendorLabel')} ({currency(maxVendorSettlement)})
                    </label>
                    <input
                      className="qcp-input"
                      type="number"
                      min={0}
                      max={maxVendorSettlement}
                      value={vendorSettlement}
                      onChange={(e) => setVendorSettlement(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'cash' && (
              <div className="qcp-field">
                <label>المبلغ المستلم من العميل</label>
                <input
                  className="qcp-input"
                  type="number"
                  min={0}
                  autoFocus
                  value={paid}
                  placeholder={String(Math.round(total * 100) / 100)}
                  onChange={(e) => setPaid(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCheckout()
                  }}
                  style={{ fontSize: 20, fontWeight: 800 }}
                />
                <div className="rst-quick-cash">
                  {quickCash.map((v) => (
                    <button key={v} type="button" onClick={() => setPaid(String(v))}>
                      {currency(v)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paymentMethod !== 'cash' && paymentMethod !== 'credit' && (
              <div className="qcp-field" style={{ marginTop: 8 }}>
                <label>🎁 إكرامية (تيبس) — اختياري</label>
                <input className="qcp-input" type="number" min={0} value={tipStr} onChange={(e) => setTipStr(e.target.value)} />
              </div>
            )}
            {paymentMethod === 'cash' && change > 0.001 && (
              <>
                <div className="rst-change">
                  <span>{t('pos.change')}</span>
                  <span>{currency(change)}</span>
                </div>
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
                    <label>قيمة الإكرامية (الباقي يتردّ للعميل: {currency(changeToReturn)})</label>
                    <input
                      className="qcp-input"
                      type="number"
                      min={0}
                      max={change}
                      value={tipStr}
                      placeholder={String(Math.round(change * 100) / 100)}
                      onChange={(e) => setTipStr(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
            {paymentMethod === 'cash' && paidNum < total - 0.001 && (
              <div className="rst-change due">
                <span>ناقص</span>
                <span>{currency(total - paidNum)}</span>
              </div>
            )}
            {paymentMethod === 'credit' && (
              <div className="rst-change due">
                <span>هيتسجل على حساب {selectedCustomer?.name ?? 'العميل'}</span>
                <span>{currency(total - vendorSettlementUsed)}</span>
              </div>
            )}

            {error && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="rst-big-btn pay"
                style={{ flex: 2 }}
                autoFocus={paymentMethod !== 'cash'}
                disabled={checkingOut}
                onClick={() => void handleCheckout()}
              >
                {checkingOut ? '...جاري التسجيل' : `✓ ${t('pos.checkout')} ${currency(total)}`}
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} disabled={checkingOut} onClick={() => setShowPayment(false)}>
                رجوع
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <ReceiptModal
          invoice={receipt}
          change={lastChange}
          tip={lastTip}
          qrEnabled={!!taxSettings?.qrEnabled}
          onClose={() => {
            setReceipt(null)
            setTimeout(() => searchRef.current?.focus(), 0)
          }}
        />
      )}

      {showAddCustomer && (
        <QuickAddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onCreated={(customer) => {
            setCustomers((prev) => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)))
            setCustomerId(customer.id)
            setShowAddCustomer(false)
          }}
        />
      )}

      {showDelivery && (
        <DeliveryInfoModal
          customers={customers}
          drivers={drivers}
          zones={zones}
          initial={{
            customerId,
            address: delivery?.address ?? '',
            mark: delivery?.mark ?? '',
            fee: delivery?.fee ?? '0',
            driverId: delivery?.driverId ?? null
          }}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
          onCancel={() => setShowDelivery(false)}
          onSave={(info) => {
            if (info.customerId !== customerId) selectCustomer(info.customerId)
            setDelivery({ address: info.address.trim(), mark: info.mark.trim(), fee: info.fee, driverId: info.driverId })
            setTableId(null)
            setShowDelivery(false)
            setTimeout(() => searchRef.current?.focus(), 0)
          }}
        />
      )}

      {showReturn && (
        <SalesReturnFlow
          allowEdit={hasPermission(user, 'invoices.manage')}
          onClose={() => {
            setShowReturn(false)
            setTimeout(() => searchRef.current?.focus(), 0)
          }}
          onReturned={() => {
            // المخزون ورصيد العميل اتغيروا
            if (warehouseId) window.api.catalog.listProducts(search, warehouseId).then(setProducts)
            window.api.customers.list('').then(setCustomers)
          }}
        />
      )}

      {showTempItem && <TempItemModal onClose={() => setShowTempItem(false)} onAdd={addTempItem} />}
    </div>
  )
}

/**
 * خانة الكمية: الرقم بيتسجل لما تدوس Enter أو تسيب الخانة — مش مع كل حرف. كده تعديل 5 لـ 12 مش بيعدّي
 * على "1" (تقليل = يطلب موافقة الأدمن)، ومسح الرقم أثناء الكتابة مش بيحذف الصنف.
 */
function QtyInput({ qty, onCommit }: { qty: number; onCommit: (qty: number) => Promise<void> }): JSX.Element {
  const [text, setText] = useState(String(qty))
  const skipCommit = useRef(false)
  // أحدث كمية فعلية — بعد الحفظ أو الرفض الخانة بترجع تعرضها (مش القيمة القديمة وقت الدوسة)
  const qtyRef = useRef(qty)
  qtyRef.current = qty
  useEffect(() => setText(String(qty)), [qty])

  function commit(): void {
    if (skipCommit.current) {
      skipCommit.current = false
      setText(String(qty))
      return
    }
    const v = Number(text.replace(/[٫,]/g, '.'))
    if (text.trim() === '' || !Number.isFinite(v) || v <= 0 || v === qty) {
      setText(String(qty))
      return
    }
    // لو التقليل اترفض الكمية بترجع زي ما كانت
    void onCommit(v).finally(() => setText(String(qtyRef.current)))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
        if (e.key === 'Escape') {
          skipCommit.current = true
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      style={{
        width: 42,
        border: 'none',
        textAlign: 'center',
        fontWeight: 800,
        fontSize: 13,
        background: 'transparent',
        color: 'var(--qcp-ink)'
      }}
    />
  )
}

function TempItemModal({
  onClose,
  onAdd
}: {
  onClose: () => void
  onAdd: (name: string, price: number, qty: number) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('0')
  const [qty, setQty] = useState('1')

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), Number(price) || 0, Number(qty) || 1)
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <form
        className="qcp-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
        }}
      >
        <h2 style={{ marginTop: 0 }}>{t('posUi.tempItemButton')}</h2>
        <div className="qcp-field">
          <label>{t('posUi.tempItemName')}</label>
          <input className="qcp-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="qcp-field">
          <label>{t('posUi.tempItemPrice')}</label>
          <input className="qcp-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="qcp-field">
          <label>{t('posUi.tempItemQty')}</label>
          <input className="qcp-input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="qcp-btn qcp-btn-primary" type="submit">
            {t('posUi.tempItemAdd')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" type="button" onClick={onClose}>
            {t('parties.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

function QuickAddCustomerModal({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (customer: CustomerView) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('parties.name') ?? '')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const customer = await window.api.customers.create({
        name: name.trim(),
        phone: phone.trim(),
        notes: '',
        openingBalance: 0
      })
      onCreated(customer)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <form
        className="qcp-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
        }}
      >
        <h2 style={{ marginTop: 0 }}>{t('pos.addCustomer')}</h2>
        <div className="qcp-field">
          <label>{t('parties.name')}</label>
          <input className="qcp-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="qcp-field">
          <label>{t('parties.phone')}</label>
          <input className="qcp-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {error && (
          <div className="qcp-pill critical" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="qcp-btn qcp-btn-primary" type="submit" disabled={saving}>
            {t('parties.save')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" type="button" onClick={onClose}>
            {t('parties.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

function ReceiptModal({
  invoice,
  change,
  tip,
  qrEnabled,
  onClose
}: {
  invoice: InvoiceView
  change: number
  tip: number
  qrEnabled: boolean
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (qrEnabled) window.api.invoices.getReceiptQr(invoice.id).then(setQr)
  }, [invoice.id, qrEnabled])

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div
        className="qcp-modal"
        style={{ width: 'min(430px, 94vw)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="pos-success-head">
          <div className="ok">✓</div>
          <h2 style={{ margin: '0 0 2px' }}>{t('pos.checkoutSuccess')} {invoice.number}</h2>
          <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 12 }}>{invoice.createdAt}</div>
        </div>

        {change > 0.001 && (
          <div className="rst-change" style={{ fontSize: 20, margin: '0 0 12px' }}>
            <span>{t('pos.change')}</span>
            <span>{currency(change)}</span>
          </div>
        )}

        {tip > 0.001 && (
          <div className="rst-change" style={{ fontSize: 16, margin: '0 0 12px' }}>
            <span>🎁 إكرامية</span>
            <span>{currency(tip)}</span>
          </div>
        )}

        <div className="pos-paper">
          {invoice.lines.map((l, idx) => (
            <div key={idx} className="row">
              <span>
                {l.productName} × {l.qty}
              </span>
              <span>{currency(l.total)}</span>
            </div>
          ))}
          <hr />
          {invoice.taxTotal > 0 && (
            <div className="row">
              <span>الضريبة</span>
              <span>{currency(invoice.taxTotal)}</span>
            </div>
          )}
          <div className="row" style={{ fontWeight: 800, fontSize: 14 }}>
            <span>{t('pos.total')}</span>
            <span>{currency(invoice.total)}</span>
          </div>
          {invoice.customerLoyaltyBalance !== null &&
            (invoice.loyaltyPointsEarned > 0 || invoice.loyaltyPointsRedeemed > 0) && (
              <>
                {invoice.loyaltyPointsRedeemed > 0 && (
                  <div className="row">
                    <span>{t('pos.redeemedPoints')}</span>
                    <span>-{invoice.loyaltyPointsRedeemed} ⭐</span>
                  </div>
                )}
                {invoice.loyaltyPointsEarned > 0 && (
                  <div className="row">
                    <span>{t('pos.earnedPoints')}</span>
                    <span>+{invoice.loyaltyPointsEarned} ⭐</span>
                  </div>
                )}
                <div className="row" style={{ fontWeight: 700 }}>
                  <span>{t('pos.currentPointsBalance')}</span>
                  <span>{invoice.customerLoyaltyBalance} ⭐</span>
                </div>
              </>
            )}
          {qr && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <img src={qr} alt="QR" width={110} height={110} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="qcp-btn qcp-btn-primary" style={{ flex: 1 }} onClick={() => window.api.print.receipt(invoice.id)}>
            🖨️ {t('common.print')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => window.api.print.previewReceipt(invoice.id)}>
            👁️ {t('common.preview')}
          </button>
        </div>
        <button className="rst-big-btn pay" style={{ width: '100%', marginTop: 10 }} autoFocus onClick={onClose}>
          ✚ فاتورة جديدة
        </button>
      </div>
    </div>
  )
}
