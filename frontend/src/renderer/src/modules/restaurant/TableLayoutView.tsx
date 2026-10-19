import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  RestaurantFloorLine,
  RestaurantFloorSettings,
  RestaurantTable,
  RestaurantTableShape
} from '../../../../shared/types'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import { TableGraphic, formatElapsed, minutesSince, resolveShape, tableGeometry, type TableVisualStatus } from './restaurantUi'
import './restaurant.css'
import { confirmDialog } from '../../components/ConfirmDialogHost'

const SHAPE_OPTIONS: { value: RestaurantTableShape; label: string }[] = [
  { value: 'auto', label: 'تلقائي' },
  { value: 'round', label: 'مدوّرة' },
  { value: 'square', label: 'مربعة' },
  { value: 'rect', label: 'مستطيلة' }
]

const SIZE_PRESETS: { value: number; label: string }[] = [
  { value: 0.6, label: 'صغيرة' },
  { value: 0.8, label: 'أصغر شوية' },
  { value: 1, label: 'عادية' },
  { value: 1.3, label: 'كبيرة' }
]

const FLOOR_PRESETS: { w: number; h: number; label: string }[] = [
  { w: 1200, h: 700, label: 'عادية' },
  { w: 1600, h: 1000, label: 'كبيرة' },
  { w: 2200, h: 1400, label: 'كبيرة جدًا' },
  { w: 3000, h: 1800, label: 'ضخمة' }
]

const DEFAULT_FLOOR: RestaurantFloorSettings = { floorWidth: 1200, floorHeight: 700, tableScale: 1, showLines: true }

/* تكبير/تصغير العرض وطريقة الرسم خاصين بكل جهاز (كل شاشة ومقاسها) — أما المخطط نفسه فمشترك */
const VIEW_KEY = 'qcp.rst.floorView'
const ZOOM_MIN = 0.2
const ZOOM_MAX = 2.5
type Zoom = 'fit' | number

