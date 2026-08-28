import { eq, sql } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { getDb, hasDatabase } from '../db/client.js'
import { rateLimitBuckets } from '../db/schema.js'
import { env } from '../env.js'
import { fail } from '../lib/response.js'

type Bucket = { count: number; resetAt: number }
const memoryBuckets = new Map<string, Bucket>()

function consumeMemoryBucket(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  let bucket = memoryBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
  }
  bucket.count += 1
  memoryBuckets.set(key, bucket)
  return { allowed: bucket.count <= limit, resetAt: bucket.resetAt }
}

async function consumeDatabaseBucket(
  key: string,
  limit: number,
  windowMs: number,
) {
  const db = getDb()
  const now = Date.now()
  const nextReset = now + windowMs

  await db.execute(sql`
    INSERT INTO rate_limit_buckets (bucket_key, count, reset_at_ms, updated_at)
    VALUES (${key}, 1, ${nextReset}, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      count = IF(reset_at_ms <= ${now}, 1, count + 1),
      reset_at_ms = IF(reset_at_ms <= ${now}, ${nextReset}, reset_at_ms),
      updated_at = CURRENT_TIMESTAMP
  `)

  const [bucket] = await db
    .select({ count: rateLimitBuckets.count, resetAtMs: rateLimitBuckets.resetAtMs })
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.bucketKey, key))
    .limit(1)

  return {
    allowed: Boolean(bucket && bucket.count <= limit),
    resetAt: bucket?.resetAtMs ?? nextReset,
  }
}

function clientIp(headers: {
  get: (name: string) => string | undefined
}) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    forwarded ??
    'unknown'
  )
}

export function rateLimit(options: {
  keyPrefix: string
  limit: number
  windowMs: number
}) {
  return createMiddleware(async (c, next) => {
    const ip = clientIp({ get: (name) => c.req.header(name) })
    const key = `${options.keyPrefix}:${ip}`

    let result: { allowed: boolean; resetAt: number }
    if (env.NODE_ENV !== 'test' && hasDatabase()) {
      try {
        result = await consumeDatabaseBucket(key, options.limit, options.windowMs)
      } catch (error) {
        console.warn('distributed rate limiter unavailable; using memory fallback', error)
        result = consumeMemoryBucket(key, options.limit, options.windowMs)
      }
    } else {
      result = consumeMemoryBucket(key, options.limit, options.windowMs)
    }

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
      c.header('Retry-After', String(retryAfter))
      return c.json(fail('Too many requests'), 429)
    }

    await next()
  })
}

export function clearRateLimitBucketsForTest() {
  memoryBuckets.clear()
}
