import type { CategoryPrinter } from '../../shared/types'
import type { DevicePrintProfile } from './printContext'

/** نسخة الويب: بروفايل الطباعة بييجي من المتصفح مع كل طلب (printProfile) — مفيش ملف محلي على السيرفر. */
export function categoryPrinterList(profile: DevicePrintProfile): CategoryPrinter[] {
  return Object.entries(profile.categoryPrinters).map(([id, printerName]) => ({
    categoryId: Number(id),
    categoryName: '',
    printerName
  }))
}
