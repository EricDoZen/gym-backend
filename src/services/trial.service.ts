import { and, desc, eq, isNull, like, or } from 'drizzle-orm'
import { getInsertId } from '../lib/insert-id.js'
import { getDb } from '../db/client.js'
import { trialRegistrations } from '../db/schema.js'
import { parseFlexibleDate, toSqlDate } from '../lib/dates.js'
import { normalizePackageName, packageCodeFromName } from '../lib/member-code.js'
import { httpError } from '../middleware/error.js'
import { createMemberInDb } from './member.service.js'

function toTrialDto(row: typeof trialRegistrations.$inferSelect) {
  return {
    id: String(row.id),
    fullName: row.fullName,
    phone: row.phone,
    email: row.email ?? '',
    package: row.packageCode,
    startDate: row.preferredStartDate ? String(row.preferredStartDate) : '',
  }
}

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
    email: input.email?.trim().toLowerCase() || null,
    packageCode: packageCodeFromName(packageName),
    preferredStartDate,
  })

  const id = getInsertId(result)
  const row = await getTrialById(id)
  return toTrialDto(row)
}

export async function listTrials(query?: string) {
  const db = getDb()
  const q = query?.trim()
  const rows = await db
    .select()
    .from(trialRegistrations)
    .where(
      q
        ? or(
            like(trialRegistrations.fullName, `%${q}%`),
            like(trialRegistrations.phone, `%${q}%`),
            like(trialRegistrations.email, `%${q}%`),
          )
        : isNull(trialRegistrations.convertedMemberId),
    )
    .orderBy(desc(trialRegistrations.createdAt))
    .limit(50)

  return rows
    .filter((row) => row.convertedMemberId == null)
    .map((row) => toTrialDto(row))
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

export async function convertTrialToMember(
  id: number,
  overrides: {
    name?: string
    phone?: string
    email?: string
    package?: string
    avatar?: string
  },
) {
  const db = getDb()

  return db.transaction(async (tx) => {
    const [trial] = await tx
      .select()
      .from(trialRegistrations)
      .where(eq(trialRegistrations.id, id))
      .limit(1)

    if (!trial) httpError(404, 'Trial registration not found')
    if (trial.convertedMemberId) {
      httpError(409, 'Trial registration has already been converted')
    }

    const member = await createMemberInDb(tx, {
      name: overrides.name ?? trial.fullName,
      phone: overrides.phone ?? trial.phone,
      email: overrides.email ?? trial.email ?? undefined,
      package: overrides.package ?? trial.packageCode,
      avatar: overrides.avatar,
    })

    const updateResult = await tx
      .update(trialRegistrations)
      .set({ convertedMemberId: Number(member.id) })
      .where(
        and(
          eq(trialRegistrations.id, id),
          isNull(trialRegistrations.convertedMemberId),
        ),
      )

    const affectedRows = Number(
      (updateResult as { rowsAffected?: number }).rowsAffected ?? 0,
    )
    if (affectedRows !== 1) {
      httpError(409, 'Trial registration has already been converted')
    }

    return member
  })
}
