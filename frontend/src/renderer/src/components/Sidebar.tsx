import { useTranslation } from 'react-i18next'
import { useAppStore, type ViewName } from '../store/appStore'
import { isViewAllowed } from '../lib/permissions'

const items: { key: ViewName; icon: string }[] = [
  { key: 'dashboard', icon: '🏠' },
  { key: 'pos', icon: '🛒' },
  { key: 'inventory', icon: '📦' },
  { key: 'priceEditing', icon: '💰' },
  { key: 'customers', icon: '👥' },
  { key: 'vendors', icon: '🚚' },
  { key: 'invoices', icon: '🧾' },
  { key: 'returns', icon: '↩️' },
  { key: 'expenses', icon: '💸' },
  { key: 'shifts', icon: '⏱️' },
  { key: 'reports', icon: '📊' },
  { key: 'salesReps', icon: '🧑‍💼' },
  { key: 'quotations', icon: '📝' },
  { key: 'stockPermits', icon: '📋' },
  { key: 'restaurant', icon: '🍽️' },
  { key: 'restaurantTables', icon: '🪑' },
  { key: 'restaurantCaptains', icon: '🎩' },
  { key: 'delivery', icon: '🛵' },
  { key: 'settings', icon: '⚙️' }
]

export function Sidebar(): JSX.Element {
  const { t } = useTranslation()
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const logout = useAppStore((s) => s.logout)
  const user = useAppStore((s) => s.user)
  const disabledFeatures = useAppStore((s) => s.disabledFeatures)
  const visibleItems = items.filter((item) => isViewAllowed(user, item.key, disabledFeatures))

  return (
    <aside className="qcp-sidebar">
      <div className="qcp-sidebar-brand">
        <div className="qcp-sidebar-logo">Q</div>
        <div>
          <strong>{t('app.name')}</strong>
          <span>Quick Cash Plus</span>
        </div>
      </div>

      <nav>
        {visibleItems.map((item) => (
          <button
            key={item.key}
            className={`qcp-nav-item${view === item.key ? ' active' : ''}`}
            onClick={() => setView(item.key)}
          >
            <span>{item.icon}</span>
            <span>{t(`nav.${item.key}`)}</span>
          </button>
        ))}
      </nav>

      <div className="qcp-sidebar-footer">
        <button className="qcp-nav-item" onClick={logout}>
          <span>🚪</span>
          <span>{t('nav.logout')}</span>
        </button>
      </div>
    </aside>
  )
}
