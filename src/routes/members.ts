import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import { recordAudit } from '../services/audit.service.js'
import { addMemberNote, getMemberOverview, listMemberNotes } from '../services/member-overview.service.js'
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
const noteSchema = z.object({ note: z.string().trim().min(2).max(1000) })

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
    action: z.enum(['freeze', 'renew', 'upgrade', 'downgrade', 'booking']),
    package: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.action === 'upgrade' || value.action === 'downgrade') && !value.package) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['package'],
        message: 'Package is required for package changes',
      })
    }
  })

export const memberRoutes = new Hono<AuthContext>()
  .get('/', authMiddleware, requirePermission('member.read'), async (c) => {
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
  .get('/:id/overview', authMiddleware, requirePermission('member.read'), async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    return c.json(ok(await getMemberOverview(id), 'success'))
  })
  .get('/:id/notes', authMiddleware, requirePermission('member.read'), async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    return c.json(ok(await listMemberNotes(id), 'success'))
  })
  .post('/:id/notes', authMiddleware, requirePermission('member.notes'), async (c) => {
    const user = c.get('user')
    const id = memberIdSchema.parse(c.req.param('id'))
    const body = noteSchema.parse(await c.req.json())
    const note = await addMemberNote(id, user.id, body.note)
    await recordAudit({
      actorStaffId: user.id,
      action: 'member.note.create',
      entityType: 'member',
      entityId: id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(note, 'Member note added'), 201)
  })
  .get('/:id', authMiddleware, requirePermission('member.read'), async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    const member = await getMemberById(id)
    return c.json(ok(member, 'success'))
  })
  .post('/', authMiddleware, requirePermission('member.write'), async (c) => {
    const body = createMemberSchema.parse(await c.req.json())
    const member = await createMember(body)
    return c.json(ok(member, 'Member created'))
  })
  .post('/:id/actions', authMiddleware, requirePermission('member.write'), async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    const body = actionSchema.parse(await c.req.json())
    const member = await performMemberAction(id, body.action, body.package)
    return c.json(ok(member, `${body.action} completed`))
  })
  .post('/:id/checkins', authMiddleware, requirePermission('member.checkin'), async (c) => {
    const id = memberIdSchema.parse(c.req.param('id'))
    const record = await checkInMember(id)
    return c.json(ok(record, 'Check-in successful'))
  })
