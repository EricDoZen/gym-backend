import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { members, payments } from '../db/schema.js'
import { parseFlexibleDate, toSqlDate } from '../lib/dates.js'
import { getInsertId } from '../lib/insert-id.js'
import { toPaymentDto } from '../lib/mappers.js'
import { normalizePackageName } from '../lib/member-code.js'
import { httpError } from '../middleware/error.js'

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

export async function createPayment(input: {
  memberId: number
  packageName: string
  amount: number
  status: 'Paid' | 'Pending' | 'Overdue'
  paymentMethod?: string
  referenceNo?: string
  idempotencyKey: string
  paymentDate?: string
  createdByStaffId: number
}) {
  const db = getDb()

  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.idempotencyKey, input.idempotencyKey))
    .limit(1)
  if (existing) return getPaymentById(existing.id)

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, input.memberId))
    .limit(1)
  if (!member) httpError(404, 'Member not found')

  const paymentDate = input.paymentDate
    ? toSqlDate(parseFlexibleDate(input.paymentDate))
    : toSqlDate(new Date())

  let insertedId = 0
  try {
    const result = await db.insert(payments).values({
      memberId: input.memberId,
      packageName: normalizePackageName(input.packageName),
      amountMmk: input.amount,
      status: input.status,
      paymentMethod: input.paymentMethod?.trim() || 'Cash',
      referenceNo: input.referenceNo?.trim() || null,
      idempotencyKey: input.idempotencyKey,
      paymentDate,
      createdByStaffId: input.createdByStaffId,
    })
    insertedId = getInsertId(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/uk_payments_idempotency|idempotency/i.test(message)) {
      const [row] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.idempotencyKey, input.idempotencyKey))
        .limit(1)
      if (row) return getPaymentById(row.id)
    }
    throw error
  }

  const receiptNo = `RCPT-${String(insertedId).padStart(8, '0')}`
  await db.update(payments).set({ receiptNo }).where(eq(payments.id, insertedId))
  return getPaymentById(insertedId)
}
