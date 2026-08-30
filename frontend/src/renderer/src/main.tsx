import React from 'react'
import ReactDOM from 'react-dom/client'
import { installWebApi } from './platform/webApi'
import './i18n'
import './styles/global.css'
import { App } from './App'

installWebApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
