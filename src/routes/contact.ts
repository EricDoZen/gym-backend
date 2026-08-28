import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { submitContact } from '../services/contact.service.js'
import { rateLimit } from '../middleware/rate-limit.js'

const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().email().max(255).optional(),
)

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  email: optionalEmailSchema,
  message: z.string().trim().min(5).max(4000),
})

export const contactRoutes = new Hono().post(
  '/',
  rateLimit({ keyPrefix: 'contact', limit: 5, windowMs: 10 * 60 * 1000 }),
  async (c) => {
    const payload = contactSchema.parse(await c.req.json())
    await submitContact(payload)
    return c.json(ok(true, 'Message sent'))
  },
)
