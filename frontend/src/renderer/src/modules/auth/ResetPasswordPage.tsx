import { FormEvent, useState } from 'react'

/** صفحة تعيين كلمة المرور الجديدة — بتظهر لما المستخدم يفتح رابط الاستعادة اللي وصله بالإيميل. */
export function ResetPasswordPage({ token, onDone }: { token: string; onDone: () => void }): JSX.Element {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('كلمة المرور لازم تكون 6 حروف على الأقل')
      return
    }
    if (password !== confirm) {
      setError('كلمتين المرور مش متطابقين')
      return
    }
    setBusy(true)
    try {
      const res = await window.api.auth.resetPassword(token, password)
      if (res.ok) setDone(true)
      else setError(res.error ?? 'حدث خطأ')
    } catch {
      setError('تعذر الاتصال بالسيرفر، جرّب تاني')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--qcp-bg-elevated)', padding: 16 }}>
      <form className="qcp-card" onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--qcp-gradient)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontFamily: 'var(--qcp-mono)',
            fontSize: 24,
            marginBottom: 14
          }}
        >
          Q
        </div>
        <h1 style={{ margin: '0 0 2px', fontSize: '1.4rem' }}>🔑 كلمة مرور جديدة</h1>

        {done ? (
          <>
            <div className="qcp-pill success" style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.7, margin: '14px 0' }}>
              تم تعيين كلمة المرور الجديدة. تقدر تسجّل الدخول بيها دلوقتي.
            </div>
            <button type="button" className="qcp-btn qcp-btn-primary" onClick={onDone} style={{ padding: 12 }}>
              الذهاب لتسجيل الدخول ←
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 14px', color: 'var(--qcp-ink-muted)', fontSize: 13.5 }}>اكتب كلمة المرور الجديدة (6 حروف على الأقل).</p>
            <div className="qcp-field">
              <label>🛡️ كلمة المرور الجديدة</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="qcp-input"
                  style={{ flex: 1 }}
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setShowPassword((v) => !v)}>
                  👁️
                </button>
              </div>
            </div>
            <div className="qcp-field">
              <label>🛡️ تأكيد كلمة المرور</label>
              <input className="qcp-input" type={showPassword ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && (
              <div className="qcp-pill critical" style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.7, marginBottom: 12 }}>
                {error}
              </div>
            )}
            <button className="qcp-btn qcp-btn-primary" type="submit" disabled={busy} style={{ padding: 12 }}>
              {busy ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
            </button>
            <button type="button" className="qcp-btn qcp-btn-secondary" onClick={onDone} style={{ marginTop: 8 }}>
              رجوع لتسجيل الدخول
            </button>
          </>
        )}
      </form>
    </div>
  )
}
