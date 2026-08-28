import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { listAuditLogs } from '../services/audit.service.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  actorStaffId: z.coerce.number().int().positive().optional(),
})

export const opsRoutes = new Hono<AuthContext>().get(
  '/audit',
  authMiddleware,
  requireRole('owner'),
  async (c) => {
    const query = querySchema.parse(c.req.query())
    return c.json(
      ok(await listAuditLogs(query.limit, query.actorStaffId), 'success'),
    )
  },
)
