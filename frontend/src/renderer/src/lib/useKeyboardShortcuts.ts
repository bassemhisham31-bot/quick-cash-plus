import { useEffect } from 'react'
import { useAppStore, type ViewName } from '../store/appStore'
import type { KeyboardShortcut } from '../../../shared/types'

const VALID_VIEWS: ViewName[] = [
  'dashboard',
  'pos',
  'inventory',
  'customers',
  'vendors',
  'invoices',
  'expenses',
  'reports',
  'settings'
]

function viewFromActionKey(actionKey: string): ViewName | null {
  if (!actionKey.startsWith('nav.')) return null
  const view = actionKey.slice(4).split(':')[0]
  return (VALID_VIEWS as string[]).includes(view) ? (view as ViewName) : null
}

/** يركّب مستمع كيبورد عالمي مرة واحدة على مستوى التطبيق ويطابق الضغطات مع الاختصارات المحفوظة في قاعدة البيانات. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    let shortcuts: KeyboardShortcut[] = []
    let cancelled = false

    function load(): void {
      window.api.shortcuts.list().then((list) => {
        if (!cancelled) shortcuts = list
      })
    }
    load()
    const unsubscribe = window.api.onDataChanged(load)

    function handler(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      const typing = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (typing) return

      for (const s of shortcuts) {
        if (!s.enabled) continue
        if (s.useShift !== e.shiftKey) continue
        if (s.useAlt !== e.altKey) continue
        if (s.useCtrl !== e.ctrlKey) continue
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue

        e.preventDefault()
        if (s.actionKey === 'toggleTheme' || s.actionKey.startsWith('toggleTheme:')) {
          const current = useAppStore.getState().theme
          useAppStore.getState().setTheme(current === 'light' ? 'dark' : 'light')
        } else {
          const view = viewFromActionKey(s.actionKey)
          if (view) useAppStore.getState().setView(view)
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener('keydown', handler)
    }
  }, [])
}
