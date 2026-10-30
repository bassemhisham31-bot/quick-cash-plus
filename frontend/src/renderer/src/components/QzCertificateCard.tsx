import { useState } from 'react'

/**
 * شهادة الطباعة الخاصة بالعميل (QZ Tray): من غير ما QZ Tray "يثق" فيها بيرفض يفتكر الموافقة وبيطلّع رسالة مع كل طباعة.
 * الحل مرة واحدة لكل جهاز طباعة: ينزّلها هنا ويحطها كـoverride.crt في فولدر QZ Tray ويعيد تشغيله.
 */
export function QzCertificateCard(): JSX.Element {
  const [message, setMessage] = useState<string | null>(null)

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
