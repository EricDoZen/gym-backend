import 'dotenv/config'
import { and, eq, inArray, like, or } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/client.js'
import {
  bookings,
  checkins,
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
  trainerTimeOff,
  trainerWeeklyAvailability,
  trainers,
  trialRegistrations,
  workoutPlans,
} from '../src/db/schema.js'
import { env } from '../src/env.js'
import { PRODUCTION_DATABASE_NAME, databaseNameFromSettings } from '../src/lib/database-safety.js'

const NOTE = 'SHOWCASE_DATA_V1'

async function main() {
  const database = databaseNameFromSettings(env.DATABASE_URL, env.DB_NAME)
  if (database !== PRODUCTION_DATABASE_NAME) {
    throw new Error(`Showcase cleanup expects ${PRODUCTION_DATABASE_NAME}; got ${database || '(none)'}`)
  }
  if (!process.argv.includes('--apply') || process.env.ALLOW_PRODUCTION_SHOWCASE_CLEANUP !== '1') {
    throw new Error('Refusing production showcase cleanup. Require --apply and ALLOW_PRODUCTION_SHOWCASE_CLEANUP=1')
  }

  const db = getDb()
  const demoMembers = await db
    .select({ id: members.id, code: members.memberCode })
    .from(members)
    .where(and(like(members.memberCode, 'DEMO-%'), like(members.email, '%@demo.elite.local')))
  const memberIds = demoMembers.map((row) => row.id)

  const demoTrainers = await db
    .select({ id: trainers.id })
    .from(trainers)
    .where(like(trainers.email, '%@demo.elite.local'))
  const trainerIds = demoTrainers.map((row) => row.id)

  if (memberIds.length) {
    const memberPayments = await db.select({ id: payments.id }).from(payments).where(inArray(payments.memberId, memberIds))
    const paymentIds = memberPayments.map((row) => row.id)
    if (paymentIds.length) await db.delete(paymentAdjustments).where(inArray(paymentAdjustments.paymentId, paymentIds))
    await db.delete(memberTrainerAssignments).where(inArray(memberTrainerAssignments.memberId, memberIds))
    await db.delete(bookings).where(inArray(bookings.memberId, memberIds))
    await db.delete(progressEntries).where(inArray(progressEntries.memberId, memberIds))
    await db.delete(workoutPlans).where(inArray(workoutPlans.memberId, memberIds))
    await db.delete(memberRequests).where(inArray(memberRequests.memberId, memberIds))
    await db.delete(membershipActions).where(inArray(membershipActions.memberId, memberIds))
    await db.delete(memberNotes).where(inArray(memberNotes.memberId, memberIds))
    await db.delete(checkins).where(inArray(checkins.memberId, memberIds))
    await db.delete(payments).where(inArray(payments.memberId, memberIds))
    await db.delete(memberAccounts).where(inArray(memberAccounts.memberId, memberIds))
    await db.delete(notifications).where(and(eq(notifications.recipientType, 'member'), inArray(notifications.recipientId, memberIds)))
    await db.delete(members).where(inArray(members.id, memberIds))
  }

  await db.delete(trialRegistrations).where(like(trialRegistrations.email, '%@demo.elite.local'))
  await db.delete(memberRequests).where(like(memberRequests.pendingKey, 'showcase-v1-%'))
  await db.delete(notifications).where(like(notifications.dedupeKey, 'showcase-v1-%'))

  const [portalMember] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.memberCode, 'EM-2406'), like(members.fullName, 'TEST Portal Member%')))
    .limit(1)
  if (portalMember) {
    await db.delete(bookings).where(and(eq(bookings.memberId, portalMember.id), eq(bookings.notes, NOTE)))
    await db.delete(progressEntries).where(and(eq(progressEntries.memberId, portalMember.id), eq(progressEntries.notes, NOTE)))
    await db.delete(workoutPlans).where(and(eq(workoutPlans.memberId, portalMember.id), like(workoutPlans.title, 'Showcase%')))
    await db.delete(membershipActions).where(and(eq(membershipActions.memberId, portalMember.id), eq(membershipActions.notes, NOTE)))
  }

  if (trainerIds.length) {
    await db.delete(memberTrainerAssignments).where(inArray(memberTrainerAssignments.trainerId, trainerIds))
    await db.delete(bookings).where(inArray(bookings.trainerId, trainerIds))
    await db.delete(workoutPlans).where(inArray(workoutPlans.trainerId, trainerIds))
    await db.delete(trainerWeeklyAvailability).where(inArray(trainerWeeklyAvailability.trainerId, trainerIds))
    await db.delete(trainerTimeOff).where(inArray(trainerTimeOff.trainerId, trainerIds))
    await db.delete(trainers).where(inArray(trainers.id, trainerIds))
  }

  console.log(JSON.stringify({ showcaseCleaned: true, members: memberIds.length, trainers: trainerIds.length }))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeDb())
