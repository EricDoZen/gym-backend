import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { checkins, memberNotes, members, payments, staffUsers } from '../db/schema.js'
import { getInsertId } from '../lib/insert-id.js'
import { toCheckinDto, toPaymentDto } from '../lib/mappers.js'
import { httpError } from '../middleware/error.js'
import {
  getActiveWorkoutPlan,
  getMemberTrainerAssignment,
  listMemberBookings,
  listMemberRequests,
  listProgress,
} from './fitness.service.js'
import { getMemberById } from './member.service.js'

export async function listMemberNotes(memberId: number) {
  const db = getDb()
  const rows = await db
    .select({
      id: memberNotes.id,
      memberId: memberNotes.memberId,
      note: memberNotes.note,
      createdByStaffId: memberNotes.createdByStaffId,
      createdByName: staffUsers.fullName,
      createdAt: memberNotes.createdAt,
    })
    .from(memberNotes)
    .leftJoin(staffUsers, eq(memberNotes.createdByStaffId, staffUsers.id))
    .where(eq(memberNotes.memberId, memberId))
    .orderBy(desc(memberNotes.createdAt), desc(memberNotes.id))
    .limit(100)
  return rows.map((row) => ({
    id: String(row.id),
    memberId: String(row.memberId),
    note: row.note,
    createdByStaffId: String(row.createdByStaffId),
    createdByName: row.createdByName ?? 'Staff',
    createdAt: row.createdAt,
  }))
}

export async function addMemberNote(memberId: number, staffId: number, note: string) {
  const db = getDb()
  const [member] = await db.select({ id: members.id }).from(members).where(eq(members.id, memberId)).limit(1)
  if (!member) httpError(404, 'Member not found')
  const result = await db.insert(memberNotes).values({
    memberId,
    createdByStaffId: staffId,
    note: note.trim(),
  })
  const id = String(getInsertId(result))
  return (await listMemberNotes(memberId)).find((item) => item.id === id)
}

export async function getMemberOverview(memberId: number) {
  const db = getDb()
  const member = await getMemberById(memberId)
  const [paymentRows, checkinRows, bookings, requests, assignment, progress, workout, notes] = await Promise.all([
    db
      .select({
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
      })
      .from(payments)
      .innerJoin(members, eq(payments.memberId, members.id))
      .where(eq(payments.memberId, memberId))
      .orderBy(desc(payments.paymentDate), desc(payments.id))
      .limit(50),
    db
      .select({
        id: checkins.id,
        memberId: checkins.memberId,
        memberName: members.fullName,
        membershipType: checkins.membershipType,
        checkedInAt: checkins.checkedInAt,
      })
      .from(checkins)
      .innerJoin(members, eq(checkins.memberId, members.id))
      .where(eq(checkins.memberId, memberId))
      .orderBy(desc(checkins.checkedInAt))
      .limit(50),
    listMemberBookings(memberId),
    listMemberRequests(memberId),
    getMemberTrainerAssignment(memberId),
    listProgress(memberId),
    getActiveWorkoutPlan(memberId),
    listMemberNotes(memberId),
  ])

  return {
    member,
    payments: paymentRows.map(toPaymentDto),
    checkins: checkinRows.map(toCheckinDto),
    bookings,
    requests,
    trainerAssignment: assignment,
    progress,
    workout,
    notes,
  }
}
