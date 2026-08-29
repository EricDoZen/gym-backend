import { and, desc, eq, lte, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { bookings, memberRequests, members, notifications, trainers } from '../db/schema.js'
import { getInsertId } from '../lib/insert-id.js'
import { httpError } from '../middleware/error.js'

function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : []
}

export async function enqueueNotification(input: {
  recipientType: 'staff' | 'member'
  recipientId?: number | null
  eventType: string
  title: string
  message: string
  channel?: 'internal' | 'email' | 'sms' | 'telegram' | 'viber'
  scheduledAt?: Date
  dedupeKey?: string | null
}) {
  const db = getDb()
  try {
    const result = await db.insert(notifications).values({
      recipientType: input.recipientType,
      recipientId: input.recipientId ?? null,
      eventType: input.eventType,
      title: input.title,
      message: input.message,
      channel: input.channel ?? 'internal',
      status: 'Pending',
      scheduledAt: input.scheduledAt ?? new Date(),
      dedupeKey: input.dedupeKey ?? null,
    })
    return String(getInsertId(result))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/uk_notifications_dedupe|dedupe|duplicate/i.test(message)) return null
    throw error
  }
}

function toDto(row: typeof notifications.$inferSelect) {
  return {
    id: String(row.id),
    recipientType: row.recipientType,
    recipientId: row.recipientId == null ? null : String(row.recipientId),
    eventType: row.eventType,
    title: row.title,
    message: row.message,
    channel: row.channel,
    status: row.status,
    scheduledAt: row.scheduledAt,
    sentAt: row.sentAt,
    readAt: row.readAt,
    attempts: row.attempts,
    failureReason: row.failureReason ?? '',
    createdAt: row.createdAt,
  }
}

export async function listStaffNotifications(staffId: number, limit = 100) {
  const db = getDb()
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientType, 'staff'),
        or(eq(notifications.recipientId, staffId), sql`${notifications.recipientId} IS NULL`),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
  return rows.map(toDto)
}

export async function listMemberNotifications(memberId: number, limit = 100) {
  const db = getDb()
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientType, 'member'), eq(notifications.recipientId, memberId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
  return rows.map(toDto)
}

export async function markNotificationRead(id: number, recipientType: 'staff' | 'member', recipientId: number) {
  const db = getDb()
  const filters = recipientType === 'staff'
    ? and(
        eq(notifications.id, id),
        eq(notifications.recipientType, 'staff'),
        or(eq(notifications.recipientId, recipientId), sql`${notifications.recipientId} IS NULL`),
      )
    : and(
        eq(notifications.id, id),
        eq(notifications.recipientType, 'member'),
        eq(notifications.recipientId, recipientId),
      )
  const result = await db
    .update(notifications)
    .set({ status: 'Read', readAt: new Date() })
    .where(filters)
  if (Number((result as { rowsAffected?: number }).rowsAffected ?? 0) !== 1) {
    httpError(404, 'Notification not found')
  }
  return true
}

export async function generateOperationalNotifications() {
  const db = getDb()
  const now = new Date()
  const created: Array<string> = []

  const expiringResult = await db.execute(sql`
    SELECT id, member_code, full_name, expire_date, DATEDIFF(expire_date, CURDATE()) AS days_left
    FROM members
    WHERE status='Active' AND DATEDIFF(expire_date, CURDATE()) IN (1,3,7)
  `)
  for (const row of resultRows(expiringResult)) {
    const memberId = Number(row.id)
    const days = Number(row.days_left)
    const dateKey = String(row.expire_date).slice(0, 10)
    const id = await enqueueNotification({
      recipientType: 'member',
      recipientId: memberId,
      eventType: 'membership.expiring',
      title: `Membership expires in ${days} day${days === 1 ? '' : 's'}`,
      message: `Your membership (${String(row.member_code)}) expires on ${dateKey}. Submit a renewal request from the member portal if you want to continue.`,
      dedupeKey: `member-expiry:${memberId}:${dateKey}:${days}`,
    })
    if (id) created.push(id)
  }

  const upcomingEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const upcoming = await db
    .select({
      id: bookings.id,
      memberId: bookings.memberId,
      scheduledAt: bookings.scheduledAt,
      sessionType: bookings.sessionType,
      trainerName: trainers.fullName,
    })
    .from(bookings)
    .leftJoin(trainers, eq(bookings.trainerId, trainers.id))
    .where(
      and(
        eq(bookings.status, 'Booked'),
        sql`${bookings.scheduledAt} >= ${now}`,
        lte(bookings.scheduledAt, upcomingEnd),
      ),
    )
  for (const row of upcoming) {
    const id = await enqueueNotification({
      recipientType: 'member',
      recipientId: row.memberId,
      eventType: 'booking.reminder',
      title: 'Upcoming training session',
      message: `${row.sessionType} with ${row.trainerName ?? 'Gym Team'} is scheduled for ${row.scheduledAt.toISOString()}.`,
      dedupeKey: `booking-reminder:${row.id}:${row.scheduledAt.toISOString()}`,
    })
    if (id) created.push(id)
  }

  const pending = await db
    .select({ id: memberRequests.id, memberId: memberRequests.memberId, requestType: memberRequests.requestType })
    .from(memberRequests)
    .where(eq(memberRequests.status, 'Pending'))
  for (const row of pending) {
    const id = await enqueueNotification({
      recipientType: 'staff',
      recipientId: null,
      eventType: 'member_request.pending',
      title: 'Member request awaiting review',
      message: `Member ${row.memberId} submitted a ${row.requestType} request.`,
      dedupeKey: `pending-request:${row.id}`,
    })
    if (id) created.push(id)
  }

  return { created: created.length, ids: created }
}
