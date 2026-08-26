import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { members, payments } from '../db/schema.js'
import { parseFlexibleDate, toSqlDate } from '../lib/dates.js'
import { getInsertId } from '../lib/insert-id.js'
import { toPaymentDto } from '../lib/mappers.js'
import { normalizePackageName } from '../lib/member-code.js'
import { httpError } from '../middleware/error.js'

export async function listPayments(status?: string) {
  const db = getDb()
  const baseQuery = db
    .select({
      id: payments.id,
      memberId: payments.memberId,
      memberName: members.fullName,
      packageName: payments.packageName,
      amountMmk: payments.amountMmk,
      status: payments.status,
      paymentDate: payments.paymentDate,
    })
    .from(payments)
    .innerJoin(members, eq(payments.memberId, members.id))

  const rows =
    status && status !== 'all' && ['Paid', 'Pending', 'Overdue'].includes(status)
      ? await baseQuery
          .where(eq(payments.status, status as 'Paid' | 'Pending' | 'Overdue'))
          .orderBy(desc(payments.paymentDate))
      : await baseQuery.orderBy(desc(payments.paymentDate))

  return rows.map((row) => toPaymentDto(row))
}

export async function createPayment(input: {
  memberId: number
  packageName: string
  amount: number
  status: 'Paid' | 'Pending' | 'Overdue'
  paymentDate?: string
}) {
  const db = getDb()
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, input.memberId))
    .limit(1)
  if (!member) httpError(404, 'Member not found')

  const paymentDate = input.paymentDate
    ? toSqlDate(parseFlexibleDate(input.paymentDate))
    : toSqlDate(new Date())

  const result = await db.insert(payments).values({
    memberId: input.memberId,
    packageName: normalizePackageName(input.packageName),
    amountMmk: input.amount,
    status: input.status,
    paymentDate,
  })

  const insertedId = getInsertId(result)
  const [row] = await db
    .select({
      id: payments.id,
      memberId: payments.memberId,
      memberName: members.fullName,
      packageName: payments.packageName,
      amountMmk: payments.amountMmk,
      status: payments.status,
      paymentDate: payments.paymentDate,
    })
    .from(payments)
    .innerJoin(members, eq(payments.memberId, members.id))
    .where(eq(payments.id, insertedId))
    .limit(1)

  if (!row) httpError(500, 'Failed to create payment')
  return toPaymentDto(row)
}
