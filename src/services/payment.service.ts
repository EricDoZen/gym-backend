import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { members, payments } from '../db/schema.js'
import { parseFlexibleDate, toSqlDate } from '../lib/dates.js'
import { getInsertId } from '../lib/insert-id.js'
import { toPaymentDto } from '../lib/mappers.js'
import { normalizePackageName } from '../lib/member-code.js'
import { httpError } from '../middleware/error.js'
import { performMemberActionInDb } from './member.service.js'

const paymentSelect = {
  id: payments.id,
  memberId: payments.memberId,
  memberName: members.fullName,
  packageName: payments.packageName,
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

type MembershipPaymentAction = 'renew' | 'upgrade'

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
  normalizedPackage: string,
) {
  const same =
    existing.memberId === input.memberId &&
    existing.packageName === normalizedPackage &&
    Number(existing.amountMmk) === input.amount &&
    existing.status === input.status &&
    (existing.membershipAction ?? null) === (input.membershipAction ?? null)
  if (!same) {
    httpError(409, 'Idempotency key was already used for a different payment')
  }
}

export async function createPayment(input: CreatePaymentInput) {
  const db = getDb()
  const normalizedPackage = normalizePackageName(input.packageName)

  if (input.membershipAction && input.status !== 'Paid') {
    httpError(400, 'Membership changes can only be applied to paid payments')
  }

  const [existing] = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, input.idempotencyKey))
    .limit(1)
  if (existing) {
    assertSameIdempotentPayment(existing, input, normalizedPackage)
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

      if (input.membershipAction === 'renew' && member.packageName !== normalizedPackage) {
        httpError(400, 'Renewal payment package must match the current membership package')
      }

      const result = await tx.insert(payments).values({
        memberId: input.memberId,
        packageName: normalizedPackage,
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
        await performMemberActionInDb(tx, input.memberId, 'upgrade', normalizedPackage)
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
        assertSameIdempotentPayment(row, input, normalizedPackage)
        return getPaymentById(row.id)
      }
    }
    throw error
  }

  return getPaymentById(insertedId)
}
