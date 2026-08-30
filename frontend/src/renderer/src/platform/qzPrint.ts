// @ts-expect-error — qz-tray مالوش أنواع TypeScript رسمية، ده library قديمة بنمط UMD
import qz from 'qz-tray'

/**
 * تكامل QZ Tray (خطة التحويل، المرحلة 4): برنامج صغير مجاني بيتركب على جهاز كل فرع فيه طابعة،
 * وبيسمح لصفحة الويب تطبع عليها مباشرة (المتصفح لوحده مايقدرش يوصل لطابعة حرارية).
 *
 * ملحوظة أمان صادقة: النسخة دي بتتصل بدون شهادة توقيع رقمي (unsigned) — يعني QZ Tray هيظهر
 * للمستخدم رسالة "Action Required" مرة كل جلسة يطلب فيها يوافق يدويًا على الاتصال. ده مقبول
 * للاختبار والاستخدام المحلي، لكن لإنتاج حقيقي على نطاق واسع الأفضل شهادة موقّعة من QZ Industries
 * عشان الموافقة تبقى تلقائية بالكامل — ده تحسين لاحق، مش حظر لاستخدام الميزة دلوقتي.
 */

let connecting: Promise<void> | null = null

async function ensureConnected(): Promise<void> {
  if (qz.websocket.isActive()) return
  if (!connecting) {
    connecting = qz.websocket.connect().finally(() => {
      connecting = null
    })
  }
  try {
    await connecting
  } catch {
    throw new Error(
      'تعذر الاتصال بـQZ Tray — تأكد إنه مثبت وشغال على الجهاز ده (أيقونة QZ Tray في شريط المهام)'
    )
  }
}

export interface QzPrintOptions {
  printerName?: string | null
  /**
   * عرض الصفحة بالمليمتر (الطول بيتحدد تلقائيًا حسب المحتوى الفعلي) — لازم قيمة هنا دايمًا.
   * اتأكد بالتجربة الفعلية إن QZ Tray بيعلّق (hang) على طباعة HTML من غير أي "size" في الـconfig
   * خالص — حتى لو HTML نفسه فيه "@page { size: auto }"، عكس Electron اللي كان بيتعامل مع الحالة دي عادي.
   * فمفيش قيمة افتراضية آمنة نسيبها فاضية؛ كل نوع طباعة (حراري 80/58 أو ليبل) لازم يبعت عرضه الحقيقي.
   */
  widthMm: number
}

/** بيطبع HTML جاهز فعليًا على الطابعة عبر QZ Tray — بيستخدم نفس منطق تحديد الطابعة الافتراضية لو مفيش اسم محدد. */
export async function printHtmlViaQz(html: string, options: QzPrintOptions): Promise<void> {
  await ensureConnected()

  const printerName = options.printerName || (await qz.printers.getDefault())
  if (!printerName) throw new Error('مفيش طابعة افتراضية متعرّفة على الجهاز ده')

  const config = qz.configs.create(printerName, {
    size: { width: options.widthMm, height: 0 },
    units: 'mm'
  })

  await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }])
}

/** بيتأكد إن QZ Tray شغال أصلًا من غير ما يعمل أي طباعة — مفيد لعرض حالة الاتصال في الواجهة. */
export async function isQzAvailable(): Promise<boolean> {
  try {
    await ensureConnected()
    return true
  } catch {
    return false
  }
}

/**
 * فتح درج الكاشير: أمر ESC/POS خام (Generate pulse) بيتبعت مباشرة للطابعة عبر QZ Tray —
 * بديل rawPrinter.ts القديم اللي كان بيبعت البايتات دي من السيرفر (main process) عبر winspool.drv،
 * مش منطقي على سيرفر بعيد عن الطابعة. نفس الأمر بالظبط: ESC p m t1 t2.
 */
export async function openCashDrawerViaQz(printerName: string, pin: 'pin2' | 'pin5'): Promise<void> {
  await ensureConnected()
  if (!printerName) throw new Error('حدد طابعة افتراضية من إعدادات الطباعة أولًا')

  const m = pin === 'pin5' ? 1 : 0
  const config = qz.configs.create(printerName)
  await qz.print(config, [{ type: 'raw', format: 'command', data: [0x1b, 0x70, m, 0x19, 0xfa] }])
}
