import { existsSync } from 'fs'
if (existsSync('.env')) process.loadEnvFile('.env')
const { initDatabase, getDb } = await import('../src/main/db')

async function main(): Promise<void> {
  if (!process.env.QCP_DB_URL) throw new Error('QCP_DB_URL مش موجود في .env — مش هشغّل على قاعدة محلية بالغلط')
  const host = new URL(process.env.QCP_DB_URL.replace('libsql://', 'https://')).host
  console.log('Target:', host)
  const before = await (async () => {
    const { createClient } = await import('@libsql/client')
    const c = createClient({ url: process.env.QCP_DB_URL!, authToken: process.env.QCP_DB_AUTH_TOKEN })
    try { return Number((await c.execute('SELECT COUNT(*) n FROM schema_migrations')).rows[0].n) } catch { return 0 }
  })()
  console.log('Migrations before:', before)
  await initDatabase()
  const rs = await getDb().execute('SELECT COUNT(*) n, MAX(name) last FROM schema_migrations')
  console.log('Migrations after:', rs.rows[0].n, '| last:', rs.rows[0].last)
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
