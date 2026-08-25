import {
  and,
  count,
  desc,
  eq,
  gte,
  like,
  lte,
  or,
  sql,
  sum,
} from 'drizzle-orm'
import { getDb } from '../db/client.js'
import {
  checkins,
  members,
  membershipActions,
  payments,
} from '../db/schema.js'
import {
  addYears,
  formatDisplayDate,
  parseFlexibleDate,
  toSqlDate,
} from '../lib/dates.js'
import { toCheckinDto, toMemberDto } from '../lib/mappers.js'
import {
  generateMemberCode,
  normalizePackageName,
} from '../lib/member-code.js'
import type { DashboardStatsDto } from '../lib/types.js'
import { httpError } from '../middleware/error.js'

export async function listMembers(options: {
  q?: string
  status?: string
  page?: number
  pageSize?: number
  sort?: 'name' | 'joinDate' | 'status'
}) {
  const db = getDb()
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 10))
  const offset = (page - 1) * pageSize

  const filters = []
  if (options.q?.trim()) {
    const q = `%${options.q.trim()}%`
    filters.push(
      or(
        like(members.fullName, q),
        like(members.phone, q),
        like(members.memberCode, q),
        like(members.email, q),
      ),
    )
  }
  if (options.status && ['Active', 'Expired', 'Trial', 'Frozen'].includes(options.status)) {
    filters.push(
      eq(
        members.status,
        options.status as 'Active' | 'Expired' | 'Trial' | 'Frozen',
      ),
    )
  }

  const whereClause = filters.length ? and(...filters) : undefined
  const orderBy =
    options.sort === 'status'
      ? members.status
      : options.sort === 'joinDate'
        ? desc(members.joinDate)
        : members.fullName

  const rows = await db
    .select()
    .from(members)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset)

  const [totalRow] = await db
    .select({ total: count() })
    .from(members)
    .where(whereClause)

  return {
    items: rows.map((row) => toMemberDto(row)),
    total: totalRow?.total ?? 0,
    page,
    pageSize,
  }
}

export async function getMemberById(id: number) {
  const db = getDb()
  const [row] = await db.select().from(members).where(eq(members.id, id)).limit(1)
  if (!row) httpError(404, 'Member not found')
  return toMemberDto(row)
}

export async function createMember(input: {
  name: string
  phone?: string
  email?: string
  package?: string
  avatar?: string
}) {
  const db = getDb()
  const memberCode = await generateMemberCode()
  const packageName = normalizePackageName(input.package ?? 'Standard')
  const joinDate = new Date()
  const expireDate = addYears(joinDate, 1)

  const [result] = await db.insert(members).values({
    memberCode,
    fullName: input.name.trim(),
    phone: input.phone?.trim() || '+95 9 000 000 000',
    email: input.email?.trim() || 'member@email.com',
    packageName,
    status: 'Active',
    joinDate: toSqlDate(joinDate),
    expireDate: toSqlDate(expireDate),
    attendanceCount: 0,
    avatarUrl: input.avatar ?? '/images/img-1352436804.jpg',
  })

  const insertedId = Number(result.insertId)
  return getMemberById(insertedId)
}

export async function performMemberAction(
  memberId: number,
  action: 'freeze' | 'renew' | 'upgrade' | 'booking',
) {
  const db = getDb()
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)
  if (!member) httpError(404, 'Member not found')

  if (action === 'freeze') {
    await db
      .update(members)
      .set({ status: 'Frozen' })
      .where(eq(members.id, memberId))
  }

  if (action === 'renew') {
    const expireDate = addYears(parseFlexibleDate(formatDisplayDate(member.expireDate)), 1)
    await db
      .update(members)
      .set({ status: 'Active', expireDate: toSqlDate(expireDate) })
      .where(eq(members.id, memberId))
  }

  await db.insert(membershipActions).values({
    memberId,
    action,
    notes: null,
  })

  return getMemberById(memberId)
}

export async function getDashboardStats(): Promise<DashboardStatsDto> {
  const db = getDb()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [memberCounts] = await db
    .select({
      totalMembers: count(),
      activeMembers: sql<number>`SUM(CASE WHEN ${members.status} = 'Active' THEN 1 ELSE 0 END)`,
    })
    .from(members)

  const [checkinCount] = await db
    .select({ total: count() })
    .from(checkins)
    .where(sql`DATE(${checkins.checkedInAt}) = CURDATE()`)

  const [revenueRow] = await db
    .select({ total: sum(payments.amountMmk) })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'Paid'),
        gte(payments.paymentDate, monthStart),
        lte(payments.paymentDate, today),
      ),
    )

  return {
    totalMembers: Number(memberCounts?.totalMembers ?? 0),
    activeMembers: Number(memberCounts?.activeMembers ?? 0),
    todayCheckins: Number(checkinCount?.total ?? 0),
    monthlyRevenue: Number(revenueRow?.total ?? 0),
  }
}

export async function getRecentCheckins(limit = 5) {
  const db = getDb()
  const rows = await db
    .select({
      id: checkins.id,
      memberId: checkins.memberId,
      memberName: members.fullName,
      membershipType: checkins.membershipType,
      checkedInAt: checkins.checkedInAt,
    })
    .from(checkins)
    .innerJoin(members, eq(checkins.memberId, members.id))
    .orderBy(desc(checkins.checkedInAt))
    .limit(limit)

  return rows.map((row) => toCheckinDto(row))
}
