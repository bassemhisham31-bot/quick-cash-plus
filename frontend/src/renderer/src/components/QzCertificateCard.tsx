import { useState } from 'react'

/**
 * شهادة الطباعة الخاصة بالعميل (QZ Tray): من غير ما QZ Tray "يثق" فيها بيرفض يفتكر الموافقة وبيطلّع رسالة مع كل طباعة.
 * الحل مرة واحدة لكل جهاز طباعة: ينزّلها هنا ويحطها كـoverride.crt في فولدر QZ Tray ويعيد تشغيله.
 */
export function QzCertificateCard(): JSX.Element {
  const [message, setMessage] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<{ ok: boolean; text: string } | null>(null)

  /** اختبار اتصال الموقع بـQZ Tray على الجهاز ده (من غير طباعة) — بيقول لو شغال أو متحظر أو الموقع مش واصله. */
  async function testConnection(): Promise<void> {
    setTesting(true)
    setDiagnosis(null)
    try {
      const { diagnoseQz } = await import('../platform/qzPrint')
      const d = await diagnoseQz()
      const extra = d.ok ? `\nنسخة QZ Tray: ${d.version ?? '—'} · عدد الطابعات: ${d.printers ?? 0}${d.defaultPrinter ? ` · الافتراضية: ${d.defaultPrinter}` : ''}` : ''
      setDiagnosis({ ok: d.ok, text: d.message + extra })
    } finally {
      setTesting(false)
    }
  }

  async function download(): Promise<void> {
    setMessage(null)
    try {
      let token: string | null = null
      try {
        token = localStorage.getItem('qcp_web_token')
      } catch {
        token = null
      }
      const res = await fetch('/api/qz/certificate', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error('تعذر تحميل الشهادة — سجّل الدخول وجرّب تاني')
      const blob = new Blob([await res.text()], { type: 'application/x-x509-ca-cert' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'override.crt'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setMessage('تم تنزيل الملف override.crt — كمّل الخطوات تحت')
    } catch (err: any) {
      setMessage(err?.message ?? 'تعذر تنزيل الشهادة')
    }
  }

  return (
    <div className="qcp-card" style={{ marginBottom: 18, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong>🖨️ اختبار الاتصال بـQZ Tray</strong>
        <button type="button" className="qcp-btn qcp-btn-secondary" disabled={testing} onClick={() => void testConnection()}>
          {testing ? 'جاري الاختبار… (لو ظهرت رسالة QZ اضغط Allow)' : 'اختبار الاتصال'}
        </button>
      </div>
      {diagnosis && (
        <div className={`qcp-pill ${diagnosis.ok ? 'success' : 'critical'}`} style={{ display: 'block', whiteSpace: 'pre-line', lineHeight: 1.8, marginBottom: 12 }}>
          {diagnosis.ok ? '✅ ' : '❌ '}
          {diagnosis.text}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong>🔐 إيقاف رسالة QZ Tray المتكررة</strong>
        <button type="button" className="qcp-btn qcp-btn-secondary" style={{ marginInlineStart: 'auto' }} onClick={() => void download()}>
          ⬇️ تنزيل شهادة الطباعة (override.crt)
        </button>
      </div>
      <ol style={{ margin: '8px 0 0', paddingInlineStart: 20, fontSize: 12.5, color: 'var(--qcp-ink-muted)', lineHeight: 1.8 }}>
        <li>نزّل الملف من الزرار.</li>
        <li>
          انسخه باسم <code>override.crt</code> جوه فولدر QZ Tray على جهاز الطباعة (غالبًا <code>C:\Program Files\QZ Tray</code>، محتاج صلاحية أدمن).
        </li>
        <li>اقفل QZ Tray (من أيقونته جنب الساعة) وافتحه تاني.</li>
        <li>أول رسالة تظهر بعد كده: علّم «Remember this decision» واضغط Allow — ومن بعدها مفيش رسائل.</li>
      </ol>
      <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 6 }}>بتتعمل مرة واحدة لكل جهاز بيطبع. الشهادة خاصة بالنظام ده.</div>
      {message && <div className="qcp-pill accent" style={{ marginTop: 8 }}>{message}</div>}
    </div>
  )
}
