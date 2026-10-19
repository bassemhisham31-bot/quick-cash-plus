import { getDb } from '../db'
import type {
  EventBooking,
  EventBookingInput,
  EventBookingPayment,
  EventBookingStatus,
  EventPackage,
  EventPackageInput,
  PaymentMethod
} from '../../shared/types'

const r2 = (v: number): number => Math.round(v * 100) / 100

/* ------------------------------- الباكدجات ------------------------------- */

export async function listPackages(includeInactive = true): Promise<EventPackage[]> {
  const rs = await getDb().execute(
    `SELECT id, name, description, price, price_type AS priceType, is_active AS isActive
     FROM event_packages WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND is_active = 1'} ORDER BY name`
  )
  return (rs.rows as any[]).map((r) => ({
    id: Number(r.id),
    name: r.name,
    description: r.description ?? null,
    price: Number(r.price),
    priceType: r.priceType === 'per_person' ? 'per_person' : 'fixed',
    isActive: Number(r.isActive) === 1
  }))
}

export async function upsertPackage(input: EventPackageInput): Promise<void> {
  const name = input.name?.trim()
  if (!name) throw new Error('اسم الباكدج مطلوب')
  const price = Number(input.price)
  if (!(price >= 0)) throw new Error('السعر غير صحيح')
  const db = getDb()
  if (input.id) {
    await db.execute({
      sql: 'UPDATE event_packages SET name = ?, description = ?, price = ?, price_type = ?, is_active = ? WHERE id = ?',
      args: [name, input.description?.trim() || null, price, input.priceType, input.isActive === false ? 0 : 1, input.id]
    })
  } else {
    await db.execute({
      sql: 'INSERT INTO event_packages (name, description, price, price_type, is_active) VALUES (?, ?, ?, ?, ?)',
      args: [name, input.description?.trim() || null, price, input.priceType, input.isActive === false ? 0 : 1]
    })
  }
}

export async function deletePackage(id: number): Promise<void> {
  await getDb().execute({ sql: "UPDATE event_packages SET deleted_at = datetime('now') WHERE id = ?", args: [id] })
}

/* ------------------------------- الحجوزات ------------------------------- */

const BOOKING_SELECT = `
  SELECT b.id, b.number, b.customer_id AS customerId, b.customer_name AS customerName, b.customer_phone AS customerPhone,
         b.event_type AS eventType, b.honoree, b.event_date AS eventDate, b.event_time AS eventTime, b.guests,
         b.package_id AS packageId, b.package_name AS packageName, b.base_price AS basePrice, b.discount, b.total,
         b.notes, b.status, b.created_at AS createdAt,
         COALESCE((SELECT SUM(amount) FROM event_booking_payments WHERE booking_id = b.id), 0) AS paid
  FROM event_bookings b
`

function mapBooking(r: any, payments: EventBookingPayment[]): EventBooking {
  const total = Number(r.total)
  const paid = r2(Number(r.paid))
  return {
    id: Number(r.id),
    number: r.number,
    customerId: r.customerId != null ? Number(r.customerId) : null,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? null,
    eventType: r.eventType,
    honoree: r.honoree ?? null,
    eventDate: r.eventDate,
    eventTime: r.eventTime ?? null,
    guests: Number(r.guests),
    packageId: r.packageId != null ? Number(r.packageId) : null,
    packageName: r.packageName ?? null,
    basePrice: Number(r.basePrice),
    discount: Number(r.discount),
    total,
    paid,
    remaining: r2(total - paid),
    notes: r.notes ?? null,
    status: r.status as EventBookingStatus,
    createdAt: r.createdAt,
    payments
  }
}

