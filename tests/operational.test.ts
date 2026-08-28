import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, or } from 'drizzle-orm'
import app from '../src/app.js'
import { closeDb, getDb } from '../src/db/client.js'
import {
  auditLogs,
  bookings,
  memberAccounts,
  memberTrainerAssignments,
  members,
  membershipActions,
  payments,
  trainers,
} from '../src/db/schema.js'
import { env } from '../src/env.js'

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function staffLogin() {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@elite.mm', password: env.SEED_OWNER_PASSWORD }),
  })
  expect(res.status).toBe(200)
  return ((await res.json()) as any).data.token as string
}

describe.sequential('operational V1 invariants', () => {
  let ownerToken = ''
  let memberToken = ''
  let memberId = 0
  let trainerId = 0
  let memberCode = ''
  const stamp = Date.now()
  const phone = `+95988${String(stamp).slice(-7)}`
  const email = `ops-${stamp}@example.test`
  const memberPassword = `OpsPortal${String(stamp).slice(-5)}A1`

  beforeAll(async () => {
    ownerToken = await staffLogin()
    const create = await app.request('/api/members', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({ name: `OPS Member ${stamp}`, phone, email, package: 'standard' }),
    })
    expect(create.status).toBe(200)
    const member = ((await create.json()) as any).data
    memberId = Number(member.id)
    memberCode = member.code

    const activate = await app.request('/api/member-auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, phone, password: memberPassword }),
    })
    expect(activate.status).toBe(201)
    const login = await app.request('/api/member-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, password: memberPassword }),
    })
    expect(login.status).toBe(200)
    memberToken = ((await login.json()) as any).data.token
  })

  afterAll(async () => {
    const db = getDb()
    if (memberId) {
      await db.delete(memberTrainerAssignments).where(eq(memberTrainerAssignments.memberId, memberId))
      await db.delete(bookings).where(eq(bookings.memberId, memberId))
      await db.delete(membershipActions).where(eq(membershipActions.memberId, memberId))
      await db.delete(payments).where(eq(payments.memberId, memberId))
      await db.delete(memberAccounts).where(eq(memberAccounts.memberId, memberId))
      await db.delete(auditLogs).where(eq(auditLogs.actorMemberId, memberId))
      await db.delete(members).where(eq(members.id, memberId))
    }
    if (trainerId) {
      await db.delete(auditLogs).where(
        or(eq(auditLogs.entityId, String(trainerId)), eq(auditLogs.entityId, trainerId)),
      )
      await db.delete(trainers).where(eq(trainers.id, trainerId))
    }
    await closeDb()
  })

  it('creates one receipt for repeated payment idempotency key', async () => {
    const idempotencyKey = `ops-pay-${stamp}`
    const payload = {
      memberId,
      packageName: 'Standard',
      amount: 54321,
      status: 'Paid',
      paymentMethod: 'Cash',
      idempotencyKey,
    }
    const first = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify(payload),
    })
    expect(first.status).toBe(200)
    const firstPayment = ((await first.json()) as any).data
    expect(firstPayment.receiptNo).toMatch(/^RCPT-\d+$/)

    const second = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify(payload),
    })
    expect(second.status).toBe(200)
    const secondPayment = ((await second.json()) as any).data
    expect(secondPayment.id).toBe(firstPayment.id)
    expect(secondPayment.receiptNo).toBe(firstPayment.receiptNo)

    const db = getDb()
    const rows = await db.select().from(payments).where(eq(payments.idempotencyKey, idempotencyKey))
    expect(rows).toHaveLength(1)
  })

  it('commits a paid renewal and receipt atomically and only once', async () => {
    const db = getDb()
    const [before] = await db
      .select({ expireDate: members.expireDate })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1)
    expect(before).toBeTruthy()

    const idempotencyKey = `ops-renew-${stamp}`
    const payload = {
      memberId,
      packageName: 'Standard',
      amount: 350000,
      status: 'Paid',
      paymentMethod: 'Cash',
      membershipAction: 'renew',
      idempotencyKey,
    }
    const first = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify(payload),
    })
    expect(first.status).toBe(200)
    const firstPayment = ((await first.json()) as any).data
    expect(firstPayment.membershipAction).toBe('renew')
    expect(firstPayment.receiptNo).toMatch(/^RCPT-\d+$/)

    const [afterFirst] = await db
      .select({ expireDate: members.expireDate })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1)
    expect(String(afterFirst?.expireDate)).not.toBe(String(before?.expireDate))

    const retry = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify(payload),
    })
    expect(retry.status).toBe(200)
    expect(((await retry.json()) as any).data.id).toBe(firstPayment.id)

    const [afterRetry] = await db
      .select({ expireDate: members.expireDate })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1)
    expect(String(afterRetry?.expireDate)).toBe(String(afterFirst?.expireDate))

    const reusedForDifferentAmount = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({ ...payload, amount: 350001 }),
    })
    expect(reusedForDifferentAmount.status).toBe(409)

    const unpaidAction = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({
        ...payload,
        idempotencyKey: `${idempotencyKey}-pending`,
        status: 'Pending',
      }),
    })
    expect(unpaidAction.status).toBe(400)
  })

  it('assigns a trainer and rejects overlapping member booking', async () => {
    const trainerCreate = await app.request('/api/trainers', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({ fullName: `OPS Trainer ${stamp}`, specialty: 'Strength' }),
    })
    expect(trainerCreate.status).toBe(201)
    trainerId = Number(((await trainerCreate.json()) as any).data.id)

    const assign = await app.request(`/api/fitness/members/${memberId}/trainer`, {
      method: 'PUT',
      headers: auth(ownerToken),
      body: JSON.stringify({ trainerId, notes: 'Operational test assignment' }),
    })
    expect(assign.status).toBe(200)
    expect(Number(((await assign.json()) as any).data.trainerId)).toBe(trainerId)

    const scheduledAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    const first = await app.request('/api/portal/bookings', {
      method: 'POST',
      headers: auth(memberToken),
      body: JSON.stringify({ trainerId, sessionType: 'Strength', scheduledAt, durationMinutes: 60 }),
    })
    expect(first.status).toBe(201)

    const duplicate = await app.request('/api/portal/bookings', {
      method: 'POST',
      headers: auth(memberToken),
      body: JSON.stringify({ trainerId, sessionType: 'Strength', scheduledAt, durationMinutes: 60 }),
    })
    expect(duplicate.status).toBe(409)
    expect(((await duplicate.json()) as any).message).toMatch(/already has a booking/i)
  })
})
