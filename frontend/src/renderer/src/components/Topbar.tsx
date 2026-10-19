import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { applyDocumentDirection } from '../i18n'
import type { DeviceRole, KitchenNotification, KitchenNotifyMode, NotificationItem } from '../../../shared/types'
import { firstPermittedView, isViewAllowed } from '../lib/permissions'
import { NAV_ITEMS } from './Sidebar'

const NOTIFICATIONS_POLL_MS = 60000

/** تنبيه الفواتير المعلّقة (اللي اتعلّقت أو اتنسيت من غير حفظ) — بيفتح شاشة البيع على قايمتها */
function HeldInvoicesButton(): JSX.Element | null {
  const user = useAppStore((s) => s.user)
  const dataVersion = useAppStore((s) => s.dataVersion)
  const setView = useAppStore((s) => s.setView)
  const setPosOpenHeld = useAppStore((s) => s.setPosOpenHeld)
  const disabledFeatures = useAppStore((s) => s.disabledFeatures)
  const [count, setCount] = useState(0)
  const allowed = isViewAllowed(user, 'pos', disabledFeatures)

  useEffect(() => {
    if (!allowed) return
    window.api.settings
      .getPosUi()
      .then((s) => (s.holdInvoicesEnabled ? window.api.held.list() : []))
      .then((list) => setCount(list.length))
      .catch(() => setCount(0))
  }, [allowed, dataVersion])

  if (!allowed || count === 0) return null
  return (
    <button
      className="qcp-btn qcp-btn-secondary"
      style={{ borderColor: 'var(--qcp-critical)', color: 'var(--qcp-critical)' }}
      title="فواتير معلّقة لسه ما اتدفعتش"
      onClick={() => {
        setPosOpenHeld(true)
        setView('pos')
      }}
    >
      ⏸ معلّقة ({count})
    </button>
  )
}

export function Topbar(): JSX.Element {
  const { t, i18n } = useTranslation()
  const user = useAppStore((s) => s.user)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const dataVersion = useAppStore((s) => s.dataVersion)
  const setView = useAppStore((s) => s.setView)

  const disabledFeatures = useAppStore((s) => s.disabledFeatures)
  const [kitchenNotifyMode, setKitchenNotifyMode] = useState<KitchenNotifyMode | null>(null)
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(null)
  // زرار المطبخ لأي حد شغال في المطعم (لوحة الطلبات أو الترابيزات أو التوصيل)
  const restaurantAllowed = (['restaurant', 'restaurantTables', 'delivery'] as const).some((v) => isViewAllowed(user, v, disabledFeatures))

  useEffect(() => {
    if (!restaurantAllowed) return
    window.api.settings.getRestaurant().then((s) => setKitchenNotifyMode(s.kitchenNotifyMode)).catch(() => {})
    window.api.network.getStatus().then((s) => setDeviceRole(s.role)).catch(() => {})
  }, [restaurantAllowed, dataVersion])

  // الجهاز المستقل (standalone) بيتعامل كرئيسي — هو اللي عليه قاعدة البيانات
  const isSubDevice = deviceRole === 'sub'
  const showKitchenBell =
    restaurantAllowed &&
    kitchenNotifyMode !== null &&
    deviceRole !== null &&
    (kitchenNotifyMode === 'all' ||
      (kitchenNotifyMode === 'sub_only' && isSubDevice) ||
      (kitchenNotifyMode === 'main_only' && !isSubDevice))

  function toggleLocale(): void {
    const next = locale === 'ar' ? 'en' : 'ar'
    setLocale(next)
    i18n.changeLanguage(next)
    applyDocumentDirection(next)
  }

  function toggleTheme(): void {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }

  const view = useAppStore((s) => s.view)
  const homeView = firstPermittedView(user, disabledFeatures)

  return (
    <header className="qcp-topbar">
      {view !== homeView && (
        <div className="qcp-topbar-home">
          <button className="qcp-btn qcp-btn-primary" onClick={() => setView(homeView)} title="الشاشة الرئيسية">
            🏠 {t(`nav.${homeView}`)}
          </button>
          <span>
            {NAV_ITEMS.find((n) => n.key === view)?.icon} {t(`nav.${view}`)}
          </span>
        </div>
      )}
      <div className="qcp-topbar-controls">
        <NetworkStatusIcon />
        <HeldInvoicesButton />
        <NotificationsBell dataVersion={dataVersion} onNavigate={setView} />
        {showKitchenBell && <KitchenOrdersBell dataVersion={dataVersion} onOpenRestaurant={() =>
              // أول شاشة مطعم مسموح بيها (لوحة الطلبات ← الترابيزات ← التوصيل)
              setView((['restaurant', 'restaurantTables', 'delivery'] as const).find((v) => isViewAllowed(user, v, disabledFeatures)) ?? 'restaurant')
            } />}
        <button className="qcp-icon-btn" onClick={toggleTheme} title="الوضع الداكن">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button className="qcp-btn qcp-btn-secondary" onClick={toggleLocale}>
          {locale === 'ar' ? 'English' : 'العربية'}
        </button>
      </div>
      <div className="qcp-topbar-user">
        <span>{user?.fullName}</span>
        <span className="qcp-pill accent">{user?.role === 'admin' ? 'مدير' : 'كاشير'}</span>
      </div>
    </header>
  )
}

