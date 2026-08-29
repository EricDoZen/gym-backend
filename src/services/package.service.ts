import { asc, eq, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import {
  membershipPackagePriceHistory,
  membershipPackages,
} from '../db/schema.js'
import { parseFlexibleDate, toSqlDate } from '../lib/dates.js'
import { getInsertId } from '../lib/insert-id.js'
import type { DbExecutor } from '../lib/member-code.js'
import { httpError } from '../middleware/error.js'

export type MembershipPackageInput = {
  code: string
  name: string
  description?: string | null
  priceMmk: number
  durationDays: number
  freezeAllowanceDays?: number
  sessionLimit?: number | null
  renewalWindowDays?: number
  allowUpgrade?: boolean
  allowDowngrade?: boolean
  effectiveFrom?: string | null
  sortOrder?: number
  isActive?: boolean
}

export type MembershipPackageUpdate = Partial<Omit<MembershipPackageInput, 'code'>>

export function normalizePackageCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function packageDto(row: typeof membershipPackages.$inferSelect) {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    priceMmk: Number(row.priceMmk),
    durationDays: row.durationDays,
    freezeAllowanceDays: row.freezeAllowanceDays,
    sessionLimit: row.sessionLimit,
    renewalWindowDays: row.renewalWindowDays,
    allowUpgrade: row.allowUpgrade,
    allowDowngrade: row.allowDowngrade,
    effectiveFrom: row.effectiveFrom == null ? null : String(row.effectiveFrom),
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function queryDirectPackage(db: DbExecutor, value: string) {
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  const code = normalizePackageCode(trimmed)
  const [row] = await db
    .select()
    .from(membershipPackages)
    .where(
      or(
        eq(membershipPackages.code, lower),
        eq(membershipPackages.code, code),
        sql`LOWER(${membershipPackages.name}) = ${lower}`,
      ),
    )
    .limit(1)
  return row
}

export async function resolveMembershipPackage(
  db: DbExecutor,
  value: string | number,
  options: { activeOnly?: boolean } = {},
) {
  let row: typeof membershipPackages.$inferSelect | undefined
  if (typeof value === 'number') {
    ;[row] = await db
      .select()
      .from(membershipPackages)
      .where(eq(membershipPackages.id, value))
      .limit(1)
  } else {
    row = await queryDirectPackage(db, value)
    if (!row) {
      const legacy = value.trim().toLowerCase()
      const legacyCode = legacy.includes('premium') || legacy.includes('aureate')
        ? 'premium'
        : legacy.includes('standard')
          ? 'standard'
          : legacy.includes('basic')
            ? 'basic'
            : null
      if (legacyCode) row = await queryDirectPackage(db, legacyCode)
    }
  }

  if (!row) httpError(400, 'Invalid membership package')
  if (options.activeOnly !== false && !row.isActive) {
    httpError(409, 'Membership package is not available')
  }
  return row
}

export async function listPublicPackages() {
  const db = getDb()
  const rows = await db
    .select()
    .from(membershipPackages)
    .where(eq(membershipPackages.isActive, true))
    .orderBy(asc(membershipPackages.sortOrder), asc(membershipPackages.name))
  return rows.map(packageDto)
}

export async function listAdminPackages() {
  const db = getDb()
  const rows = await db
    .select()
    .from(membershipPackages)
    .orderBy(asc(membershipPackages.sortOrder), asc(membershipPackages.name))
  return rows.map(packageDto)
}

export async function getPackagePriceHistory(packageId: number) {
  const db = getDb()
  const rows = await db
    .select()
    .from(membershipPackagePriceHistory)
    .where(eq(membershipPackagePriceHistory.packageId, packageId))
    .orderBy(asc(membershipPackagePriceHistory.effectiveFrom), asc(membershipPackagePriceHistory.id))
  return rows.map((row) => ({
    id: String(row.id),
    packageId: String(row.packageId),
    priceMmk: Number(row.priceMmk),
    effectiveFrom: String(row.effectiveFrom),
    createdByStaffId: row.createdByStaffId == null ? null : String(row.createdByStaffId),
    createdAt: row.createdAt,
  }))
}

function effectiveDate(value?: string | null) {
  return value ? toSqlDate(parseFlexibleDate(value)) : toSqlDate(new Date())
}

export async function createMembershipPackage(input: MembershipPackageInput, staffId: number) {
  const db = getDb()
  const code = normalizePackageCode(input.code)
  if (!code) httpError(400, 'Package code is required')

  const [existing] = await db
    .select({ id: membershipPackages.id })
    .from(membershipPackages)
    .where(or(eq(membershipPackages.code, code), sql`LOWER(${membershipPackages.name}) = ${input.name.trim().toLowerCase()}`))
    .limit(1)
  if (existing) httpError(409, 'Package code or name already exists')

  let id = 0
  await db.transaction(async (tx) => {
    const result = await tx.insert(membershipPackages).values({
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      priceMmk: input.priceMmk,
      durationDays: input.durationDays,
      freezeAllowanceDays: input.freezeAllowanceDays ?? 0,
      sessionLimit: input.sessionLimit ?? null,
      renewalWindowDays: input.renewalWindowDays ?? 30,
      allowUpgrade: input.allowUpgrade ?? true,
      allowDowngrade: input.allowDowngrade ?? true,
      effectiveFrom: effectiveDate(input.effectiveFrom),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    id = getInsertId(result)
    await tx.insert(membershipPackagePriceHistory).values({
      packageId: id,
      priceMmk: input.priceMmk,
      effectiveFrom: effectiveDate(input.effectiveFrom),
      createdByStaffId: staffId,
    })
  })

  return packageDto(await resolveMembershipPackage(db, id, { activeOnly: false }))
}

export async function updateMembershipPackage(
  id: number,
  input: MembershipPackageUpdate,
  staffId: number,
) {
  const db = getDb()
  const current = await resolveMembershipPackage(db, id, { activeOnly: false })

  if (input.name && input.name.trim().toLowerCase() !== current.name.toLowerCase()) {
    const [duplicate] = await db
      .select({ id: membershipPackages.id })
      .from(membershipPackages)
      .where(sql`LOWER(${membershipPackages.name}) = ${input.name.trim().toLowerCase()}`)
      .limit(1)
    if (duplicate && duplicate.id !== id) httpError(409, 'Package name already exists')
  }

  await db.transaction(async (tx) => {
    const nextEffectiveFrom = input.effectiveFrom === undefined
      ? current.effectiveFrom
      : effectiveDate(input.effectiveFrom)
    await tx
      .update(membershipPackages)
      .set({
        name: input.name?.trim(),
        description: input.description === undefined ? undefined : input.description?.trim() || null,
        priceMmk: input.priceMmk,
        durationDays: input.durationDays,
        freezeAllowanceDays: input.freezeAllowanceDays,
        sessionLimit: input.sessionLimit,
        renewalWindowDays: input.renewalWindowDays,
        allowUpgrade: input.allowUpgrade,
        allowDowngrade: input.allowDowngrade,
        effectiveFrom: nextEffectiveFrom,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      })
      .where(eq(membershipPackages.id, id))

    if (input.priceMmk !== undefined && Number(input.priceMmk) !== Number(current.priceMmk)) {
      await tx.insert(membershipPackagePriceHistory).values({
        packageId: id,
        priceMmk: input.priceMmk,
        effectiveFrom: effectiveDate(input.effectiveFrom),
        createdByStaffId: staffId,
      })
    }
  })

  return packageDto(await resolveMembershipPackage(db, id, { activeOnly: false }))
}
