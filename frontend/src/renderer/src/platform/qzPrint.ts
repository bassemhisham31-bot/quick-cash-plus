// @ts-expect-error — qz-tray مالوش أنواع TypeScript رسمية، ده library قديمة بنمط UMD
import qz from 'qz-tray'

/**
 * تكامل QZ Tray (خطة التحويل، المرحلة 4): برنامج صغير مجاني بيتركب على جهاز كل فرع فيه طابعة،
 * وبيسمح لصفحة الويب تطبع عليها مباشرة (المتصفح لوحده مايقدرش يوصل لطابعة حرارية).
 *
 * التوقيع: السيرفر بيولّد شهادة موقّعة ذاتيًا للعميل (backend/src/main/services/qzSigning.ts) وبيوقّع رسايل QZ Tray.
 * من غير كده QZ Tray بيطلّع "Untrusted website / anonymous request" مع كل طباعة. بعد التوقيع المستخدم بيوافق مرة واحدة
 * على الجهاز مع "Remember this decision" (أو يحط الشهادة كـoverride.crt في فولدر QZ Tray) ومن بعدها الطباعة صامتة.
 * لو التوقيع فشل (مفيش تسجيل دخول مثلًا) بنكمّل بدون توقيع زي الأول.
 */

function authHeaders(): Record<string, string> {
  let token: string | null = null
  try {
    token = localStorage.getItem('qcp_web_token')
  } catch {
    token = null
  }
  return token ? { Authorization: `Bearer ${token}` } : {}
}

qz.security.setCertificatePromise((resolve: (cert?: string) => void) => {
  fetch('/api/qz/certificate', { headers: authHeaders() })
    .then((r) => (r.ok ? r.text() : undefined))
    .then((cert) => resolve(cert || undefined))
    .catch(() => resolve(undefined))
})
qz.security.setSignatureAlgorithm('SHA512')
qz.security.setSignaturePromise((toSign: string) => (resolve: (sig?: string) => void) => {
  fetch('/api/qz/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message: toSign })
  })
    .then((r) => (r.ok ? r.json() : undefined))
    .then((j) => resolve(j?.signature || undefined))
    .catch(() => resolve(undefined))
})

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

/** طابعات الجهاز ده (اللي QZ Tray شايفها) — بديل getPrintersAsync بتاع Electron. */
export async function listPrintersViaQz(): Promise<{ name: string; displayName: string; isDefault: boolean }[]> {
  await ensureConnected()
  const names: string[] = await qz.printers.find()
  let def: string | null = null
  try {
    def = await qz.printers.getDefault()
  } catch {
    def = null
  }
  return (Array.isArray(names) ? names : [names]).map((n) => ({ name: n, displayName: n, isDefault: n === def }))
}
