import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import { checkInMember } from '../services/checkin.service.js'
import {
  createMember,
  getMemberById,
  listMembers,
  performMemberAction,
} from '../services/member.service.js'

const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().email().max(255).optional(),
)

const memberIdSchema = z.coerce.number().int().positive()

const createMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .regex(/^[+0-9][0-9\s().-]+$/, 'Invalid phone number'),
  email: optionalEmailSchema,
  package: z.string().trim().min(1).max(100).default('standard'),
  avatar: z.string().trim().max(500).optional(),
})

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['Active', 'Expired', 'Trial', 'Frozen']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  sort: z.enum(['name', 'joinDate', 'status']).default('name'),
})

const actionSchema = z
  .object({
    action: z.enum(['freeze', 'renew', 'upgrade', 'booking']),
    package: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'upgrade' && !value.package) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['package'],
        message: 'Package is required for upgrade',
      })
    }
  })

export const memberRoutes = new Hono<AuthContext>()
  .get('/', authMiddleware, async (c) => {
    const query = listQuerySchema.parse({
      q: c.req.query('q'),
      status: c.req.query('status'),
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
      sort: c.req.query('sort'),
    })

    const result = await listMembers(query)
    return c.json(ok(result.items, 'success'))
  })
  .get('/:id', authMiddleware, async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    const member = await getMemberById(id)
    return c.json(ok(member, 'success'))
  })
  .post('/', authMiddleware, async (c) => {
    const body = createMemberSchema.parse(await c.req.json())
    const member = await createMember(body)
    return c.json(ok(member, 'Member created'))
  })
  .post('/:id/actions', authMiddleware, async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    const body = actionSchema.parse(await c.req.json())
    const member = await performMemberAction(id, body.action, body.package)
    return c.json(ok(member, `${body.action} completed`))
  })
  .post('/:id/checkins', authMiddleware, async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    const record = await checkInMember(id)
    return c.json(ok(record, 'Check-in successful'))
  })
