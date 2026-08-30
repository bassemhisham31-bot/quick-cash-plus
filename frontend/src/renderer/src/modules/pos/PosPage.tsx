import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { hasPermission } from '../../lib/permissions'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'
import type {
  CartLine,
  Category,
  CustomerView,
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

function priceForTier(product: Product, tier: PriceTier): number {
  if (tier === 'retail') return product.retailPrice
  return product.prices[tier] ?? product.retailPrice
}

export function PosPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)

  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discountType, setDiscountType] = useState<'percent' | 'value'>('value')
  const [discountValue, setDiscountValue] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paid, setPaid] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<InvoiceView | null>(null)
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
    window.api.settings.getRestaurant().then((s) => setDineInEnabled(s.dineInEnabled))
    window.api.restaurant.listTables().then(setRestaurantTables)
  }, [])

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
      ? customers.filter((c) => {
          const q = phoneSearch.trim()
          return (c.phone && c.phone.replace(/\s/g, '').includes(q)) || c.name.toLowerCase().includes(q.toLowerCase())
        })
      : []
  const loyaltyActive = !!loyaltySettings?.enabled && !!selectedCustomer && selectedCustomer.loyaltyEnabled
  const maxRedeemablePoints = selectedCustomer ? Math.floor(selectedCustomer.loyaltyPoints) : 0
  const redeemPointsUsed = loyaltyActive ? Math.min(Number(redeemPoints) || 0, maxRedeemablePoints) : 0
  const redeemDiscount = redeemPointsUsed * (loyaltySettings?.redemptionValue ?? 0)

  const total = Math.max(0, preTaxTotal + taxTotal - redeemDiscount)
  const change = Math.max(0, (Number(paid) || 0) - total)
  const earnedPointsPreview =
    loyaltyActive && loyaltySettings ? Math.floor(total * loyaltySettings.pointsPerCurrency) : 0

  const maxVendorSettlement =
    selectedCustomer?.linkedVendorId && selectedCustomer.linkedVendorBalance
      ? Math.min(selectedCustomer.linkedVendorBalance, total)
      : 0
  const vendorSettlementUsed = maxVendorSettlement > 0 ? Math.min(Number(vendorSettlement) || 0, maxVendorSettlement) : 0

  function selectCustomer(id: number | null): void {
    setCustomerId(id)
    setPhoneSearch('')
    setRedeemPoints('0')
    setVendorSettlement('0')
  }

  function addToCart(product: Product, qty = 1): void {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + qty } : l))
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
  }

  function updateQty(productId: number, qty: number): void {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, qty } : l))
    )
  }

  function updateLinePrice(productId: number, unitPrice: number): void {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, unitPrice } : l)))
  }

  function updateLineSerial(productId: number, serialNumber: string): void {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, serialNumber } : l)))
  }

  function removeLine(productId: number): void {
    setCart((prev) => prev.filter((l) => l.productId !== productId))
    playSound('delete')
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

    const exact = products.find((p) => p.barcode === term)
    if (exact) {
      addToCart(exact)
      setSearch('')
      return
    }

    // باركود ميزان (وزن): {بادئة}{كود الصنف}{الوزن بالجرام}{رقم تحقق}
    if (/^\d{13}$/.test(term)) {
      const decoded = await window.api.barcode.decodeWeight(term)
      if (decoded.matched && decoded.productCode) {
        const product = products.find((p) => p.barcode === decoded.productCode)
        if (product) {
          addToCart(product, (decoded.weightGrams ?? 0) / 1000)
          setSearch('')
        }
      }
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

  async function handleCheckout(): Promise<void> {
    if (!user || !warehouseId || checkingOut) return
    setError(null)

    if (paymentMethod === 'credit' && customerId === null) {
      setError('لازم تختار عميل حقيقي عشان تسجل بيع آجل')
      return
    }

    setCheckingOut(true)
    try {
      const result = await window.api.pos.checkout(
        {
          customerId,
          warehouseId,
          lines: cart,
          discountType,
          discountValue: Number(discountValue) || 0,
          paymentMethod,
          paid: paymentMethod === 'cash' ? Number(paid) || total : paymentMethod === 'credit' ? 0 : total,
          redeemPoints: redeemPointsUsed,
          salesRepId,
          vendorSettlementAmount: vendorSettlementUsed,
          orderType: tableId ? 'dine_in' : 'retail',
          tableId
        },
        user.id
      )

      if (!result.ok || !result.invoiceId) {
        setError(result.error ?? 'حدث خطأ')
        return
      }

      playSound('sell')
      const view = await window.api.invoices.getView(result.invoiceId)
      setReceipt(view)
      if (printSettings?.autoPrintAfterSale) {
        window.api.print.receipt(result.invoiceId)
      }
      setCart([])
      setDiscountValue('0')
      setPaid('0')
      setCustomerId(null)
      setRedeemPoints('0')
      setSalesRepId(null)
      setVendorSettlement('0')
      setPhoneSearch('')
      setTableId(null)
      window.api.customers.list('').then(setCustomers)
      window.api.catalog.listProducts(search, warehouseId).then(setProducts)
    } finally {
      setCheckingOut(false)
    }
  }

  const sidebarEnabled = !!posUiSettings?.categorySidebarEnabled

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: sidebarEnabled ? '180px minmax(0, 1fr) 340px' : 'minmax(0, 1fr) 340px',
        gap: 18,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden'
      }}
    >
      {sidebarEnabled && (
        <div className="qcp-card" style={{ padding: 10, overflowY: 'auto', minHeight: 0 }}>
          <button
            type="button"
            className="qcp-btn qcp-btn-secondary"
            style={{ width: '100%', marginBottom: 6, fontWeight: categoryFilter === null ? 700 : 400 }}
            onClick={() => setCategoryFilter(null)}
          >
            {t('posUi.allCategories')}
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
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <div className="qcp-page-header" style={{ flex: '0 0 auto' }}>
          <h1>{t('pos.title')}</h1>
        </div>

        {!dayOpen && (
          <div className="qcp-callout" style={{ flex: '0 0 auto', marginBottom: 14 }}>
            {t('pos.dayNotStarted')}
          </div>
        )}

        <div style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {posUiSettings?.multiWarehouseEnabled !== false && (
            <select className="qcp-select" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(Number(e.target.value))}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <select className="qcp-select" value={priceTier} onChange={(e) => setPriceTier(e.target.value as PriceTier)}>
            {(Object.keys(TIER_LABELS) as PriceTier[]).map((tier) => (
              <option key={tier} value={tier}>
                {TIER_LABELS[tier]}
              </option>
            ))}
          </select>
          {dineInEnabled && restaurantTables.length > 0 && (
            <select
              className="qcp-select"
              value={tableId ?? ''}
              onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">بدون ترابيزة</option>
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
            <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setShowTempItem(true)}>
              + {t('posUi.tempItemButton')}
            </button>
          )}
          <button type="button" className="qcp-btn qcp-btn-secondary" disabled={openingDrawer} onClick={handleOpenDrawer}>
            🗄️ {t('pos.openDrawer')}
          </button>
          <input
            className="qcp-input"
            style={{ flex: 1, minWidth: 160 }}
            placeholder={t('pos.searchPlaceholder') ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => void handleSearchKeyDown(e)}
            autoFocus
          />
        </div>

        {drawerMessage && (
          <div className="qcp-pill critical" style={{ flex: '0 0 auto', marginBottom: 10, width: 'fit-content' }}>
            {drawerMessage}
          </div>
        )}

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 12
            }}
          >
            {products
              .filter((p) => p.showInPos && (categoryFilter === null || p.categoryId === categoryFilter))
              .map((p) => (
                <button
                  key={p.id}
                  className="qcp-card"
                  style={{ textAlign: 'start', cursor: 'pointer', border: 'none' }}
                  onClick={() => addToCart(p)}
                  disabled={p.quantity <= 0}
                >
                  <div
                    style={{
                      width: '100%',
                      height: 72,
                      borderRadius: 8,
                      overflow: 'hidden',
                      marginBottom: 8,
                      background: 'var(--qcp-bg-sunken)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {p.imageDataUrl ? (
                      <img src={p.imageDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 24 }}>📦</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>{p.name}</div>
                  <div style={{ fontFamily: 'var(--qcp-mono)', fontSize: 11, color: 'var(--qcp-ink-faint)' }}>
                    {p.barcode}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span className="qcp-pill accent">{currency(priceForTier(p, priceTier))}</span>
                    <span className={`qcp-pill ${p.quantity <= 0 ? 'critical' : ''}`}>{p.quantity}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className="qcp-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <h3 style={{ marginTop: 0, flex: '0 0 auto' }}>{t('pos.cart')}</h3>

        <div
          style={{
            flex: '0 1 auto',
            minHeight: 120,
            maxHeight: '58%',
            overflowY: 'auto',
            marginBottom: 12,
            borderBottom: '1px dashed var(--qcp-border)',
            paddingBottom: 6
          }}
        >
          {cart.length === 0 && (
            <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>{t('pos.emptyCart')}</p>
          )}
          {cart.map((line) => (
            <div
              key={line.productId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--qcp-border)',
                fontSize: 13
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {line.name} {line.isTemp && <span className="qcp-pill accent">{t('posUi.tempItemBadge')}</span>}
                </div>
                {posUiSettings?.priceEditEnabled && hasPermission(user, 'pos.editPrice') ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <input
                      className="qcp-input"
                      type="number"
                      style={{ width: 70, padding: '2px 6px', fontSize: 11.5 }}
                      value={line.unitPrice}
                      onChange={(e) => updateLinePrice(line.productId, Number(e.target.value))}
                    />
                    <span style={{ color: 'var(--qcp-ink-faint)', fontSize: 11.5 }}>× {line.qty}</span>
                  </div>
                ) : (
                  <div style={{ color: 'var(--qcp-ink-faint)', fontSize: 11.5 }}>
                    {currency(line.unitPrice)} × {line.qty}
                  </div>
                )}
                {!line.isTemp && products.find((p) => p.id === line.productId)?.serialTrackingEnabled && (
                  <input
                    className="qcp-input"
                    style={{ width: '100%', marginTop: 4, padding: '2px 6px', fontSize: 11.5 }}
                    placeholder={t('pos.serialNumberPlaceholder') ?? ''}
                    value={line.serialNumber ?? ''}
                    onChange={(e) => updateLineSerial(line.productId, e.target.value)}
                  />
                )}
              </div>
              <input
                className="qcp-input"
                type="number"
                style={{ width: 56, padding: '4px 6px', textAlign: 'center' }}
                value={line.qty}
                onChange={(e) => updateQty(line.productId, Number(e.target.value))}
              />
              <button
                className="qcp-btn qcp-btn-secondary"
                style={{ padding: '4px 8px', marginInlineStart: 6 }}
                onClick={() => removeLine(line.productId)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
        <div className="qcp-field">
          <label>{t('pos.customerPhoneSearch')}</label>
          <div style={{ position: 'relative' }}>
            <input
              className="qcp-input"
              style={{ width: '100%' }}
              type="tel"
              placeholder={t('pos.customerPhoneSearchPlaceholder') ?? ''}
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
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="qcp-field">
          <label>{t('pos.customer')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="qcp-select"
              style={{ flex: 1 }}
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
            <button
              type="button"
              className="qcp-btn qcp-btn-secondary"
              style={{ padding: '6px 10px' }}
              onClick={() => setShowAddCustomer(true)}
            >
              {t('pos.addCustomer')}
            </button>
          </div>
        </div>

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

        {maxVendorSettlement > 0 && (
          <div className="qcp-field">
            <label>
              {t('parties.settleFromVendorLabel')} ({t('parties.settleFromVendorAvailable')}:{' '}
              {currency(maxVendorSettlement)})
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

        {loyaltyActive && selectedCustomer && (
          <div className="qcp-field">
            <label>
              {t('pos.loyaltyPointsAvailable')}: {maxRedeemablePoints} ⭐
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

        <div className="qcp-field">
          <label>{t('pos.discount')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="qcp-select"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percent' | 'value')}
            >
              <option value="value">ج.م</option>
              <option value="percent">%</option>
            </select>
            <input
              className="qcp-input"
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>
        </div>

        <div className="qcp-field">
          <label>{t('pos.paymentMethod')}</label>
          <select
            className="qcp-select"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            <option value="cash">{t('pos.cash')}</option>
            <option value="credit">{t('pos.credit')}</option>
            <option value="card">{t('pos.card')}</option>
            <option value="wallet">{t('pos.wallet')}</option>
            <option value="mixed">{t('pos.mixed')}</option>
            <option value="vodafone_cash">{t('pos.vodafoneCash')}</option>
            <option value="instapay">{t('pos.instapay')}</option>
          </select>
        </div>

        {paymentMethod === 'cash' && (
          <div className="qcp-field">
            <label>{t('pos.paid')}</label>
            <input className="qcp-input" type="number" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
        )}

        <div style={{ borderTop: '1px dashed var(--qcp-border)', paddingTop: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>{t('pos.subtotal')}</span>
            <span>{currency(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>{t('pos.discount')}</span>
            <span>-{currency(discountTotal)}</span>
          </div>
          {taxSettings?.enabled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{taxSettings.taxName} ({taxSettings.rate}%)</span>
              <span>+{currency(taxTotal)}</span>
            </div>
          )}
          {redeemDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--qcp-critical)' }}>
              <span>{t('pos.redeemedPointsDiscount')} ({redeemPointsUsed} ⭐)</span>
              <span>-{currency(redeemDiscount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 17, marginTop: 4 }}>
            <span>{t('pos.total')}</span>
            <span>{currency(total)}</span>
          </div>
          {loyaltyActive && earnedPointsPreview > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>
              <span>{t('pos.earnedPointsPreview')}</span>
              <span>+{earnedPointsPreview} ⭐</span>
            </div>
          )}
          {paymentMethod === 'cash' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--qcp-accent-strong)' }}>
              <span>{t('pos.change')}</span>
              <span>{currency(change)}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="qcp-pill critical" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        <button
          className="qcp-btn qcp-btn-primary"
          style={{ marginTop: 12, width: '100%', padding: '12px' }}
          disabled={cart.length === 0 || checkingOut}
          onClick={handleCheckout}
        >
          {t('pos.checkout')}
        </button>
        </div>
      </div>

      {receipt && (
        <ReceiptModal invoice={receipt} qrEnabled={!!taxSettings?.qrEnabled} onClose={() => setReceipt(null)} />
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

      {showTempItem && <TempItemModal onClose={() => setShowTempItem(false)} onAdd={addTempItem} />}
    </div>
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
  qrEnabled,
  onClose
}: {
  invoice: InvoiceView
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
      <div className="qcp-modal" onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'var(--qcp-mono)' }}>
        <h2 style={{ textAlign: 'center', fontFamily: 'var(--qcp-sans)' }}>Quick Cash Plus</h2>
        <p style={{ textAlign: 'center', margin: 0 }}>{invoice.number}</p>
        <p style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)', fontSize: 12 }}>{invoice.createdAt}</p>
        <hr />
        {invoice.lines.map((l, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>
              {l.productName} × {l.qty}
            </span>
            <span>{currency(l.total)}</span>
          </div>
        ))}
        <hr />
        {invoice.taxTotal > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>الضريبة</span>
            <span>{currency(invoice.taxTotal)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
          <span>{t('pos.total')}</span>
          <span>{currency(invoice.total)}</span>
        </div>
        {invoice.customerLoyaltyBalance !== null &&
          (invoice.loyaltyPointsEarned > 0 || invoice.loyaltyPointsRedeemed > 0) && (
            <>
              {invoice.loyaltyPointsRedeemed > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{t('pos.redeemedPoints')}</span>
                  <span>-{invoice.loyaltyPointsRedeemed} ⭐</span>
                </div>
              )}
              {invoice.loyaltyPointsEarned > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{t('pos.earnedPoints')}</span>
                  <span>+{invoice.loyaltyPointsEarned} ⭐</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span>{t('pos.currentPointsBalance')}</span>
                <span>{invoice.customerLoyaltyBalance} ⭐</span>
              </div>
            </>
          )}
        {qr && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <img src={qr} alt="QR" width={120} height={120} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, fontFamily: 'var(--qcp-sans)' }}>
          <button
            className="qcp-btn qcp-btn-primary"
            style={{ flex: 1 }}
            onClick={() => window.api.print.receipt(invoice.id)}
          >
            {t('common.print')}
          </button>
          <button
            className="qcp-btn qcp-btn-secondary"
            style={{ flex: 1 }}
            onClick={() => window.api.print.previewReceipt(invoice.id)}
          >
            {t('common.preview')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
