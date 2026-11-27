// تنفيذ أوامر المساعد الذكي في الواجهة — كل أمر بيشتغل بنفس صلاحيات المستخدم وبنفس دوال البرنامج العادية،
// والعمليات اللي بتغيّر بيانات (سداد، مصروف) بتطلب تأكيد لو «اطلب تأكيدي قبل الحفظ» مفعّل.
import { useAppStore, type ViewName } from '../store/appStore'
import { isViewAllowed, VIEW_ORDER } from './permissions'
import { confirmDialog } from '../components/ConfirmDialogHost'
import { formatCurrency } from './currency'
import { waitForPosBridge } from './assistantBridge'
import type { AssistantAction, AssistantSettings, ExpenseInput, PaymentMethod, ReportType, SessionUser } from '../../../shared/types'

/** تنظيف عربي للمطابقة: تشكيل، همزات، تاء مربوطة، ياء، مسافات */
export function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim()
}

/** أفضل تطابق: اسم مطابق تمامًا ← بيبدأ بالكلمة ← بيحتويها ← كل كلماتها موجودة. بيرجّع كمان عدد المتساوين في نفس الدرجة */
export function bestMatch<T>(items: T[], query: string, nameOf: (item: T) => string): { item: T; ties: number } | null {
  const q = normalizeArabic(query)
  if (!q) return null
  const words = q.split(' ')
  let best: { rank: number; item: T } | null = null
  let ties = 0
  for (const item of items) {
    const n = normalizeArabic(nameOf(item))
    let rank = 0
    if (n === q) rank = 4
    else if (n.startsWith(q)) rank = 3
    else if (n.includes(q)) rank = 2
    else if (words.length > 1 && words.every((w) => n.includes(w))) rank = 1
    if (!rank) continue
    if (!best || rank > best.rank) {
      best = { rank, item }
      ties = 1
    } else if (rank === best.rank) {
      ties++
    }
  }
  return best ? { item: best.item, ties } : null
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  credit: 'آجل',
  card: 'بنكي',
  wallet: 'محفظة',
  vodafone_cash: 'فودافون كاش',
  instapay: 'InstaPay',
  transfer: 'تحويل'
}

export interface ActionContext {
  user: SessionUser
  settings: AssistantSettings
  disabledFeatures: string[]
}

const VIEW_ALIASES: Record<string, ViewName> = {
  home: 'dashboard',
  sales: 'pos',
  sell: 'pos',
  purchases: 'inventory',
  stock: 'inventory'
}

function resolveView(raw: string): ViewName | null {
  const v = raw.trim()
  if ((VIEW_ORDER as string[]).includes(v)) return v as ViewName
  const lower = v.toLowerCase()
  const exact = (VIEW_ORDER as string[]).find((x) => x.toLowerCase() === lower)
  if (exact) return exact as ViewName
  return VIEW_ALIASES[lower] ?? null
}

async function navigate(action: Extract<AssistantAction, { type: 'navigate' }>, ctx: ActionContext): Promise<string> {
  const view = resolveView(action.view)
  if (!view) return `⚠️ ما عرفتش الشاشة «${action.view}»`
  if (!isViewAllowed(ctx.user, view, ctx.disabledFeatures)) return `⛔ مفيش صلاحية لفتح الشاشة دي (${action.view})`
  useAppStore.getState().setView(view)
  return `✅ فتحت الشاشة (${view})`
}

