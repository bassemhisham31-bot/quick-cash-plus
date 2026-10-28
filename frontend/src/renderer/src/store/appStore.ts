import { create } from 'zustand'
import type { Branch, SessionUser } from '../../../shared/types'
import { getActiveBranchHeader, setActiveBranchHeader } from '../platform/webApi'

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
  | 'treasury'
  | 'accounting'
  | 'reports'
  | 'salesReps'
  | 'quotations'
  | 'stockPermits'
  | 'restaurant'
  | 'restaurantTables'
  | 'restaurantCaptains'
  | 'delivery'
  | 'events'
  | 'attendance'
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
  /** حالة الترخيص (الميزات الموقوفة) وصلت من السيرفر — قبل كده مانفترضش إن ميزة مسموحة ونطلب قنواتها */
  licenseLoaded: boolean
  /** ميزة الفروع مفعّلة لعميل ده */
  branchesEnabled: boolean
  setBranchesEnabled: (enabled: boolean) => void
  branches: Branch[]
  setBranches: (branches: Branch[]) => void
  /** الفرع المختار للأدمن: رقم فرع (نص) أو 'all' (كل الفروع). غير الأدمن دايمًا على فرعه. */
  activeBranch: string | null
  setActiveBranch: (value: string) => void
  activeRestaurantOrderId: number | null
  setActiveRestaurantOrderId: (id: number | null) => void
  /** رسالة بتظهر في صفحة الترابيزات بعد الرجوع لها تلقائيًا (مثلاً بعد الإرسال للمطبخ) */
  restaurantFlash: string | null
  setRestaurantFlash: (message: string | null) => void
  setUser: (user: SessionUser | null) => void
  setView: (view: ViewName) => void
  /** زرار "فواتير معلّقة" في الشريط العلوي بيفتح شاشة البيع على قايمة المعلّقة */
  posOpenHeld: boolean
  setPosOpenHeld: (v: boolean) => void
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
  licenseLoaded: false,
  branchesEnabled: false,
  setBranchesEnabled: (branchesEnabled) => set({ branchesEnabled }),
  branches: [],
  setBranches: (branches) => set({ branches }),
  activeBranch: getActiveBranchHeader(),
  setActiveBranch: (value) => {
    setActiveBranchHeader(value)
    // تغيير الفرع = إعادة تحميل بيانات الشاشة الحالية بنطاق الفرع الجديد
    set((s) => ({ activeBranch: value, dataVersion: s.dataVersion + 1 }))
  },
  activeRestaurantOrderId: null,
  setActiveRestaurantOrderId: (activeRestaurantOrderId) => set({ activeRestaurantOrderId }),
  restaurantFlash: null,
  setRestaurantFlash: (restaurantFlash) => set({ restaurantFlash }),
  setUser: (user) => {
    if (user) window.api.session.setActiveUser(user.id, user.username)
    else window.api.session.clearActiveUser()
    if (user) {
      // الأدمن بيرجع لآخر فرع اختاره (أو فرعه)، وغير الأدمن دايمًا على فرعه
      const next = user.role === 'admin' ? (getActiveBranchHeader() ?? String(user.branchId)) : String(user.branchId)
      setActiveBranchHeader(next)
      set({ user, activeBranch: next })
    } else {
      set({ user })
    }
  },
  setView: (view) => set({ view }),
  posOpenHeld: false,
  setPosOpenHeld: (posOpenHeld) => set({ posOpenHeld }),
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => set({ theme }),
  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  setCurrencySymbol: (currencySymbol) => set({ currencySymbol }),
  setSoundPrefs: (soundEnabled, soundVolume) => set({ soundEnabled, soundVolume }),
  setDisabledFeatures: (disabledFeatures) => set({ disabledFeatures, licenseLoaded: true }),
  logout: () => {
    window.api.session.clearActiveUser()
    set({ user: null, view: 'dashboard', licenseLoaded: false })
  }
}))
