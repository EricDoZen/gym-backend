import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { fileURLToPath } from 'node:url'
import { env } from './env.js'
import { ok } from './lib/response.js'

const app = new Hono()

app.get('/health', (c) => c.json(ok({ status: 'ok' })))

export default app

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  serve({ fetch: app.fetch, port: env.PORT })
  console.log(`gym-backend listening on http://localhost:${env.PORT}`)
}