async function posSale(action: Extract<AssistantAction, { type: 'pos_sale' }>, ctx: ActionContext): Promise<string[]> {
  if (!isViewAllowed(ctx.user, 'pos', ctx.disabledFeatures)) return ['⛔ مفيش صلاحية لشاشة البيع']
  if (!action.items.length && !action.customer) {
    useAppStore.getState().setView('pos')
    return ['✅ فتحت شاشة البيع']
  }
  useAppStore.getState().setView('pos')
  const bridge = await waitForPosBridge()
  if (!bridge) return ['⚠️ تعذر فتح شاشة البيع']

  const lines: string[] = []
  if (bridge.cartCount() > 0) lines.push('ℹ️ السلة كان فيها أصناف — ضفت عليها')

  if (action.customer) {
    const customers = await window.api.customers.list(action.customer)
    const m = bestMatch(customers.filter((c) => !c.isWalkIn), action.customer, (c) => c.name)
    if (m) {
      bridge.setCustomer(m.item.id)
      lines.push(`👤 العميل: ${m.item.name}${m.ties > 1 ? ` (فيه ${m.ties} عملاء بنفس الاسم تقريبًا — راجع الاختيار)` : ''}`)
    } else {
      lines.push(`⚠️ مفيش عميل باسم «${action.customer}» — كمّلت من غير عميل`)
    }
  }

  let added = 0
  for (const item of action.items) {
    const r = await bridge.addByQuery(item.name, item.qty ?? 1, item.price ?? null)
    if (r.ok) added++
    lines.push(r.message)
  }

  const wantsPayment = action.finalize === true || !!action.payment
  if (added > 0 && wantsPayment) {
    const method = action.payment && METHOD_LABELS[action.payment] ? action.payment : null
    const autoConfirm = action.finalize === true && !ctx.settings.confirmActions
    const r = bridge.startPayment(method, autoConfirm)
    lines.push(r.message)
    if (r.ok && !autoConfirm && action.finalize) lines.push('👆 راجع الفاتورة واضغط «تأكيد» في شاشة الدفع عشان تتحفظ')
  } else if (added > 0) {
    lines.push('✅ الأصناف في السلة — قولّي «اقفل الفاتورة» أو اضغط دفع')
  }
  return lines
}

async function customerPayment(action: Extract<AssistantAction, { type: 'customer_payment' }>, ctx: ActionContext): Promise<string> {
  if (!isViewAllowed(ctx.user, 'customers', ctx.disabledFeatures)) return '⛔ مفيش صلاحية لتسجيل سداد عملاء'
  const customers = await window.api.customers.list(action.customer)
  const m = bestMatch(customers.filter((c) => !c.isWalkIn), action.customer, (c) => c.name)
  if (!m) return `⚠️ مفيش عميل باسم «${action.customer}»`
  if (m.ties > 1) return `⚠️ فيه ${m.ties} عملاء بنفس الاسم تقريبًا («${action.customer}») — اكتب الاسم كامل أكتر`
  const customer = m.item

  let treasuryId: number | null = null
  let treasuryName = 'الخزينة الافتراضية'
  try {
    const treasuries = (await window.api.treasury.list()).filter((t) => t.active)
    if (action.treasury) {
      const t = bestMatch(treasuries, action.treasury, (x) => x.name)
      if (!t) return `⚠️ مفيش خزينة باسم «${action.treasury}»`
      treasuryId = t.item.id
      treasuryName = t.item.name
    } else if (treasuries.length) {
      const def = treasuries.find((x) => x.isDefault) ?? treasuries[0]
      treasuryId = def.id
      treasuryName = def.name
    }
  } catch {
    // مفيش صلاحية لقايمة الخزائن — السداد هيتسجل بوسيلة الدفع الافتراضية
  }

  if (ctx.settings.confirmActions) {
    const ok = await confirmDialog(`تسجيل سداد ${formatCurrency(action.amount)} من «${customer.name}» على ${treasuryName}؟`)
    if (!ok) return '↩️ اتلغى تسجيل السداد'
  }
  const updated = await window.api.customers.recordPayment(customer.id, action.amount, 'cash' as PaymentMethod, action.note ?? '', ctx.user.id, treasuryId)
  return `✅ اتسجّل سداد ${formatCurrency(action.amount)} من ${customer.name} على ${treasuryName} — رصيده دلوقتي ${formatCurrency(updated.balance)}`
}

