import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, or } from 'drizzle-orm'
import app from '../src/app.js'
import { closeDb, getDb } from '../src/db/client.js'
import {
  auditLogs,
  members,
  membershipActions,
  membershipPackagePriceHistory,
  membershipPackages,
  payments,
} from '../src/db/schema.js'
import { env } from '../src/env.js'

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function login(email: string, password: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  return ((await response.json()) as any).data.token as string
}

describe.sequential('V1.1 membership package engine', () => {
  const stamp = Date.now()
  const code = `flex-${String(stamp).slice(-8)}`
  const name = `Flex ${String(stamp).slice(-6)}`
  const phone = `+95977${String(stamp).slice(-7)}`
  const email = `pkg-${stamp}@example.test`
  let ownerToken = ''
  let receptionToken = ''
  let packageId = 0
  let memberId = 0

  beforeAll(async () => {
    ownerToken = await login('owner@elite.mm', env.SEED_OWNER_PASSWORD ?? '')
    receptionToken = await login('reception@elite.mm', env.SEED_RECEPTION_PASSWORD ?? '')
  })

  afterAll(async () => {
    const db = getDb()
    if (memberId) {
      await db.delete(membershipActions).where(eq(membershipActions.memberId, memberId))
      await db.delete(payments).where(eq(payments.memberId, memberId))
      await db.delete(members).where(eq(members.id, memberId))
    }
    if (packageId) {
      await db.delete(membershipPackagePriceHistory).where(eq(membershipPackagePriceHistory.packageId, packageId))
      await db.delete(auditLogs).where(
        or(
          eq(auditLogs.entityId, String(packageId)),
          eq(auditLogs.entityId, packageId),
        ),
      )
      await db.delete(membershipPackages).where(eq(membershipPackages.id, packageId))
    }
    await closeDb()
  })

  it('creates a configurable package, exposes it publicly, and records price history', async () => {
    const denied = await app.request('/api/packages/admin', {
      headers: auth(receptionToken),
    })
    expect(denied.status).toBe(403)

    const create = await app.request('/api/packages', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({
        code,
        name,
        description: 'Flexible test membership',
        priceMmk: 220000,
        durationDays: 45,
        freezeAllowanceDays: 7,
        renewalWindowDays: 21,
        allowUpgrade: true,
        allowDowngrade: true,
        sortOrder: 25,
      }),
    })
    expect(create.status).toBe(201)
    const created = ((await create.json()) as any).data
    packageId = Number(created.id)
    expect(created.code).toBe(code)
    expect(created.priceMmk).toBe(220000)
    expect(created.durationDays).toBe(45)
    expect(created.freezeAllowanceDays).toBe(7)

    const publicList = await app.request('/api/packages')
    expect(publicList.status).toBe(200)
    const publicPackages = ((await publicList.json()) as any).data as any[]
    expect(publicPackages.some((item) => item.code === code)).toBe(true)

    const update = await app.request(`/api/packages/${packageId}`, {
      method: 'PATCH',
      headers: auth(ownerToken),
      body: JSON.stringify({ priceMmk: 230000, renewalWindowDays: 28 }),
    })
    expect(update.status).toBe(200)
    expect(((await update.json()) as any).data.priceMmk).toBe(230000)

    const history = await app.request(`/api/packages/${packageId}/prices`, {
      headers: auth(ownerToken),
    })
    expect(history.status).toBe(200)
    const prices = ((await history.json()) as any).data as any[]
    expect(prices.map((item) => item.priceMmk)).toEqual(expect.arrayContaining([220000, 230000]))
  })

  it('creates members from a custom package and stores payment package snapshots', async () => {
    const createMember = await app.request('/api/members', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({ name: `Package Member ${stamp}`, phone, email, package: code }),
    })
    expect(createMember.status).toBe(200)
    const member = ((await createMember.json()) as any).data
    memberId = Number(member.id)
    expect(member.package).toBe(name)

    const payment = await app.request('/api/payments', {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({
        memberId,
        packageName: code,
        amount: 200000,
        status: 'Paid',
        paymentMethod: 'Cash',
        idempotencyKey: `pkg-pay-${stamp}`,
      }),
    })
    expect(payment.status).toBe(200)
    const receipt = ((await payment.json()) as any).data
    expect(receipt.packageCode).toBe(code)
    expect(receipt.packagePriceMmk).toBe(230000)
    expect(receipt.amount).toBe(200000)

    const [row] = await getDb().select().from(payments).where(eq(payments.id, Number(receipt.id))).limit(1)
    expect(row?.packageId).toBe(packageId)
    expect(row?.packageCode).toBe(code)
    expect(Number(row?.packagePriceMmk)).toBe(230000)
  })

  it('enforces database-driven upgrade and downgrade rules', async () => {
    const upgrade = await app.request(`/api/members/${memberId}/actions`, {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({ action: 'upgrade', package: 'standard' }),
    })
    expect(upgrade.status).toBe(200)
    expect(((await upgrade.json()) as any).data.package).toBe('Standard')

    const invalidUpgrade = await app.request(`/api/members/${memberId}/actions`, {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({ action: 'upgrade', package: code }),
    })
    expect(invalidUpgrade.status).toBe(400)

    const downgrade = await app.request(`/api/members/${memberId}/actions`, {
      method: 'POST',
      headers: auth(ownerToken),
      body: JSON.stringify({ action: 'downgrade', package: code }),
    })
    expect(downgrade.status).toBe(200)
    expect(((await downgrade.json()) as any).data.package).toBe(name)

    const deactivate = await app.request(`/api/packages/${packageId}`, {
      method: 'PATCH',
      headers: auth(ownerToken),
      body: JSON.stringify({ isActive: false }),
    })
    expect(deactivate.status).toBe(200)

    const publicList = await app.request('/api/packages')
    const publicPackages = ((await publicList.json()) as any).data as any[]
    expect(publicPackages.some((item) => item.code === code)).toBe(false)
  })
})