function loadView(): { zoom: Zoom; compact: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')
    return { zoom: typeof v.zoom === 'number' ? v.zoom : 'fit', compact: !!v.compact }
  } catch {
    return { zoom: 'fit', compact: false }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

interface TableForm {
  id?: number
  name: string
  zone: string
  seats: string
  shape: RestaurantTableShape
  sizeScale: number
  posX: number
  posY: number
}

interface LineForm {
  id?: number
  zone: string | null
  orientation: 'h' | 'v'
  posX: number
  posY: number
  length: number
  style: 'solid' | 'dashed'
  label: string
}

function visualStatus(t: RestaurantTable): TableVisualStatus {
  if (t.status !== 'occupied') return 'available'
  if (t.orderCheckPrinted) return 'checked'
  return t.orderKitchenStatus === 'ready' ? 'ready' : 'occupied'
}

/** مقاس الترابيزة بوحدات الصالة (بالكراسي دايمًا — عشان الترتيب يفضل سليم حتى لو جهاز تاني بيعرض الرسم الكامل) */
function tableBox(t: { shape: RestaurantTableShape; seats: number; sizeScale?: number }, tableScale: number): { w: number; h: number } {
  const g = tableGeometry(resolveShape(t.shape, t.seats), t.seats)
  const k = tableScale * (t.sizeScale || 1)
  return { w: g.width * k, h: g.height * k }
}

export function TableLayoutView({ onOpenOrder }: { onOpenOrder: (orderId: number) => void }): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [floor, setFloor] = useState<RestaurantFloorSettings>(DEFAULT_FLOOR)
  const [lines, setLines] = useState<RestaurantFloorLine[]>([])
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<TableForm | null>(null)
  const [lineForm, setLineForm] = useState<LineForm | null>(null)
  const [floorForm, setFloorForm] = useState<RestaurantFloorSettings | null>(null)
  const [zoneFilter, setZoneFilter] = useState<string>('__all__')
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [, setTick] = useState(0)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [view, setView] = useState(loadView)
  const [box, setBox] = useState({ w: 1000, h: 600 })
  const floorRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const lineDrag = useRef<{
    mode: 'move' | 'resize'
    startX: number
    startY: number
    orig: RestaurantFloorLine
    latest: RestaurantFloorLine
    moved: boolean
  } | null>(null)
  const scaleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function refresh(): void {
    window.api.restaurant.listTables().then(setTables)
  }

  function refreshFloor(): void {
    window.api.restaurant.getFloor().then((f) => {
      setFloor(f.settings)
      setLines(f.lines)
    })
  }

  useEffect(() => {
    refresh()
    refreshFloor()
    // تحديث دوري: الوقت على الترابيزات المشغولة + أي تغيير من جهاز تاني على الشبكة
    const timer = setInterval(() => {
      setTick((n) => n + 1)
      if (!drag.current && !lineDrag.current) refresh()
    }, 20000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view))
    } catch {
      /* مش مهم لو التخزين مش متاح */
    }
  }, [view])

  // مقاس المساحة المتاحة للصالة على الشاشة (عشان "ملء الشاشة" يبيّن الصالة كلها مرة واحدة)
  function measure(): void {
    const el = viewportRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    setBox({ w: el.clientWidth, h: Math.max(280, window.innerHeight - top - 64) })
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const zones = useMemo(
    () => Array.from(new Set(tables.map((t) => t.zone).filter((z): z is string => !!z))).sort(),
    [tables]
  )

  useLayoutEffect(measure, [editMode, error, zones.length])

  const W = floor.floorWidth
  const H = floor.floorHeight
  const fitScale = clamp(Math.min((box.w - 4) / W, (box.h - 4) / H), 0.1, ZOOM_MAX)
  const scale = view.zoom === 'fit' ? fitScale : view.zoom
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  function setZoom(next: number): void {
    setView((v) => ({ ...v, zoom: clamp(Math.round(next * 100) / 100, ZOOM_MIN, ZOOM_MAX) }))
  }

  // Ctrl + عجلة الماوس = تكبير/تصغير
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(scaleRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const visibleTables = tables.filter((t) => zoneFilter === '__all__' || (t.zone ?? '') === zoneFilter)
  const visibleLines = lines.filter((l) => zoneFilter === '__all__' || !l.zone || l.zone === zoneFilter)
  const occupiedCount = tables.filter((t) => t.status === 'occupied').length
  const checkedCount = tables.filter((t) => t.status === 'occupied' && t.orderCheckPrinted).length
  const readyCount = tables.filter((t) => t.status === 'occupied' && t.orderKitchenStatus === 'ready').length
  const openTotal = tables.reduce((s, t) => s + (t.status === 'occupied' ? t.orderTotal ?? 0 : 0), 0)

  // دوسة واحدة على ترابيزة فاضية بتفتح طلبها على طول، والمشغولة بتفتح طلبها الحالي.
  async function selectTable(table: RestaurantTable): Promise<void> {
    if (opening) return
    if (editMode) {
      setForm({
        id: table.id,
        name: table.name,
        zone: table.zone ?? '',
        seats: String(table.seats),
        shape: table.shape ?? 'auto',
        sizeScale: table.sizeScale || 1,
        posX: table.posX,
        posY: table.posY
      })
      return
    }
    if (table.status === 'occupied') {
      if (table.currentOrderId) onOpenOrder(table.currentOrderId)
      return
    }
    if (!user) return
    setOpening(true)
    setError(null)
    try {
      const result = await window.api.restaurant.openOrder({ orderType: 'dine_in', tableIds: [table.id] }, user.id)
      if (result.ok && result.orderId) onOpenOrder(result.orderId)
      else setError(result.error ?? 'تعذر فتح الطلب')
    } finally {
      setOpening(false)
    }
  }

  /* ------------------------------ سحب الترابيزات ------------------------------ */

  function handlePointerDown(e: React.PointerEvent, table: RestaurantTable): void {
    if (!editMode || !floorRef.current) return
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    drag.current = { id: table.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, startX: e.clientX, startY: e.clientY, moved: false }
    el.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent): void {
    const d = drag.current
    if (!editMode || !d || !floorRef.current) return
    // حركة بسيطة جدًا (رعشة إيد) متتحسبش سحب — عشان الدوسة العادية تفتح نافذة التعديل
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 5) return
    // كل المقاسات هنا بمقاس الشاشة الفعلي (بعد التكبير/التصغير) عشان النسبة المئوية تطلع صح
    const floorRect = floorRef.current.getBoundingClientRect()
    const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const maxX = 100 - (elRect.width / floorRect.width) * 100
    const maxY = 100 - (elRect.height / floorRect.height) * 100
    const posX = Math.min(Math.max(0, maxX), Math.max(0, ((e.clientX - d.offsetX - floorRect.left) / floorRect.width) * 100))
    const posY = Math.min(Math.max(0, maxY), Math.max(0, ((e.clientY - d.offsetY - floorRect.top) / floorRect.height) * 100))
    if (!d.moved) {
      d.moved = true
      setDraggingId(d.id)
    }
    setTables((prev) => prev.map((t) => (t.id === d.id ? { ...t, posX, posY } : t)))
  }

  async function handlePointerUp(table: RestaurantTable): Promise<void> {
    const d = drag.current
    drag.current = null
    setDraggingId(null)
    if (!d || !d.moved) {
      selectTable(table)
      return
    }
    const moved = tables.find((t) => t.id === d.id)
    if (!moved) return
    await window.api.restaurant.upsertTable({
      id: moved.id,
      name: moved.name,
      zone: moved.zone ?? '',
      seats: moved.seats,
      posX: moved.posX,
      posY: moved.posY,
      shape: moved.shape,
      sizeScale: moved.sizeScale
    })
  }

  /* ------------------------------ الخطوط الفاصلة ------------------------------ */

  function linePointerDown(e: React.PointerEvent, line: RestaurantFloorLine, mode: 'move' | 'resize'): void {
    if (!editMode) return
    e.stopPropagation()
    lineDrag.current = { mode, startX: e.clientX, startY: e.clientY, orig: line, latest: line, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function linePointerMove(e: React.PointerEvent): void {
    const d = lineDrag.current
    if (!d || !floorRef.current) return
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 5) return
    d.moved = true
    const rect = floorRef.current.getBoundingClientRect()
    const dx = ((e.clientX - d.startX) / rect.width) * 100
    const dy = ((e.clientY - d.startY) / rect.height) * 100
    const o = d.orig
    const horizontal = o.orientation === 'h'
    let next: RestaurantFloorLine
    if (d.mode === 'move') {
      next = {
        ...o,
        posX: clamp(o.posX + dx, 0, horizontal ? 100 - o.length : 100),
        posY: clamp(o.posY + dy, 0, horizontal ? 100 : 100 - o.length)
      }
    } else {
      next = { ...o, length: horizontal ? clamp(o.length + dx, 3, 100 - o.posX) : clamp(o.length + dy, 3, 100 - o.posY) }
    }
    d.latest = next
    setLines((prev) => prev.map((l) => (l.id === next.id ? next : l)))
  }

  async function linePointerUp(): Promise<void> {
    const d = lineDrag.current
    lineDrag.current = null
    if (!d) return
    if (!d.moved) {
      const l = d.orig
      setLineForm({ ...l, label: l.label ?? '' })
      return
    }
    await window.api.restaurant.upsertFloorLine(d.latest)
  }

  function newLine(): void {
    setLineForm({
      zone: zoneFilter !== '__all__' ? zoneFilter : null,
      orientation: 'h',
      posX: 20,
      posY: 50,
      length: 60,
      style: 'solid',
      label: ''
    })
  }

  async function saveLine(): Promise<void> {
    if (!lineForm) return
    const horizontal = lineForm.orientation === 'h'
    const length = clamp(lineForm.length, 3, 100)
    // لو الاتجاه اتغير، الخط لازم يفضل جوه الصالة
    const posX = clamp(lineForm.posX, 0, horizontal ? 100 - length : 100)
    const posY = clamp(lineForm.posY, 0, horizontal ? 100 : 100 - length)
    await window.api.restaurant.upsertFloorLine({ ...lineForm, posX, posY, length, label: lineForm.label.trim() || null })
    if (!floor.showLines) await window.api.restaurant.saveFloorSettings({ ...floor, showLines: true })
    setLineForm(null)
    refreshFloor()
  }

  async function removeLine(id: number): Promise<void> {
    await window.api.restaurant.deleteFloorLine(id)
    setLineForm(null)
    refreshFloor()
  }

  /* ------------------------------ إعدادات الصالة ------------------------------ */

  async function applyFloorSettings(next: RestaurantFloorSettings): Promise<void> {
    const saved = await window.api.restaurant.saveFloorSettings(next)
    setFloor(saved.settings)
    setLines(saved.lines)
    refresh()
  }

  async function toggleLines(): Promise<void> {
    await applyFloorSettings({ ...floor, showLines: !floor.showLines })
  }

  /** حجم كل الترابيزات: بيتغير على الشاشة فورًا ويتحفظ بعد ما توقف تحريك */
  function changeTableScale(value: number): void {
    setFloor((f) => ({ ...f, tableScale: value }))
    if (scaleSaveTimer.current) clearTimeout(scaleSaveTimer.current)
    scaleSaveTimer.current = setTimeout(() => {
      window.api.restaurant.saveFloorSettings({ ...floor, tableScale: value }).then((f) => setFloor(f.settings))
    }, 500)
  }

  /** ترتيب تلقائي في صفوف منظمة (من اليمين للشمال)، وكل صالة/منطقة تبدأ في صف جديد */
  async function autoArrange(): Promise<void> {
    if (!visibleTables.length) return
    if (!await confirmDialog(`ترتيب ${visibleTables.length} ترابيزة تلقائيًا في صفوف؟ (الأماكن الحالية هتتغير)`)) return
    const list = [...visibleTables].sort(
      (a, b) => (a.zone ?? '').localeCompare(b.zone ?? '', 'ar') || a.name.localeCompare(b.name, 'ar', { numeric: true })
    )
    const GAP = 20
    const MARGIN = 20
    let x = MARGIN
    let y = MARGIN
    let rowH = 0
    let prevZone: string | null = null
    const placed: { id: number; x: number; y: number; w: number }[] = []
    for (const t of list) {
      const b = tableBox(t, floor.tableScale)
      const zone = t.zone ?? ''
      const zoneChanged = zoneFilter === '__all__' && prevZone !== null && zone !== prevZone
      if (placed.length && (x + b.w > W - MARGIN || zoneChanged)) {
        x = MARGIN
        y += rowH + GAP + (zoneChanged ? GAP * 2 : 0)
        rowH = 0
      }
      placed.push({ id: t.id, x, y, w: b.w })
      x += b.w + GAP
      rowH = Math.max(rowH, b.h)
      prevZone = zone
    }
    // لو الترابيزات محتاجة طول أكتر من الصالة، الصالة بتطول لوحدها
    let floorH = H
    const needH = y + rowH + MARGIN
    if (needH > H) {
      floorH = Math.ceil(needH / 50) * 50
      await applyFloorSettings({ ...floor, floorHeight: floorH })
    }
    await window.api.restaurant.setTablePositions(
      placed.map((p) => ({ id: p.id, posX: ((W - p.x - p.w) / W) * 100, posY: (p.y / floorH) * 100 }))
    )
    refresh()
  }

  /* ------------------------------ نموذج الترابيزة ------------------------------ */

  async function saveForm(): Promise<void> {
    if (!form || !form.name.trim()) return
    const seats = Math.max(1, Math.min(20, Number(form.seats) || 4))
    await window.api.restaurant.upsertTable({
      id: form.id,
      name: form.name,
      zone: form.zone,
      seats,
      posX: form.posX,
      posY: form.posY,
      shape: form.shape,
      sizeScale: form.sizeScale
    })
    setForm(null)
    refresh()
  }

  async function removeTable(id: number): Promise<void> {
    if (!await confirmDialog('حذف الترابيزة؟')) return
    const result = await window.api.restaurant.deleteTable(id)
    if (!result.ok) setError(result.error ?? 'تعذر الحذف')
    else {
      setForm(null)
      refresh()
    }
  }

  /** أول مكان فاضي في الصالة (من فوق لتحت، ومن اليمين للشمال) بدل ما الترابيزات الجديدة تتكوّم فوق بعض */
  function findFreeSpot(w: number, h: number): { posX: number; posY: number } {
    const PADDING = 12
    const rects = visibleTables.map((t) => {
      const b = tableBox(t, floor.tableScale)
      return { x: (t.posX / 100) * W, y: (t.posY / 100) * H, w: b.w, h: b.h }
    })
    for (let y = 16; y + h <= H - 8; y += 16) {
      for (let x = W - w - 16; x >= 8; x -= 16) {
        const hit = rects.some(
          (r) => x < r.x + r.w + PADDING && x + w + PADDING > r.x && y < r.y + r.h + PADDING && y + h + PADDING > r.y
        )
        if (!hit) return { posX: (x / W) * 100, posY: (y / H) * 100 }
      }
    }
    return { posX: 2, posY: 2 }
  }

  function newTable(): void {
    const b = tableBox({ shape: 'auto', seats: 4, sizeScale: 1 }, floor.tableScale)
    const spot = findFreeSpot(b.w, b.h)
    setForm({
      name: String(tables.length + 1),
      zone: zoneFilter !== '__all__' ? zoneFilter : '',
      seats: '4',
      shape: 'auto',
      sizeScale: 1,
      ...spot
    })
  }

  const previewSeats = form ? Math.max(1, Math.min(20, Number(form.seats) || 1)) : 4
  const previewGeom = form ? tableGeometry(resolveShape(form.shape, previewSeats), previewSeats) : null
  const linesVisible = floor.showLines || editMode

  return (
    <div className="rst-root">
      <div className="rst-toolbar" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="rst-stat-row">
          <div className="rst-stat">
            <span className="rst-dot" style={{ background: 'var(--rst-free)' }} />
            متاحة <strong>{tables.length - occupiedCount}</strong>
          </div>
          <div className="rst-stat">
            <span className="rst-dot" style={{ background: 'var(--rst-busy)' }} />
            مشغولة <strong>{occupiedCount}</strong>
          </div>
          {checkedCount > 0 && (
            <div className="rst-stat">
              <span className="rst-dot" style={{ background: 'var(--rst-check)' }} />
              الحساب اتطبع <strong>{checkedCount}</strong>
            </div>
          )}
          {readyCount > 0 && (
            <div className="rst-stat">
              <span className="rst-dot" style={{ background: 'var(--rst-ready)' }} />
              أكلها جاهز <strong>{readyCount}</strong>
            </div>
          )}
          <div className="rst-stat">
            💰 مفتوح على الترابيزات <strong>{currency(openTotal)}</strong>
          </div>
        </div>
        <div className="rst-toolbar">
          {editMode && (
            <>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={newTable}>
                + ترابيزة جديدة
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={newLine}>
                ➖ خط فاصل
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={autoArrange}>
                🔲 ترتيب تلقائي
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setFloorForm({ ...floor })}>
                📐 مساحة الصالة
              </button>
            </>
          )}
          <button
            type="button"
            className={`qcp-btn ${editMode ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '✓ حفظ وإنهاء التعديل' : '✏️ تعديل تخطيط الصالة'}
          </button>
        </div>
      </div>

      <div className="rst-toolbar" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          {zones.length > 0 && (
            <div className="rst-seg">
              <button type="button" className={zoneFilter === '__all__' ? 'active' : ''} onClick={() => setZoneFilter('__all__')}>
                كل الصالات <span className="rst-count">{tables.length}</span>
              </button>
              {zones.map((z) => (
                <button key={z} type="button" className={zoneFilter === z ? 'active' : ''} onClick={() => setZoneFilter(z)}>
                  {z} <span className="rst-count">{tables.filter((t) => t.zone === z).length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rst-toolbar">
          <div className="rst-seg">
            <button type="button" className={!view.compact ? 'active' : ''} onClick={() => setView((v) => ({ ...v, compact: false }))}>
              🪑 رسم كامل
            </button>
            <button type="button" className={view.compact ? 'active' : ''} onClick={() => setView((v) => ({ ...v, compact: true }))}>
              ▫️ رسم مصغّر
            </button>
          </div>
          {!editMode && lines.length > 0 && (
            <button
              type="button"
              className="qcp-btn qcp-btn-secondary"
              onClick={toggleLines}
              title="إظهار/إخفاء الخطوط الفاصلة"
            >
              {floor.showLines ? '➖ إخفاء الخطوط' : '➖ إظهار الخطوط'}
            </button>
          )}
          <div className="rst-zoom">
            <button type="button" onClick={() => setZoom(scale / 1.15)} title="تصغير">
              −
            </button>
            <span title="Ctrl + عجلة الماوس للتكبير والتصغير">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setZoom(scale * 1.15)} title="تكبير">
              +
            </button>
            <button
              type="button"
              className={view.zoom === 'fit' ? 'active' : ''}
              onClick={() => setView((v) => ({ ...v, zoom: 'fit' }))}
              title="الصالة كلها تبان على الشاشة"
            >
              ⛶ ملء الشاشة
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rst-error">{error}</div>}
      {editMode && (
        <div
          className="rst-toast rst-toolbar"
          style={{ background: 'var(--qcp-accent-soft)', color: 'var(--qcp-accent)', borderColor: 'transparent', justifyContent: 'space-between' }}
        >
          <span>✋ اسحب الترابيزة أو الخط لمكانه — ودوس عليه لتعديله أو حذفه. طرف الخط بيتسحب لتطويله.</span>
          <label className="rst-range">
            حجم كل الترابيزات
            <input
              type="range"
              min={0.3}
              max={1.6}
              step={0.05}
              value={floor.tableScale}
              onChange={(e) => changeTableScale(Number(e.target.value))}
            />
            <strong>{Math.round(floor.tableScale * 100)}%</strong>
          </label>
        </div>
      )}

      <div ref={viewportRef} className="rst-floor-viewport" style={{ maxHeight: box.h }}>
        <div style={{ position: 'relative', width: W * scale, height: H * scale, margin: '0 auto' }}>
          <div
            ref={floorRef}
            className={`rst-floor ${editMode ? 'editing' : ''}`}
            style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, minHeight: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }}
          >
            {linesVisible &&
              visibleLines.map((l) => {
                const horizontal = l.orientation === 'h'
                return (
                  <div
                    key={`line-${l.id}`}
                    className={`rst-line ${horizontal ? 'h' : 'v'} ${editMode ? 'editing' : ''} ${!floor.showLines ? 'hidden-lines' : ''}`}
                    style={
                      horizontal
                        ? { left: `${l.posX}%`, top: `${l.posY}%`, width: `${l.length}%` }
                        : { left: `${l.posX}%`, top: `${l.posY}%`, height: `${l.length}%` }
                    }
                    onPointerDown={(e) => linePointerDown(e, l, 'move')}
                    onPointerMove={linePointerMove}
                    onPointerUp={linePointerUp}
                  >
                    <div className={`rst-line-stroke ${l.style}`} />
                    {l.label && <span className="rst-line-label">{l.label}</span>}
                    {editMode && <span className="rst-line-handle" onPointerDown={(e) => linePointerDown(e, l, 'resize')} title="اسحب لتطويل/تقصير الخط" />}
                  </div>
                )
              })}

            {visibleTables.map((t) => {
              const status = visualStatus(t)
              const shape = resolveShape(t.shape, t.seats)
              const elapsed = minutesSince(t.orderOpenedAt)
              return (
                <div
                  key={t.id}
                  className={`rst-table ${draggingId === t.id ? 'dragging' : ''}`}
                  style={{ left: `${t.posX}%`, top: `${t.posY}%`, cursor: opening ? 'wait' : undefined, touchAction: 'none' }}
                  onPointerDown={(e) => handlePointerDown(e, t)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => (editMode ? handlePointerUp(t) : selectTable(t))}
                  title={t.zone ? `${t.name} — ${t.zone}` : t.name}
                >
                  <TableGraphic
                    shape={shape}
                    seats={t.seats}
                    status={status}
                    occupiedSeats={t.orderGuestCount}
                    compact={view.compact}
                    scale={floor.tableScale * (t.sizeScale || 1)}
                  >
                    <div className="rst-table-name">{t.name}</div>
                    {t.status === 'occupied' ? (
                      <>
                        <div className="rst-table-amount">{currency(t.orderTotal ?? 0)}</div>
                        <div className="rst-table-sub">⏱ {formatElapsed(elapsed)}</div>
                      </>
                    ) : (
                      <div className="rst-table-sub">👤 {t.seats}</div>
                    )}
                  </TableGraphic>
                  {status === 'checked' && <span className="rst-table-badge" style={{ background: 'var(--rst-check)' }}>🧾 الحساب</span>}
                  {status === 'ready' && <span className="rst-table-badge">🔔 جاهز</span>}
                </div>
              )
            })}
            {!visibleTables.length && (
              <div className="rst-empty" style={{ paddingTop: 120 }}>
                <span className="big">🪑</span>
                {tables.length ? 'مفيش ترابيزات في الصالة دي' : 'مفيش ترابيزات لسه — دوس "تعديل تخطيط الصالة" وبعدين "+ ترابيزة جديدة"'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rst-legend" style={{ marginTop: 10 }}>
        <span>
          <span className="rst-dot" style={{ background: 'var(--rst-free)' }} /> متاحة — دوسة تفتح طلب جديد
        </span>
        <span>
          <span className="rst-dot" style={{ background: 'var(--rst-busy)' }} /> مشغولة — دوسة تفتح الطلب
        </span>
        <span>
          <span className="rst-dot" style={{ background: 'var(--rst-ready)' }} /> الأكل جاهز للتقديم
        </span>
      </div>

      {form && previewGeom && (
        <div className="qcp-modal-backdrop" onClick={() => setForm(null)}>
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              saveForm()
            }}
          >
            <h3 style={{ marginTop: 0 }}>{form.id ? `تعديل ترابيزة ${form.name}` : 'ترابيزة جديدة'}</h3>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px 0 14px', minHeight: 150 }}>
              <TableGraphic
                shape={resolveShape(form.shape, previewSeats)}
                seats={previewSeats}
                status="available"
                scale={Math.min(260 / previewGeom.width, 190 / previewGeom.height, form.sizeScale * floor.tableScale)}
              >
                <div className="rst-table-name">{form.name || '؟'}</div>
                <div className="rst-table-sub">👤 {previewSeats}</div>
              </TableGraphic>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="qcp-field">
                <label>الاسم/الرقم</label>
                <input className="qcp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div className="qcp-field">
                <label>عدد الكراسي</label>
                <input
                  className="qcp-input"
                  type="number"
                  min={1}
                  max={20}
                  value={form.seats}
                  onChange={(e) => setForm({ ...form, seats: e.target.value })}
                />
              </div>
            </div>
            <div className="qcp-field">
              <label>الصالة/المنطقة (اختياري)</label>
              <input
                className="qcp-input"
                list="rst-zones"
                value={form.zone}
                placeholder="مثلاً: الصالة الرئيسية، التراس، الدور التاني"
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
              />
              <datalist id="rst-zones">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </div>
            <div className="qcp-field">
              <label>شكل الترابيزة</label>
              <div className="rst-shape-picker">
                {SHAPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={form.shape === o.value ? 'active' : ''}
                    onClick={() => setForm({ ...form, shape: o.value })}
                  >
                    <TableGraphic
                      shape={resolveShape(o.value, previewSeats)}
                      seats={Math.min(previewSeats, 8)}
                      status="available"
                      scale={0.32}
                    />
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="qcp-field">
              <label>
                حجم الترابيزة <strong>{Math.round(form.sizeScale * 100)}%</strong>
              </label>
              <input
                type="range"
                min={0.4}
                max={2.5}
                step={0.05}
                value={form.sizeScale}
                onChange={(e) => setForm({ ...form, sizeScale: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
              <div className="rst-seg" style={{ marginTop: 6 }}>
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={Math.abs(form.sizeScale - p.value) < 0.01 ? 'active' : ''}
                    onClick={() => setForm({ ...form, sizeScale: p.value })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }}>
                {form.id ? 'حفظ' : 'إضافة'}
              </button>
              {form.id && (
                <button
                  type="button"
                  className="qcp-btn qcp-btn-secondary"
                  style={{ color: 'var(--qcp-critical)' }}
                  onClick={() => removeTable(form.id!)}
                >
                  🗑 حذف
                </button>
              )}
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => setForm(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {lineForm && (
        <div className="qcp-modal-backdrop" onClick={() => setLineForm(null)}>
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              saveLine()
            }}
          >
            <h3 style={{ marginTop: 0 }}>{lineForm.id ? 'تعديل الخط الفاصل' : 'خط فاصل جديد'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="qcp-field">
                <label>الاتجاه</label>
                <div className="rst-seg">
                  <button type="button" className={lineForm.orientation === 'h' ? 'active' : ''} onClick={() => setLineForm({ ...lineForm, orientation: 'h' })}>
                    ━ أفقي
                  </button>
                  <button type="button" className={lineForm.orientation === 'v' ? 'active' : ''} onClick={() => setLineForm({ ...lineForm, orientation: 'v' })}>
                    ┃ رأسي
                  </button>
                </div>
              </div>
              <div className="qcp-field">
                <label>شكل الخط</label>
                <div className="rst-seg">
                  <button type="button" className={lineForm.style === 'solid' ? 'active' : ''} onClick={() => setLineForm({ ...lineForm, style: 'solid' })}>
                    متصل
                  </button>
                  <button type="button" className={lineForm.style === 'dashed' ? 'active' : ''} onClick={() => setLineForm({ ...lineForm, style: 'dashed' })}>
                    متقطع
                  </button>
                </div>
              </div>
            </div>
            <div className="qcp-field">
              <label>
                الطول <strong>{Math.round(lineForm.length)}%</strong> من {lineForm.orientation === 'h' ? 'عرض' : 'طول'} الصالة
              </label>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={lineForm.length}
                onChange={(e) => setLineForm({ ...lineForm, length: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="qcp-field">
              <label>كلمة على الخط (اختياري)</label>
              <input
                className="qcp-input"
                value={lineForm.label}
                placeholder="مثلاً: التراس، منطقة التدخين، العائلات"
                onChange={(e) => setLineForm({ ...lineForm, label: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }}>
                {lineForm.id ? 'حفظ' : 'إضافة'}
              </button>
              {lineForm.id && (
                <button
                  type="button"
                  className="qcp-btn qcp-btn-secondary"
                  style={{ color: 'var(--qcp-critical)' }}
                  onClick={() => removeLine(lineForm.id!)}
                >
                  🗑 شيل الخط
                </button>
              )}
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => setLineForm(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {floorForm && (
        <div className="qcp-modal-backdrop" onClick={() => setFloorForm(null)}>
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault()
              await applyFloorSettings(floorForm)
              setFloorForm(null)
            }}
          >
            <h3 style={{ marginTop: 0 }}>📐 مساحة الصالة</h3>
            <p style={{ marginTop: 0, color: 'var(--qcp-ink-muted)', fontSize: 13 }}>
              كبّر المساحة لو الترابيزات كتير — الترابيزات بتفضل في مكانها والمساحة الزيادة بتبان فاضية تحت وعلى الشمال.
              الصالة كلها بتتصغّر على الشاشة لوحدها عشان تبان مرة واحدة.
            </p>
            <div className="rst-seg" style={{ marginBottom: 12 }}>
              {FLOOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={floorForm.floorWidth === p.w && floorForm.floorHeight === p.h ? 'active' : ''}
                  onClick={() => setFloorForm({ ...floorForm, floorWidth: p.w, floorHeight: p.h })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="qcp-field">
                <label>العرض ↔</label>
                <input
                  className="qcp-input"
                  type="number"
                  min={600}
                  max={6000}
                  step={100}
                  value={floorForm.floorWidth}
                  onChange={(e) => setFloorForm({ ...floorForm, floorWidth: Number(e.target.value) })}
                />
              </div>
              <div className="qcp-field">
                <label>الطول ↕</label>
                <input
                  className="qcp-input"
                  type="number"
                  min={400}
                  max={4000}
                  step={100}
                  value={floorForm.floorHeight}
                  onChange={(e) => setFloorForm({ ...floorForm, floorHeight: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="qcp-field">
              <label>
                حجم كل الترابيزات <strong>{Math.round(floorForm.tableScale * 100)}%</strong>
              </label>
              <input
                type="range"
                min={0.3}
                max={1.6}
                step={0.05}
                value={floorForm.tableScale}
                onChange={(e) => setFloorForm({ ...floorForm, tableScale: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input type="checkbox" checked={floorForm.showLines} onChange={(e) => setFloorForm({ ...floorForm, showLines: e.target.checked })} />
              إظهار الخطوط الفاصلة
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="submit" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }}>
                حفظ
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => setFloorForm(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
