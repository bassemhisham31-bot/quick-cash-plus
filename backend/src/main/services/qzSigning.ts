/**
 * توقيع طلبات QZ Tray (نسخة الويب فقط).
 *
 * من غير توقيع، QZ Tray بيعتبر الصفحة "Untrusted website / anonymous request" وبيطلع رسالة موافقة مع كل اتصال/طباعة.
 * هنا السيرفر بيولّد (مرة واحدة) مفتاح خاص + شهادة موقّعة ذاتيًا بتتحفظوا في مجلد البيانات بتاع العميل (<QCP_DATA_DIR>/qz)،
 * والمتصفح بياخد الشهادة العامة ويطلب من السيرفر يوقّع رسايل QZ. المستخدم بيوافق مرة واحدة على جهازه مع "Remember this decision"
 * (أو بيحط الشهادة كـoverride.crt في فولدر QZ Tray فمبتظهرش أي رسالة خالص) — ومن بعدها الطباعة صامتة.
 *
 * المفتاح الخاص ما بيطلعش من السيرفر أبدًا؛ الواجهة بتبعت الرسالة بس والسيرفر بيرجّع التوقيع (بعد تسجيل دخول المستخدم).
 */
import { createSign, generateKeyPairSync, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import forge from 'node-forge'

interface QzCredentials {
  privateKeyPem: string
  certificatePem: string
}

let cached: QzCredentials | null = null

function qzDir(): string {
  const dir = join(process.env.QCP_DATA_DIR ?? join(process.cwd(), 'data'), 'qz')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getQzCredentials(): QzCredentials {
  if (cached) return cached
  const dir = qzDir()
  const keyPath = join(dir, 'private-key.pem')
  const certPath = join(dir, 'digital-certificate.pem')
  if (existsSync(keyPath) && existsSync(certPath)) {
    cached = { privateKeyPem: readFileSync(keyPath, 'utf8'), certificatePem: readFileSync(certPath, 'utf8') }
    return cached
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })

  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey)
  cert.serialNumber = '01' + randomBytes(8).toString('hex')
  const now = new Date()
  cert.validity.notBefore = new Date(now.getTime() - 24 * 3600 * 1000)
  cert.validity.notAfter = new Date(now.getTime() + 20 * 365 * 24 * 3600 * 1000)
  const attrs = [
    { name: 'commonName', value: 'Quick Cash Plus' },
    { name: 'organizationName', value: 'Quick Cash Plus' },
    { name: 'countryName', value: 'EG' }
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([{ name: 'basicConstraints', cA: false }])
  cert.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create())
  const certificatePem = forge.pki.certificateToPem(cert)

  writeFileSync(keyPath, privateKey, { mode: 0o600 })
  writeFileSync(certPath, certificatePem)
  cached = { privateKeyPem: privateKey, certificatePem }
  return cached
}

/** توقيع رسالة QZ Tray (RSA + SHA512) وإرجاعه base64 — نفس الخوارزمية اللي الواجهة بتحدّدها بـsetSignatureAlgorithm('SHA512'). */
export function signQzMessage(message: string): string {
  const signer = createSign('RSA-SHA512')
  signer.update(message)
  return signer.sign(getQzCredentials().privateKeyPem, 'base64')
}
