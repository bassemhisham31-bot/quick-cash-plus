import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { TableLayoutView } from './TableLayoutView'
import { ReservationsTab } from './ReservationsTab'
import { OrderScreen } from './OrderScreen'

type Tab = 'layout' | 'reservations'

export function RestaurantTablesPage(): JSX.Element {
  const activeOrderId = useAppStore((s) => s.activeRestaurantOrderId)
  const setActiveOrderId = useAppStore((s) => s.setActiveRestaurantOrderId)
  const [tab, setTab] = useState<Tab>('layout')
  const flash = useAppStore((s) => s.restaurantFlash)
  const setFlash = useAppStore((s) => s.setRestaurantFlash)

  useEffect(() => {
    if (!flash || activeOrderId) return
    const t = setTimeout(() => setFlash(null), 7000)
    return () => clearTimeout(t)
  }, [flash, activeOrderId, setFlash])

  if (activeOrderId) {
    return <OrderScreen key={activeOrderId} orderId={activeOrderId} onClose={() => setActiveOrderId(null)} />
  }

  return (
    <div>
      <div className="qcp-page-header">
        <h1>الترابيزات</h1>
      </div>

      {flash && (
        <div
          className={`qcp-pill ${flash.startsWith('⚠️') ? 'critical' : 'success'}`}
          style={{ display: 'block', marginBottom: 12, padding: '10px 14px', fontSize: 14, cursor: 'pointer' }}
          onClick={() => setFlash(null)}
        >
          {flash}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" className={`qcp-btn ${tab === 'layout' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab('layout')}>
          🪑 تخطيط الترابيزات
        </button>
        <button type="button" className={`qcp-btn ${tab === 'reservations' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab('reservations')}>
          📅 حجز الترابيزة
        </button>
      </div>

      {tab === 'layout' && <TableLayoutView onOpenOrder={setActiveOrderId} />}
      {tab === 'reservations' && <ReservationsTab />}
    </div>
  )
}