async function loadPayments(bookingIds: number[]): Promise<Map<number, EventBookingPayment[]>> {
  const map = new Map<number, EventBookingPayment[]>()
  if (!bookingIds.length) return map
  const rs = await getDb().execute({
    sql: `SELECT p.id, p.booking_id AS bookingId, p.amount, p.method, p.note, p.created_at AS createdAt, u.full_name AS userName
          FROM event_booking_payments p LEFT JOIN users u ON u.id = p.user_id
          WHERE p.booking_id IN (${bookingIds.map(() => '?').join(',')}) ORDER BY p.id`,
    args: bookingIds
  })
  for (const r of rs.rows as any[]) {
    const list = map.get(Number(r.bookingId)) ?? []
    list.push({
      id: Number(r.id),
      bookingId: Number(r.bookingId),
      amount: Number(r.amount),
      method: r.method as PaymentMethod,
      note: r.note ?? null,
      createdAt: r.createdAt,
      userName: r.userName ?? null
    })
    map.set(Number(r.bookingId), list)
  }
  return map
}

export async function listBookings(filter: { status?: EventBookingStatus; from?: string; to?: string } = {}): Promise<EventBooking[]> {
  const conditions: string[] = []
  const args: unknown[] = []
  if (filter.status) {
    conditions.push('b.status = ?')
    args.push(filter.status)
  }
  if (filter.from) {
    conditions.push('b.event_date >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    conditions.push('b.event_date <= ?')
    args.push(filter.to)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rs = await getDb().execute({ sql: `${BOOKING_SELECT} ${where} ORDER BY b.event_date DESC, b.event_time DESC, b.id DESC`, args })
  const rows = rs.rows as any[]
  const payments = await loadPayments(rows.map((r) => Number(r.id)))
  return rows.map((r) => mapBooking(r, payments.get(Number(r.id)) ?? []))
}

export async function getBooking(id: number): Promise<EventBooking | null> {
  const rs = await getDb().execute({ sql: `${BOOKING_SELECT} WHERE b.id = ?`, args: [id] })
  const row = rs.rows[0] as any
  if (!row) return null
  const payments = await loadPayments([id])
  return mapBooking(row, payments.get(id) ?? [])
}

async function getOpenSessionId(): Promise<number | null> {
  const rs = await getDb().execute("SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1")
  return rs.rows[0] ? Number((rs.rows[0] as any).id) : null
}

async function insertPayment(
  bookingId: number,
  amount: number,
  method: PaymentMethod,
  note: string | null,
  userId: number,
  sessionId: number
): Promise<void> {
  await getDb().execute({
    sql: 'INSERT INTO event_booking_payments (booking_id, amount, method, session_id, user_id, note) VALUES (?, ?, ?, ?, ?, ?)',
    args: [bookingId, amount, method, sessionId, userId, note]
  })
}

export async function saveBooking(input: EventBookingInput, userId: number): Promise<EventBooking> {
  const db = getDb()
  const customerName = input.customerName?.trim()
  if (!customerName) throw new Error('اسم العميل مطلوب')
  if (!input.eventDate) throw new Error('تاريخ المناسبة مطلوب')
  const guests = Math.max(1, Math.floor(Number(input.guests) || 1))
  const basePrice = Math.max(0, Number(input.basePrice) || 0)
  const discount = Math.min(basePrice, Math.max(0, Number(input.discount) || 0))
  const total = r2(basePrice - discount)

  let packageName: string | null = null
  if (input.packageId) {
    const p = await db.execute({ sql: 'SELECT name FROM event_packages WHERE id = ?', args: [input.packageId] })
    packageName = (p.rows[0] as any)?.name ?? null
  }

  const deposit = Math.max(0, Number(input.depositAmount) || 0)
  const sessionId = await getOpenSessionId()
  if (deposit > 0 && !sessionId) throw new Error('افتح الوردية الأول عشان تسجّل العربون')

  let id: number
  if (input.id) {
    id = input.id
    const cur = await db.execute({ sql: 'SELECT status FROM event_bookings WHERE id = ?', args: [id] })
    if (!cur.rows[0]) throw new Error('الحجز غير موجود')
    if ((cur.rows[0] as any).status !== 'booked') throw new Error('الحجز ده اتقفل — مينفعش يتعدّل')
    await db.execute({
      sql: `UPDATE event_bookings SET customer_id = ?, customer_name = ?, customer_phone = ?, event_type = ?, honoree = ?,
                   event_date = ?, event_time = ?, guests = ?, package_id = ?, package_name = ?, base_price = ?, discount = ?,
                   total = ?, notes = ? WHERE id = ?`,
      args: [
        input.customerId ?? null,
        customerName,
        input.customerPhone?.trim() || null,
        input.eventType?.trim() || 'عيد ميلاد',
        input.honoree?.trim() || null,
        input.eventDate,
        input.eventTime || null,
        guests,
        input.packageId ?? null,
        packageName,
        basePrice,
        discount,
        total,
        input.notes?.trim() || null,
        id
      ]
    })
  } else {
    const info = await db.execute({
      sql: `INSERT INTO event_bookings (customer_id, customer_name, customer_phone, event_type, honoree, event_date, event_time,
                   guests, package_id, package_name, base_price, discount, total, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.customerId ?? null,
        customerName,
        input.customerPhone?.trim() || null,
        input.eventType?.trim() || 'عيد ميلاد',
        input.honoree?.trim() || null,
        input.eventDate,
        input.eventTime || null,
        guests,
        input.packageId ?? null,
        packageName,
        basePrice,
        discount,
        total,
        input.notes?.trim() || null,
        userId
      ]
    })
    id = Number(info.lastInsertRowid)
    await db.execute({ sql: 'UPDATE event_bookings SET number = ? WHERE id = ?', args: [`EV-${String(id).padStart(5, '0')}`, id] })
    if (deposit > 0 && sessionId) {
      await insertPayment(id, r2(deposit), input.depositMethod ?? 'cash', 'عربون الحجز', userId, sessionId)
    }
  }
  const saved = await getBooking(id)
  if (!saved) throw new Error('تعذر حفظ الحجز')
  return saved
}

/** دفعة (عربون / قسط / باقي) أو استرداد (amount سالب) — بتدخل الخزينة وبتظهر في إقفال الوردية تحت "الحجوزات" */
export async function addBookingPayment(
  bookingId: number,
  amount: number,
  method: PaymentMethod,
  note: string | null,
  userId: number
): Promise<EventBooking> {
  const value = r2(Number(amount))
  if (!value) throw new Error('المبلغ غير صحيح')
  const booking = await getBooking(bookingId)
  if (!booking) throw new Error('الحجز غير موجود')
  if (booking.status === 'cancelled' && value > 0) throw new Error('الحجز ملغي')
  if (value > 0 && value > booking.remaining + 0.001) throw new Error('المبلغ أكبر من المتبقي على الحجز')
  if (value < 0 && -value > booking.paid + 0.001) throw new Error('الاسترداد أكبر من المدفوع')
  const sessionId = await getOpenSessionId()
  if (!sessionId) throw new Error('افتح الوردية الأول — الفلوس بتدخل الدرج')
  await insertPayment(bookingId, value, method, note?.trim() || (value < 0 ? 'استرداد' : null), userId, sessionId)
  return (await getBooking(bookingId))!
}

export async function setBookingStatus(bookingId: number, status: EventBookingStatus): Promise<EventBooking> {
  const booking = await getBooking(bookingId)
  if (!booking) throw new Error('الحجز غير موجود')
  if (booking.status !== 'booked') throw new Error('الحجز اتقفل قبل كده')
  if (status === 'completed') {
    await getDb().execute({ sql: "UPDATE event_bookings SET status = 'completed', completed_at = datetime('now') WHERE id = ?", args: [bookingId] })
  } else if (status === 'cancelled') {
    await getDb().execute({ sql: "UPDATE event_bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?", args: [bookingId] })
  }
  return (await getBooking(bookingId))!
}

/** إجمالي تحصيلات الحجوزات في وردية (صافي الاسترداد) — للإقفال */
export async function getSessionEventTotals(sessionId: number): Promise<{ count: number; total: number }> {
  const rs = await getDb().execute({
    sql: 'SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total FROM event_booking_payments WHERE session_id = ?',
    args: [sessionId]
  })
  const row = rs.rows[0] as any
  return { count: Number(row.cnt), total: r2(Number(row.total)) }
}
