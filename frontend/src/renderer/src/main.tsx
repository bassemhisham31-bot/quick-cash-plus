import React from 'react'
import ReactDOM from 'react-dom/client'
import { getStoredUser, installWebApi } from './platform/webApi'
import { useAppStore } from './store/appStore'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './i18n'
import './styles/global.css'

installWebApi()

// لو فيه جلسة محفوظة (توكن + مستخدم) نرجّعها بدل ما نطلب تسجيل الدخول بعد كل إعادة تحميل
const restoredUser = getStoredUser()
if (restoredUser) useAppStore.setState({ user: restoredUser })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
