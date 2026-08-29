import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { recordAudit } from '../services/audit.service.js'
import {
  addProgress,
  assignTrainerToMember,
  listPendingMemberRequests,
  resolveMemberRequest,
  setWorkoutPlan,
  updateBookingStatus,
} from '../services/fitness.service.js'

const memberIdSchema = z.coerce.number().int().positive()
const requestIdSchema = z.coerce.number().int().positive()
const bookingIdSchema = z.coerce.number().int().positive()
const bookingStatusSchema = z.object({ status: z.enum(['Completed', 'Cancelled', 'NoShow']) })
const progressSchema = z
  .object({
    weightKg: z.number().positive().max(500).optional(),
    bodyFatPct: z.number().min(1).max(80).optional(),
    muscleMassKg: z.number().positive().max(300).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) =>
      value.weightKg != null ||
      value.bodyFatPct != null ||
      value.muscleMassKg != null ||
      Boolean(value.notes),
    'At least one progress value is required',
  )

const workoutSchema = z.object({
  trainerId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(2).max(255),
  plan: z.union([z.record(z.unknown()), z.array(z.unknown())]),
})

const resolveSchema = z.object({ decision: z.enum(['approve', 'reject']) })
const trainerAssignmentSchema = z.object({
  trainerId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional(),
})

export const fitnessAdminRoutes = new Hono<AuthContext>()
  .use('*', authMiddleware)
  .get('/requests', requirePermission('member.write'), async (c) => {
    return c.json(ok(await listPendingMemberRequests(), 'success'))
  })
  .post('/requests/:id/resolve', requirePermission('member.write'), async (c) => {
    const user = c.get('user')
    const id = requestIdSchema.parse(c.req.param('id'))
    const body = resolveSchema.parse(await c.req.json())
    const result = await resolveMemberRequest(id, user.id, body.decision)
    await recordAudit({
      actorStaffId: user.id,
      action: `member_request.${body.decision}`,
      entityType: 'member_request',
      entityId: id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(result, `Request ${result.status.toLowerCase()}`))
  })
  .put('/members/:id/trainer', requirePermission('trainer.manage'), async (c) => {
    const user = c.get('user')
    const memberId = memberIdSchema.parse(c.req.param('id'))
    const body = trainerAssignmentSchema.parse(await c.req.json())
    const assignment = await assignTrainerToMember(memberId, body.trainerId, user.id, body.notes)
    await recordAudit({
      actorStaffId: user.id,
      action: 'trainer.assign',
      entityType: 'member',
      entityId: memberId,
      ipAddress: getClientIp(c),
      metadata: { trainerId: body.trainerId },
    })
    return c.json(ok(assignment, 'Trainer assigned'))
  })
  .post('/members/:id/progress', requirePermission('fitness.write'), async (c) => {
    const user = c.get('user')
    const memberId = memberIdSchema.parse(c.req.param('id'))
    const body = progressSchema.parse(await c.req.json())
    const progress = await addProgress(memberId, body)
    await recordAudit({
      actorStaffId: user.id,
      action: 'progress.create',
      entityType: 'member',
      entityId: memberId,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(progress, 'Progress recorded'), 201)
  })
  .put('/members/:id/workout', requirePermission('fitness.write'), async (c) => {
    const user = c.get('user')
    const memberId = memberIdSchema.parse(c.req.param('id'))
    const body = workoutSchema.parse(await c.req.json())
    const plan = await setWorkoutPlan(memberId, body)
    await recordAudit({
      actorStaffId: user.id,
      action: 'workout_plan.set',
      entityType: 'member',
      entityId: memberId,
      ipAddress: getClientIp(c),
      metadata: { title: body.title },
    })
    return c.json(ok(plan, 'Workout plan saved'))
  })
  .patch('/bookings/:id/status', requirePermission('fitness.write'), async (c) => {
    const user = c.get('user')
    const id = bookingIdSchema.parse(c.req.param('id'))
    const body = bookingStatusSchema.parse(await c.req.json())
    await updateBookingStatus(id, body.status)
    await recordAudit({
      actorStaffId: user.id,
      action: `booking.${body.status.toLowerCase()}`,
      entityType: 'booking',
      entityId: id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(true, `Booking marked ${body.status}`))
  })
