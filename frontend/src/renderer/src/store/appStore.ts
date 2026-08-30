import { create } from 'zustand'
import type { SessionUser } from '../../../shared/types'

export type ViewName =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'priceEditing'
  | 'customers'
  | 'vendors'
  | 'invoices'
  | 'returns'
  | 'expenses'
  | 'shifts'
  | 'reports'
  | 'salesReps'
  | 'quotations'
  | 'stockPermits'
  | 'restaurant'
  | 'restaurantTables'
  | 'restaurantCaptains'
  | 'delivery'
  | 'settings'
export type ThemeMode = 'light' | 'dark'

interface AppState {
  user: SessionUser | null
  view: ViewName
  locale: 'ar' | 'en'
  theme: ThemeMode
  dataVersion: number
  currencySymbol: string
  soundEnabled: boolean
  soundVolume: number
  disabledFeatures: string[]
  activeRestaurantOrderId: number | null
  setActiveRestaurantOrderId: (id: number | null) => void
  setUser: (user: SessionUser | null) => void
  setView: (view: ViewName) => void
  setLocale: (locale: 'ar' | 'en') => void
  setTheme: (theme: ThemeMode) => void
  bumpDataVersion: () => void
  setCurrencySymbol: (symbol: string) => void
  setSoundPrefs: (enabled: boolean, volume: number) => void
  setDisabledFeatures: (features: string[]) => void
  logout: () => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  view: 'dashboard',
  locale: 'ar',
  theme: 'light',
  dataVersion: 0,
  currencySymbol: 'ج.م',
  soundEnabled: true,
  soundVolume: 0.3,
  disabledFeatures: [],
  activeRestaurantOrderId: null,
  setActiveRestaurantOrderId: (activeRestaurantOrderId) => set({ activeRestaurantOrderId }),
  setUser: (user) => {
    if (user) window.api.session.setActiveUser(user.id, user.username)
    else window.api.session.clearActiveUser()
    set({ user })
  },
  setView: (view) => set({ view }),
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => set({ theme }),
  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  setCurrencySymbol: (currencySymbol) => set({ currencySymbol }),
  setSoundPrefs: (soundEnabled, soundVolume) => set({ soundEnabled, soundVolume }),
  setDisabledFeatures: (disabledFeatures) => set({ disabledFeatures }),
  logout: () => {
    window.api.session.clearActiveUser()
    set({ user: null, view: 'dashboard' })
  }
}))
