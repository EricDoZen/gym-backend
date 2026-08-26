import 'dotenv/config'
import { serve } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import app from './app.js'
import { env } from './env.js'

export default app

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  serve({ fetch: app.fetch, port: env.PORT })
  console.log(`gym-backend listening on http://localhost:${env.PORT}`)
  console.log(`Swagger UI: http://localhost:${env.PORT}/docs`)
}
