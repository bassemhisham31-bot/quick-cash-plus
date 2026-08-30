import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { buildHandlerMap, MUTATING_CHANNELS } from '../main/handlers'
import { CATALOG_SYNC_CHANNELS, MANUALLY_LOGGED_CHANNELS } from '../shared/mutatingChannels'
import { ACTOR_META_KEY, type ActorMeta } from '../shared/activityActor'
import { login } from '../main/services/auth'
import { logUserActivity } from '../main/services/users'
import { triggerDebouncedSync } from '../main/services/priceCheckerSync'
import { signToken, requireAuth, verifyToken, type AuthedRequest } from './auth'

const handlers = buildHandlerMap()

const wsClients = new Set<WebSocket>()

function broadcastChanged(channel?: string): void {
  const payload = JSON.stringify({ type: 'changed', channel })
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) ws.send(payload)
  }
}

/** بعد أي عملية ناجحة على قناة "مُغيّرة للبيانات": بث تحديث لحظي + مزامنة الأصناف + تسجيل النشاط — نفس منطق network/server.ts في نسخة الأوفلاين، بدل كود الاتصال المشترك هنا كل ده مبني على مستخدم موثّق فعليًا بـJWT. */
async function afterMutation(channel: string, actor: ActorMeta): Promise<void> {
  broadcastChanged(channel)

  if (CATALOG_SYNC_CHANNELS.has(channel)) {
    triggerDebouncedSync().catch(() => {})
  }

  if (!MANUALLY_LOGGED_CHANNELS.has(channel)) {
    await logUserActivity(actor.userId ?? 0, actor.username ?? 'غير معروف', channel).catch(() => {})
  }
}

export function createApp(): express.Express {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '25mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'qcp-web-backend', time: new Date().toISOString() })
  })

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {}
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ ok: false, error: 'اسم المستخدم وكلمة المرور مطلوبين' })
      return
    }
    const result = await login(username, password)
    if (!result.ok || !result.user) {
      res.status(401).json(result)
      return
    }
    const token = signToken(result.user)
    res.json({ ok: true, token, user: result.user })
  })

  /**
   * استثناء واحد قبل بوابة المصادقة: شاشة تسجيل الدخول نفسها محتاجة بيانات المتجر (الاسم/الشعار/الهاتف)
   * للعرض قبل ما يكون فيه توكن أصلاً — نفس القناة (settings:getStore) بترجع بيانات عرض فقط، مش حساسة.
   *
   * ملحوظة مهمة: الاستثناء ده لازم يتعمل بمطابقة نص حرفية لـreq.path، مش بتسجيل route منفصل
   * زي app.post('/api/rpc/settings:getStore', ...) — لأن Express (path-to-regexp) بيفسّر أي ':'
   * جوه نص الـpath كـparameter مش حرف حرفي، فـ'settings:getStore' كانت بتتحول لـ'settings' + parameter
   * اسمه getStore بيطابق أي قناة تانية تبدأ بـ'settings' زي settings:getPosUi أو settings:updateStore —
   * يعني كل قنوات settings:* كانت بتتنفذ من غير مصادقة بالغلط. اتصلح بفحص req.path يدويًا هنا بدل ده.
   */
  app.use('/api', (req: AuthedRequest, res, next) => {
    if (req.path === '/rpc/settings:getStore') {
      handlers['settings:getStore']()
        .then((result: unknown) => res.json({ ok: true, result }))
        .catch((err: any) => res.status(500).json({ ok: false, error: err?.message ?? 'حدث خطأ غير متوقع' }))
      return
    }
    requireAuth(req, res, next)
  })

  app.get('/api/me', (req: AuthedRequest, res) => {
    res.json({ ok: true, auth: req.auth })
  })

  /**
   * نقطة نهاية عامة واحدة بتنادي نفس جدول القنوات (channel -> handler) المُستخدم أصلاً
   * في نسخة الأوفلاين — بنفس أسماء القنوات، عشان واجهة الويب المستقبلية (المرحلة 3) تقدر
   * تستدعيها بنفس المنطق اللي الـrenderer الحالي بيستخدمه مع window.api.
   */
  app.post('/api/rpc/:channel', async (req: AuthedRequest, res) => {
    const channel = req.params.channel
    const handler = handlers[channel]
    if (!handler) {
      res.status(404).json({ ok: false, error: `قناة غير معروفة: ${channel}` })
      return
    }

    const args: unknown[] = Array.isArray(req.body?.args) ? req.body.args : []
    const isMutating = MUTATING_CHANNELS.has(channel)
    const actor: ActorMeta = {
      [ACTOR_META_KEY]: true,
      userId: req.auth!.userId,
      username: req.auth!.username
    }
    const callArgs = isMutating ? [...args, actor] : args

    try {
      const result = await handler(...callArgs)
      if (isMutating) await afterMutation(channel, actor)
      res.json({ ok: true, result })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? 'حدث خطأ غير متوقع' })
    }
  })

  return app
}

/** خادم WebSocket للتحديث اللحظي فقط (بث "changed") — استدعاءات البيانات نفسها بتتم عبر REST أعلاه. الاتصال محتاج JWT صالح كـquery param (?token=...). */
export function attachWebSocketServer(httpServer: ReturnType<typeof createServer>): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const token = url.searchParams.get('token')
    if (!token || !verifyToken(token)) {
      ws.close(4001, 'unauthorized')
      return
    }
    wsClients.add(ws)
    ws.on('close', () => wsClients.delete(ws))
    ws.on('error', () => wsClients.delete(ws))
  })

  return wss
}

export function startHttpServer(port: number): ReturnType<typeof createServer> {
  const app = createApp()
  const httpServer = createServer(app)
  attachWebSocketServer(httpServer)
  httpServer.listen(port, () => {
    console.log(`✅ QCP web backend شغال على المنفذ ${port}`)
  })
  return httpServer
}
