// جسر بين المساعد الذكي وشاشة البيع: شاشة البيع بتسجّل نفسها هنا لما تفتح، والمساعد بينفّذ عليها بنفس دوالها
// (نفس الصلاحيات والتحققات) بدل ما يكتب في الـstate بتاعها من برّه.

export interface PosBridge {
  /** السلة فيها أصناف دلوقتي؟ */
  cartCount: () => number
  /** بيضيف صنف بالاسم/الباركود. بيرجّع سطر نتيجة جاهز يتعرض للمستخدم */
  addByQuery: (query: string, qty: number, price: number | null) => Promise<{ ok: boolean; message: string }>
  /** بيختار العميل (id) على الفاتورة */
  setCustomer: (customerId: number) => void
  /** بيفتح شاشة الدفع (ومعاها وسيلة الدفع لو اتحددت)، ولو autoConfirm بيأكّد الحفظ بعد ما الشاشة تفتح */
  startPayment: (method: string | null, autoConfirm: boolean) => { ok: boolean; message: string }
}

let current: PosBridge | null = null
const waiters: Array<(b: PosBridge) => void> = []

export function registerPosBridge(bridge: PosBridge): () => void {
  current = bridge
  while (waiters.length) waiters.shift()!(bridge)
  return () => {
    if (current === bridge) current = null
  }
}

/** بيستنى شاشة البيع تفتح وتسجّل نفسها (بعد setView('pos')) */
export function waitForPosBridge(timeoutMs = 5000): Promise<PosBridge | null> {
  if (current) return Promise.resolve(current)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(onReady)
      if (i >= 0) waiters.splice(i, 1)
      resolve(null)
    }, timeoutMs)
    function onReady(b: PosBridge): void {
      clearTimeout(timer)
      resolve(b)
    }
    waiters.push(onReady)
  })
}
