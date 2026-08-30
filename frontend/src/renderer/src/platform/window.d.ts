import type { QuickCashApi } from './webApi'

declare global {
  interface Window {
    api: QuickCashApi
  }
}

export {}
