import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import { checkInMember } from '../services/checkin.service.js'
import {
  createMember,
  getMemberById,
  listMembers,
  performMemberAction,
} from '../services/member.service.js'

const createMemberSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  package: z.string().optional(),
  avatar: z.string().optional(),
})

const actionSchema = z.object({
  action: z.enum(['freeze', 'renew', 'upgrade', 'booking']),
})

export const memberRoutes = new Hono<AuthContext>()
  .get('/', authMiddleware, async (c) => {
    const q = c.req.query('q')
    const status = c.req.query('status')
    const page = Number(c.req.query('page') ?? '1')
    const pageSize = Number(c.req.query('pageSize') ?? '100')
    const sort = (c.req.query('sort') ?? 'name') as
      | 'name'
      | 'joinDate'
      | 'status'

    const result = await listMembers({ q, status, page, pageSize, sort })
    return c.json(ok(result.items, 'success'))
  })
  .get('/:id', authMiddleware, async (c) => {
    const id = Number(c.req.param('id'))
    const member = await getMemberById(id)
    return c.json(ok(member, 'success'))
  })
  .post('/', authMiddleware, async (c) => {
    const body = createMemberSchema.parse(await c.req.json())
    const member = await createMember(body)
    return c.json(ok(member, 'Member created'))
  })
  .post('/:id/actions', authMiddleware, async (c) => {
    const id = Number(c.req.param('id'))
    const body = actionSchema.parse(await c.req.json())
    const member = await performMemberAction(id, body.action)
    return c.json(ok(member, `${body.action} completed`))
  })
  .post('/:id/checkins', authMiddleware, async (c) => {
    const id = Number(c.req.param('id'))
    const record = await checkInMember(id)
    return c.json(ok(record, 'Check-in successful'))
  })
