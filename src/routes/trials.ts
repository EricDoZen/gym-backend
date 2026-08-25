import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import { getTrialById, registerTrial } from '../services/trial.service.js'

const trialSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().optional(),
  package: z.string().min(1),
  startDate: z.string().optional(),
})

export const trialRoutes = new Hono<AuthContext>()
  .post('/', async (c) => {
    const body = trialSchema.parse(await c.req.json())
    const trial = await registerTrial(body)
    return c.json(ok(trial, 'Trial registration saved'))
  })
  .get('/:id', authMiddleware, async (c) => {
    const id = Number(c.req.param('id'))
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
