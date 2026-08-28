import { and, eq, gte } from 'drizzle-orm'
import { getInsertId } from '../lib/insert-id.js'
import { getDb } from '../db/client.js'
import { checkins, members } from '../db/schema.js'
import { toCheckinDto } from '../lib/mappers.js'
import { httpError } from '../middleware/error.js'
import { getMemberById } from './member.service.js'

export async function checkInMember(memberId: number) {
  const db = getDb()
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)
  if (!member) httpError(404, 'Member not found')
  if (member.status !== 'Active') {
    httpError(409, 'Membership is not active')
  }

  const expiry = member.expireDate instanceof Date ? member.expireDate : new Date(member.expireDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!Number.isNaN(expiry.getTime()) && expiry < today) {
    httpError(409, 'Membership has expired')
  }

  const duplicateCutoff = new Date(Date.now() - 5 * 60 * 1000)
  const [recentDuplicate] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .where(and(eq(checkins.memberId, memberId), gte(checkins.checkedInAt, duplicateCutoff)))
    .limit(1)
  if (recentDuplicate) {
    httpError(409, 'Member was already checked in recently')
  }

  const result = await db.insert(checkins).values({
    memberId,
    membershipType: member.packageName,
  })

  await db
    .update(members)
    .set({ attendanceCount: member.attendanceCount + 1 })
    .where(eq(members.id, memberId))

  const insertedId = getInsertId(result)
  const [row] = await db
    .select({
      id: checkins.id,
      memberId: checkins.memberId,
      memberName: members.fullName,
      membershipType: checkins.membershipType,
      checkedInAt: checkins.checkedInAt,
    })
    .from(checkins)
    .innerJoin(members, eq(checkins.memberId, members.id))
    .where(eq(checkins.id, insertedId))
    .limit(1)

  if (!row) httpError(500, 'Failed to create check-in')
  await getMemberById(memberId)
  return toCheckinDto(row)
}
