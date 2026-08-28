import { createMiddleware } from 'hono/factory'
import { jwtVerify, type JWTPayload } from 'jose'
import { env } from '../env.js'
import { getMemberById } from '../services/member.service.js'
import { getActiveMemberAccount } from '../services/member-auth.service.js'
import { httpError } from './error.js'
import type { MemberDto } from '../lib/types.js'

const encoder = new TextEncoder()

export type MemberAuthContext = {
  Variables: {
    member: MemberDto
  }
}

export const memberAuthMiddleware = createMiddleware<MemberAuthContext>(
  async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) {
      httpError(401, 'Missing member authorization token')
    }

    const token = header.slice('Bearer '.length)
    let payload: JWTPayload
    try {
      ;({ payload } = await jwtVerify(token, encoder.encode(env.JWT_SECRET)))
    } catch {
      httpError(401, 'Invalid or expired member token')
    }

    if (payload.kind !== 'member') httpError(401, 'Invalid token type')
    const memberId = Number(payload.sub)
    if (!Number.isInteger(memberId) || memberId <= 0) {
      httpError(401, 'Invalid member token')
    }

    const account = await getActiveMemberAccount(memberId)
    if (!account) httpError(401, 'Inactive member portal account')
    if (Number(payload.ver) !== account.tokenVersion) {
      httpError(401, 'Member session was revoked; please sign in again')
    }

    c.set('member', await getMemberById(memberId))
    await next()
  },
)
