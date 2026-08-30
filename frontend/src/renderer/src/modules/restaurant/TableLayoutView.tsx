import { useEffect, useRef, useState } from 'react'
import type { RestaurantTable } from '../../../../shared/types'
import { useAppStore } from '../../store/appStore'

export function TableLayoutView({ onOpenOrder }: { onOpenOrder: (orderId: number) => void }): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [editMode, setEditMode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', zone: '', seats: '4' })
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const floorRef = useRef<HTMLDivElement>(null)
  const dragTableId = useRef<number | null>(null)

  function refresh(): void {
    window.api.restaurant.listTables().then(setTables)
  }

  useEffect(() => {
    refresh()
  }, [])

  // دوسة واحدة على ترابيزة فاضية بتفتح طلبها على طول على نفس الشاشة (من غير خطوة "ابدأ طلب" منفصلة) —
  // لو المستخدم عايز يدمج أكتر من ترابيزة، بيقدر يعمل ده من جوه شاشة الطلب نفسها بزرار "دمج ترابيزة"
  // الموجود أصلاً، فمفيش داعي لخطوة اختيار متعدد قبل ما الطلب يتفتح خالص.
  async function selectTable(table: RestaurantTable): Promise<void> {
    if (editMode || opening) return
    if (table.status === 'occupied') {
      if (table.currentOrderId) onOpenOrder(table.currentOrderId)
      return
    }
    if (!user) return
    setOpening(true)
    setError(null)
    try {
      const result = await window.api.restaurant.openOrder({ orderType: 'dine_in', tableIds: [table.id] }, user.id)
      if (result.ok && result.orderId) {
        onOpenOrder(result.orderId)
      } else {
        setError(result.error ?? 'تعذر فتح الطلب')
      }
    } finally {
      setOpening(false)
    }
  }

  function handleMouseDown(tableId: number): void {
    if (!editMode) return
    dragTableId.current = tableId
  }

  function handleMouseMove(e: React.MouseEvent): void {
    if (!editMode || dragTableId.current === null || !floorRef.current) return
    const rect = floorRef.current.getBoundingClientRect()
    const posX = Math.min(95, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const posY = Math.min(90, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    setTables((prev) => prev.map((t) => (t.id === dragTableId.current ? { ...t, posX, posY } : t)))
  }

  async function handleMouseUp(): Promise<void> {
    if (!editMode || dragTableId.current === null) return
    const table = tables.find((t) => t.id === dragTableId.current)
    dragTableId.current = null
    if (!table) return
    await window.api.restaurant.upsertTable({
      id: table.id,
      name: table.name,
      zone: table.zone ?? '',
      seats: table.seats,
      posX: table.posX,
      posY: table.posY
    })
  }

  async function addTable(): Promise<void> {
    if (!form.name.trim()) return
    await window.api.restaurant.upsertTable({
      name: form.name,
      zone: form.zone,
      seats: Number(form.seats) || 4,
      posX: 10,
      posY: 10
    })
    setForm({ name: '', zone: '', seats: '4' })
    setShowAdd(false)
    refresh()
  }

  async function removeTable(id: number): Promise<void> {
    if (!window.confirm('حذف الترابيزة؟')) return
    const result = await window.api.restaurant.deleteTable(id)
    if (!result.ok) setError(result.error ?? 'تعذر الحذف')
    else refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setShowAdd(true)}>
          + ترابيزة جديدة
        </button>
        <button
          type="button"
          className={`qcp-btn ${editMode ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? '✓ إنهاء تعديل التخطيط' : '✏️ تعديل التخطيط (سحب الترابيزات)'}
        </button>
      </div>

      {error && (
        <div className="qcp-pill critical" style={{ marginBottom: 10, width: 'fit-content' }}>
          {error}
        </div>
      )}

      <div
        ref={floorRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: 'relative',
          minHeight: 480,
          border: '1px dashed var(--qcp-border)',
          borderRadius: 12,
          background: 'var(--qcp-bg-sunken)'
        }}
      >
        {tables.map((t) => (
          <div
            key={t.id}
            onMouseDown={() => handleMouseDown(t.id)}
            onClick={() => selectTable(t)}
            className="qcp-card"
            style={{
              position: 'absolute',
              left: `${t.posX}%`,
              top: `${t.posY}%`,
              width: 110,
              padding: 10,
              cursor: editMode ? 'grab' : opening ? 'wait' : 'pointer',
              userSelect: 'none',
              textAlign: 'center',
              opacity: opening ? 0.7 : 1,
              background: t.status === 'occupied' ? 'var(--qcp-critical-soft, #f8d7da)' : 'var(--qcp-success-soft, #d4edda)'
            }}
          >
            <div style={{ fontWeight: 800 }}>{t.name}</div>
            {t.zone && <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>{t.zone}</div>}
            <div style={{ fontSize: 11 }}>{t.seats} كرسي</div>
            <div className={`qcp-pill ${t.status === 'occupied' ? 'critical' : 'accent'}`} style={{ marginTop: 4, fontSize: 10 }}>
              {t.status === 'occupied' ? 'مشغولة' : 'متاحة'}
            </div>
            {editMode && (
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                style={{ marginTop: 6, padding: '2px 6px', fontSize: 10 }}
                onClick={(e) => {
                  e.stopPropagation()
                  removeTable(t.id)
                }}
              >
                حذف
              </button>
            )}
          </div>
        ))}
        {!tables.length && (
          <p style={{ padding: 20, color: 'var(--qcp-ink-faint)' }}>مفيش ترابيزات لسه — ضيفي واحدة من الزرار فوق</p>
        )}
      </div>

      {showAdd && (
        <div className="qcp-modal-backdrop" onClick={() => setShowAdd(false)}>
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              addTable()
            }}
          >
            <h3>ترابيزة جديدة</h3>
            <div className="qcp-field">
              <label>الاسم/الرقم</label>
              <input className="qcp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="qcp-field">
              <label>المنطقة (اختياري)</label>
              <input className="qcp-input" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            </div>
            <div className="qcp-field">
              <label>عدد الكراسي</label>
              <input
                className="qcp-input"
                type="number"
                value={form.seats}
                onChange={(e) => setForm({ ...form, seats: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }}>
                إضافة
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