type NetworkStatus = 'ok' | 'weak' | 'offline'

function NetworkStatusIcon(): JSX.Element {
  const { t } = useTranslation()
  const [online, setOnline] = useState(navigator.onLine)
  const [weak, setWeak] = useState(false)

  useEffect(() => {
    function updateOnline(): void {
      setOnline(navigator.onLine)
    }
    const connection = (navigator as any).connection
    function updateConnection(): void {
      if (!connection) return
      setWeak(
        connection.effectiveType === 'slow-2g' ||
          connection.effectiveType === '2g' ||
          (typeof connection.downlink === 'number' && connection.downlink > 0 && connection.downlink < 1)
      )
    }

    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    updateOnline()
    if (connection) {
      updateConnection()
      connection.addEventListener?.('change', updateConnection)
    }
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      connection?.removeEventListener?.('change', updateConnection)
    }
  }, [])

  const status: NetworkStatus = !online ? 'offline' : weak ? 'weak' : 'ok'
  const color =
    status === 'offline' ? 'var(--qcp-critical)' : status === 'weak' ? 'var(--qcp-warn)' : 'var(--qcp-success)'
  const label =
    status === 'offline'
      ? t('topbar.networkOffline')
      : status === 'weak'
        ? t('topbar.networkWeak')
        : t('topbar.networkOnline')

  return (
    <span className="qcp-icon-btn" style={{ color, cursor: 'default' }} title={label ?? ''}>
      <WifiIcon status={status} />
    </span>
  )
}

function WifiIcon({ status }: { status: NetworkStatus }): JSX.Element {
  const faint = 'var(--qcp-ink-faint)'
  const outerColor = status === 'ok' ? 'currentColor' : faint
  const midColor = status === 'offline' ? faint : 'currentColor'

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M2 8.5C7.5 3.5 16.5 3.5 22 8.5" stroke={outerColor} />
      <path d="M5.5 12.5C9.5 9 14.5 9 18.5 12.5" stroke={midColor} />
      <path d="M9 16.5C10.9 15 13.1 15 15 16.5" stroke="currentColor" />
      <circle cx="12" cy="19.5" r="1.4" fill="currentColor" stroke="none" />
      {status === 'offline' && <path d="M3 3L21 21" stroke="var(--qcp-critical)" strokeWidth="2.2" />}
    </svg>
  )
}

