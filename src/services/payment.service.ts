import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { members, paymentAdjustments, payments } from '../db/schema.js'
import { parseFlexibleDate, toSqlDate } from '../lib/dates.js'
import { getInsertId } from '../lib/insert-id.js'
import { toPaymentDto } from '../lib/mappers.js'
import { httpError } from '../middleware/error.js'
import { performMemberActionInDb } from './member.service.js'
import { resolveMembershipPackage } from './package.service.js'

const paymentSelect = {
  id: payments.id,
  memberId: payments.memberId,
  memberName: members.fullName,
  packageId: payments.packageId,
  packageCode: payments.packageCode,
  packageName: payments.packageName,
  packagePriceMmk: payments.packagePriceMmk,
  amountMmk: payments.amountMmk,
  status: payments.status,
  paymentMethod: payments.paymentMethod,
  referenceNo: payments.referenceNo,
  receiptNo: payments.receiptNo,
  membershipAction: payments.membershipAction,
  paymentDate: payments.paymentDate,
}

export async function listPayments(status?: string) {
  const db = getDb()
  const baseQuery = db
    .select(paymentSelect)
    .from(payments)
    .innerJoin(members, eq(payments.memberId, members.id))

  const rows =
    status && status !== 'all' && ['Paid', 'Pending', 'Overdue'].includes(status)
      ? await baseQuery
          .where(eq(payments.status, status as 'Paid' | 'Pending' | 'Overdue'))
          .orderBy(desc(payments.paymentDate), desc(payments.id))
      : await baseQuery.orderBy(desc(payments.paymentDate), desc(payments.id))

  return rows.map(toPaymentDto)
}

export async function getPaymentById(id: number) {
  const db = getDb()
  const [row] = await db
    .select(paymentSelect)
    .from(payments)
    .innerJoin(members, eq(payments.memberId, members.id))
    .where(eq(payments.id, id))
    .limit(1)
  if (!row) httpError(404, 'Payment not found')
  return toPaymentDto(row)
}

type MembershipPaymentAction = 'renew' | 'upgrade' | 'downgrade'

type CreatePaymentInput = {
  memberId: number
  packageName: string
  amount: number
  status: 'Paid' | 'Pending' | 'Overdue'
  paymentMethod?: string
  referenceNo?: string
  idempotencyKey: string
  membershipAction?: MembershipPaymentAction
  paymentDate?: string
  createdByStaffId: number
}

function assertSameIdempotentPayment(
  existing: typeof payments.$inferSelect,
  input: CreatePaymentInput,
  selectedPackage: { id: number; code: string; name: string },
) {
  const samePackage = existing.packageId != null
    ? existing.packageId === selectedPackage.id
    : existing.packageName === selectedPackage.name
  const same =
    existing.memberId === input.memberId &&
    samePackage &&
    Number(existing.amountMmk) === input.amount &&
    existing.status === input.status &&
    (existing.membershipAction ?? null) === (input.membershipAction ?? null)
  if (!same) {
    httpError(409, 'Idempotency key was already used for a different payment')
  }
}

