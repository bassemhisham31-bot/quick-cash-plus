import { useEffect, useState } from 'react'
import { LicenseLock } from './components/LicenseLock'
import type { LicenseStatus } from '../../shared/types'
import { useAppStore } from './store/appStore'
import { LoginPage } from './modules/auth/LoginPage'
import { AppShell } from './components/AppShell'

export function App(): JSX.Element {
  const user = useAppStore((s) => s.user)
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion)

  useEffect(() => {
    const unsubscribe = window.api.onDataChanged(() => bumpDataVersion())
    return unsubscribe
  }, [bumpDataVersion])

  const [license, setLicense] = useState<LicenseStatus | null>(null)

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
  return user ? <AppShell /> : <LoginPage />
}
