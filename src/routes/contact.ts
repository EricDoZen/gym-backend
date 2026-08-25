import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { submitContact } from '../services/contact.service.js'

export const contactRoutes = new Hono().post('/', async (c) => {
  const payload = z.record(z.string()).parse(await c.req.json())
  await submitContact(payload)
  return c.json(ok(true, 'Message sent'))
})
