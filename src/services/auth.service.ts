import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { staffUsers } from '../db/schema.js'
import { env } from '../env.js'
import { httpError } from '../middleware/error.js'

const encoder = new TextEncoder()

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

  const valid = await bcrypt.compare(password, user!.passwordHash)
  if (!valid) {
    httpError(401, 'Invalid email or password')
  }

  const token = await new SignJWT({
    role: user!.role,
    name: user!.fullName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user!.id))
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(encoder.encode(env.JWT_SECRET))

  return {
    token,
    role: user!.role,
    name: user!.fullName,
    email: user!.email,
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

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}
