import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, or } from 'drizzle-orm'
import app from '../src/app.js'
import { closeDb, getDb } from '../src/db/client.js'
import {
  auditLogs,
  bookings,
  memberAccounts,
  memberRequests,
  members,
  membershipActions,
  progressEntries,
  staffUsers,
  trainers,
  workoutPlans,
} from '../src/db/schema.js'
import { env } from '../src/env.js'

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function staffLogin(email: string, password: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as any
  return body.data.token as string
}

describe.sequential('production hardening API', () => {
  const stamp = Date.now()
  const memberPassword = 'MemberPortal9x!'
  const memberPassword2 = 'MemberPortal10x!'
  const staffPassword = 'TempStaff9x!'
  const staffPassword2 = 'TempStaff10x!'
  const tempPhone = `+95 9 66${String(stamp).slice(-7)}`
  const tempEmail = `hardening-member-${stamp}@example.test`
  const tempStaffEmail = `hardening-staff-${stamp}@example.test`

  let ownerToken = ''
  let receptionToken = ''
  let memberId = 0
  let memberCode = ''
  let memberToken = ''
  let trainerId = 0
  let bookingId = 0
  let requestId = 0
  let tempStaffId = 0

  beforeAll(async () => {
    ownerToken = await staffLogin('owner@elite.mm', env.SEED_OWNER_PASSWORD)
    receptionToken = await staffLogin(
      'reception@elite.mm',
      env.SEED_RECEPTION_PASSWORD,
    )

    const createMember = await app.request('/api/members', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        name: `Hardening Member ${stamp}`,
        phone: tempPhone,
        email: tempEmail,
        package: 'standard',
      }),
    })
    expect(createMember.status).toBe(200)
    const memberBody = (await createMember.json()) as any
    memberId = Number(memberBody.data.id)
    memberCode = memberBody.data.code
  })

  afterAll(async () => {
    const db = getDb()
    if (memberId) {
      await db.delete(bookings).where(eq(bookings.memberId, memberId))
      await db.delete(progressEntries).where(eq(progressEntries.memberId, memberId))
      await db.delete(workoutPlans).where(eq(workoutPlans.memberId, memberId))
      await db.delete(memberRequests).where(eq(memberRequests.memberId, memberId))
      await db.delete(membershipActions).where(eq(membershipActions.memberId, memberId))
      await db.delete(memberAccounts).where(eq(memberAccounts.memberId, memberId))
      await db.delete(members).where(eq(members.id, memberId))
      await db
        .delete(auditLogs)
        .where(eq(auditLogs.actorMemberId, memberId))
    }
    if (trainerId) {
      await db.delete(trainers).where(eq(trainers.id, trainerId))
    }
    if (tempStaffId) {
      await db
        .delete(auditLogs)
        .where(
          or(
            eq(auditLogs.actorStaffId, tempStaffId),
            and(
              eq(auditLogs.entityType, 'staff'),
              eq(auditLogs.entityId, String(tempStaffId)),
            ),
          ),
        )
      await db.delete(staffUsers).where(eq(staffUsers.id, tempStaffId))
    }
    await closeDb()
  })

  it('activates a member portal account and keeps staff/member tokens separated', async () => {
    const activate = await app.request('/api/member-auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberCode,
        phone: tempPhone,
        password: memberPassword,
      }),
    })
    expect(activate.status).toBe(201)

    const login = await app.request('/api/member-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, password: memberPassword }),
    })
    expect(login.status).toBe(200)
    const loginBody = (await login.json()) as any
    memberToken = loginBody.data.token
    expect(loginBody.data.member.code).toBe(memberCode)

    const memberMe = await app.request('/api/member-auth/me', {
      headers: authHeaders(memberToken),
    })
    expect(memberMe.status).toBe(200)

    const memberOnStaffApi = await app.request('/api/dashboard', {
      headers: authHeaders(memberToken),
    })
    expect(memberOnStaffApi.status).toBe(401)

    const staffOnMemberApi = await app.request('/api/member-auth/me', {
      headers: authHeaders(ownerToken),
    })
    expect(staffOnMemberApi.status).toBe(401)
  })

  it('manages staff accounts with owner-only access and real password reset', async () => {
    const forbidden = await app.request('/api/auth/staff', {
      headers: authHeaders(receptionToken),
    })
    expect(forbidden.status).toBe(403)

    const create = await app.request('/api/auth/staff', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        email: tempStaffEmail,
        password: staffPassword,
        role: 'reception',
        fullName: `Hardening Reception ${stamp}`,
      }),
    })
    expect(create.status).toBe(201)
    const createBody = (await create.json()) as any
    tempStaffId = Number(createBody.data.id)
    expect(tempStaffId).toBeGreaterThan(0)

    const tempToken = await staffLogin(tempStaffEmail, staffPassword)
    expect(tempToken).toBeTruthy()

    const reset = await app.request(
      `/api/auth/staff/${tempStaffId}/reset-password`,
      {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ newPassword: staffPassword2 }),
      },
    )
    expect(reset.status).toBe(200)

    const revokedToken = await app.request('/api/auth/me', {
      headers: authHeaders(tempToken),
    })
    expect(revokedToken.status).toBe(401)

    const oldLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tempStaffEmail, password: staffPassword }),
    })
    expect(oldLogin.status).toBe(401)
    expect(await staffLogin(tempStaffEmail, staffPassword2)).toBeTruthy()

    const deactivate = await app.request(`/api/auth/staff/${tempStaffId}`, {
      method: 'PATCH',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ isActive: false }),
    })
    expect(deactivate.status).toBe(200)
  })

  it('supports trainer, booking, progress and workout APIs', async () => {
    const trainer = await app.request('/api/trainers', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        fullName: `Trainer ${stamp}`,
        specialty: 'Strength & Conditioning',
        email: `trainer-${stamp}@example.test`,
      }),
    })
    expect(trainer.status).toBe(201)
    const trainerBody = (await trainer.json()) as any
    trainerId = Number(trainerBody.data.id)

    const trainersForMember = await app.request('/api/portal/trainers', {
      headers: authHeaders(memberToken),
    })
    expect(trainersForMember.status).toBe(200)

    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const booking = await app.request('/api/portal/bookings', {
      method: 'POST',
      headers: authHeaders(memberToken),
      body: JSON.stringify({
        trainerId,
        sessionType: 'Personal Training',
        scheduledAt,
      }),
    })
    expect(booking.status).toBe(201)
    const bookingBody = (await booking.json()) as any
    bookingId = Number(bookingBody.data.id)

    const progress = await app.request(`/api/fitness/members/${memberId}/progress`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ weightKg: 70.25, bodyFatPct: 18.5 }),
    })
    expect(progress.status).toBe(201)

    const workout = await app.request(`/api/fitness/members/${memberId}/workout`, {
      method: 'PUT',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        trainerId,
        title: 'E2E Strength Plan',
        plan: {
          days: [
            { day: 1, exercises: ['Squat', 'Bench Press'] },
            { day: 2, exercises: ['Deadlift', 'Row'] },
          ],
        },
      }),
    })
    expect(workout.status).toBe(200)

    const portalProgress = await app.request('/api/portal/progress', {
      headers: authHeaders(memberToken),
    })
    expect(portalProgress.status).toBe(200)
    const progressBody = (await portalProgress.json()) as any
    expect(progressBody.data[0].weightKg).toBe(70.25)

    const portalWorkout = await app.request('/api/portal/workout', {
      headers: authHeaders(memberToken),
    })
    expect(portalWorkout.status).toBe(200)
    const workoutBody = (await portalWorkout.json()) as any
    expect(workoutBody.data.title).toBe('E2E Strength Plan')

    const cancel = await app.request(`/api/portal/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      headers: authHeaders(memberToken),
    })
    expect(cancel.status).toBe(200)
  })

  it('turns member renewal into an auditable staff-approved request', async () => {
    const request = await app.request('/api/portal/requests', {
      method: 'POST',
      headers: authHeaders(memberToken),
      body: JSON.stringify({ requestType: 'renew' }),
    })
    expect(request.status).toBe(201)
    const requestBody = (await request.json()) as any
    requestId = Number(requestBody.data.id)

    const pending = await app.request('/api/fitness/requests', {
      headers: authHeaders(receptionToken),
    })
    expect(pending.status).toBe(200)
    const pendingBody = (await pending.json()) as any
    expect(pendingBody.data.some((row: any) => Number(row.id) === requestId)).toBe(true)

    const approve = await app.request(`/api/fitness/requests/${requestId}/resolve`, {
      method: 'POST',
      headers: authHeaders(receptionToken),
      body: JSON.stringify({ decision: 'approve' }),
    })
    expect(approve.status).toBe(200)

    const approveAgain = await app.request(
      `/api/fitness/requests/${requestId}/resolve`,
      {
        method: 'POST',
        headers: authHeaders(receptionToken),
        body: JSON.stringify({ decision: 'approve' }),
      },
    )
    expect(approveAgain.status).toBe(404)

    const requests = await app.request('/api/portal/requests', {
      headers: authHeaders(memberToken),
    })
    const requestsBody = (await requests.json()) as any
    const resolved = requestsBody.data.find((row: any) => Number(row.id) === requestId)
    expect(resolved.status).toBe('Approved')
  })

  it('revokes an existing member session after a password change', async () => {
    const changed = await app.request('/api/member-auth/change-password', {
      method: 'POST',
      headers: authHeaders(memberToken),
      body: JSON.stringify({
        currentPassword: memberPassword,
        newPassword: memberPassword2,
      }),
    })
    expect(changed.status).toBe(200)

    const revoked = await app.request('/api/member-auth/me', {
      headers: authHeaders(memberToken),
    })
    expect(revoked.status).toBe(401)

    const login = await app.request('/api/member-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, password: memberPassword2 }),
    })
    expect(login.status).toBe(200)
    memberToken = ((await login.json()) as any).data.token
  })

  it('exposes request IDs, readiness and owner audit logs', async () => {
    const ready = await app.request('/ready')
    expect(ready.status).toBe(200)
    expect(ready.headers.get('x-request-id')).toBeTruthy()

    const audit = await app.request('/api/ops/audit?limit=50', {
      headers: authHeaders(ownerToken),
    })
    expect(audit.status).toBe(200)
    const auditBody = (await audit.json()) as any
    expect(auditBody.data.some((row: any) => row.action === 'member_portal.login')).toBe(
      true,
    )
  })
})
