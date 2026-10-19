import type { KitchenStatus, RestaurantOrderType, RestaurantTableShape } from '../../../../shared/types'

export const ORDER_TYPE_LABELS: Record<RestaurantOrderType, string> = {
  dine_in: 'صالة',
  takeaway: 'تيك أواي',
  delivery: 'ديلفري'
}

export const ORDER_TYPE_ICONS: Record<RestaurantOrderType, string> = {
  dine_in: '🍽️',
  takeaway: '🥡',
  delivery: '🛵'
}

export const KITCHEN_STATUS_LABELS: Record<KitchenStatus, string> = {
  pending: 'لم يُرسل للمطبخ',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  out_for_delivery: 'خرج للتوصيل',
  completed: 'تم'
}

export const KITCHEN_STATUS_FLOW: Record<KitchenStatus, KitchenStatus | null> = {
  pending: null,
  preparing: 'ready',
  ready: 'out_for_delivery',
  out_for_delivery: 'completed',
  completed: null
}

/** تاريخ SQLite (datetime('now') = UTC بصيغة "YYYY-MM-DD HH:MM:SS") → عدد الدقايق من ساعتها */
export function minutesSince(sqliteUtc: string | null | undefined): number {
  if (!sqliteUtc) return 0
  const t = new Date(sqliteUtc.replace(' ', 'T') + (sqliteUtc.endsWith('Z') ? '' : 'Z')).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 60000))
}

