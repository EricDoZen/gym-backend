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
  membershipPackages,
  payments,
} from '../db/schema.js'
import {
  addDays,
  formatDisplayDate,
  parseFlexibleDate,
  toSqlDate,
} from '../lib/dates.js'
import { toCheckinDto, toMemberDto } from '../lib/mappers.js'
import {
  generateMemberCode,
  normalizePackageName,
  packageCodeFromName,
  type DbExecutor,
} from '../lib/member-code.js'
import type { DashboardStatsDto } from '../lib/types.js'
import { getInsertId } from '../lib/insert-id.js'
import { httpError } from '../middleware/error.js'
import { normalizePhone } from '../lib/phone.js'

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export async function listMembers(options: {
  q?: string
  status?: 'Active' | 'Expired' | 'Trial' | 'Frozen'
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
  if (options.status) {
    filters.push(eq(members.status, options.status))
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

  const today = startOfToday()
  return {
    items: rows.map((row) =>
      toMemberDto({
        ...row,
        status:
          row.status === 'Active' && new Date(row.expireDate) < today
            ? 'Expired'
            : row.status,
      }),
    ),
    total: totalRow?.total ?? 0,
    page,
    pageSize,
  }
}

type CreateMemberInput = {
  name: string
  phone: string
  email?: string
  package?: string
  avatar?: string
}

async function getMemberByIdFromDb(db: DbExecutor, id: number) {
  const [row] = await db.select().from(members).where(eq(members.id, id)).limit(1)
  if (!row) httpError(404, 'Member not found')

  const effectiveStatus =
    row.status === 'Active' && new Date(row.expireDate) < startOfToday()
      ? 'Expired'
      : row.status
  return toMemberDto({ ...row, status: effectiveStatus })
}

export async function getMemberById(id: number) {
  return getMemberByIdFromDb(getDb(), id)
}

function duplicateConstraintName(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (!/duplicate/i.test(message)) return null
  if (/uk_member_phone/i.test(message)) return 'phone'
  if (/uk_member_email/i.test(message)) return 'email'
  if (/uk_member_code/i.test(message)) return 'code'
  return 'unknown'
}

export async function createMemberInDb(db: DbExecutor, input: CreateMemberInput) {
  const packageName = normalizePackageName(input.package ?? 'Standard')
  const [membershipPackage] = await db
    .select()
    .from(membershipPackages)
    .where(eq(membershipPackages.code, packageCodeFromName(packageName)))
    .limit(1)
  if (!membershipPackage || !membershipPackage.isActive) {
    httpError(400, 'Invalid or inactive membership package')
  }

  const joinDate = new Date()
  const expireDate = addDays(joinDate, membershipPackage.durationDays)
  const phone = normalizePhone(input.phone)
  const email = input.email?.trim().toLowerCase() || null

  const [phoneMatch] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.phone, phone))
    .limit(1)
  if (phoneMatch) httpError(409, 'A member with this phone number already exists')

  if (email) {
    const [emailMatch] = await db
      .select({ id: members.id })
      .from(members)
      .where(sql`LOWER(${members.email}) = ${email}`)
      .limit(1)
    if (emailMatch) httpError(409, 'A member with this email already exists')
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const memberCode = await generateMemberCode(db)
    try {
      const result = await db.insert(members).values({
        memberCode,
        fullName: input.name.trim(),
        phone,
        email,
        packageId: membershipPackage.id,
        packageName,
        status: 'Active',
        joinDate: toSqlDate(joinDate),
        expireDate: toSqlDate(expireDate),
        attendanceCount: 0,
        avatarUrl: input.avatar ?? '/images/img-1352436804.jpg',
      })
      const insertedId = getInsertId(result)
      return getMemberByIdFromDb(db, insertedId)
    } catch (error) {
      const duplicate = duplicateConstraintName(error)
      if (duplicate === 'phone') {
        httpError(409, 'A member with this phone number already exists')
      }
      if (duplicate === 'email') {
        httpError(409, 'A member with this email already exists')
      }
      if (duplicate !== 'code' || attempt === 2) throw error
    }
  }

  httpError(500, 'Failed to allocate a unique member code')
}

export async function createMember(input: CreateMemberInput) {
  return createMemberInDb(getDb(), input)
}

export async function performMemberActionInDb(
  db: DbExecutor,
  memberId: number,
  action: 'freeze' | 'renew' | 'upgrade' | 'booking',
  targetPackage?: string,
) {
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)
  if (!member) httpError(404, 'Member not found')

  let notes: string | null = null

  if (action === 'freeze' && member.status !== 'Frozen') {
    await db
      .update(members)
      .set({ status: 'Frozen' })
      .where(eq(members.id, memberId))
  }

  if (action === 'renew') {
    const [membershipPackage] = await db
      .select()
      .from(membershipPackages)
      .where(eq(membershipPackages.code, packageCodeFromName(member.packageName)))
      .limit(1)
    if (!membershipPackage || !membershipPackage.isActive) {
      httpError(409, 'Membership package is no longer available')
    }
    const currentExpiry = parseFlexibleDate(formatDisplayDate(member.expireDate))
    const today = startOfToday()
    const baseDate = currentExpiry > today ? currentExpiry : today
    const expireDate = addDays(baseDate, membershipPackage.durationDays)
    await db
      .update(members)
      .set({
        status: 'Active',
        packageId: membershipPackage.id,
        expireDate: toSqlDate(expireDate),
      })
      .where(eq(members.id, memberId))
  }

  if (action === 'upgrade') {
    if (!targetPackage) httpError(400, 'Package is required for upgrade')
    const packageName = normalizePackageName(targetPackage)
    const [membershipPackage] = await db
      .select()
      .from(membershipPackages)
      .where(eq(membershipPackages.code, packageCodeFromName(packageName)))
      .limit(1)
    if (!membershipPackage || !membershipPackage.isActive) {
      httpError(400, 'Invalid or inactive membership package')
    }
    if (packageName === member.packageName) {
      httpError(409, 'Member is already on this package')
    }
    await db
      .update(members)
      .set({ packageId: membershipPackage.id, packageName })
      .where(eq(members.id, memberId))
    notes = `package=${packageName}`
  }

  await db.insert(membershipActions).values({
    memberId,
    action,
    notes,
  })

  return getMemberByIdFromDb(db, memberId)
}

export async function performMemberAction(
  memberId: number,
  action: 'freeze' | 'renew' | 'upgrade' | 'booking',
  targetPackage?: string,
) {
  return performMemberActionInDb(getDb(), memberId, action, targetPackage)
}

export async function getDashboardStats(): Promise<DashboardStatsDto> {
  const db = getDb()
  const today = startOfToday()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [memberCounts] = await db
    .select({
      totalMembers: count(),
      activeMembers: sql<number>`SUM(CASE WHEN ${members.status} = 'Active' AND ${members.expireDate} >= CURDATE() THEN 1 ELSE 0 END)`,
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
