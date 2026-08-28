import 'dotenv/config'
import { like, or } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/client.js'
import { rateLimitBuckets } from '../src/db/schema.js'
import { env } from '../src/env.js'

async function main() {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset rate limits when NODE_ENV=production')
  }

  const db = getDb()
  const filters = [
    'login:unknown',
    'member-login:unknown',
    'member-activate:unknown',
    'trial:unknown',
    'contact:unknown',
  ]

  await db
    .delete(rateLimitBuckets)
    .where(or(...filters.map((key) => like(rateLimitBuckets.bucketKey, key))))

  console.log(`Reset local E2E rate-limit buckets: ${filters.join(', ')}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeDb())