async function addExpense(action: Extract<AssistantAction, { type: 'add_expense' }>, ctx: ActionContext): Promise<string> {
  if (!isViewAllowed(ctx.user, 'expenses', ctx.disabledFeatures)) return '⛔ مفيش صلاحية لتسجيل مصروفات'
  const categories = await window.api.expenses.listCategories()
  const m = bestMatch(categories, action.category, (c) => c.name)
  if (!m) return `⚠️ مفيش بند مصروف باسم «${action.category}» — أضيفه من شاشة المصروفات الأول`
  if (m.ties > 1) return `⚠️ فيه ${m.ties} بنود بنفس الاسم تقريبًا («${action.category}») — حدّد البند أدق`
  const method: ExpenseInput['method'] = (['cash', 'card', 'wallet', 'transfer'] as const).find((x) => x === action.method) ?? 'cash'
  if (ctx.settings.confirmActions) {
    const ok = await confirmDialog(`تسجيل مصروف «${m.item.name}» بمبلغ ${formatCurrency(action.amount)} (${METHOD_LABELS[method]})؟`)
    if (!ok) return '↩️ اتلغى تسجيل المصروف'
  }
  const result = await window.api.expenses.create(
    { categoryId: m.item.id, amount: action.amount, method, note: action.note ?? '', attachmentPath: null, attachmentName: null },
    ctx.user.id
  )
  if (!result.ok) return `⚠️ ${result.error ?? 'تعذر تسجيل المصروف'}`
  return `✅ اتسجّل مصروف ${m.item.name} بمبلغ ${formatCurrency(action.amount)} (${METHOD_LABELS[method]})`
}

async function addCustomer(action: Extract<AssistantAction, { type: 'add_customer' }>, ctx: ActionContext): Promise<string> {
  if (!isViewAllowed(ctx.user, 'customers', ctx.disabledFeatures)) return '⛔ مفيش صلاحية لإضافة عملاء'
  const existing = await window.api.customers.list(action.name)
  const dup = existing.find((c) => normalizeArabic(c.name) === normalizeArabic(action.name))
  if (dup) return `⚠️ فيه عميل بنفس الاسم بالفعل («${dup.name}») — ما أضفتوش تاني`
  const phone = (action.phone ?? '').replace(/\s+/g, '')
  if (ctx.settings.confirmActions) {
    const details = [phone && `موبايل ${phone}`, action.openingBalance ? `رصيد ${formatCurrency(action.openingBalance)}` : ''].filter(Boolean).join('، ')
    const ok = await confirmDialog(`إضافة عميل جديد «${action.name}»${details ? ` (${details})` : ''}؟`)
    if (!ok) return '↩️ اتلغت إضافة العميل'
  }
  const created = await window.api.customers.create({
    name: action.name,
    phone,
    address: action.address ?? '',
    notes: action.notes ?? '',
    openingBalance: action.openingBalance ?? 0,
    loyaltyEnabled: true
  })
  return `✅ اتضاف العميل ${created.name}${phone ? ` (${phone})` : ''}`
}

