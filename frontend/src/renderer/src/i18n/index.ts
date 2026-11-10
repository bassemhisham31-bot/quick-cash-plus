import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './ar.json'
import en from './en.json'
import { BRAND_NAME } from '../platform/brand'

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en }
  },
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false, defaultVariables: { brand: BRAND_NAME } }
})

export function applyDocumentDirection(locale: 'ar' | 'en'): void {
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
}

export default i18n
