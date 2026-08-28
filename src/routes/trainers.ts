import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { recordAudit } from '../services/audit.service.js'
import {
  createTrainer,
  listTrainers,
  updateTrainer,
} from '../services/fitness.service.js'

const trainerIdSchema = z.coerce.number().int().positive()
const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().email().max(255).optional(),
)
const createSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  specialty: z.string().trim().min(2).max(255),
  phone: z.string().trim().max(30).optional(),
  email: optionalEmail,
})
const updateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(255).optional(),
    specialty: z.string().trim().min(2).max(255).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const trainerRoutes = new Hono<AuthContext>()
  .get('/', authMiddleware, async (c) => {
    const user = c.get('user')
    return c.json(ok(await listTrainers(user.role === 'owner'), 'success'))
  })
  .post('/', authMiddleware, requireRole('owner'), async (c) => {
    const user = c.get('user')
    const body = createSchema.parse(await c.req.json())
    const trainer = await createTrainer(body)
    await recordAudit({
      actorStaffId: user.id,
      action: 'trainer.create',
      entityType: 'trainer',
      entityId: trainer.id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(trainer, 'Trainer created'), 201)
  })
  .patch('/:id', authMiddleware, requireRole('owner'), async (c) => {
    const user = c.get('user')
    const id = trainerIdSchema.parse(c.req.param('id'))
    const body = updateSchema.parse(await c.req.json())
    const trainer = await updateTrainer(id, body)
    await recordAudit({
      actorStaffId: user.id,
      action: 'trainer.update',
      entityType: 'trainer',
      entityId: id,
      ipAddress: getClientIp(c),
      metadata: { isActive: trainer.isActive },
    })
    return c.json(ok(trainer, 'Trainer updated'))
  })
