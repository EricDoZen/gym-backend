import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { ok } from '../lib/response.js'
import {
  convertTrialToMember,
  getTrialById,
  listTrials,
  registerTrial,
} from '../services/trial.service.js'

const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().email().max(255).optional(),
)

const trialSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .regex(/^[+0-9][0-9\s().-]+$/, 'Invalid phone number'),
  email: optionalEmailSchema,
  package: z.string().trim().min(1).max(100),
  startDate: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Invalid start date'),
})

const trialIdSchema = z.coerce.number().int().positive()

const convertSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .regex(/^[+0-9][0-9\s().-]+$/, 'Invalid phone number')
    .optional(),
  email: optionalEmailSchema,
  package: z.string().trim().min(1).max(100).optional(),
  avatar: z.string().trim().max(500).optional(),
})

export const trialRoutes = new Hono<AuthContext>()
  .post(
    '/',
    rateLimit({ keyPrefix: 'trial', limit: 5, windowMs: 10 * 60 * 1000 }),
    async (c) => {
      const body = trialSchema.parse(await c.req.json())
      const trial = await registerTrial(body)
      return c.json(ok(trial, 'Trial registration saved'))
    },
  )
  .get('/', authMiddleware, async (c) => {
    const q = z.string().trim().max(120).optional().parse(c.req.query('q'))
    const trials = await listTrials(q)
    return c.json(ok(trials, 'success'))
  })
  .get('/:id', authMiddleware, async (c) => {
    const id = trialIdSchema.parse(c.req.param('id'))
    const trial = await getTrialById(id)
    return c.json(
      ok(
        {
          id: String(trial.id),
          fullName: trial.fullName,
          phone: trial.phone,
          email: trial.email ?? '',
          package: trial.packageCode,
          startDate: trial.preferredStartDate ?? '',
        },
        'success',
      ),
    )
  })
  .post('/:id/convert', authMiddleware, async (c) => {
    const id = trialIdSchema.parse(c.req.param('id'))
    const body = convertSchema.parse(await c.req.json())
    const member = await convertTrialToMember(id, body)
    return c.json(ok(member, 'Trial converted to member'))
  })
