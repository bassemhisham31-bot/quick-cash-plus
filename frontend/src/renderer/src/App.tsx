import { useEffect, useState } from 'react'
import { LicenseLock } from './components/LicenseLock'
import type { LicenseStatus } from '../../shared/types'
import { useAppStore } from './store/appStore'
import { LoginPage } from './modules/auth/LoginPage'
import { ResetPasswordPage } from './modules/auth/ResetPasswordPage'
import { AppShell } from './components/AppShell'

function readResetToken(): string | null {
  const m = /(?:^#|&)reset=([0-9a-f]{64})/.exec(window.location.hash)
  return m ? m[1] : null
}

export function App(): JSX.Element {
  const user = useAppStore((s) => s.user)
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion)

  useEffect(() => {
    const unsubscribe = window.api.onDataChanged(() => bumpDataVersion())
    return unsubscribe
  }, [bumpDataVersion])

  const [license, setLicense] = useState<LicenseStatus | null>(null)
  // رابط استعادة كلمة المرور من الإيميل: https://.../#reset=<token> (الجزء بعد # مابيروحش للسيرفر)
  const [resetToken, setResetToken] = useState<string | null>(() => readResetToken())

  // لو الرابط اتفتح في تبويب التطبيق نفسه (تغيّر الـhash من غير إعادة تحميل)
  useEffect(() => {
    const onHash = (): void => setResetToken(readResetToken())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // فحص الترخيص عند التشغيل وكل 5 دقايق — لو انتهى بتظهر شاشة التفعيل بدل البرنامج
  useEffect(() => {
    const check = (): void => {
      window.api.license.getStatus().then(setLicense).catch(() => {})
    }
    check()
    const id = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  if (license?.status === 'expired') return <LicenseLock status={license} onActivated={setLicense} />
  if (resetToken && !user) {
    return (
      <ResetPasswordPage
        token={resetToken}
        onDone={() => {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
          setResetToken(null)
        }}
      />
    )
  }
  return user ? <AppShell /> : <LoginPage />
}
