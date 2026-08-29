import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import { getClientIp } from '../lib/request.js'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { recordAudit } from '../services/audit.service.js'
import {
  createMembershipPackage,
  getPackagePriceHistory,
  listAdminPackages,
  listPublicPackages,
  updateMembershipPackage,
} from '../services/package.service.js'

const packageIdSchema = z.coerce.number().int().positive()
const packagePayload = z.object({
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  priceMmk: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  durationDays: z.number().int().min(1).max(3650),
  freezeAllowanceDays: z.number().int().min(0).max(365).default(0),
  sessionLimit: z.number().int().positive().max(10000).nullable().optional(),
  renewalWindowDays: z.number().int().min(0).max(365).default(30),
  allowUpgrade: z.boolean().default(true),
  allowDowngrade: z.boolean().default(true),
  effectiveFrom: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
})

const updatePackagePayload = packagePayload.omit({ code: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
)

export const packageRoutes = new Hono<AuthContext>()
  .get('/', async (c) => c.json(ok(await listPublicPackages(), 'success')))
  .get('/admin', authMiddleware, requirePermission('package.manage'), async (c) => {
    return c.json(ok(await listAdminPackages(), 'success'))
  })
  .get('/:id/prices', authMiddleware, requirePermission('package.manage'), async (c) => {
    const id = packageIdSchema.parse(c.req.param('id'))
    return c.json(ok(await getPackagePriceHistory(id), 'success'))
  })
  .post('/', authMiddleware, requirePermission('package.manage'), async (c) => {
    const user = c.get('user')
    const body = packagePayload.parse(await c.req.json())
    const membershipPackage = await createMembershipPackage(body, user.id)
    await recordAudit({
      actorStaffId: user.id,
      action: 'package.create',
      entityType: 'membership_package',
      entityId: membershipPackage.id,
      ipAddress: getClientIp(c),
      metadata: { code: membershipPackage.code, priceMmk: membershipPackage.priceMmk },
    })
    return c.json(ok(membershipPackage, 'Package created'), 201)
  })
  .patch('/:id', authMiddleware, requirePermission('package.manage'), async (c) => {
    const user = c.get('user')
    const id = packageIdSchema.parse(c.req.param('id'))
    const body = updatePackagePayload.parse(await c.req.json())
    const membershipPackage = await updateMembershipPackage(id, body, user.id)
    await recordAudit({
      actorStaffId: user.id,
      action: 'package.update',
      entityType: 'membership_package',
      entityId: id,
      ipAddress: getClientIp(c),
      metadata: {
        code: membershipPackage.code,
        priceMmk: membershipPackage.priceMmk,
        isActive: membershipPackage.isActive,
      },
    })
    return c.json(ok(membershipPackage, 'Package updated'))
  })
