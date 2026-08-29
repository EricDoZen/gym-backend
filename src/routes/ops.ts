import { Hono } from 'hono'
import { z } from 'zod'
import { ok } from '../lib/response.js'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { listAuditLogs } from '../services/audit.service.js'
import { getOperationsReport } from '../services/report.service.js'
import {
  generateOperationalNotifications,
  listStaffNotifications,
  markNotificationRead,
} from '../services/notification.service.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  actorStaffId: z.coerce.number().int().positive().optional(),
})
const notificationIdSchema = z.coerce.number().int().positive()
const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

function monthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const toDate = (date: Date) => date.toISOString().slice(0, 10)
  return { from: toDate(first), to: toDate(now) }
}

export const opsRoutes = new Hono<AuthContext>()
  .get('/audit', authMiddleware, requirePermission('audit.view'), async (c) => {
    const query = querySchema.parse(c.req.query())
    return c.json(ok(await listAuditLogs(query.limit, query.actorStaffId), 'success'))
  })
  .get('/reports', authMiddleware, requirePermission('reports.view'), async (c) => {
    const query = reportQuerySchema.parse(c.req.query())
    const defaults = monthRange()
    const from = query.from ?? defaults.from
    const to = query.to ?? defaults.to
    if (from > to) {
      return c.json({ success: false, data: null, message: 'from must be before or equal to to' }, 400)
    }
    return c.json(ok(await getOperationsReport(from, to), 'success'))
  })
  .get('/notifications', authMiddleware, async (c) => {
    const user = c.get('user')
    return c.json(ok(await listStaffNotifications(user.id), 'success'))
  })
  .post('/notifications/generate', authMiddleware, requirePermission('notifications.manage'), async (c) => {
    return c.json(ok(await generateOperationalNotifications(), 'Notifications generated'))
  })
  .patch('/notifications/:id/read', authMiddleware, async (c) => {
    const user = c.get('user')
    const id = notificationIdSchema.parse(c.req.param('id'))
    return c.json(ok(await markNotificationRead(id, 'staff', user.id), 'Notification read'))
  })
