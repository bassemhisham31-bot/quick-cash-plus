import { existsSync } from 'fs'

// Node 20.6+ built-in .env loader — بدون أي مكتبة إضافية.
// لازم يتنفذ هنا قبل أي import تاني (عبر dynamic import) عشان الموديولات اللي بتقرأ
// process.env وقت التحميل (زي http/auth.ts) تلاقي القيم جاهزة، مش قبل ما تتحمل.
if (existsSync('.env')) process.loadEnvFile('.env')

const { initDatabase } = await import('./main/db')
const { startHttpServer } = await import('./http/server')
const { scheduleAutoBackup } = await import('./main/services/backup')

async function main(): Promise<void> {
  await initDatabase()
  await scheduleAutoBackup().catch(() => {})

  const port = Number(process.env.PORT ?? 4000)
  startHttpServer(port)
}

main().catch((err) => {
  console.error('فشل تشغيل السيرفر:', err)
  process.exit(1)
})
