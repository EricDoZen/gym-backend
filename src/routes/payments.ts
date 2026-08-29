import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import { recordAudit } from '../services/audit.service.js'
import {
  createPayment,
  createPaymentAdjustment,
  getPaymentById,
  listPaymentAdjustments,
  listPayments,
} from '../services/payment.service.js'

const paymentIdSchema = z.coerce.number().int().positive()
const adjustmentSchema = z.object({
  type: z.enum(['refund', 'void']),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  reason: z.string().trim().min(3).max(500),
}).superRefine((value, ctx) => {
  if (value.type === 'refund' && value.amount == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Refund amount is required' })
  }
})

const createPaymentSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  packageName: z.string().trim().min(1).max(100),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: z.enum(['Paid', 'Pending', 'Overdue']).default('Paid'),
  paymentMethod: z.string().trim().min(1).max(50).default('Cash'),
  referenceNo: z.string().trim().max(100).optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
  membershipAction: z.enum(['renew', 'upgrade', 'downgrade']).optional(),
  paymentDate: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Invalid payment date'),
})

export const paymentRoutes = new Hono<AuthContext>()
  .get('/', authMiddleware, requirePermission('payment.read'), async (c) => {
    const status = z
      .enum(['Paid', 'Pending', 'Overdue', 'all'])
      .optional()
      .parse(c.req.query('status'))
    return c.json(ok(await listPayments(status), 'success'))
  })
  .get('/:id', authMiddleware, requirePermission('payment.read'), async (c) => {
    const id = paymentIdSchema.parse(c.req.param('id'))
    return c.json(ok(await getPaymentById(id), 'success'))
  })
  .post('/', authMiddleware, requirePermission('payment.create'), async (c) => {
    const user = c.get('user')
    const body = createPaymentSchema.parse(await c.req.json())
    const payment = await createPayment({ ...body, createdByStaffId: user.id })
    await recordAudit({
      actorStaffId: user.id,
      action: 'payment.create',
      entityType: 'payment',
      entityId: payment.id,
      ipAddress: getClientIp(c),
      metadata: {
        memberId: payment.memberId,
        amount: payment.amount,
        status: payment.status,
        membershipAction: payment.membershipAction || null,
      },
    })
    return c.json(ok(payment, 'Payment recorded'))
  })
  .get('/:id/adjustments', authMiddleware, requirePermission('payment.read'), async (c) => {
    const id = paymentIdSchema.parse(c.req.param('id'))
    return c.json(ok(await listPaymentAdjustments(id), 'success'))
  })
  .post('/:id/adjustments', authMiddleware, requirePermission('payment.adjust'), async (c) => {
    const user = c.get('user')
    const id = paymentIdSchema.parse(c.req.param('id'))
    const body = adjustmentSchema.parse(await c.req.json())
    const result = await createPaymentAdjustment(id, {
      ...body,
      createdByStaffId: user.id,
    })
    await recordAudit({
      actorStaffId: user.id,
      action: `payment.${body.type}`,
      entityType: 'payment',
      entityId: id,
      ipAddress: getClientIp(c),
      metadata: { amount: body.type === 'void' ? result.payment.amount : body.amount, reason: body.reason },
    })
    return c.json(ok(result, body.type === 'void' ? 'Payment voided' : 'Refund recorded'))
  })
