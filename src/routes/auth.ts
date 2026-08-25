import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import { getStaffById, login } from '../services/auth.service.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const authRoutes = new Hono<AuthContext>()
  .post('/login', async (c) => {
    const body = loginSchema.parse(await c.req.json())
    const result = await login(body.email, body.password)
    return c.json(ok(result, 'Login successful'))
  })
  .get('/me', authMiddleware, async (c) => {
    const user = c.get('user')
    const staff = await getStaffById(user.id)
    if (!staff) {
      return c.json({ success: false, data: null, message: 'User not found' }, 404)
    }
    return c.json(
      ok(
        {
          id: staff.id,
          email: staff.email,
          role: staff.role,
          name: staff.fullName,
        },
        'success',
      ),
    )
  })