export function formatElapsed(minutes: number): string {
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `${minutes} د`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} س ${m} د` : `${h} س`
}

/* ------------------------------ رسم الترابيزة ------------------------------ */

export type ResolvedShape = 'round' | 'square' | 'rect'

export function resolveShape(shape: RestaurantTableShape | undefined, seats: number): ResolvedShape {
  if (shape && shape !== 'auto') return shape
  if (seats <= 2) return 'round'
  if (seats <= 4) return 'square'
  return 'rect'
}

export type TableVisualStatus = 'available' | 'occupied' | 'ready' | 'checked'

const CHAIR_W = 26
const CHAIR_D = 14
const GAP = 6
const PAD = GAP + CHAIR_D + 4

interface Chair {
  cx: number
  cy: number
  angle: number
}

interface Geometry {
  width: number
  height: number
  /** مستطيل سطح الترابيزة (للكتابة فوقه) */
  top: { x: number; y: number; w: number; h: number }
  kind: ResolvedShape
  chairs: Chair[]
}

function spread(count: number, start: number, length: number): number[] {
  return Array.from({ length: count }, (_, k) => start + (length * (k + 1)) / (count + 1))
}

/** الرسم المصغّر: سطح الترابيزة بس من غير كراسي — مساحة أقل بكتير لما الترابيزات تكتر */
function compactGeometry(shape: ResolvedShape, seats: number): Geometry {
  const pad = 4
  if (shape === 'round') {
    const r = seats <= 2 ? 30 : seats <= 4 ? 34 : Math.min(52, 34 + (seats - 4) * 3)
    return { width: 2 * (r + pad), height: 2 * (r + pad), top: { x: pad, y: pad, w: 2 * r, h: 2 * r }, kind: 'round', chairs: [] }
  }
  const w = shape === 'square' ? (seats <= 4 ? 66 : 78) : Math.max(96, Math.min(180, 64 + seats * 9))
  const h = shape === 'square' ? w : 60
  return { width: w + pad * 2, height: h + pad * 2, top: { x: pad, y: pad, w, h }, kind: shape, chairs: [] }
}

export function tableGeometry(shape: ResolvedShape, rawSeats: number, compact = false): Geometry {
  const seats = Math.max(1, Math.min(20, Math.round(rawSeats) || 1))
  if (compact) return compactGeometry(shape, seats)

  if (shape === 'round') {
    const r = seats <= 2 ? 36 : seats <= 4 ? 44 : Math.min(84, 44 + (seats - 4) * 6)
    const size = 2 * (r + PAD)
    const c = size / 2
    const chairs: Chair[] = Array.from({ length: seats }, (_, i) => {
      const theta = -90 + (i * 360) / seats
      const rad = (theta * Math.PI) / 180
      const dist = r + GAP + CHAIR_D / 2
      return { cx: c + dist * Math.cos(rad), cy: c + dist * Math.sin(rad), angle: theta + 90 }
    })
    return { width: size, height: size, top: { x: PAD, y: PAD, w: 2 * r, h: 2 * r }, kind: 'round', chairs }
  }

  let top = 0
  let bottom = 0
  let left = 0
  let right = 0
  if (shape === 'square') {
    const order = ['top', 'bottom', 'right', 'left'] as const
    for (let i = 0; i < seats; i++) {
      const side = order[i % 4]
      if (side === 'top') top++
      else if (side === 'bottom') bottom++
      else if (side === 'right') right++
      else left++
    }
  } else {
    const ends = seats >= 7 ? 1 : 0
    const rest = seats - ends * 2
    top = Math.ceil(rest / 2)
    bottom = Math.floor(rest / 2)
    left = ends
    right = ends
  }

  const slot = CHAIR_W + 10
  let w: number
  let h: number
  if (shape === 'square') {
    w = Math.max(92, Math.max(top, bottom, left, right) * slot + 20)
    h = w
  } else {
    w = Math.max(132, Math.max(top, bottom) * slot + 24)
    h = Math.max(78, Math.max(left, right) * slot + 20)
  }

  const chairs: Chair[] = []
  const outer = GAP + CHAIR_D / 2
  for (const x of spread(top, PAD, w)) chairs.push({ cx: x, cy: PAD - outer, angle: 0 })
  for (const x of spread(bottom, PAD, w)) chairs.push({ cx: x, cy: PAD + h + outer, angle: 180 })
  for (const y of spread(right, PAD, h)) chairs.push({ cx: PAD + w + outer, cy: y, angle: 90 })
  for (const y of spread(left, PAD, h)) chairs.push({ cx: PAD - outer, cy: y, angle: 270 })

  return { width: w + PAD * 2, height: h + PAD * 2, top: { x: PAD, y: PAD, w, h }, kind: shape, chairs }
}

const STATUS_COLORS: Record<TableVisualStatus, { top: string; stroke: string; chair: string }> = {
  available: { top: 'var(--qcp-bg-elevated)', stroke: 'var(--rst-free)', chair: 'var(--rst-chair)' },
  occupied: { top: 'var(--rst-busy-soft)', stroke: 'var(--rst-busy)', chair: 'var(--rst-chair-busy)' },
  ready: { top: 'var(--rst-ready-soft)', stroke: 'var(--rst-ready)', chair: 'var(--rst-chair-busy)' },
  checked: { top: 'var(--rst-check-soft)', stroke: 'var(--rst-check)', chair: 'var(--rst-check-chair)' }
}

/**
 * ترابيزة حقيقية الشكل (مدوّرة/مربعة/مستطيلة) وحواليها كراسي بعدد الكراسي الفعلي.
 * الكراسي المشغولة (بعدد الضيوف لو معروف) بتتلوّن بلون الترابيزة المشغولة.
 */
export function TableGraphic({
  shape,
  seats,
  status,
  occupiedSeats,
  scale = 1,
  compact = false,
  children
}: {
  shape: ResolvedShape
  seats: number
  status: TableVisualStatus
  occupiedSeats?: number | null
  scale?: number
  /** رسم مصغّر من غير كراسي */
  compact?: boolean
  children?: React.ReactNode
}): JSX.Element {
  const g = tableGeometry(shape, seats, compact)
  // الكلام بيصغر مع الترابيزة، بس مش أقل من 70% عشان يفضل مقروء
  const textScale = Math.max(scale, 0.7)
  const colors = STATUS_COLORS[status]
  const busyChairs = status === 'available' ? 0 : occupiedSeats && occupiedSeats > 0 ? occupiedSeats : g.chairs.length
  const radius = g.kind === 'round' ? g.top.w / 2 : g.kind === 'square' ? 14 : 16

  return (
    <div style={{ position: 'relative', width: g.width * scale, height: g.height * scale }}>
      <svg width={g.width * scale} height={g.height * scale} viewBox={`0 0 ${g.width} ${g.height}`}>
        {g.chairs.map((c, i) => (
          <g key={i} transform={`translate(${c.cx} ${c.cy}) rotate(${c.angle})`}>
            <rect
              x={-CHAIR_W / 2}
              y={-CHAIR_D / 2}
              width={CHAIR_W}
              height={CHAIR_D}
              rx={5}
              fill={i < busyChairs ? colors.chair : 'var(--rst-chair)'}
            />
            <rect
              x={-CHAIR_W / 2 + 3}
              y={-CHAIR_D / 2 - 4}
              width={CHAIR_W - 6}
              height={5}
              rx={2.5}
              fill={i < busyChairs ? colors.stroke : 'var(--qcp-ink-faint)'}
              opacity={0.55}
            />
          </g>
        ))}
        {g.kind === 'round' ? (
          <>
            <circle
              cx={g.width / 2}
              cy={g.height / 2}
              r={g.top.w / 2}
              fill={colors.top}
              stroke={colors.stroke}
              strokeWidth={3}
            />
            <circle
              cx={g.width / 2}
              cy={g.height / 2}
              r={g.top.w / 2 - 6}
              fill="none"
              stroke={colors.stroke}
              strokeOpacity={0.22}
              strokeWidth={1.5}
            />
          </>
        ) : (
          <>
            <rect
              x={g.top.x}
              y={g.top.y}
              width={g.top.w}
              height={g.top.h}
              rx={radius}
              fill={colors.top}
              stroke={colors.stroke}
              strokeWidth={3}
            />
            <rect
              x={g.top.x + 6}
              y={g.top.y + 6}
              width={g.top.w - 12}
              height={g.top.h - 12}
              rx={Math.max(4, radius - 5)}
              fill="none"
              stroke={colors.stroke}
              strokeOpacity={0.22}
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>
      {children && (
        <div
          className="rst-table-label"
          style={{
            left: g.top.x * scale,
            top: g.top.y * scale,
            width: (g.top.w * scale) / textScale,
            height: (g.top.h * scale) / textScale,
            right: 'auto',
            bottom: 'auto',
            transform: textScale !== 1 ? `scale(${textScale})` : undefined,
            transformOrigin: '0 0'
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** لون ثابت لكل تصنيف/صنف (لما مفيش صورة) — بيتحسب من الاسم عشان يفضل نفس اللون دايمًا */
const TILE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16']

export function colorFor(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return TILE_COLORS[h % TILE_COLORS.length]
}
