import 'dotenv/config'
import { and, eq, like } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/client.js'
import {
  bookings,
  checkins,
  memberRequests,
  memberTrainerAssignments,
  members,
  membershipActions,
  membershipPackages,
  notifications,
  payments,
  progressEntries,
  staffUsers,
  trainerWeeklyAvailability,
  trainers,
  trialRegistrations,
  workoutPlans,
} from '../src/db/schema.js'
import { env } from '../src/env.js'
import { getInsertId } from '../src/lib/insert-id.js'
import { toSqlDate } from '../src/lib/dates.js'
import { PRODUCTION_DATABASE_NAME, databaseNameFromSettings } from '../src/lib/database-safety.js'

const DOMAIN = '@demo.elite.local'
const MEMBER_PREFIX = 'DEMO-'
const NOTE = 'SHOWCASE_DATA_V1'

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

async function main() {
  const database = databaseNameFromSettings(env.DATABASE_URL, env.DB_NAME)
  if (database !== PRODUCTION_DATABASE_NAME) {
    throw new Error(`Showcase seed expects ${PRODUCTION_DATABASE_NAME}; got ${database || '(none)'}`)
  }
  if (!process.argv.includes('--apply') || process.env.ALLOW_PRODUCTION_SHOWCASE_SEED !== '1') {
    throw new Error('Refusing production showcase seed. Require --apply and ALLOW_PRODUCTION_SHOWCASE_SEED=1')
  }

  const db = getDb()
  const existing = await db
    .select({ id: members.id })
    .from(members)
    .where(like(members.memberCode, `${MEMBER_PREFIX}%`))
    .limit(1)
  if (existing.length) {
    console.log('Showcase dataset already exists; seed is idempotent and made no changes.')
    return
  }

  const packageRows = await db.select().from(membershipPackages).where(eq(membershipPackages.isActive, true))
  const packageByCode = new Map(packageRows.map((row) => [row.code, row]))
  for (const code of ['basic', 'standard', 'premium']) {
    if (!packageByCode.has(code)) throw new Error(`Required package ${code} is missing`)
  }

  const [owner] = await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.role, 'owner')).limit(1)
  if (!owner) throw new Error('Owner staff account is required for showcase trainer assignments')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const trainerSeeds = [
    { name: 'DEMO · Ko Min', specialty: 'Strength & Performance', phone: '+959700010001', email: `trainer.ko.min${DOMAIN}` },
    { name: 'DEMO · Zin Mar', specialty: 'Yoga & Mobility', phone: '+959700010002', email: `trainer.zin.mar${DOMAIN}` },
    { name: 'DEMO · Thiha', specialty: 'Hypertrophy & Conditioning', phone: '+959700010003', email: `trainer.thiha${DOMAIN}` },
  ]
  const trainerIds: number[] = []
  for (const trainer of trainerSeeds) {
    const result = await db.insert(trainers).values({
      fullName: trainer.name,
      specialty: trainer.specialty,
      phone: trainer.phone,
      email: trainer.email,
      isActive: true,
    })
    trainerIds.push(getInsertId(result))
  }

  for (const trainerId of trainerIds) {
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      await db.insert(trainerWeeklyAvailability).values({ trainerId, weekday, startMinute: 6 * 60, endMinute: 20 * 60 })
    }
  }

  const names = [
    'Aung Kyaw', 'Thiri Mon', 'Min Khant', 'Su Myat', 'Nay Lin', 'Ei Ei Phyo',
    'Ko Ko Naing', 'May Thu', 'Htet Aung', 'Pyae Sone', 'Moe Sandar', 'Kyaw Zin',
    'Nandar Hlaing', 'Ye Yint', 'Wai Yan', 'Khin Thazin', 'Lin Htet', 'Yoon Mi',
    'Sai Aik', 'Nang Mwe', 'Than Htike', 'Mya Mya', 'Zaw Lin', 'Phyu Sin',
  ]
  const demoMemberIds: number[] = []
  const packageCycle = ['premium', 'standard', 'standard', 'basic'] as const

  for (let index = 0; index < names.length; index += 1) {
    const sequence = index + 1
    const code = `${MEMBER_PREFIX}${String(sequence).padStart(4, '0')}`
    const packageCode = packageCycle[index % packageCycle.length]!
    const pkg = packageByCode.get(packageCode)!
    const status = index >= 20 ? 'Expired' : index >= 18 ? 'Frozen' : 'Active'
    const joinDate = addMonths(today, -(1 + (index % 14)))
    const expireDate = status === 'Expired' ? addDays(today, -(3 + index)) : addMonths(today, 3 + (index % 9))
    const result = await db.insert(members).values({
      memberCode: code,
      fullName: `DEMO · ${names[index]}`,
      phone: `+95971${String(100000 + sequence).slice(-6)}`,
      email: `member.${String(sequence).padStart(2, '0')}${DOMAIN}`,
      packageId: pkg.id,
      packageName: pkg.name,
      status,
      joinDate: toSqlDate(joinDate),
      expireDate: toSqlDate(expireDate),
      attendanceCount: 4 + ((index * 7) % 52),
      avatarUrl: index % 2 === 0 ? '/images/img-1352436804.jpg' : '/images/img-663641805.jpg',
    })
    demoMemberIds.push(getInsertId(result))
  }

  const paidMemberIds = demoMemberIds.slice(0, 16)
  for (let index = 0; index < paidMemberIds.length; index += 1) {
    const memberId = paidMemberIds[index]!
    const packageCode = packageCycle[index % packageCycle.length]!
    const pkg = packageByCode.get(packageCode)!
    const paymentDate = addDays(today, -Math.min(today.getDate() - 1, index % 20))
    await db.insert(payments).values({
      memberId,
      packageId: pkg.id,
      packageCode: pkg.code,
      packageName: pkg.name,
      packagePriceMmk: pkg.priceMmk,
      amountMmk: pkg.priceMmk,
      status: 'Paid',
      paymentMethod: ['Cash', 'Mobile Wallet', 'Bank Transfer', 'Card'][index % 4]!,
      referenceNo: `DEMO-${String(index + 1).padStart(4, '0')}`,
      receiptNo: `DEMO-RCP-${String(index + 1).padStart(4, '0')}`,
      idempotencyKey: `showcase-v1-payment-${index + 1}`,
      paymentDate: toSqlDate(paymentDate),
      createdByStaffId: owner.id,
    })
  }

  for (let index = 16; index < 20; index += 1) {
    const memberId = demoMemberIds[index]!
    const pkg = packageByCode.get(packageCycle[index % packageCycle.length]!)!
    await db.insert(payments).values({
      memberId,
      packageId: pkg.id,
      packageCode: pkg.code,
      packageName: pkg.name,
      packagePriceMmk: pkg.priceMmk,
      amountMmk: pkg.priceMmk,
      status: index % 2 === 0 ? 'Pending' : 'Overdue',
      paymentMethod: 'Cash',
      referenceNo: `DEMO-DUE-${index + 1}`,
      receiptNo: null,
      idempotencyKey: `showcase-v1-due-${index + 1}`,
      paymentDate: toSqlDate(addDays(today, -(index - 15))),
      createdByStaffId: owner.id,
    })
  }

  for (let index = 0; index < 12; index += 1) {
    const checkedInAt = new Date(today)
    checkedInAt.setHours(6 + Math.floor(index / 2), index % 2 ? 35 : 5, 0, 0)
    const pkg = packageByCode.get(packageCycle[index % packageCycle.length]!)!
    await db.insert(checkins).values({
      memberId: demoMemberIds[index]!,
      membershipType: pkg.name,
      checkedInAt,
    })
  }
  for (let offset = 1; offset <= 8; offset += 1) {
    for (let index = 0; index < 5; index += 1) {
      const checkedInAt = addDays(today, -offset)
      checkedInAt.setHours(7 + index, 10 + index * 3, 0, 0)
      const pkg = packageByCode.get(packageCycle[index % packageCycle.length]!)!
      await db.insert(checkins).values({ memberId: demoMemberIds[(index + offset) % 18]!, membershipType: pkg.name, checkedInAt })
    }
  }

  for (let index = 0; index < 9; index += 1) {
    const trainerId = trainerIds[index % trainerIds.length]!
    const memberId = demoMemberIds[index]!
    await db.insert(memberTrainerAssignments).values({ memberId, trainerId, assignedByStaffId: owner.id, notes: NOTE })
    const scheduledAt = addDays(today, index - 3)
    scheduledAt.setHours(9 + (index % 5), 0, 0, 0)
    await db.insert(bookings).values({
      memberId,
      trainerId,
      sessionType: index % 2 ? 'Personal Training' : 'Strength Session',
      scheduledAt,
      durationMinutes: 60,
      status: index < 3 ? 'Completed' : 'Booked',
      completedAt: index < 3 ? scheduledAt : null,
      notes: NOTE,
    })
  }

  for (let index = 0; index < 6; index += 1) {
    await db.insert(trialRegistrations).values({
      fullName: `DEMO Trial Lead ${index + 1}`,
      phone: `+9597299${String(1000 + index)}`,
      email: `trial.${index + 1}${DOMAIN}`,
      packageCode: packageCycle[index % packageCycle.length]!,
      preferredStartDate: toSqlDate(addDays(today, 2 + index)),
    })
  }

  for (let index = 0; index < 3; index += 1) {
    await db.insert(memberRequests).values({
      memberId: demoMemberIds[12 + index]!,
      requestType: (['freeze', 'renew', 'upgrade'] as const)[index]!,
      requestedPackage: index === 2 ? 'premium' : null,
      status: 'Pending',
      pendingKey: `showcase-v1-request-${index + 1}`,
      notes: NOTE,
    })
  }

  for (let index = 0; index < 5; index += 1) {
    await db.insert(notifications).values({
      recipientType: 'staff',
      recipientId: owner.id,
      eventType: 'showcase.activity',
      title: `DEMO Operations Alert ${index + 1}`,
      message: ['Membership renewal due', 'Trial follow-up requested', 'Trainer session scheduled', 'Payment pending review', 'Member freeze request'][index]!,
      channel: 'internal',
      status: 'Pending',
      dedupeKey: `showcase-v1-notification-${index + 1}`,
    })
  }

  const [portalMember] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.memberCode, 'EM-2406'), like(members.fullName, 'TEST Portal Member%')))
    .limit(1)
  if (portalMember) {
    const existingAssignment = await db.select({ id: memberTrainerAssignments.id }).from(memberTrainerAssignments).where(eq(memberTrainerAssignments.memberId, portalMember.id)).limit(1)
    if (!existingAssignment.length) {
      await db.insert(memberTrainerAssignments).values({ memberId: portalMember.id, trainerId: trainerIds[0]!, assignedByStaffId: owner.id, notes: NOTE })
    }
    for (const [offset, weight, bodyFat] of [[28, 7420, 2150], [18, 7310, 2070], [9, 7240, 1990], [0, 7160, 1920]] as const) {
      const recordedAt = addDays(today, -offset)
      recordedAt.setHours(8, 0, 0, 0)
      await db.insert(progressEntries).values({ memberId: portalMember.id, weightKg: weight, bodyFatPct: bodyFat, muscleMassKg: 3310 + (28 - offset) * 6, notes: NOTE, recordedAt })
    }
    await db.insert(workoutPlans).values({
      memberId: portalMember.id,
      trainerId: trainerIds[0]!,
      title: 'Showcase Strength Foundation',
      plan: [
        { day: 'Monday', focus: 'Upper Strength', exercises: ['Bench Press 4x6', 'Row 4x8', 'Shoulder Press 3x8'] },
        { day: 'Wednesday', focus: 'Lower Strength', exercises: ['Squat 4x6', 'Romanian Deadlift 3x8', 'Split Squat 3x10'] },
        { day: 'Friday', focus: 'Full Body', exercises: ['Deadlift 3x5', 'Incline Press 3x10', 'Lat Pulldown 3x10'] },
      ],
      isActive: true,
    })
    const portalBooking = addDays(today, 2)
    portalBooking.setHours(18, 0, 0, 0)
    await db.insert(bookings).values({ memberId: portalMember.id, trainerId: trainerIds[0]!, sessionType: 'Personal Training', scheduledAt: portalBooking, durationMinutes: 60, status: 'Booked', notes: NOTE })
    await db.insert(membershipActions).values({ memberId: portalMember.id, action: 'booking', notes: NOTE })
  }

  console.log(JSON.stringify({
    showcaseSeeded: true,
    members: demoMemberIds.length,
    paidPayments: paidMemberIds.length,
    duePayments: 4,
    todayCheckins: 12,
    historicalCheckins: 40,
    trainers: trainerIds.length,
    trials: 6,
    portalMemberEnriched: Boolean(portalMember),
  }))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeDb())
