import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// عنوان الباك إند (المرحلة 1/2) — في التطوير المحلي شغال على 4000
const BACKEND = process.env.QCP_BACKEND_URL ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/ws': { target: BACKEND, ws: true, changeOrigin: true }
    }
  }
})
