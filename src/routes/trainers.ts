import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { recordAudit } from '../services/audit.service.js'
import {
  addTrainerTimeOff,
  createTrainer,
  listTrainerAvailability,
  listTrainerCalendar,
  listTrainerTimeOff,
  listTrainers,
  replaceTrainerAvailability,
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
const availabilitySchema = z.object({
  slots: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })).max(50),
})
const timeOffSchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().trim().max(500).optional(),
})
const calendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
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
  .get('/', authMiddleware, requirePermission('trainer.read'), async (c) => {
    const user = c.get('user')
    return c.json(ok(await listTrainers(user.role === 'owner' || user.role === 'manager'), 'success'))
  })
  .post('/', authMiddleware, requirePermission('trainer.manage'), async (c) => {
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
  .patch('/:id', authMiddleware, requirePermission('trainer.manage'), async (c) => {
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
  .get('/:id/availability', authMiddleware, requirePermission('trainer.read'), async (c) => {
    const id = trainerIdSchema.parse(c.req.param('id'))
    return c.json(ok(await listTrainerAvailability(id), 'success'))
  })
  .put('/:id/availability', authMiddleware, requirePermission('trainer.manage'), async (c) => {
    const user = c.get('user')
    const id = trainerIdSchema.parse(c.req.param('id'))
    const body = availabilitySchema.parse(await c.req.json())
    const slots = await replaceTrainerAvailability(id, body.slots)
    await recordAudit({ actorStaffId: user.id, action: 'trainer.availability.set', entityType: 'trainer', entityId: id, ipAddress: getClientIp(c), metadata: { slots: slots.length } })
    return c.json(ok(slots, 'Trainer availability saved'))
  })
  .get('/:id/time-off', authMiddleware, requirePermission('trainer.read'), async (c) => {
    const id = trainerIdSchema.parse(c.req.param('id'))
    return c.json(ok(await listTrainerTimeOff(id), 'success'))
  })
  .post('/:id/time-off', authMiddleware, requirePermission('trainer.manage'), async (c) => {
    const user = c.get('user')
    const id = trainerIdSchema.parse(c.req.param('id'))
    const body = timeOffSchema.parse(await c.req.json())
    const item = await addTrainerTimeOff(id, body)
    await recordAudit({ actorStaffId: user.id, action: 'trainer.time_off.create', entityType: 'trainer', entityId: id, ipAddress: getClientIp(c) })
    return c.json(ok(item, 'Trainer time off saved'), 201)
  })
  .get('/:id/calendar', authMiddleware, requirePermission('trainer.read'), async (c) => {
    const id = trainerIdSchema.parse(c.req.param('id'))
    const query = calendarQuerySchema.parse(c.req.query())
    const from = query.from ?? new Date(Date.now() - 7 * 86400000)
    const to = query.to ?? new Date(Date.now() + 30 * 86400000)
    return c.json(ok(await listTrainerCalendar(id, from, to), 'success'))
  })
