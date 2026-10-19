import http from 'http'
import https from 'https'
import crypto from 'crypto'

export interface IsapiConfig {
  ip: string
  port: number
  user: string
  password: string
  https: boolean
}

interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

const md5 = (s: string): string => crypto.createHash('md5').update(s).digest('hex')

function rawRequest(cfg: IsapiConfig, method: string, path: string, body: string | null, authHeader?: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const lib = cfg.https ? https : http
    const req = lib.request(
      {
        host: cfg.ip,
        port: cfg.port,
        path,
        method,
        timeout: 15000,
        rejectUnauthorized: false,
        headers: {
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
          ...(authHeader ? { Authorization: authHeader } : {})
        }
      } as https.RequestOptions,
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      }
    )
    req.on('timeout', () => req.destroy(new Error('انتهت مهلة الاتصال بالماكينة')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function parseChallenge(h: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(h))) out[m[1].toLowerCase()] = m[2] ?? m[3]
  return out
}

/** طلب ISAPI مع تسجيل دخول Digest (أو Basic لو الماكينة مظبوطة عليه) */
export async function isapiRequest(cfg: IsapiConfig, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<string> {
  const payload = body === undefined ? null : JSON.stringify(body)
  let res = await rawRequest(cfg, method, path, payload)
  if (res.status === 401) {
    const challenge = String(res.headers['www-authenticate'] ?? '')
    let auth: string
    if (/^basic/i.test(challenge)) {
      auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')
    } else {
      const c = parseChallenge(challenge)
      const cnonce = crypto.randomBytes(8).toString('hex')
      const nc = '00000001'
      const qop = (c.qop ?? '').split(',')[0].trim()
      const ha1 = md5(`${cfg.user}:${c.realm}:${cfg.password}`)
      const ha2 = md5(`${method}:${path}`)
      const response = qop ? md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${c.nonce}:${ha2}`)
      auth =
        `Digest username="${cfg.user}", realm="${c.realm}", nonce="${c.nonce}", uri="${path}", response="${response}"` +
        (qop ? `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : '') +
        (c.opaque ? `, opaque="${c.opaque}"` : '')
    }
    res = await rawRequest(cfg, method, path, payload, auth)
    if (res.status === 401) throw new Error('اسم المستخدم أو الباسورد غلط (أو الحساب اتقفل مؤقتًا بعد محاولات فاشلة)')
  }
  if (res.status < 200 || res.status >= 300) throw new Error(`الماكينة رجّعت خطأ ${res.status}: ${res.body.slice(0, 200)}`)
  return res.body
}

export async function hikDeviceInfo(cfg: IsapiConfig): Promise<string> {
  const xml = await isapiRequest(cfg, 'GET', '/ISAPI/System/deviceInfo')
  const pick = (tag: string): string => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? ''
  return `${pick('model')} — السيريال ${pick('serialNumber')}`
}

export interface HikPunch {
  deviceUserId: string
  at: string
}

/** كل أحداث الدخول/البصمة الناجحة في فترة (الماكينة بترجّع ~30 حدث في المرة فبنقسم صفحات) */
export async function hikFetchPunches(cfg: IsapiConfig, startIso: string, endIso: string): Promise<HikPunch[]> {
  const out: HikPunch[] = []
  let pos = 0
  const searchID = String(Date.now())
  for (let guard = 0; guard < 2000; guard++) {
    const txt = await isapiRequest(cfg, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', {
      AcsEventCond: { searchID, searchResultPosition: pos, maxResults: 30, major: 5, minor: 0, startTime: startIso, endTime: endIso }
    })
    const ev = JSON.parse(txt)?.AcsEvent
    const list: any[] = ev?.InfoList ?? []
    for (const e of list) {
      const id = String(e.employeeNoString ?? e.employeeNo ?? '').trim()
      if (!id || !e.time) continue
      // الوقت زي ما الماكينة بتعرضه: 2026-10-07T09:12:33+03:00 ← 2026-10-07 09:12:33
      out.push({ deviceUserId: id, at: String(e.time).slice(0, 19).replace('T', ' ') })
    }
    if (!list.length || ev?.responseStatusStrg !== 'MORE') break
    pos += list.length
  }
  return out
}

export async function hikListUsers(cfg: IsapiConfig): Promise<{ deviceUserId: string; name: string }[]> {
  const out: { deviceUserId: string; name: string }[] = []
  let pos = 0
  const searchID = String(Date.now())
  for (let guard = 0; guard < 500; guard++) {
    const txt = await isapiRequest(cfg, 'POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', {
      UserInfoSearchCond: { searchID, searchResultPosition: pos, maxResults: 30 }
    })
    const r = JSON.parse(txt)?.UserInfoSearch
    const list: any[] = r?.UserInfo ?? []
    for (const u of list) out.push({ deviceUserId: String(u.employeeNo), name: String(u.name ?? '') })
    if (!list.length || r?.responseStatusStrg !== 'MORE') break
    pos += list.length
  }
  return out
}
