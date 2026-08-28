import { createMiddleware } from 'hono/factory'
import { jwtVerify, type JWTPayload } from 'jose'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { staffUsers } from '../db/schema.js'
import { env } from '../env.js'
import type { AppVariables, StaffRole } from '../lib/types.js'
import { httpError } from './error.js'

const encoder = new TextEncoder()

export type AuthContext = {
  Variables: AppVariables
}

export const authMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    httpError(401, 'Missing authorization token')
  }

  const token = header.slice('Bearer '.length)
  let payload: JWTPayload
  try {
    const secret = encoder.encode(env.JWT_SECRET)
    ;({ payload } = await jwtVerify(token, secret))
  } catch {
    httpError(401, 'Invalid or expired token')
  }

  if (payload.kind !== 'staff') {
    httpError(401, 'Invalid token type')
  }

  const userId = Number(payload.sub)
  if (!Number.isInteger(userId) || userId <= 0) {
    httpError(401, 'Invalid token')
  }

  const db = getDb()
  const [user] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.id, userId))
    .limit(1)

  if (!user || !user.isActive) httpError(401, 'Invalid or inactive user')

  c.set('user', {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.fullName,
  })
  await next()
})

export function requireRole(...roles: StaffRole[]) {
  return createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      httpError(403, 'Insufficient permissions')
    }
    await next()
  })
}