async function addProduct(action: Extract<AssistantAction, { type: 'add_product' }>, ctx: ActionContext): Promise<string> {
  if (!isViewAllowed(ctx.user, 'inventory', ctx.disabledFeatures)) return '⛔ مفيش صلاحية لإضافة أصناف'
  const warehouses = await window.api.catalog.listWarehouses()
  const warehouse = warehouses.find((w) => w.isDefault) ?? warehouses[0]
  if (!warehouse) return '⚠️ مفيش مخزن'
  const same = (await window.api.catalog.listProducts(action.name, warehouse.id)).find((p) => normalizeArabic(p.name) === normalizeArabic(action.name))
  if (same) return `⚠️ فيه صنف بنفس الاسم بالفعل («${same.name}») — ما أضفتوش تاني`
  const notes: string[] = []
  let categoryId: number | null = null
  if (action.category) {
    const m = bestMatch(await window.api.catalog.listCategories(), action.category, (c) => c.name)
    if (m) categoryId = m.item.id
    else notes.push(`التصنيف «${action.category}» مش موجود — اتحط من غير تصنيف`)
  }
  let unitId: number | null = null
  if (action.unit) {
    const m = bestMatch(await window.api.catalog.listUnits(), action.unit, (u) => u.name)
    if (m) unitId = m.item.id
    else notes.push(`الوحدة «${action.unit}» مش موجودة — اتحط من غير وحدة`)
  }
  const retail = action.retailPrice ?? 0
  const cost = action.costPrice ?? 0
  const qty = action.quantity ?? 0
  if (ctx.settings.confirmActions) {
    const ok = await confirmDialog(`إضافة صنف جديد «${action.name}» — بيع ${formatCurrency(retail)}، شراء ${formatCurrency(cost)}، كمية ${qty}؟`)
    if (!ok) return '↩️ اتلغت إضافة الصنف'
  }
  const p = await window.api.catalog.createProduct({
    name: action.name,
    barcode: action.barcode ?? '',
    categoryId,
    unitId,
    vendorId: null,
    costPrice: cost,
    retailPrice: retail,
    wholesalePrice: 0,
    wholesale2Price: 0,
    packPrice: 0,
    openingQuantity: qty,
    reorderPoint: 0,
    warehouseId: warehouse.id,
    expiryDate: null,
    serialNumber: null,
    showInPos: true,
    serialTrackingEnabled: false,
    imageDataUrl: null
  })
  return `✅ اتضاف الصنف ${p.name} (باركود ${p.barcode}) — بيع ${formatCurrency(retail)}، شراء ${formatCurrency(cost)}، كمية ${qty}${notes.length ? ` (${notes.join('، ')})` : ''}`
}

/** عرض تقرير في المحادثة: العنوان + الإجماليات + أول الصفوف */
async function showReport(action: Extract<AssistantAction, { type: 'show_report' }>, ctx: ActionContext): Promise<string> {
  if (!isViewAllowed(ctx.user, 'reports', ctx.disabledFeatures)) return '⛔ مفيش صلاحية للتقارير'
  const today = new Date().toISOString().slice(0, 10)
  const from = action.from ?? today
  const to = action.to ?? action.from ?? today
  const r = await window.api.reports.run(action.report as ReportType, { dateFrom: from, dateTo: to, warehouseId: null })
  const label = (key: string): string => r.columns.find((c) => c.key === key)?.label ?? key
  const lines = [`📊 ${r.title} (${from}${to !== from ? ` ← ${to}` : ''})`]
  if (r.totals) {
    for (const [k, v] of Object.entries(r.totals)) lines.push(`• ${label(k)}: ${typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v}`)
  }
  const rows = r.rows.filter((row) => !row._subtotal)
  for (const row of rows.slice(0, 8)) lines.push('– ' + r.columns.slice(0, 4).map((c) => String(row[c.key] ?? '')).join(' | '))
  if (rows.length > 8) lines.push(`… و${rows.length - 8} صف كمان — التفاصيل الكاملة من شاشة التقارير`)
  if (!r.totals && !rows.length) lines.push('مفيش بيانات في الفترة دي')
  return lines.join('\n')
}

/** بينفّذ الأوامر بالترتيب وبيرجّع سطور النتيجة (نجاح/تحذير) اللي هتتعرض للمستخدم */
export async function executeAssistantActions(actions: AssistantAction[], ctx: ActionContext): Promise<string[]> {
  const out: string[] = []
  for (const action of actions) {
    try {
      if (action.type === 'navigate') out.push(await navigate(action, ctx))
      else if (action.type === 'pos_sale') out.push(...(await posSale(action, ctx)))
      else if (action.type === 'customer_payment') out.push(await customerPayment(action, ctx))
      else if (action.type === 'add_expense') out.push(await addExpense(action, ctx))
      else if (action.type === 'add_customer') out.push(await addCustomer(action, ctx))
      else if (action.type === 'add_product') out.push(await addProduct(action, ctx))
      else if (action.type === 'show_report') out.push(await showReport(action, ctx))
    } catch (err: any) {
      out.push(`⚠️ تعذر تنفيذ الأمر: ${err?.message ?? 'خطأ غير معروف'}`)
    }
  }
  return out
}