function NotificationsBell({
  dataVersion,
  onNavigate
}: {
  dataVersion: number
  onNavigate: (view: 'inventory' | 'settings') => void
}): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)

  async function refresh(): Promise<void> {
    setItems(await window.api.notifications.list())
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, NOTIFICATIONS_POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  const criticalCount = items.filter((i) => i.severity === 'critical').length

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="qcp-icon-btn"
        style={{ position: 'relative' }}
        onClick={() => setOpen((o) => !o)}
        title={t('notifications.title') ?? ''}
      >
        🔔
        {items.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              insetInlineEnd: -2,
              minWidth: 16,
              height: 16,
              padding: '0 3px',
              borderRadius: 8,
              fontSize: 10,
              fontWeight: 800,
              lineHeight: '16px',
              textAlign: 'center',
              color: 'white',
              background: criticalCount > 0 ? 'var(--qcp-critical)' : 'var(--qcp-accent)'
            }}
          >
            {items.length > 99 ? '99+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              insetInlineStart: 0,
              marginTop: 8,
              width: 320,
              maxHeight: 380,
              overflowY: 'auto',
              background: 'var(--qcp-bg)',
              border: '1px solid var(--qcp-border)',
              borderRadius: 10,
              boxShadow: '0 10px 24px rgba(0,0,0,0.16)',
              zIndex: 31
            }}
          >
            <div style={{ padding: '10px 14px', fontWeight: 800, borderBottom: '1px solid var(--qcp-border)' }}>
              {t('notifications.title')}
            </div>
            {items.length === 0 ? (
              <p style={{ padding: 14, fontSize: 13, color: 'var(--qcp-ink-faint)', margin: 0 }}>
                {t('notifications.empty')}
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    onNavigate(n.target)
                    setOpen(false)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'start',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--qcp-border)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5 }}>
                    <span>{n.severity === 'critical' ? '🔴' : '🟠'}</span>
                    <span>{n.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginTop: 2 }}>{n.message}</div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------ إشعارات طلبات التجهيز (المطبخ) ------------------------------ */

const KITCHEN_SEEN_KEY = 'qcp.kitchenNotifications.lastSeenId'
const KITCHEN_POLL_MS = 15000
const ORDER_TYPE_SHORT: Record<string, string> = { dine_in: '🪑 صالة', takeaway: '🥡 تيك أواي', delivery: '🛵 ديلفري' }

function readLastSeen(): number {
  try {
    return Number(localStorage.getItem(KITCHEN_SEEN_KEY)) || 0
  } catch {
    return 0
  }
}

function writeLastSeen(id: number): void {
  try {
    localStorage.setItem(KITCHEN_SEEN_KEY, String(id))
  } catch {
    // تخزين المتصفح مش متاح — العداد هيرجع يظهر بعد إعادة التشغيل بس، مش مشكلة
  }
}

function beep(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => ctx.close()
  } catch {
    // مفيش صوت متاح — تجاهل
  }
}

/**
 * زرار منفصل عن جرس التنبيهات العادي: كل طلب يتبعت للمطبخ (من الجهاز ده أو أي جهاز فرعي على الشبكة)
 * بيظهر هنا على طول. التحديث فوري لأن أي إرسال للمطبخ بيعمل data:changed على كل الأجهزة، ومعاه polling احتياطي.
 */
