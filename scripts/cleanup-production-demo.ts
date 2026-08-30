import 'dotenv/config'
import { and, eq, inArray, or } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/client.js'
import { env } from '../src/env.js'
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
  workoutPlans,
} from '../src/db/schema.js'
import {
  PRODUCTION_DATABASE_NAME,
  databaseNameFromSettings,
} from '../src/lib/database-safety.js'

const DEMO_MEMBERS = [
  { code: 'EM-2401', name: 'Aung Min', phone: '+95 9 123 456 789', email: 'aung.min@email.com' },
  { code: 'EM-2402', name: 'Thiri Aye', phone: '+95 9 987 654 321', email: 'thiri.aye@email.com' },
  { code: 'EM-2403', name: 'Kyaw Lin', phone: '+95 9 555 123 456', email: 'kyaw.lin@email.com' },
  { code: 'EM-2404', name: 'Su Mon', phone: '+95 9 444 222 111', email: 'su.mon@email.com' },
] as const

async function main() {
  const database = databaseNameFromSettings(env.DATABASE_URL, env.DB_NAME)
  if (database !== PRODUCTION_DATABASE_NAME) {
    throw new Error(`Cleanup expects ${PRODUCTION_DATABASE_NAME}; got ${database || '(none)'}`)
  }

  const apply = process.argv.includes('--apply')
  if (apply && process.env.ALLOW_PRODUCTION_DEMO_CLEANUP !== '1') {
    throw new Error('Set ALLOW_PRODUCTION_DEMO_CLEANUP=1 together with --apply for intentional cleanup')
  }

  const db = getDb()
  const matchers = DEMO_MEMBERS.map((item) => and(
    eq(members.memberCode, item.code),
    eq(members.fullName, item.name),
    eq(members.phone, item.phone),
    eq(members.email, item.email),
  ))
  const found = await db
    .select({ id: members.id, code: members.memberCode, name: members.fullName })
    .from(members)
    .where(or(...matchers))

  console.log(`Exact demo-member matches: ${found.length}`)
  for (const row of found) console.log(`- ${row.code} ${row.name} (id=${row.id})`)

  if (!apply) {
    console.log('Dry run only. No production data changed.')
    return
  }

  if (found.length !== DEMO_MEMBERS.length) {
    throw new Error(`Refusing cleanup: expected exactly ${DEMO_MEMBERS.length} exact demo records, found ${found.length}`)
  }

  for (const row of found) {
    const memberId = row.id
    await db.delete(memberTrainerAssignments).where(eq(memberTrainerAssignments.memberId, memberId))
    await db.delete(bookings).where(eq(bookings.memberId, memberId))
    await db.delete(progressEntries).where(eq(progressEntries.memberId, memberId))
    await db.delete(workoutPlans).where(eq(workoutPlans.memberId, memberId))
    await db.delete(memberRequests).where(eq(memberRequests.memberId, memberId))
    await db.delete(membershipActions).where(eq(membershipActions.memberId, memberId))
    await db.delete(memberNotes).where(eq(memberNotes.memberId, memberId))
    await db.delete(notifications).where(and(eq(notifications.recipientType, 'member'), eq(notifications.recipientId, memberId)))
    await db.delete(checkins).where(eq(checkins.memberId, memberId))

    const memberPayments = await db.select({ id: payments.id }).from(payments).where(eq(payments.memberId, memberId))
    const paymentIds = memberPayments.map((payment) => payment.id)
    if (paymentIds.length) {
      await db.delete(paymentAdjustments).where(inArray(paymentAdjustments.paymentId, paymentIds))
    }
    await db.delete(payments).where(eq(payments.memberId, memberId))
    await db.delete(memberAccounts).where(eq(memberAccounts.memberId, memberId))
    await db.delete(members).where(eq(members.id, memberId))
  }

  console.log(`Removed ${found.length} exact production demo member records and their operational dependencies. Audit logs were retained.`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeDb())
