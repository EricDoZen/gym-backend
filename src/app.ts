import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { hasDatabase, getDb } from './db/client.js'
import { corsOrigins, env } from './env.js'
import { fail, ok } from './lib/response.js'
import { requestId } from './lib/request.js'
import { registerErrorHandler } from './middleware/error.js'
import { authRoutes } from './routes/auth.js'
import { contactRoutes } from './routes/contact.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { fitnessAdminRoutes } from './routes/fitness-admin.js'
import { memberAuthRoutes } from './routes/member-auth.js'
import { memberPortalRoutes } from './routes/member-portal.js'
import { memberRoutes } from './routes/members.js'
import { opsRoutes } from './routes/ops.js'
import { paymentRoutes } from './routes/payments.js'
import { trainerRoutes } from './routes/trainers.js'
import { trialRoutes } from './routes/trials.js'
import { openApiDoc } from './openapi.js'

const app = new Hono()

registerErrorHandler(app)

app.use('*', async (c, next) => {
  const id = requestId(c)
  const startedAt = Date.now()
  c.header('X-Request-Id', id)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }

  await next()

  console.log(
    JSON.stringify({
      type: 'request',
      requestId: id,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    }),
  )
})

app.use(
  '*',
  cors({
    origin: corsOrigins(),
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id', 'Retry-After'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
)

app.get('/', (c) => c.redirect('/docs'))
app.get('/doc', (c) => c.json(openApiDoc))
app.get('/docs', swaggerUI({ url: '/doc' }))

async function healthPayload() {
  if (!hasDatabase()) {
    return { ok: true, data: { status: 'ok', database: 'not_configured' as const } }
  }

  try {
    const db = getDb()
    await db.execute(sql`SELECT 1`)
    return { ok: true, data: { status: 'ok', database: 'connected' as const } }
  } catch {
    return { ok: false, data: { status: 'degraded', database: 'unreachable' as const } }
  }
}

app.get('/health', async (c) => {
  const health = await healthPayload()
  if (!health.ok) return c.json(fail('Database unreachable'), 503)
  return c.json(ok(health.data))
})

app.get('/ready', async (c) => {
  const health = await healthPayload()
  if (!health.ok || health.data.database !== 'connected') {
    return c.json(fail('Service is not ready'), 503)
  }
  return c.json(ok({ status: 'ready', database: health.data.database }))
})

const api = new Hono()
api.route('/auth', authRoutes)
api.route('/member-auth', memberAuthRoutes)
api.route('/portal', memberPortalRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/members', memberRoutes)
api.route('/trials', trialRoutes)
api.route('/payments', paymentRoutes)
api.route('/trainers', trainerRoutes)
api.route('/fitness', fitnessAdminRoutes)
api.route('/ops', opsRoutes)
api.route('/contact', contactRoutes)

app.route('/api', api)

export default app
