import { eq } from 'drizzle-orm'
import { getInsertId } from '../lib/insert-id.js'
import { getDb } from '../db/client.js'
import { trialRegistrations } from '../db/schema.js'
import { parseFlexibleDate, toSqlDate } from '../lib/dates.js'
import { normalizePackageName, packageCodeFromName } from '../lib/member-code.js'
import { httpError } from '../middleware/error.js'

export async function registerTrial(input: {
  fullName: string
  phone: string
  email?: string
  package: string
  startDate?: string
}) {
  const db = getDb()
  const packageName = normalizePackageName(input.package)
  const preferredStartDate = input.startDate
    ? toSqlDate(parseFlexibleDate(input.startDate))
    : null

  const result = await db.insert(trialRegistrations).values({
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    packageCode: packageCodeFromName(packageName),
    preferredStartDate,
  })

  const id = getInsertId(result)
  const [row] = await db
    .select()
    .from(trialRegistrations)
    .where(eq(trialRegistrations.id, id))
    .limit(1)

  if (!row) httpError(500, 'Failed to save trial registration')

  return {
    id: String(row.id),
    fullName: row.fullName,
    phone: row.phone,
    email: row.email ?? '',
    package: packageName,
    startDate: input.startDate ?? '',
  }
}

export async function getTrialById(id: number) {
  const db = getDb()
  const [row] = await db
    .select()
    .from(trialRegistrations)
    .where(eq(trialRegistrations.id, id))
    .limit(1)
  if (!row) httpError(404, 'Trial registration not found')
  return row
}
