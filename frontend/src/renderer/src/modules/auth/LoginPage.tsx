import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import type { StoreSettings } from '../../../../shared/types'

const FEATURE_ICONS: Record<string, string> = {
  customersVendors: '👥',
  multiWarehouse: '🏬',
  invoicesManagement: '🧾',
  smartAssistant: '🤖',
  cloudBackup: '☁️',
  followUpAnywhere: '📱',
  clearStock: '📦',
  instantReports: '📊',
  fasterSelling: '🛒'
}

export function LoginPage(): JSX.Element {
  const { t } = useTranslation()
  const setUser = useAppStore((s) => s.setUser)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberUsername, setRememberUsername] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [store, setStore] = useState<StoreSettings | null>(null)

  useEffect(() => {
    window.api.settings.getStore().then(setStore).catch(() => undefined)
    const saved = localStorage.getItem('qcp_saved_username')
    if (saved) setUsername(saved)
  }, [])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await window.api.auth.login(username, password)
      if (result.ok && result.user) {
        if (rememberUsername) localStorage.setItem('qcp_saved_username', username)
        else localStorage.removeItem('qcp_saved_username')
        setUser(result.user)
      } else {
        setError(result.error ?? t('auth.invalid'))
      }
    } finally {
      setLoading(false)
    }
  }

  const whatsappLink = store?.phone ? `https://wa.me/${store.phone.replace(/\D/g, '')}` : null

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: '420px 1fr',
        background: 'var(--qcp-bg-elevated)'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 48px'
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--qcp-gradient)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontFamily: 'var(--qcp-mono)',
              fontSize: 24,
              marginBottom: 14,
              boxShadow: '0 8px 20px -6px rgba(79, 70, 229, 0.55)'
            }}
          >
            Q
          </div>
          <h1 style={{ margin: '0 0 2px', fontSize: '1.5rem' }}>{t('auth.title')}</h1>
          <p style={{ margin: '0 0 22px', color: 'var(--qcp-ink-muted)', fontSize: 13.5 }}>{t('auth.subtitle')}</p>

          <div className="qcp-field">
            <label>👤 {t('auth.username')}</label>
            <input className="qcp-input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>

          <div className="qcp-field">
            <label>🛡️ {t('auth.password')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="qcp-input"
                style={{ flex: 1 }}
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordPlaceholder') ?? ''}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                onClick={() => setShowPassword((v) => !v)}
              >
                👁️
              </button>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 18px', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={rememberUsername}
              onChange={(e) => setRememberUsername(e.target.checked)}
            />
            {t('auth.rememberUsername')}
          </label>

          {error && (
            <div className="qcp-pill critical" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            className="qcp-btn qcp-btn-primary"
            type="submit"
            disabled={loading}
            style={{ padding: '12px', fontSize: 14.5 }}
          >
            {loading ? t('common.loading') : `${t('auth.submit')} ←`}
          </button>
        </form>

        <div className="qcp-card" style={{ marginTop: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginBottom: 4 }}>
            {t('auth.developedBy')}
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Quick Cash Plus</div>
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="qcp-btn"
              style={{
                display: 'block',
                textDecoration: 'none',
                background: '#25D366',
                color: 'white'
              }}
            >
              WhatsApp
            </a>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 16 }}>
          {t('auth.copyright')}
        </p>
      </div>

      <div
        style={{
          background: 'var(--qcp-gradient)',
          display: 'flex',
          flexDirection: 'column',
          padding: '40px 48px',
          color: 'white'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{t('app.name')}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85 }}>{t('auth.rightPanelSubtitle')}</div>
          </div>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontFamily: 'var(--qcp-mono)'
            }}
          >
            Q
          </div>
        </div>

        <span
          style={{
            alignSelf: 'flex-start',
            background: 'rgba(255,255,255,0.16)',
            borderRadius: 20,
            padding: '5px 14px',
            fontSize: 12,
            marginBottom: 16
          }}
        >
          ⚡ {t('auth.rightPanelBadge')}
        </span>

        <h2 style={{ fontSize: '2rem', margin: '0 0 30px' }}>{t('auth.rightPanelHeading')}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {Object.keys(FEATURE_ICONS).map((key) => (
            <div
              key={key}
              style={{
                background: 'rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: '14px 10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                textAlign: 'center'
              }}
            >
              <span style={{ fontSize: 20 }}>{FEATURE_ICONS[key]}</span>
              {t(`auth.feature.${key}`)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
