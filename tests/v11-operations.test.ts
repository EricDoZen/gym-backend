import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray, or } from 'drizzle-orm'
import app from '../src/app.js'
import { closeDb, getDb } from '../src/db/client.js'
import {
  auditLogs,
  bookings,
  memberAccounts,
  memberNotes,
  members,
  membershipActions,
  notifications,
  paymentAdjustments,
  payments,
  staffUsers,
  trainerTimeOff,
  trainerWeeklyAvailability,
  trainers,
} from '../src/db/schema.js'
import { env } from '../src/env.js'
import { login as loginStaff } from '../src/services/auth.service.js'
import { enqueueNotification } from '../src/services/notification.service.js'

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function tokenFor(email: string, password: string) {
  return (await loginStaff(email, password)).token
}

describe.sequential('V1.1 operations and RBAC', () => {
  const stamp = Date.now()
  const suffix = String(stamp).slice(-7)
  const password = `V11Ops${suffix}A1`
  const memberPassword = `V11Member${suffix}A1`
  const memberPhone = `+95955${suffix}`
  const memberEmail = `v11-member-${stamp}@example.test`
  const roles = ['manager', 'trainer', 'accountant'] as const
  const staffIds: number[] = []
  const staffEmails = Object.fromEntries(roles.map((role) => [role, `v11-${role}-${stamp}@example.test`])) as Record<(typeof roles)[number], string>

  let ownerToken = ''
  let receptionToken = ''
  let managerToken = ''
  let trainerStaffToken = ''
  let accountantToken = ''
  let trainerStaffId = 0
  let memberId = 0
  let memberCode = ''
  let memberToken = ''
  let trainerId = 0
  let bookingId = 0
  let paymentId = 0
  let voidPaymentId = 0
  let notificationId = 0

  beforeAll(async () => {
    ownerToken = await tokenFor('owner@elite.mm', env.SEED_OWNER_PASSWORD ?? '')
    receptionToken = await tokenFor('reception@elite.mm', env.SEED_RECEPTION_PASSWORD ?? '')

    for (const role of roles) {
      const response = await app.request('/api/auth/staff', {
        method: 'POST',
        headers: auth(ownerToken),
        body: JSON.stringify({
          email: staffEmails[role],
          password,
          role,
          fullName: `V11 ${role} ${suffix}`,
        }),
      })
      expect(response.status).toBe(201)
      const staff = ((await response.json()) as any).data
      staffIds.push(Number(staff.id))
      if (role === 'trainer') trainerStaffId = Number(staff.id)
    }

    managerToken = await tokenFor(staffEmails.manager, password)
    trainerStaffToken = await tokenFor(staffEmails.trainer, password)
    accountantToken = await tokenFor(staffEmails.accountant, password)

    const createMember = await app.request('/api/members', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({
        name: `V11 Member ${suffix}`,
        phone: memberPhone,
        email: memberEmail,
        package: 'standard',
      }),
    })
    expect(createMember.status).toBe(200)
    const member = ((await createMember.json()) as any).data
    memberId = Number(member.id)
    memberCode = member.code

    const activate = await app.request('/api/member-auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, phone: memberPhone, password: memberPassword }),
    })
    expect(activate.status).toBe(201)
    const memberLogin = await app.request('/api/member-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, password: memberPassword }),
    })
    expect(memberLogin.status).toBe(200)
    memberToken = ((await memberLogin.json()) as any).data.token

    const trainerCreate = await app.request('/api/trainers', {
      method: 'POST',
      headers: auth(managerToken),
      body: JSON.stringify({ fullName: `V11 Coach ${suffix}`, specialty: 'Operations Test' }),
    })
    expect(trainerCreate.status).toBe(201)
    trainerId = Number(((await trainerCreate.json()) as any).data.id)

    const slots = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }))
    const availability = await app.request(`/api/trainers/${trainerId}/availability`, {
      method: 'PUT',
      headers: auth(managerToken),
      body: JSON.stringify({ slots }),
    })
    expect(availability.status).toBe(200)
  })

  afterAll(async () => {
    const db = getDb()
    if (paymentId || voidPaymentId) {
      const ids = [paymentId, voidPaymentId].filter(Boolean)
      await db.delete(paymentAdjustments).where(inArray(paymentAdjustments.paymentId, ids))
      await db.delete(payments).where(inArray(payments.id, ids))
    }
    if (memberId) {
      await db.delete(bookings).where(eq(bookings.memberId, memberId))
      await db.delete(memberNotes).where(eq(memberNotes.memberId, memberId))
      await db.delete(membershipActions).where(eq(membershipActions.memberId, memberId))
      await db.delete(memberAccounts).where(eq(memberAccounts.memberId, memberId))
      await db.delete(auditLogs).where(eq(auditLogs.actorMemberId, memberId))
      await db.delete(members).where(eq(members.id, memberId))
    }
    if (trainerId) {
      await db.delete(trainerWeeklyAvailability).where(eq(trainerWeeklyAvailability.trainerId, trainerId))
      await db.delete(trainerTimeOff).where(eq(trainerTimeOff.trainerId, trainerId))
      await db.delete(auditLogs).where(andEntity('trainer', trainerId))
      await db.delete(trainers).where(eq(trainers.id, trainerId))
    }
    if (trainerStaffId) {
      await db.delete(notifications).where(eq(notifications.recipientId, trainerStaffId))
    }
    if (staffIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.actorStaffId, staffIds))
      await db.delete(staffUsers).where(inArray(staffUsers.id, staffIds))
    }
    await closeDb()
  })

  it('enforces granular permissions for manager, trainer, accountant and reception', async () => {
    const managerPackages = await app.request('/api/packages/admin', { headers: auth(managerToken) })
    expect(managerPackages.status).toBe(200)

    const managerStaff = await app.request('/api/auth/staff', { headers: auth(managerToken) })
    expect(managerStaff.status).toBe(403)

    const trainerMe = await app.request('/api/auth/me', { headers: auth(trainerStaffToken) })
    expect(trainerMe.status).toBe(200)
    const permissions = ((await trainerMe.json()) as any).data.permissions as string[]
    expect(permissions).toContain('fitness.write')
    expect(permissions).not.toContain('payment.create')

    const blockedPayment = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(trainerStaffToken),
      body: JSON.stringify({
        memberId,
        packageName: 'standard',
        amount: 1000,
        status: 'Paid',
        paymentMethod: 'Cash',
        idempotencyKey: `blocked-${stamp}`,
      }),
    })
    expect(blockedPayment.status).toBe(403)

    const reports = await app.request('/api/ops/reports', { headers: auth(accountantToken) })
    expect(reports.status).toBe(200)

    const receptionAdjust = await app.request('/api/payments/1/adjustments', {
      method: 'POST',
      headers: auth(receptionToken),
      body: JSON.stringify({ type: 'refund', amount: 1, reason: 'Permission check' }),
    })
    expect(receptionAdjust.status).toBe(403)
  })

  it('keeps receipts immutable and records bounded refund/void adjustments', async () => {
    const first = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(receptionToken),
      body: JSON.stringify({
        memberId,
        packageName: 'standard',
        amount: 10000,
        status: 'Paid',
        paymentMethod: 'Cash',
        idempotencyKey: `v11-refund-${stamp}`,
      }),
    })
    expect(first.status).toBe(200)
    paymentId = Number(((await first.json()) as any).data.id)

    const refund = await app.request(`/api/payments/${paymentId}/adjustments`, {
      method: 'POST',
      headers: auth(accountantToken),
      body: JSON.stringify({ type: 'refund', amount: 4000, reason: 'Partial service refund' }),
    })
    expect(refund.status).toBe(200)
    expect(((await refund.json()) as any).data.remainingAmount).toBe(6000)

    const overRefund = await app.request(`/api/payments/${paymentId}/adjustments`, {
      method: 'POST',
      headers: auth(accountantToken),
      body: JSON.stringify({ type: 'refund', amount: 7000, reason: 'Should exceed remaining amount' }),
    })
    expect(overRefund.status).toBe(409)

    const second = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(receptionToken),
      body: JSON.stringify({
        memberId,
        packageName: 'standard',
        amount: 12000,
        status: 'Paid',
        paymentMethod: 'Bank Transfer',
        idempotencyKey: `v11-void-${stamp}`,
      }),
    })
    expect(second.status).toBe(200)
    voidPaymentId = Number(((await second.json()) as any).data.id)

    const voided = await app.request(`/api/payments/${voidPaymentId}/adjustments`, {
      method: 'POST',
      headers: auth(accountantToken),
      body: JSON.stringify({ type: 'void', reason: 'Duplicate transfer entry' }),
    })
    expect(voided.status).toBe(200)
    expect(((await voided.json()) as any).data.remainingAmount).toBe(0)

    const adjustments = await app.request(`/api/payments/${paymentId}/adjustments`, {
      headers: auth(accountantToken),
    })
    expect(adjustments.status).toBe(200)
    expect(((await adjustments.json()) as any).data).toHaveLength(1)
  })

  it('enforces trainer schedule/time-off and supports completion status', async () => {
    const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    scheduledAt.setHours(10, 0, 0, 0)
    const booking = await app.request('/api/portal/bookings', {
      method: 'POST',
      headers: auth(memberToken),
      body: JSON.stringify({
        trainerId,
        sessionType: 'V1.1 Coaching',
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: 60,
      }),
    })
    expect(booking.status).toBe(201)
    bookingId = Number(((await booking.json()) as any).data.id)

    const completed = await app.request(`/api/fitness/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: auth(trainerStaffToken),
      body: JSON.stringify({ status: 'Completed' }),
    })
    expect(completed.status).toBe(200)

    const offStart = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
    offStart.setHours(12, 0, 0, 0)
    const offEnd = new Date(offStart.getTime() + 2 * 60 * 60 * 1000)
    const timeOff = await app.request(`/api/trainers/${trainerId}/time-off`, {
      method: 'POST',
      headers: auth(managerToken),
      body: JSON.stringify({ startsAt: offStart.toISOString(), endsAt: offEnd.toISOString(), reason: 'Test leave' }),
    })
    expect(timeOff.status).toBe(201)

    const blocked = await app.request('/api/portal/bookings', {
      method: 'POST',
      headers: auth(memberToken),
      body: JSON.stringify({
        trainerId,
        sessionType: 'Blocked Session',
        scheduledAt: new Date(offStart.getTime() + 30 * 60 * 1000).toISOString(),
        durationMinutes: 60,
      }),
    })
    expect(blocked.status).toBe(409)

    const calendar = await app.request(`/api/trainers/${trainerId}/calendar`, { headers: auth(managerToken) })
    expect(calendar.status).toBe(200)
    const rows = ((await calendar.json()) as any).data as any[]
    expect(rows.some((row) => Number(row.id) === bookingId && row.status === 'Completed')).toBe(true)
  })

  it('exposes member overview and append-only staff notes', async () => {
    const note = await app.request(`/api/members/${memberId}/notes`, {
      method: 'POST',
      headers: auth(trainerStaffToken),
      body: JSON.stringify({ note: 'Member prefers morning strength sessions.' }),
    })
    expect(note.status).toBe(201)

    const overview = await app.request(`/api/members/${memberId}/overview`, {
      headers: auth(receptionToken),
    })
    expect(overview.status).toBe(200)
    const data = ((await overview.json()) as any).data
    expect(data.member.code).toBe(memberCode)
    expect(data.notes.some((item: any) => /morning strength/i.test(item.note))).toBe(true)
    expect(data.payments.length).toBeGreaterThanOrEqual(2)
  })

  it('returns net operations reports and deduplicates internal notifications', async () => {
    const reports = await app.request('/api/ops/reports', { headers: auth(accountantToken) })
    expect(reports.status).toBe(200)
    const report = ((await reports.json()) as any).data
    expect(report.revenue.gross).toBeGreaterThanOrEqual(report.revenue.net)
    expect(report.revenue.adjustments).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(report.paymentMethods)).toBe(true)

    const dedupeKey = `v11-test-notification-${stamp}`
    const first = await enqueueNotification({
      recipientType: 'staff',
      recipientId: trainerStaffId,
      eventType: 'v11.test',
      title: 'V1.1 test notification',
      message: 'Notification dedupe/read acceptance',
      dedupeKey,
    })
    const duplicate = await enqueueNotification({
      recipientType: 'staff',
      recipientId: trainerStaffId,
      eventType: 'v11.test',
      title: 'V1.1 test notification',
      message: 'Notification dedupe/read acceptance',
      dedupeKey,
    })
    expect(first).toBeTruthy()
    expect(duplicate).toBeNull()
    notificationId = Number(first)

    const list = await app.request('/api/ops/notifications', { headers: auth(trainerStaffToken) })
    expect(list.status).toBe(200)
    expect(((await list.json()) as any).data.some((item: any) => Number(item.id) === notificationId)).toBe(true)

    const read = await app.request(`/api/ops/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: auth(trainerStaffToken),
    })
    expect(read.status).toBe(200)
  })
})

function andEntity(entityType: string, entityId: number) {
  return or(
    eq(auditLogs.entityId, String(entityId)),
    eq(auditLogs.entityId, entityId),
  )
}
