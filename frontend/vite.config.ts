import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// عنوان الباك إند (المرحلة 1/2) — في التطوير المحلي شغال على 4000
const BACKEND = process.env.QCP_BACKEND_URL ?? 'http://localhost:4000'

export default defineConfig(({ mode }) => {
  // اسم البرنامج لعميل معيّن (frontend/.env.local → VITE_BRAND_NAME) — نفس القيمة اللي بيقراها platform/brand.ts
  const brand = (loadEnv(mode, process.cwd(), 'VITE_').VITE_BRAND_NAME ?? '').trim() || 'Quick Cash Plus'
  return {
    plugins: [
      react(),
      {
        name: 'qcp-brand-title',
        transformIndexHtml: (html: string) => html.replace(/<title>.*?<\/title>/, `<title>${brand.replace(/[<>&]/g, '')}</title>`)
      }
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: BACKEND, changeOrigin: true },
        '/ws': { target: BACKEND, ws: true, changeOrigin: true }
      }
    }
  }
})
