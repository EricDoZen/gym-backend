import { desc, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { members } from '../db/schema.js'

export async function generateMemberCode() {
  const db = getDb()
  const [latest] = await db
    .select({ memberCode: members.memberCode })
    .from(members)
    .orderBy(desc(members.id))
    .limit(1)

  const current = latest?.memberCode.match(/EM-(\d+)/)?.[1]
  const nextNumber = current ? Number(current) + 1 : 2401
  return `EM-${String(nextNumber).padStart(4, '0')}`
}

export function normalizePackageName(input: string) {
  const normalized = input.trim().toLowerCase()
  if (normalized.includes('premium') || normalized.includes('aureate')) {
    return 'Premium'
  }
  if (normalized.includes('standard')) return 'Standard'
  if (normalized.includes('basic')) return 'Basic'
  return input.trim() || 'Standard'
}

export function packageCodeFromName(name: string) {
  return normalizePackageName(name).toLowerCase()
}
