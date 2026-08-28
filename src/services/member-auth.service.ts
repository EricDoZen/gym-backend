import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { memberAccounts, members } from '../db/schema.js'
import { env } from '../env.js'
import { normalizePhone } from '../lib/phone.js'
import { getMemberById } from './member.service.js'
import { httpError } from '../middleware/error.js'

const encoder = new TextEncoder()

export async function activateMemberAccount(
  memberCode: string,
  phone: string,
  password: string,
) {
  const db = getDb()
  const normalizedPhone = normalizePhone(phone)
  const [member] = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.memberCode, memberCode.trim().toUpperCase()),
        eq(members.phone, normalizedPhone),
      ),
    )
    .limit(1)

  if (!member) {
    httpError(400, 'Member code and phone number do not match')
  }

  const [existing] = await db
    .select()
    .from(memberAccounts)
    .where(eq(memberAccounts.memberId, member.id))
    .limit(1)

  if (existing?.isActive) {
    httpError(409, 'Member portal account is already activated')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  if (existing) {
    await db
      .update(memberAccounts)
      .set({
        passwordHash,
        isActive: true,
        activatedAt: new Date(),
        passwordChangedAt: new Date(),
      })
      .where(eq(memberAccounts.id, existing.id))
  } else {
    await db.insert(memberAccounts).values({
      memberId: member.id,
      passwordHash,
      isActive: true,
      passwordChangedAt: new Date(),
    })
  }

  return getMemberById(member.id)
}

export async function memberLogin(memberCode: string, password: string) {
  const db = getDb()
  const [row] = await db
    .select({
      memberId: members.id,
      memberCode: members.memberCode,
      memberName: members.fullName,
      accountId: memberAccounts.id,
      passwordHash: memberAccounts.passwordHash,
      accountActive: memberAccounts.isActive,
    })
    .from(memberAccounts)
    .innerJoin(members, eq(memberAccounts.memberId, members.id))
    .where(eq(members.memberCode, memberCode.trim().toUpperCase()))
    .limit(1)

  if (!row || !row.accountActive) {
    httpError(401, 'Invalid member code or password')
  }

  if (!(await bcrypt.compare(password, row.passwordHash))) {
    httpError(401, 'Invalid member code or password')
  }

  await db
    .update(memberAccounts)
    .set({ lastLoginAt: new Date() })
    .where(eq(memberAccounts.id, row.accountId))

  const token = await new SignJWT({
    kind: 'member',
    memberCode: row.memberCode,
    name: row.memberName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(row.memberId))
    .setIssuedAt()
    .setExpirationTime(env.MEMBER_JWT_EXPIRES_IN)
    .sign(encoder.encode(env.JWT_SECRET))

  return {
    token,
    member: await getMemberById(row.memberId),
  }
}

export async function getActiveMemberAccount(memberId: number) {
  const db = getDb()
  const [row] = await db
    .select()
    .from(memberAccounts)
    .where(
      and(
        eq(memberAccounts.memberId, memberId),
        eq(memberAccounts.isActive, true),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function changeMemberPassword(
  memberId: number,
  currentPassword: string,
  newPassword: string,
) {
  const db = getDb()
  const account = await getActiveMemberAccount(memberId)
  if (!account) httpError(404, 'Member portal account not found')

  if (!(await bcrypt.compare(currentPassword, account.passwordHash))) {
    httpError(401, 'Current password is incorrect')
  }

  await db
    .update(memberAccounts)
    .set({
      passwordHash: await bcrypt.hash(newPassword, 12),
      passwordChangedAt: new Date(),
    })
    .where(eq(memberAccounts.id, account.id))
}
