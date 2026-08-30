import 'dotenv/config'
import { and, eq, inArray, like } from 'drizzle-orm'
import { getDb, closeDb } from '../src/db/client.js'
import { env } from '../src/env.js'
import {
  assertNonProductionDatabase,
  databaseNameFromSettings,
} from '../src/lib/database-safety.js'
import {
  auditLogs,
  bookings,
  checkins,
  contactMessages,
  memberAccounts,
  memberNotes,
  memberRequests,
  memberTrainerAssignments,
  members,
  membershipActions,
  notifications,
  paymentAdjustments,
  payments,
  progressEntries,
  trialRegistrations,
  workoutPlans,
} from '../src/db/schema.js'

async function main() {
  const apply = process.argv.includes('--apply')
  if (apply) {
    const database = databaseNameFromSettings(env.DATABASE_URL, env.DB_NAME)
    assertNonProductionDatabase(database, 'E2E cleanup')
  }
  const db = getDb()
  const testMembers = await db
    .select({ id: members.id, name: members.fullName, email: members.email })
    .from(members)
    .where(and(like(members.fullName, 'E2E %'), like(members.email, '%@e2e.local')))
  const testTrials = await db
    .select({ id: trialRegistrations.id, email: trialRegistrations.email })
    .from(trialRegistrations)
    .where(and(like(trialRegistrations.fullName, 'E2E %'), like(trialRegistrations.email, '%@e2e.local')))
  const contactRows = await db
    .select({ id: contactMessages.id, payload: contactMessages.payload })
    .from(contactMessages)
  const testContacts = contactRows.filter((row) => {
    const payload = row.payload as Record<string, unknown>
    return (
      typeof payload?.name === 'string' &&
      payload.name.startsWith('E2E Contact ') &&
      typeof payload?.email === 'string' &&
      payload.email.endsWith('@e2e.local')
    )
  })

  console.log(
    `E2E cleanup candidates: members=${testMembers.length}, trials=${testTrials.length}, contacts=${testContacts.length}`,
  )
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to remove strictly matched E2E test records.')
    return
  }

  for (const member of testMembers) {
    const id = member.id
    await db.delete(memberTrainerAssignments).where(eq(memberTrainerAssignments.memberId, id))
    await db.delete(bookings).where(eq(bookings.memberId, id))
    await db.delete(progressEntries).where(eq(progressEntries.memberId, id))
    await db.delete(workoutPlans).where(eq(workoutPlans.memberId, id))
    await db.delete(memberRequests).where(eq(memberRequests.memberId, id))
    await db.delete(membershipActions).where(eq(membershipActions.memberId, id))
    await db.delete(memberNotes).where(eq(memberNotes.memberId, id))
    await db.delete(notifications).where(and(eq(notifications.recipientType, 'member'), eq(notifications.recipientId, id)))
    await db.delete(checkins).where(eq(checkins.memberId, id))
    const memberPayments = await db.select({ id: payments.id }).from(payments).where(eq(payments.memberId, id))
    const paymentIds = memberPayments.map((row) => row.id)
    if (paymentIds.length) await db.delete(paymentAdjustments).where(inArray(paymentAdjustments.paymentId, paymentIds))
    await db.delete(payments).where(eq(payments.memberId, id))
    await db.delete(memberAccounts).where(eq(memberAccounts.memberId, id))
    await db.delete(auditLogs).where(eq(auditLogs.actorMemberId, id))
    await db.delete(auditLogs).where(
      and(eq(auditLogs.entityType, 'member'), eq(auditLogs.entityId, String(id))),
    )
    await db.delete(members).where(eq(members.id, id))
  }

  for (const trial of testTrials) {
    await db.delete(trialRegistrations).where(eq(trialRegistrations.id, trial.id))
  }

  for (const contact of testContacts) {
    await db.delete(contactMessages).where(eq(contactMessages.id, contact.id))
  }

  console.log(
    `Removed E2E records: members=${testMembers.length}, trials=${testTrials.length}, contacts=${testContacts.length}`,
  )
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeDb())
