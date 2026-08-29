import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import app from '../src/app.js'
import { closeDb, getDb } from '../src/db/client.js'
import {
  checkins,
  members,
  membershipActions,
  payments,
  trialRegistrations,
} from '../src/db/schema.js'
import { env } from '../src/env.js'

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function login(email: string, password: string) {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(res.status).toBe(200)
  const body = await res.json() as any
  expect(body.success).toBe(true)
  expect(body.data.token).toBeTruthy()
  return body.data.token as string
}

describe.sequential('live API integration with TiDB', () => {
  let ownerToken = ''
  let receptionToken = ''
  let memberId = 0
  let memberName = ''
  let trialId = 0
  let trialMemberId = 0
  let dashboardCheckinsBefore = 0

  beforeAll(async () => {
    ownerToken = await login('owner@elite.mm', env.SEED_OWNER_PASSWORD)
    receptionToken = await login('reception@elite.mm', env.SEED_RECEPTION_PASSWORD)

    const dashboardRes = await app.request('/api/dashboard', {
      headers: authHeaders(ownerToken),
    })
    expect(dashboardRes.status).toBe(200)
    const dashboard = await dashboardRes.json() as any
    dashboardCheckinsBefore = Number(dashboard.data.stats.todayCheckins)
  })

  afterAll(async () => {
    const db = getDb()
    for (const id of [memberId, trialMemberId].filter(Boolean)) {
      await db.delete(membershipActions).where(eq(membershipActions.memberId, id))
      await db.delete(checkins).where(eq(checkins.memberId, id))
      await db.delete(payments).where(eq(payments.memberId, id))
      await db.delete(members).where(eq(members.id, id))
    }
    if (trialId) {
      await db.delete(trialRegistrations).where(eq(trialRegistrations.id, trialId))
    }
    await closeDb()
  })

  it('rejects unauthenticated member access and bad credentials', async () => {
    const membersRes = await app.request('/api/members')
    expect(membersRes.status).toBe(401)

    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@elite.mm', password: 'definitely-wrong' }),
    })
    expect(loginRes.status).toBe(401)
  })

  it('rejects invalid member input', async () => {
    const res = await app.request('/api/members', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ name: 'X', phone: 'bad', package: 'standard' }),
    })
    expect(res.status).toBe(400)
  })

  it('authenticates owner and resolves /auth/me', async () => {
    const res = await app.request('/api/auth/me', {
      headers: authHeaders(ownerToken),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.email).toBe('owner@elite.mm')
    expect(body.data.role).toBe('owner')
  })

  it('creates and searches a temporary member', async () => {
    memberName = `E2E Member ${Date.now()}`
    const createRes = await app.request('/api/members', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        name: memberName,
        phone: '+95 9 999 000 111',
        email: `e2e-${Date.now()}@example.test`,
        package: 'premium',
      }),
    })
    expect(createRes.status).toBe(200)
    const created = await createRes.json() as any
    expect(created.success).toBe(true)
    memberId = Number(created.data.id)
    expect(memberId).toBeGreaterThan(0)
    expect(created.data.status).toBe('Active')

    const searchRes = await app.request(`/api/members?q=${encodeURIComponent(memberName)}`, {
      headers: authHeaders(ownerToken),
    })
    expect(searchRes.status).toBe(200)
    const search = await searchRes.json() as any
    expect(search.data.some((member: any) => Number(member.id) === memberId)).toBe(true)
  })

  it('rejects duplicate member phone and email', async () => {
    const duplicatePhone = await app.request('/api/members', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        name: 'Duplicate Phone',
        phone: '+95 9 999 000 111',
        email: `unique-${Date.now()}@example.test`,
        package: 'standard',
      }),
    })
    expect(duplicatePhone.status).toBe(409)

    const memberRes = await app.request(`/api/members/${memberId}`, {
      headers: authHeaders(ownerToken),
    })
    const member = await memberRes.json() as any
    const duplicateEmail = await app.request('/api/members', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        name: 'Duplicate Email',
        phone: '+95 9 999 000 222',
        email: member.data.email,
        package: 'standard',
      }),
    })
    expect(duplicateEmail.status).toBe(409)
  })

  it('registers, searches and converts a trial exactly once', async () => {
    const stamp = Date.now()
    const trialName = `E2E Trial ${stamp}`
    const trialPhone = `+95 9 77${String(stamp).slice(-7)}`
    const trialEmail = `trial-${stamp}@example.test`

    const createTrial = await app.request('/api/trials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: trialName,
        phone: trialPhone,
        email: trialEmail,
        package: 'premium',
      }),
    })
    expect(createTrial.status).toBe(200)
    const createdTrial = await createTrial.json() as any
    trialId = Number(createdTrial.data.id)
    expect(trialId).toBeGreaterThan(0)

    const searchTrial = await app.request(`/api/trials?q=${encodeURIComponent(trialName)}`, {
      headers: authHeaders(receptionToken),
    })
    expect(searchTrial.status).toBe(200)
    const trials = await searchTrial.json() as any
    expect(trials.data.some((trial: any) => Number(trial.id) === trialId)).toBe(true)

    const convert = await app.request(`/api/trials/${trialId}/convert`, {
      method: 'POST',
      headers: authHeaders(receptionToken),
      body: JSON.stringify({ package: 'premium' }),
    })
    expect(convert.status).toBe(200)
    const converted = await convert.json() as any
    trialMemberId = Number(converted.data.id)
    expect(trialMemberId).toBeGreaterThan(0)
    expect(converted.data.name).toBe(trialName)
    expect(converted.data.status).toBe('Active')

    const convertAgain = await app.request(`/api/trials/${trialId}/convert`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({}),
    })
    expect(convertAgain.status).toBe(409)
  })

  it('checks in once, rejects an immediate duplicate, and updates dashboard', async () => {
    const first = await app.request(`/api/members/${memberId}/checkins`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
    })
    expect(first.status).toBe(200)
    const firstBody = await first.json() as any
    expect(firstBody.success).toBe(true)
    expect(Number(firstBody.data.memberId)).toBe(memberId)

    const duplicate = await app.request(`/api/members/${memberId}/checkins`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
    })
    expect(duplicate.status).toBe(409)
    const duplicateBody = await duplicate.json() as any
    expect(duplicateBody.success).toBe(false)
    expect(duplicateBody.message).toMatch(/already checked in/i)

    const dashboardRes = await app.request('/api/dashboard', {
      headers: authHeaders(ownerToken),
    })
    const dashboard = await dashboardRes.json() as any
    expect(Number(dashboard.data.stats.todayCheckins)).toBeGreaterThanOrEqual(
      dashboardCheckinsBefore + 1,
    )
  })

  it('blocks check-in for a frozen membership and renews it', async () => {
    const freeze = await app.request(`/api/members/${memberId}/actions`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ action: 'freeze' }),
    })
    expect(freeze.status).toBe(200)
    const frozen = await freeze.json() as any
    expect(frozen.data.status).toBe('Frozen')

    const blocked = await app.request(`/api/members/${memberId}/checkins`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
    })
    expect(blocked.status).toBe(409)
    const blockedBody = await blocked.json() as any
    expect(blockedBody.message).toMatch(/not active/i)

    const renew = await app.request(`/api/members/${memberId}/actions`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ action: 'renew' }),
    })
    expect(renew.status).toBe(200)
    const renewed = await renew.json() as any
    expect(renewed.data.status).toBe('Active')
  })

  it('allows reception to record payments under V1.1 RBAC', async () => {
    const res = await app.request('/api/payments', {
      method: 'POST',
      headers: authHeaders(receptionToken),
      body: JSON.stringify({
        memberId,
        packageName: 'Premium',
        amount: 1000,
        status: 'Paid',
        paymentMethod: 'Cash',
        idempotencyKey: `integration-reception-${Date.now()}`,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.receiptNo).toMatch(/^RCPT-\d+$/)
  })
})
