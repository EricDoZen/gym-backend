import 'dotenv/config'
import bcrypt from 'bcrypt'
import { count, eq } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/client.js'
import {
  checkins,
  members,
  membershipPackages,
  payments,
  staffUsers,
} from '../src/db/schema.js'
import { getInsertId } from '../src/lib/insert-id.js'
import { parseFlexibleDate, toSqlDate } from '../src/lib/dates.js'
import { env } from '../src/env.js'

const PACKAGES = [
  { code: 'basic', name: 'Basic', priceMmk: 150_000, durationDays: 30 },
  { code: 'standard', name: 'Standard', priceMmk: 350_000, durationDays: 365 },
  { code: 'premium', name: 'Premium', priceMmk: 500_000, durationDays: 365 },
]

const SEED_MEMBERS = [
  {
    memberCode: 'EM-2401',
    fullName: 'Aung Min',
    phone: '+95 9 123 456 789',
    email: 'aung.min@email.com',
    packageName: 'Premium',
    status: 'Active' as const,
    joinDate: '12 Jan 2024',
    expireDate: '31 Dec 2026',
    attendanceCount: 28,
    avatarUrl: '/images/img-1352436804.jpg',
  },
  {
    memberCode: 'EM-2402',
    fullName: 'Thiri Aye',
    phone: '+95 9 987 654 321',
    email: 'thiri.aye@email.com',
    packageName: 'Standard',
    status: 'Active' as const,
    joinDate: '03 Mar 2024',
    expireDate: '03 Mar 2025',
    attendanceCount: 19,
    avatarUrl: '/images/img-663641805.jpg',
  },
  {
    memberCode: 'EM-2403',
    fullName: 'Kyaw Lin',
    phone: '+95 9 555 123 456',
    email: 'kyaw.lin@email.com',
    packageName: 'Basic',
    status: 'Trial' as const,
    joinDate: '18 Aug 2026',
    expireDate: '01 Sep 2026',
    attendanceCount: 3,
    avatarUrl: '/images/img-1179786167.jpg',
  },
  {
    memberCode: 'EM-2404',
    fullName: 'Su Mon',
    phone: '+95 9 444 222 111',
    email: 'su.mon@email.com',
    packageName: 'Premium',
    status: 'Active' as const,
    joinDate: '22 Jun 2023',
    expireDate: '22 Jun 2026',
    attendanceCount: 41,
    avatarUrl: '/images/img-1352436804.jpg',
  },
]

async function main() {
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const db = getDb()
  const [staffCount] = await db.select({ total: count() }).from(staffUsers)
  if ((staffCount?.total ?? 0) > 0) {
    console.log('Seed skipped: data already exists')
    await closeDb()
    return
  }

  for (const pkg of PACKAGES) {
    await db.insert(membershipPackages).values(pkg)
  }

  const ownerHash = await bcrypt.hash(env.SEED_OWNER_PASSWORD, 12)
  const receptionHash = await bcrypt.hash(env.SEED_RECEPTION_PASSWORD, 12)

  await db.insert(staffUsers).values([
    {
      email: 'owner@elite.mm',
      passwordHash: ownerHash,
      role: 'owner',
      fullName: 'Gym Owner',
    },
    {
      email: 'reception@elite.mm',
      passwordHash: receptionHash,
      role: 'reception',
      fullName: 'Reception Staff',
    },
  ])

  const memberIds: Record<string, number> = {}
  for (const member of SEED_MEMBERS) {
    const result = await db.insert(members).values({
      memberCode: member.memberCode,
      fullName: member.fullName,
      phone: member.phone,
      email: member.email,
      packageName: member.packageName,
      status: member.status,
      joinDate: toSqlDate(parseFlexibleDate(member.joinDate)),
      expireDate: toSqlDate(parseFlexibleDate(member.expireDate)),
      attendanceCount: member.attendanceCount,
      avatarUrl: member.avatarUrl,
    })
    memberIds[member.memberCode] = getInsertId(result)
  }

  const checkinSeed = [
    { code: 'EM-2401', membershipType: 'Premium', hour: 8, minute: 42 },
    { code: 'EM-2402', membershipType: 'Standard', hour: 9, minute: 15 },
    { code: 'EM-2404', membershipType: 'Premium', hour: 10, minute: 3 },
  ]

  for (const item of checkinSeed) {
    const memberId = memberIds[item.code]
    if (!memberId) continue
    const checkedInAt = new Date()
    checkedInAt.setHours(item.hour, item.minute, 0, 0)
    await db.insert(checkins).values({
      memberId,
      membershipType: item.membershipType,
      checkedInAt,
    })
  }

  const paymentSeed = [
    {
      code: 'EM-2401',
      packageName: 'Premium',
      amountMmk: 500_000,
      status: 'Paid' as const,
      paymentDate: '24 Oct 2026',
    },
    {
      code: 'EM-2402',
      packageName: 'Standard',
      amountMmk: 350_000,
      status: 'Paid' as const,
      paymentDate: '22 Oct 2026',
    },
    {
      code: 'EM-2403',
      packageName: 'Basic',
      amountMmk: 150_000,
      status: 'Pending' as const,
      paymentDate: '25 Aug 2026',
    },
  ]

  for (const item of paymentSeed) {
    const memberId = memberIds[item.code]
    if (!memberId) continue
    await db.insert(payments).values({
      memberId,
      packageName: item.packageName,
      amountMmk: item.amountMmk,
      status: item.status,
      paymentDate: toSqlDate(parseFlexibleDate(item.paymentDate)),
    })
  }

  console.log('Seed complete')
  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
