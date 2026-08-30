import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { SessionUser } from '../shared/types'

const JWT_SECRET = process.env.QCP_JWT_SECRET ?? 'dev-only-insecure-secret-change-me'

if (!process.env.QCP_JWT_SECRET) {
  console.warn(
    '⚠️  QCP_JWT_SECRET غير موجود في متغيرات البيئة — بيتم استخدام سر افتراضي غير آمن. ' +
      'لازم تحدد QCP_JWT_SECRET حقيقي قبل أي استضافة فعلية على الإنترنت.'
  )
}

const TOKEN_TTL = '12h'

export interface AuthTokenPayload {
  userId: number
  username: string
  role: string
}

export function signToken(user: SessionUser): string {
  const payload: AuthTokenPayload = { userId: user.id, username: user.username, role: user.role }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload
  } catch {
    return null
  }
}

export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload
}

/** Middleware: يرفض أي طلب من غير Authorization: Bearer <token> صالح — بديل كود الاتصال المشترك القديم بمصادقة حقيقية لكل مستخدم. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (!token) {
    res.status(401).json({ ok: false, error: 'مطلوب تسجيل الدخول' })
    return
  }
  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ ok: false, error: 'جلسة الدخول منتهية أو غير صالحة' })
    return
  }
  req.auth = payload
  next()
}
