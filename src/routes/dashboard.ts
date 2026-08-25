import { Hono } from 'hono'
import type { AuthContext } from '../middleware/auth.js'
import { authMiddleware } from '../middleware/auth.js'
import { ok } from '../lib/response.js'
import {
  getDashboardStats,
  getRecentCheckins,
} from '../services/member.service.js'

export const dashboardRoutes = new Hono<AuthContext>().get(
  '/',
  authMiddleware,
  async (c) => {
    const [stats, recentCheckins] = await Promise.all([
      getDashboardStats(),
      getRecentCheckins(5),
    ])
    return c.json(ok({ stats, recentCheckins }, 'success'))
  },
)
