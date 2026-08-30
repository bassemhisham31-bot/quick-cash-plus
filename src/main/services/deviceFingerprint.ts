import { createHash } from 'crypto'
import os from 'os'

/** بصمة جهاز مستقرة عبر إعادة التشغيل، لا تعتمد على قاعدة البيانات — يُستخدمها كل من seed.ts وlicense.ts. */
export function computeDeviceFingerprint(): string {
  const parts = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model ?? '', String(os.totalmem())]
  return createHash('sha256').update(parts.join('|')).digest('hex')
}
