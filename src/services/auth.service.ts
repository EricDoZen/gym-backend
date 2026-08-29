import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { and, eq, sql } from 'drizzle-orm'
import { getInsertId } from '../lib/insert-id.js'
import { getDb } from '../db/client.js'
import { staffUsers } from '../db/schema.js'
import { env } from '../env.js'
import { httpError } from '../middleware/error.js'
import type { StaffRole } from '../lib/types.js'
import { rolePermissions } from '../lib/permissions.js'

const encoder = new TextEncoder()

function toStaffDto(user: typeof staffUsers.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.fullName,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    permissions: rolePermissions(user.role),
  }
}

export async function login(email: string, password: string) {
  const db = getDb()
  const [user] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, email.trim().toLowerCase()))
    .limit(1)

  if (!user || !user.isActive) {
    httpError(401, 'Invalid email or password')
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    httpError(401, 'Invalid email or password')
  }

  await db
    .update(staffUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(staffUsers.id, user.id))

  const token = await new SignJWT({
    role: user.role,
    name: user.fullName,
    kind: 'staff',
    ver: user.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(encoder.encode(env.JWT_SECRET))

  return {
    id: user.id,
    token,
    role: user.role,
    name: user.fullName,
    email: user.email,
    permissions: rolePermissions(user.role),
  }
}

export async function getStaffById(id: number) {
  const db = getDb()
  const [user] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.id, id))
    .limit(1)
  return user ?? null
}

export async function listStaff() {
  const db = getDb()
  const rows = await db.select().from(staffUsers).orderBy(staffUsers.fullName)
  return rows.map(toStaffDto)
}

export async function createStaff(input: {
  email: string
  password: string
  role: StaffRole
  fullName: string
}) {
  const db = getDb()
  const email = input.email.trim().toLowerCase()
  const [existing] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(eq(staffUsers.email, email))
    .limit(1)
  if (existing) httpError(409, 'A staff account with this email already exists')

  const result = await db.insert(staffUsers).values({
    email,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    fullName: input.fullName.trim(),
    isActive: true,
    passwordChangedAt: new Date(),
  })
  const id = getInsertId(result)
  const created = await getStaffById(id)
  if (!created) httpError(500, 'Failed to create staff account')
  return toStaffDto(created)
}

async function ensureOwnerContinuity(targetId: number, nextRole?: StaffRole, nextActive?: boolean) {
  const db = getDb()
  const [target] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.id, targetId))
    .limit(1)
  if (!target) httpError(404, 'Staff account not found')

  const removesOwner =
    target.role === 'owner' && target.isActive &&
    ((nextRole !== undefined && nextRole !== 'owner') || nextActive === false)
  if (!removesOwner) return target

  const owners = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(and(eq(staffUsers.role, 'owner'), eq(staffUsers.isActive, true)))
  if (owners.length <= 1) {
    httpError(409, 'At least one active owner account is required')
  }
  return target
}

export async function updateStaff(
  id: number,
  input: {
    email?: string
    role?: StaffRole
    fullName?: string
    isActive?: boolean
  },
) {
  const db = getDb()
  await ensureOwnerContinuity(id, input.role, input.isActive)

  const email = input.email?.trim().toLowerCase()
  if (email) {
    const [match] = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(eq(staffUsers.email, email))
      .limit(1)
    if (match && match.id !== id) {
      httpError(409, 'A staff account with this email already exists')
    }
  }

  await db
    .update(staffUsers)
    .set({
      ...(email ? { email } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.fullName ? { fullName: input.fullName.trim() } : {}),
      ...(typeof input.isActive === 'boolean'
        ? {
            isActive: input.isActive,
            tokenVersion: sql`${staffUsers.tokenVersion} + 1`,
          }
        : {}),
    })
    .where(eq(staffUsers.id, id))

  const updated = await getStaffById(id)
  if (!updated) httpError(404, 'Staff account not found')
  return toStaffDto(updated)
}

export async function changePassword(
  id: number,
  currentPassword: string,
  newPassword: string,
) {
  const db = getDb()
  const user = await getStaffById(id)
  if (!user || !user.isActive) httpError(404, 'Staff account not found')

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) httpError(401, 'Current password is incorrect')

  await db
    .update(staffUsers)
    .set({
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: sql`${staffUsers.tokenVersion} + 1`,
    })
    .where(eq(staffUsers.id, id))
}

export async function resetStaffPassword(id: number, newPassword: string) {
  const db = getDb()
  const user = await getStaffById(id)
  if (!user) httpError(404, 'Staff account not found')

  await db
    .update(staffUsers)
    .set({
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: sql`${staffUsers.tokenVersion} + 1`,
    })
    .where(eq(staffUsers.id, id))
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}