function KitchenOrdersBell({
  dataVersion,
  onOpenRestaurant
}: {
  dataVersion: number
  onOpenRestaurant: () => void
}): JSX.Element {
  const [items, setItems] = useState<KitchenNotification[]>([])
  const [open, setOpen] = useState(false)
  const [lastSeenId, setLastSeenId] = useState(readLastSeen)
  const [popup, setPopup] = useState<KitchenNotification | null>(null)
  const newestKnownId = useRef<number | null>(null)

  async function refresh(): Promise<void> {
    let list: KitchenNotification[]
    try {
      list = await window.api.restaurant.listKitchenNotifications(30)
    } catch {
      return
    }
    setItems(list)
    const newest = list[0]?.id ?? 0
    // أول تحميل بيسجّل آخر id بس من غير صوت — بعد كده أي طلب جديد يطلع صوت + نافذة صغيرة
    if (newestKnownId.current !== null && newest > newestKnownId.current) {
      setPopup(list[0])
      beep()
    }
    newestKnownId.current = Math.max(newestKnownId.current ?? 0, newest)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, KITCHEN_POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  useEffect(() => {
    if (!popup) return
    const t = setTimeout(() => setPopup(null), 8000)
    return () => clearTimeout(t)
  }, [popup])

  const unread = items.filter((i) => i.id > lastSeenId).length

  function toggle(): void {
    const next = !open
    setOpen(next)
    setPopup(null)
    if (next && items[0]) {
      setLastSeenId(items[0].id)
      writeLastSeen(items[0].id)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="qcp-icon-btn"
        style={{
          position: 'relative',
          background: unread > 0 ? 'var(--qcp-warn-soft, #fff4e0)' : undefined,
          borderColor: unread > 0 ? 'var(--qcp-warn)' : undefined
        }}
        onClick={toggle}
        title="طلبات التجهيز (المطبخ)"
      >
        🍳
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              insetInlineEnd: -2,
              minWidth: 16,
              height: 16,
              padding: '0 3px',
              borderRadius: 8,
              fontSize: 10,
              fontWeight: 800,
              lineHeight: '16px',
              textAlign: 'center',
              color: 'white',
              background: 'var(--qcp-warn, #e8890c)'
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {popup && !open && (
        <button
          type="button"
          onClick={toggle}
          style={{
            position: 'absolute',
            top: '100%',
            insetInlineStart: 0,
            marginTop: 8,
            width: 300,
            textAlign: 'start',
            padding: '10px 14px',
            background: 'var(--qcp-bg)',
            border: '2px solid var(--qcp-warn, #e8890c)',
            borderRadius: 10,
            boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
            zIndex: 32,
            cursor: 'pointer'
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13 }}>🍳 طلب تجهيز جديد — {popup.orderNumber}</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>
            {ORDER_TYPE_SHORT[popup.orderType] ?? popup.orderType}
            {popup.tableLabel ? ` · ترابيزة ${popup.tableLabel}` : ''}
            {popup.sentByName ? ` · من ${popup.sentByName}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginTop: 3 }}>{popup.itemsSummary}</div>
        </button>
      )}

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              insetInlineStart: 0,
              marginTop: 8,
              width: 340,
              maxHeight: 420,
              overflowY: 'auto',
              background: 'var(--qcp-bg)',
              border: '1px solid var(--qcp-border)',
              borderRadius: 10,
              boxShadow: '0 10px 24px rgba(0,0,0,0.16)',
              zIndex: 31
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                fontWeight: 800,
                borderBottom: '1px solid var(--qcp-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>🍳 طلبات التجهيز</span>
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                style={{ padding: '2px 10px', fontSize: 12 }}
                onClick={() => {
                  onOpenRestaurant()
                  setOpen(false)
                }}
              >
                لوحة الطلبات
              </button>
            </div>
            {items.length === 0 ? (
              <p style={{ padding: 14, fontSize: 13, color: 'var(--qcp-ink-faint)', margin: 0 }}>مفيش طلبات تجهيز لسه</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--qcp-border)',
                    background: n.id > lastSeenId ? 'var(--qcp-accent-soft)' : undefined
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 12.5 }}>
                    <span>
                      {n.orderNumber} · {ORDER_TYPE_SHORT[n.orderType] ?? n.orderType}
                      {n.tableLabel ? ` · ${n.tableLabel}` : ''}
                    </span>
                    <span style={{ fontWeight: 500, color: 'var(--qcp-ink-faint)', fontSize: 11 }}>{n.createdAt.slice(11, 16)}</span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 3 }}>{n.itemsSummary}</div>
                  {(n.sentByName || n.captainName) && (
                    <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)', marginTop: 2 }}>
                      {n.sentByName ? `أرسله: ${n.sentByName}` : ''}
                      {n.captainName ? `${n.sentByName ? ' · ' : ''}الكابتن: ${n.captainName}` : ''}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
