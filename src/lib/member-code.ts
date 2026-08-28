import { desc } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { members } from '../db/schema.js'

type DbClient = ReturnType<typeof getDb>
type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0]
export type DbExecutor = DbClient | DbTransaction

export async function generateMemberCode(dbOverride?: DbExecutor) {
  const db = dbOverride ?? getDb()
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
