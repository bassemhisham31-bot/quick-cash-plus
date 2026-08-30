import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useAppStore, type ViewName } from '../store/appStore'
import { DashboardPage } from '../modules/dashboard/DashboardPage'
import { PosPage } from '../modules/pos/PosPage'
import { InventoryPage } from '../modules/inventory/InventoryPage'
import { PriceEditingPage } from '../modules/priceEditing/PriceEditingPage'
import { CustomersPage } from '../modules/customers/CustomersPage'
import { VendorsPage } from '../modules/vendors/VendorsPage'
import { InvoicesPage } from '../modules/invoices/InvoicesPage'
import { ExpensesPage } from '../modules/expenses/ExpensesPage'
import { ShiftsPage } from '../modules/shifts/ShiftsPage'
import { ReturnsPage } from '../modules/returns/ReturnsPage'
import { ReportsPage } from '../modules/reports/ReportsPage'
import { SalesRepsPage } from '../modules/salesReps/SalesRepsPage'
import { QuotationsPage } from '../modules/quotations/QuotationsPage'
import { StockPermitsPage } from '../modules/stockPermits/StockPermitsPage'
import { RestaurantPage } from '../modules/restaurant/RestaurantPage'
import { RestaurantTablesPage } from '../modules/restaurant/RestaurantTablesPage'
import { CaptainsPage } from '../modules/restaurant/CaptainsPage'
import { DeliveryPage } from '../modules/delivery/DeliveryPage'
import { SettingsPage } from '../modules/settings/SettingsPage'
import { isViewAllowed, firstPermittedView } from '../lib/permissions'
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts'
import { AssistantFloatingButton } from './AssistantFloatingButton'

// شاشات بترفض تعمل remount كامل عند وصول إشعار "data changed" من أي عملية بيانات
// (MUTATING_CHANNELS) — لأنها بتعمل refresh() لنفسها يدويًا، وremount كان بيمسح
// state محلي مهم فيها (سلة بيع جارية، تاب إعدادات مختار، فلتر، نافذة نتيجة عملية لسه ظاهرة).
const SELF_REFRESHING_VIEWS: ViewName[] = [
  'pos',
  'settings',
  'stockPermits',
  'dashboard',
  'inventory',
  'priceEditing',
  'restaurant',
  'restaurantTables',
  'restaurantCaptains',
  'delivery'
]

export function AppShell(): JSX.Element {
  const view = useAppStore((s) => s.view)
  const dataVersion = useAppStore((s) => s.dataVersion)
  const user = useAppStore((s) => s.user)
  const setView = useAppStore((s) => s.setView)
  const setCurrencySymbol = useAppStore((s) => s.setCurrencySymbol)
  const setSoundPrefs = useAppStore((s) => s.setSoundPrefs)
  const disabledFeatures = useAppStore((s) => s.disabledFeatures)
  const setDisabledFeatures = useAppStore((s) => s.setDisabledFeatures)

  useKeyboardShortcuts()

  useEffect(() => {
    if (!isViewAllowed(user, view, disabledFeatures)) setView(firstPermittedView(user, disabledFeatures))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, view, disabledFeatures])

  useEffect(() => {
    window.api.settings.getPosUi().then((s) => {
      setCurrencySymbol(s.currencySymbol)
      setSoundPrefs(s.soundEnabled, s.soundVolume)
    })
    window.api.license.getStatus().then((s) => setDisabledFeatures(s.disabledFeatures))
  }, [dataVersion, setCurrencySymbol, setSoundPrefs, setDisabledFeatures])

  const refreshKey = SELF_REFRESHING_VIEWS.includes(view) ? view : `${view}-${dataVersion}`
  const viewAllowed = isViewAllowed(user, view, disabledFeatures)

  return (
    <div className="qcp-app-shell">
      <Sidebar />
      <div className="qcp-main">
        <Topbar />
        <main className="qcp-content" key={refreshKey}>
          {viewAllowed && view === 'dashboard' && <DashboardPage />}
          {viewAllowed && view === 'pos' && <PosPage />}
          {viewAllowed && view === 'inventory' && <InventoryPage />}
          {viewAllowed && view === 'priceEditing' && <PriceEditingPage />}
          {viewAllowed && view === 'customers' && <CustomersPage />}
          {viewAllowed && view === 'vendors' && <VendorsPage />}
          {viewAllowed && view === 'invoices' && <InvoicesPage />}
          {viewAllowed && view === 'returns' && <ReturnsPage />}
          {viewAllowed && view === 'expenses' && <ExpensesPage />}
          {viewAllowed && view === 'shifts' && <ShiftsPage />}
          {viewAllowed && view === 'reports' && <ReportsPage />}
          {viewAllowed && view === 'salesReps' && <SalesRepsPage />}
          {viewAllowed && view === 'quotations' && <QuotationsPage />}
          {viewAllowed && view === 'stockPermits' && <StockPermitsPage />}
          {viewAllowed && view === 'restaurant' && <RestaurantPage />}
          {viewAllowed && view === 'restaurantTables' && <RestaurantTablesPage />}
          {viewAllowed && view === 'restaurantCaptains' && <CaptainsPage />}
          {viewAllowed && view === 'delivery' && <DeliveryPage />}
          {viewAllowed && view === 'settings' && <SettingsPage />}
        </main>
      </div>
      <AssistantFloatingButton />
    </div>
  )
}
