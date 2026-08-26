import { serve } from '@hono/node-server'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'
import { hasDatabase, getDb } from './db/client.js'
import { corsOrigins, env } from './env.js'
import { fail, ok } from './lib/response.js'
import { registerErrorHandler } from './middleware/error.js'
import { authRoutes } from './routes/auth.js'
import { contactRoutes } from './routes/contact.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { memberRoutes } from './routes/members.js'
import { paymentRoutes } from './routes/payments.js'
import { trialRoutes } from './routes/trials.js'
import { openApiDoc } from './openapi.js'

const app = new Hono()

registerErrorHandler(app)

app.use(
  '*',
  cors({
    origin: corsOrigins(),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/', (c) => c.redirect('/docs'))
app.get('/doc', (c) => c.json(openApiDoc))
app.get('/docs', swaggerUI({ url: '/doc' }))

app.get('/health', async (c) => {
  if (!hasDatabase()) {
    return c.json(ok({ status: 'ok', database: 'not_configured' }))
  }

  try {
    const db = getDb()
    await db.execute(sql`SELECT 1`)
    return c.json(ok({ status: 'ok', database: 'connected' }))
  } catch {
    return c.json(fail('Database unreachable'), 503)
  }
})

const api = new Hono()
api.route('/auth', authRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/members', memberRoutes)
api.route('/trials', trialRoutes)
api.route('/payments', paymentRoutes)
api.route('/contact', contactRoutes)

app.route('/api', api)

export default app

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  serve({ fetch: app.fetch, port: env.PORT })
  console.log(`gym-backend listening on http://localhost:${env.PORT}`)
  console.log(`Swagger UI: http://localhost:${env.PORT}/docs`)
}
