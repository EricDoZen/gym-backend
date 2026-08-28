import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import {
  memberAuthMiddleware,
  type MemberAuthContext,
} from '../middleware/member-auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import {
  activateMemberAccount,
  changeMemberPassword,
  memberLogin,
} from '../services/member-auth.service.js'
import { recordAudit } from '../services/audit.service.js'

const strongPassword = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number')

const activateSchema = z.object({
  memberCode: z.string().trim().min(4).max(20),
  phone: z.string().trim().min(7).max(30),
  password: strongPassword,
})

const loginSchema = z.object({
  memberCode: z.string().trim().min(4).max(20),
  password: z.string().min(1).max(128),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPassword,
})

export const memberAuthRoutes = new Hono<MemberAuthContext>()
  .post(
    '/activate',
    rateLimit({ keyPrefix: 'member-activate', limit: 5, windowMs: 60 * 60 * 1000 }),
    async (c) => {
      const body = activateSchema.parse(await c.req.json())
      const member = await activateMemberAccount(
        body.memberCode,
        body.phone,
        body.password,
      )
      await recordAudit({
        actorMemberId: Number(member.id),
        action: 'member_portal.activate',
        entityType: 'member',
        entityId: member.id,
        ipAddress: getClientIp(c),
      })
      return c.json(ok(member, 'Member portal activated'), 201)
    },
  )
  .post(
    '/login',
    rateLimit({ keyPrefix: 'member-login', limit: 10, windowMs: 15 * 60 * 1000 }),
    async (c) => {
      const body = loginSchema.parse(await c.req.json())
      const result = await memberLogin(body.memberCode, body.password)
      await recordAudit({
        actorMemberId: Number(result.member.id),
        action: 'member_portal.login',
        entityType: 'member',
        entityId: result.member.id,
        ipAddress: getClientIp(c),
      })
      return c.json(ok(result, 'Login successful'))
    },
  )
  .get('/me', memberAuthMiddleware, async (c) => {
    return c.json(ok(c.get('member'), 'success'))
  })
  .post('/change-password', memberAuthMiddleware, async (c) => {
    const member = c.get('member')
    const body = changePasswordSchema.parse(await c.req.json())
    await changeMemberPassword(
      Number(member.id),
      body.currentPassword,
      body.newPassword,
    )
    await recordAudit({
      actorMemberId: Number(member.id),
      action: 'member_portal.change_password',
      entityType: 'member',
      entityId: member.id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(true, 'Password changed'))
  })
