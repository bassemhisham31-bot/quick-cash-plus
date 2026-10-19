import { useState } from 'react'
import type { LicenseStatus } from '../../../shared/types'

/** شاشة القفل: بتظهر بدل البرنامج لما التجربة أو الاشتراك يخلص — مفيش دخول لحد ما يتفعّل بكود */
export function LicenseLock({ status, onActivated }: { status: LicenseStatus; onActivated: (s: LicenseStatus) => void }): JSX.Element {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function activate(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const res = await window.api.license.activate(key)
      if (!res.ok) setError(res.error ?? 'كود التفعيل غير صحيح')
      else if (res.status) onActivated(res.status)
    } catch (e: any) {
      setError(e?.message ?? 'تعذر التفعيل')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--qcp-bg, #f4f5f7)' }}>
      <div className="qcp-card" style={{ width: 'min(560px, 96vw)', textAlign: 'center', padding: 28 }}>
        <div style={{ fontSize: 44 }}>🔒</div>
        <h2 style={{ margin: '6px 0' }}>{status.clockTampered ? 'تاريخ الجهاز غير صحيح' : 'انتهت فترة التجربة / الترخيص'}</h2>
        <p style={{ color: 'var(--qcp-ink-muted)', fontSize: 14 }}>
          {status.clockTampered
            ? 'تم اكتشاف تغيير في تاريخ ووقت الجهاز. صحّح التاريخ والوقت ثم أعد فتح البرنامج، أو تواصل مع الدعم.'
            : 'عشان تكمّل استخدام البرنامج فعّله بكود التفعيل. بياناتك محفوظة ولن تُمسح.'}
        </p>

        <div style={{ textAlign: 'start', margin: '14px 0 6px', fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>بصمة الجهاز (ابعتها لتحصل على كود التفعيل)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="qcp-input" readOnly value={status.deviceFingerprint} style={{ flex: 1, direction: 'ltr', fontFamily: 'monospace' }} onFocus={(e) => e.currentTarget.select()} />
          <button
            className="qcp-btn qcp-btn-secondary"
            onClick={() => {
              navigator.clipboard?.writeText(status.deviceFingerprint).then(() => setCopied(true))
            }}
          >
            {copied ? '✓ اتنسخت' : 'نسخ'}
          </button>
        </div>

        <div style={{ textAlign: 'start', margin: '16px 0 6px', fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>كود التفعيل</div>
        <textarea
          className="qcp-input"
          rows={3}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ width: '100%', direction: 'ltr', fontFamily: 'monospace', resize: 'none' }}
          placeholder="الصق كود التفعيل هنا"
        />
        {error && <div className="rst-error" style={{ marginTop: 8 }}>⚠️ {error}</div>}
        <button className="qcp-btn qcp-btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy || !key.trim()} onClick={activate}>
          {busy ? '...جاري التفعيل' : '🔓 تفعيل البرنامج'}
        </button>
      </div>
    </div>
  )
}