export async function createPayment(input: CreatePaymentInput) {
  const db = getDb()
  const selectedPackage = await resolveMembershipPackage(db, input.packageName)

  if (input.membershipAction && input.status !== 'Paid') {
    httpError(400, 'Membership changes can only be applied to paid payments')
  }

  const [existing] = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, input.idempotencyKey))
    .limit(1)
  if (existing) {
    assertSameIdempotentPayment(existing, input, selectedPackage)
    return getPaymentById(existing.id)
  }

  const paymentDate = input.paymentDate
    ? toSqlDate(parseFlexibleDate(input.paymentDate))
    : toSqlDate(new Date())

  let insertedId = 0
  try {
    insertedId = await db.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(members)
        .where(eq(members.id, input.memberId))
        .limit(1)
      if (!member) httpError(404, 'Member not found')

      const currentPackage = await resolveMembershipPackage(
        tx,
        member.packageId ?? member.packageName,
        { activeOnly: false },
      )
      if (input.membershipAction === 'renew' && currentPackage.id !== selectedPackage.id) {
        httpError(400, 'Renewal payment package must match the current membership package')
      }

      const result = await tx.insert(payments).values({
        memberId: input.memberId,
        packageId: selectedPackage.id,
        packageCode: selectedPackage.code,
        packageName: selectedPackage.name,
        packagePriceMmk: Number(selectedPackage.priceMmk),
        amountMmk: input.amount,
        status: input.status,
        paymentMethod: input.paymentMethod?.trim() || 'Cash',
        referenceNo: input.referenceNo?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        membershipAction: input.membershipAction ?? null,
        paymentDate,
        createdByStaffId: input.createdByStaffId,
      })
      const id = getInsertId(result)
      const receiptNo = `RCPT-${String(id).padStart(8, '0')}`
      await tx.update(payments).set({ receiptNo }).where(eq(payments.id, id))

      if (input.membershipAction === 'renew') {
        await performMemberActionInDb(tx, input.memberId, 'renew')
      } else if (input.membershipAction === 'upgrade') {
        await performMemberActionInDb(tx, input.memberId, 'upgrade', selectedPackage.code)
      } else if (input.membershipAction === 'downgrade') {
        await performMemberActionInDb(tx, input.memberId, 'downgrade', selectedPackage.code)
      }

      return id
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/uk_payments_idempotency|idempotency/i.test(message)) {
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, input.idempotencyKey))
        .limit(1)
      if (row) {
        assertSameIdempotentPayment(row, input, selectedPackage)
        return getPaymentById(row.id)
      }
    }
    throw error
  }

  return getPaymentById(insertedId)
}

export async function listPaymentAdjustments(paymentId: number) {
  const db = getDb()
  const rows = await db
    .select()
    .from(paymentAdjustments)
    .where(eq(paymentAdjustments.paymentId, paymentId))
    .orderBy(desc(paymentAdjustments.createdAt), desc(paymentAdjustments.id))
  return rows.map((row) => ({
    id: String(row.id),
    paymentId: String(row.paymentId),
    type: row.adjustmentType,
    amount: Number(row.amountMmk),
    reason: row.reason,
    createdByStaffId: String(row.createdByStaffId),
    createdAt: row.createdAt,
  }))
}

export async function createPaymentAdjustment(
  paymentId: number,
  input: { type: 'refund' | 'void'; amount?: number; reason: string; createdByStaffId: number },
) {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`)
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
    if (!payment) httpError(404, 'Payment not found')
    if (payment.status !== 'Paid') httpError(409, 'Only paid payments can be refunded or voided')

    const existing = await tx
      .select()
      .from(paymentAdjustments)
      .where(eq(paymentAdjustments.paymentId, paymentId))
    if (existing.some((item) => item.adjustmentType === 'void')) {
      httpError(409, 'Payment has already been voided')
    }
    const adjusted = existing.reduce((total, item) => total + Number(item.amountMmk), 0)
    const remaining = Number(payment.amountMmk) - adjusted
    if (remaining <= 0) httpError(409, 'Payment has no refundable balance remaining')

    const amount = input.type === 'void' ? Number(payment.amountMmk) : Math.round(input.amount ?? 0)
    if (input.type === 'void' && existing.length > 0) {
      httpError(409, 'A partially adjusted payment cannot be voided; refund the remaining balance instead')
    }
    if (input.type === 'refund' && amount <= 0) {
      httpError(400, 'Refund amount must be positive')
    }
    if (input.type === 'refund' && amount > remaining) {
      httpError(409, `Refund amount exceeds remaining balance of ${remaining}`)
    }

    await tx.insert(paymentAdjustments).values({
      paymentId,
      adjustmentType: input.type,
      amountMmk: amount,
      reason: input.reason.trim(),
      createdByStaffId: input.createdByStaffId,
    })
  })

  const payment = await getPaymentById(paymentId)
  const adjustments = await listPaymentAdjustments(paymentId)
  const adjustedAmount = adjustments.reduce((total, item) => total + item.amount, 0)
  const originalAmount = payment.amount
  const remainingAmount = Math.max(0, originalAmount - adjustedAmount)
  return {
    payment,
    adjustments,
    originalAmount,
    adjustedAmount,
    remainingAmount,
    netAmount: remainingAmount,
    voided: adjustments.some((item) => item.type === 'void'),
  }
}
