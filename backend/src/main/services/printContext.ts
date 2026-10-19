import { AsyncLocalStorage } from 'async_hooks'
import type { PrintSettings } from '../../shared/types'

/**
 * طباعة الجهاز الفرعي: الجهاز الرئيسي هو اللي بيبني الفاتورة/التذكرة (البيانات عنده)، لكن الطباعة نفسها لازم تحصل
 * على طابعات الجهاز الفرعي. فالرئيسي بيشغّل نفس دوال الطباعة داخل "capture": أي طلب طباعة أو معاينة بيتسجّل هنا
 * كـ job بدل ما يتنفّذ، وبيتبعت للفرعي في الرد ينفّذه على طابعاته هو.
 */
export type PrintJob =
  | {
      kind: 'print'
      html: string
      printSettings: PrintSettings
      thermalWidthMm?: number
      pageSizeMm?: { width: number; height: number }
    }
  | { kind: 'preview'; previewKind: string; title: string; html: string }
  | { kind: 'drawer'; printer: string; pin: 'pin2' | 'pin5' }

/** إعدادات الطباعة الخاصة بالجهاز الفرعي (بتتخزن على الفرعي نفسه) */
export interface DevicePrintProfile {
  printSettings: PrintSettings
  /** categoryId → اسم الطابعة على الجهاز الفرعي (تذاكر المطبخ) */
  categoryPrinters: Record<string, string>
}

export interface PrintCapture {
  profile: DevicePrintProfile
  jobs: PrintJob[]
}

export const printCapture = new AsyncLocalStorage<PrintCapture>()
