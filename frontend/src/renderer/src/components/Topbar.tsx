import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { applyDocumentDirection } from '../i18n'
import type { NotificationItem } from '../../../shared/types'

const NOTIFICATIONS_POLL_MS = 60000

export function Topbar(): JSX.Element {
  const { t, i18n } = useTranslation()
  const user = useAppStore((s) => s.user)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const dataVersion = useAppStore((s) => s.dataVersion)
  const setView = useAppStore((s) => s.setView)

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

  return (
    <header className="qcp-topbar">
      <div className="qcp-topbar-controls">
        <NetworkStatusIcon />
        <NotificationsBell dataVersion={dataVersion} onNavigate={setView} />
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
