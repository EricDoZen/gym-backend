import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import {
  memberAuthMiddleware,
  type MemberAuthContext,
} from '../middleware/member-auth.js'
import { recordAudit } from '../services/audit.service.js'
import { listMemberNotifications, markNotificationRead } from '../services/notification.service.js'
import {
  cancelMemberBooking,
  createMemberBooking,
  createMemberRequest,
  getActiveWorkoutPlan,
  getMemberTrainerAssignment,
  listMemberBookings,
  listMemberRequests,
  listProgress,
  listTrainers,
} from '../services/fitness.service.js'

const bookingSchema = z.object({
  trainerId: z.coerce.number().int().positive().optional(),
  sessionType: z.string().trim().min(2).max(100),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(15).max(240).default(60),
  notes: z.string().trim().max(500).optional(),
})
const bookingIdSchema = z.coerce.number().int().positive()
const notificationIdSchema = z.coerce.number().int().positive()
const requestSchema = z.object({
  requestType: z.enum(['freeze', 'renew', 'upgrade', 'downgrade']),
  requestedPackage: z.string().trim().max(100).optional(),
})

export const memberPortalRoutes = new Hono<MemberAuthContext>()
  .use('*', memberAuthMiddleware)
  .get('/trainers', async (c) => c.json(ok(await listTrainers(false), 'success')))
  .get('/trainer-assignment', async (c) => {
    const member = c.get('member')
    return c.json(ok(await getMemberTrainerAssignment(Number(member.id)), 'success'))
  })
  .get('/bookings', async (c) => {
    const member = c.get('member')
    return c.json(ok(await listMemberBookings(Number(member.id)), 'success'))
  })
  .post('/bookings', async (c) => {
    const member = c.get('member')
    const body = bookingSchema.parse(await c.req.json())
    if (body.scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) {
      return c.json(
        { success: false, data: null, message: 'Booking must be at least 15 minutes in the future' },
        400,
      )
    }
    const booking = await createMemberBooking(Number(member.id), body)
    await recordAudit({
      actorMemberId: Number(member.id),
      action: 'booking.create',
      entityType: 'booking',
      entityId: booking?.id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(booking, 'Session booked'), 201)
  })
  .patch('/bookings/:id/cancel', async (c) => {
    const member = c.get('member')
    const id = bookingIdSchema.parse(c.req.param('id'))
    await cancelMemberBooking(Number(member.id), id)
    await recordAudit({
      actorMemberId: Number(member.id),
      action: 'booking.cancel',
      entityType: 'booking',
      entityId: id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(true, 'Booking cancelled'))
  })
  .get('/progress', async (c) => {
    const member = c.get('member')
    return c.json(ok(await listProgress(Number(member.id)), 'success'))
  })
  .get('/workout', async (c) => {
    const member = c.get('member')
    return c.json(ok(await getActiveWorkoutPlan(Number(member.id)), 'success'))
  })
  .get('/notifications', async (c) => {
    const member = c.get('member')
    return c.json(ok(await listMemberNotifications(Number(member.id)), 'success'))
  })
  .patch('/notifications/:id/read', async (c) => {
    const member = c.get('member')
    const id = notificationIdSchema.parse(c.req.param('id'))
    return c.json(ok(await markNotificationRead(id, 'member', Number(member.id)), 'Notification read'))
  })
  .get('/requests', async (c) => {
    const member = c.get('member')
    return c.json(ok(await listMemberRequests(Number(member.id)), 'success'))
  })
  .post('/requests', async (c) => {
    const member = c.get('member')
    const body = requestSchema.parse(await c.req.json())
    if ((body.requestType === 'upgrade' || body.requestType === 'downgrade') && !body.requestedPackage) {
      return c.json(
        { success: false, data: null, message: 'Package is required for package change requests' },
        400,
      )
    }
    const request = await createMemberRequest(Number(member.id), body)
    await recordAudit({
      actorMemberId: Number(member.id),
      action: `member_request.${body.requestType}`,
      entityType: 'member_request',
      entityId: request.id,
      ipAddress: getClientIp(c),
      metadata: { requestedPackage: body.requestedPackage ?? null },
    })
    return c.json(ok(request, 'Request submitted'), 201)
  })
