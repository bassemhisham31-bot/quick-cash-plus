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
      'QZ Tray مش شغال على الجهاز ده. افتحه من قايمة ابدأ (ابحث عن QZ Tray) واستنى لما أيقونته تظهر جنب الساعة، وبعدين جرّب الطباعة تاني.'
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

const CSS_PX_PER_MM = 96 / 25.4
/** دقة الطابعات الحرارية (203dpi = 8 نقط/مم) — بنرسم الصورة بنفس عدد نقط الطابعة عشان الخط يطلع حاد. */
const THERMAL_DOTS_PER_MM = 8

/** بيرسم الـHTML جوه المتصفح ويرجّعه صورة PNG (base64) مع ارتفاعها بالمليمتر. */
export async function renderHtmlToImage(html: string, widthMm: number): Promise<{ base64: string; heightMm: number }> {
  const widthPx = Math.round(widthMm * CSS_PX_PER_MM)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:10px;border:0;visibility:hidden;`
  document.body.appendChild(iframe)
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('تعذر تجهيز الورقة للطباعة كصورة')), 15000)
      iframe.onload = () => {
        clearTimeout(timer)
        resolve()
      }
      iframe.srcdoc = html
    })
    const doc = iframe.contentDocument
    if (!doc) throw new Error('تعذر تجهيز الورقة للطباعة كصورة')

    await Promise.all(
      Array.from(doc.images).map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = img.onerror = () => r() })))
    )
    try {
      await (doc as any).fonts?.ready
    } catch {
      // مش مهم
    }

    const heightPx = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight))
    if (!heightPx) throw new Error('الورقة فاضية — مفيش حاجة تتطبع')

    // نفس تخطيط المتصفح بالظبط: الصفحة بتتحط جوه SVG (foreignObject) وتترسم على canvas
    doc.documentElement.style.background = '#fff'
    const xhtml = new XMLSerializer().serializeToString(doc.documentElement)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">` +
      `<foreignObject x="0" y="0" width="${widthPx}" height="${heightPx}">${xhtml}</foreignObject></svg>`
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('تعذر تحويل الورقة لصورة'))
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    })

    const scale = (THERMAL_DOTS_PER_MM * 25.4) / 96
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(widthMm * THERMAL_DOTS_PER_MM)
    canvas.height = Math.ceil(heightPx * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('تعذر تحويل الورقة لصورة')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/png')
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), heightMm: heightPx / CSS_PX_PER_MM }
  } finally {
    iframe.remove()
  }
}

/** زي printHtmlViaQz بس الورقة بتتبعت صورة مرسومة في المتصفح (للورق الحراري). */
export async function printHtmlAsImageViaQz(html: string, options: QzPrintOptions): Promise<void> {
  await ensureConnected()

  const printerName = options.printerName || (await qz.printers.getDefault())
  if (!printerName) throw new Error('مفيش طابعة افتراضية متعرّفة على الجهاز ده')

  const { base64, heightMm } = await renderHtmlToImage(html, options.widthMm)
  const config = qz.configs.create(printerName, {
    size: { width: options.widthMm, height: Math.ceil(heightMm) },
    units: 'mm',
    margins: 0,
    scaleContent: true,
    interpolation: 'nearest-neighbor'
  })

  await qz.print(config, [{ type: 'pixel', format: 'image', flavor: 'base64', data: base64 }])
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
