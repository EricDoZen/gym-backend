import { beforeEach, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { clearRateLimitBucketsForTest, rateLimit } from '../src/middleware/rate-limit.js'

describe('rateLimit middleware', () => {
  beforeEach(() => clearRateLimitBucketsForTest())

  it('allows requests up to the limit then returns 429', async () => {
    const app = new Hono().get(
      '/limited',
      rateLimit({ keyPrefix: 'test', limit: 2, windowMs: 60_000 }),
      (c) => c.json({ ok: true }),
    )
    const headers = { 'x-forwarded-for': '203.0.113.10' }
    expect((await app.request('/limited', { headers })).status).toBe(200)
    expect((await app.request('/limited', { headers })).status).toBe(200)
    const blocked = await app.request('/limited', { headers })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBeTruthy()
  })

  it('isolates buckets by client IP', async () => {
    const app = new Hono().get(
      '/limited',
      rateLimit({ keyPrefix: 'test-ip', limit: 1, windowMs: 60_000 }),
      (c) => c.text('ok'),
    )
    expect((await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.1' } })).status).toBe(200)
    expect((await app.request('/limited', { headers: { 'x-forwarded-for': '203.0.113.2' } })).status).toBe(200)
  })
})
