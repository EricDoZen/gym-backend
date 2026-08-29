import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requirePermission, requireRole } from '../middleware/auth.js'
import { rolePermissions } from '../lib/permissions.js'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import {
  changePassword,
  createStaff,
  getStaffById,
  listStaff,
  login,
  resetStaffPassword,
  updateStaff,
} from '../services/auth.service.js'
import { recordAudit } from '../services/audit.service.js'
import { rateLimit } from '../middleware/rate-limit.js'

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
})

const strongPassword = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number')

const createStaffSchema = z.object({
  email: z.string().trim().email().max(255),
  password: strongPassword,
  role: z.enum(['owner', 'manager', 'reception', 'trainer', 'accountant']),
  fullName: z.string().trim().min(2).max(255),
})

const updateStaffSchema = z
  .object({
    email: z.string().trim().email().max(255).optional(),
    role: z.enum(['owner', 'manager', 'reception', 'trainer', 'accountant']).optional(),
    fullName: z.string().trim().min(2).max(255).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPassword,
})

const resetPasswordSchema = z.object({ newPassword: strongPassword })
const staffIdSchema = z.coerce.number().int().positive()

export const authRoutes = new Hono<AuthContext>()
  .post(
    '/login',
    rateLimit({ keyPrefix: 'login', limit: 10, windowMs: 15 * 60 * 1000 }),
    async (c) => {
      const body = loginSchema.parse(await c.req.json())
      const result = await login(body.email, body.password)
      await recordAudit({
        actorStaffId: result.id,
        action: 'staff.login',
        entityType: 'staff',
        entityId: result.id,
        ipAddress: getClientIp(c),
      })
      const { id: _id, ...response } = result
      return c.json(ok(response, 'Login successful'))
    },
  )
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
          permissions: rolePermissions(staff.role),
        },
        'success',
      ),
    )
  })
  .post('/change-password', authMiddleware, async (c) => {
    const user = c.get('user')
    const body = changePasswordSchema.parse(await c.req.json())
    await changePassword(user.id, body.currentPassword, body.newPassword)
    await recordAudit({
      actorStaffId: user.id,
      action: 'staff.change_password',
      entityType: 'staff',
      entityId: user.id,
      ipAddress: getClientIp(c),
    })
    return c.json(ok(true, 'Password changed'))
  })
  .get('/staff', authMiddleware, requirePermission('staff.manage'), async (c) => {
    return c.json(ok(await listStaff(), 'success'))
  })
  .post('/staff', authMiddleware, requirePermission('staff.manage'), async (c) => {
    const user = c.get('user')
    const body = createStaffSchema.parse(await c.req.json())
    const staff = await createStaff(body)
    await recordAudit({
      actorStaffId: user.id,
      action: 'staff.create',
      entityType: 'staff',
      entityId: staff.id,
      ipAddress: getClientIp(c),
      metadata: { role: staff.role },
    })
    return c.json(ok(staff, 'Staff account created'), 201)
  })
  .patch('/staff/:id', authMiddleware, requirePermission('staff.manage'), async (c) => {
    const user = c.get('user')
    const id = staffIdSchema.parse(c.req.param('id'))
    const body = updateStaffSchema.parse(await c.req.json())
    const staff = await updateStaff(id, body)
    await recordAudit({
      actorStaffId: user.id,
      action: 'staff.update',
      entityType: 'staff',
      entityId: id,
      ipAddress: getClientIp(c),
      metadata: { role: staff.role, isActive: staff.isActive },
    })
    return c.json(ok(staff, 'Staff account updated'))
  })
  .post(
    '/staff/:id/reset-password',
    authMiddleware,
    requirePermission('staff.manage'),
    async (c) => {
      const user = c.get('user')
      const id = staffIdSchema.parse(c.req.param('id'))
      const body = resetPasswordSchema.parse(await c.req.json())
      await resetStaffPassword(id, body.newPassword)
      await recordAudit({
        actorStaffId: user.id,
        action: 'staff.reset_password',
        entityType: 'staff',
        entityId: id,
        ipAddress: getClientIp(c),
      })
      return c.json(ok(true, 'Password reset'))
    },
  )
