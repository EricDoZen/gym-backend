import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import { createPayment, listPayments } from '../services/payment.service.js'

const createPaymentSchema = z.object({
  memberId: z.union([z.string(), z.number()]),
  packageName: z.string().min(1),
  amount: z.number().positive(),
  status: z.enum(['Paid', 'Pending', 'Overdue']).default('Paid'),
  paymentDate: z.string().optional(),
})

export const paymentRoutes = new Hono<AuthContext>()
  .get('/', authMiddleware, async (c) => {
    const status = c.req.query('status')
    const items = await listPayments(status)
    return c.json(ok(items, 'success'))
  })
  .post('/', authMiddleware, requireRole('owner'), async (c) => {
    const body = createPaymentSchema.parse(await c.req.json())
    const payment = await createPayment({
      memberId: Number(body.memberId),
      packageName: body.packageName,
      amount: body.amount,
      status: body.status,
      paymentDate: body.paymentDate,
    })
    return c.json(ok(payment, 'Payment recorded'))
  })
