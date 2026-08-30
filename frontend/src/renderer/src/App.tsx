import { useEffect } from 'react'
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

  return user ? <AppShell /> : <LoginPage />
}
