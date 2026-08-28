import type { Context } from 'hono'

export function getClientIp(c: Context) {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??
    forwarded ??
    'unknown'
  )
}

export function requestId(c: Context) {
  return c.req.header('x-request-id') ?? crypto.randomUUID()
}
