import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import {
  bookings,
  memberRequests,
  members,
  memberTrainerAssignments,
  progressEntries,
  trainers,
  trainerTimeOff,
  trainerWeeklyAvailability,
  workoutPlans,
} from '../db/schema.js'
import { getInsertId } from '../lib/insert-id.js'
import { httpError } from '../middleware/error.js'
import { performMemberActionInDb } from './member.service.js'

export async function listTrainers(includeInactive = false) {
  const db = getDb()
  const rows = includeInactive
    ? await db.select().from(trainers).orderBy(trainers.fullName)
    : await db
        .select()
        .from(trainers)
        .where(eq(trainers.isActive, true))
        .orderBy(trainers.fullName)

  return rows.map((row) => ({
    id: String(row.id),
    name: row.fullName,
    specialty: row.specialty,
    phone: row.phone ?? '',
    email: row.email ?? '',
    isActive: row.isActive,
  }))
}

export async function createTrainer(input: {
  fullName: string
  specialty: string
  phone?: string
  email?: string
}) {
  const db = getDb()
  const result = await db.insert(trainers).values({
    fullName: input.fullName.trim(),
    specialty: input.specialty.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    isActive: true,
  })
  const id = getInsertId(result)
  return updateTrainer(id, {})
}

export async function updateTrainer(
  id: number,
  input: {
    fullName?: string
    specialty?: string
    phone?: string | null
    email?: string | null
    isActive?: boolean
  },
) {
  const db = getDb()
  if (Object.keys(input).length) {
    await db
      .update(trainers)
      .set({
        ...(input.fullName ? { fullName: input.fullName.trim() } : {}),
        ...(input.specialty ? { specialty: input.specialty.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.email !== undefined
          ? { email: input.email?.trim().toLowerCase() || null }
          : {}),
        ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      })
      .where(eq(trainers.id, id))
  }
  const [row] = await db.select().from(trainers).where(eq(trainers.id, id)).limit(1)
  if (!row) httpError(404, 'Trainer not found')
  return {
    id: String(row.id),
    name: row.fullName,
    specialty: row.specialty,
    phone: row.phone ?? '',
    email: row.email ?? '',
    isActive: row.isActive,
  }
}

export async function listMemberBookings(memberId: number) {
  const db = getDb()
  const rows = await db
    .select({
      id: bookings.id,
      sessionType: bookings.sessionType,
      scheduledAt: bookings.scheduledAt,
      durationMinutes: bookings.durationMinutes,
      status: bookings.status,
      notes: bookings.notes,
      trainerId: bookings.trainerId,
      trainerName: trainers.fullName,
    })
    .from(bookings)
    .leftJoin(trainers, eq(bookings.trainerId, trainers.id))
    .where(eq(bookings.memberId, memberId))
    .orderBy(desc(bookings.scheduledAt))
    .limit(100)

  return rows.map((row) => ({
    id: String(row.id),
    sessionType: row.sessionType,
    scheduledAt: row.scheduledAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    notes: row.notes ?? '',
    trainerId: row.trainerId == null ? null : String(row.trainerId),
    trainerName: row.trainerName ?? 'Gym Team',
  }))
}

export async function createMemberBooking(
  memberId: number,
  input: {
    trainerId?: number
    sessionType: string
    scheduledAt: Date
    durationMinutes?: number
    notes?: string
  },
) {
  const db = getDb()
  const [member] = await db
    .select({ id: members.id, status: members.status, expireDate: members.expireDate })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)
  if (!member) httpError(404, 'Member not found')
  if (member.status === 'Frozen') httpError(409, 'Frozen memberships cannot book sessions')
  if (new Date(member.expireDate) < new Date()) {
    httpError(409, 'Expired memberships cannot book sessions')
  }

  if (input.trainerId) {
    const [trainer] = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(and(eq(trainers.id, input.trainerId), eq(trainers.isActive, true)))
      .limit(1)
    if (!trainer) httpError(400, 'Trainer is not available')
  }

  const durationMinutes = Math.max(15, Math.min(240, input.durationMinutes ?? 60))
  if (input.trainerId) {
    const weekday = input.scheduledAt.getDay()
    const startMinute = input.scheduledAt.getHours() * 60 + input.scheduledAt.getMinutes()
    const endMinute = startMinute + durationMinutes
    const availability = await db
      .select()
      .from(trainerWeeklyAvailability)
      .where(
        and(
          eq(trainerWeeklyAvailability.trainerId, input.trainerId),
          eq(trainerWeeklyAvailability.weekday, weekday),
        ),
      )
    const configuredSlots = await db
      .select({ id: trainerWeeklyAvailability.id })
      .from(trainerWeeklyAvailability)
      .where(eq(trainerWeeklyAvailability.trainerId, input.trainerId))
      .limit(1)
    if (configuredSlots.length && !availability.some((slot) => startMinute >= slot.startMinute && endMinute <= slot.endMinute)) {
      httpError(409, 'Trainer is outside configured working hours')
    }

    const bookingEnd = new Date(input.scheduledAt.getTime() + durationMinutes * 60_000)
    const [timeOff] = await db
      .select({ id: trainerTimeOff.id })
      .from(trainerTimeOff)
      .where(
        and(
          eq(trainerTimeOff.trainerId, input.trainerId),
          sql`${trainerTimeOff.startsAt} < ${bookingEnd}`,
          sql`${trainerTimeOff.endsAt} > ${input.scheduledAt}`,
        ),
      )
      .limit(1)
    if (timeOff) httpError(409, 'Trainer is unavailable during this time')
  }
  const conflictWindowStart = new Date(input.scheduledAt.getTime() - (durationMinutes - 1) * 60_000)
  const conflictWindowEnd = new Date(input.scheduledAt.getTime() + (durationMinutes - 1) * 60_000)
  const conflictFilters = [
    eq(bookings.status, 'Booked'),
    gte(bookings.scheduledAt, conflictWindowStart),
    lte(bookings.scheduledAt, conflictWindowEnd),
    input.trainerId
      ? or(eq(bookings.memberId, memberId), eq(bookings.trainerId, input.trainerId))
      : eq(bookings.memberId, memberId),
  ]
  const [conflict] = await db
    .select({ id: bookings.id, memberId: bookings.memberId, trainerId: bookings.trainerId })
    .from(bookings)
    .where(and(...conflictFilters))
    .limit(1)
  if (conflict) {
    if (input.trainerId && conflict.trainerId === input.trainerId) {
      httpError(409, 'Trainer already has a booking near this time')
    }
    httpError(409, 'Member already has a booking near this time')
  }

  const result = await db.insert(bookings).values({
    memberId,
    trainerId: input.trainerId ?? null,
    sessionType: input.sessionType.trim(),
    scheduledAt: input.scheduledAt,
    durationMinutes,
    status: 'Booked',
    notes: input.notes?.trim() || null,
  })
  const id = getInsertId(result)
  const rows = await listMemberBookings(memberId)
  return rows.find((row) => row.id === String(id)) ?? rows[0]
}

export async function cancelMemberBooking(memberId: number, bookingId: number) {
  const db = getDb()
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.memberId, memberId)))
    .limit(1)
  if (!booking) httpError(404, 'Booking not found')
  if (booking.status !== 'Booked') httpError(409, 'Only booked sessions can be cancelled')
  await db
    .update(bookings)
    .set({ status: 'Cancelled' })
    .where(eq(bookings.id, bookingId))
}

export async function listProgress(memberId: number) {
  const db = getDb()
  const rows = await db
    .select()
    .from(progressEntries)
    .where(eq(progressEntries.memberId, memberId))
    .orderBy(desc(progressEntries.recordedAt))
    .limit(100)
  return rows.map((row) => ({
    id: String(row.id),
    weightKg: row.weightKg == null ? null : row.weightKg / 100,
    bodyFatPct: row.bodyFatPct == null ? null : row.bodyFatPct / 100,
    muscleMassKg: row.muscleMassKg == null ? null : row.muscleMassKg / 100,
    notes: row.notes ?? '',
    recordedAt: row.recordedAt,
  }))
}

export async function addProgress(
  memberId: number,
  input: {
    weightKg?: number
    bodyFatPct?: number
    muscleMassKg?: number
    notes?: string
  },
) {
  const db = getDb()
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)
  if (!member) httpError(404, 'Member not found')

  const result = await db.insert(progressEntries).values({
    memberId,
    weightKg: input.weightKg == null ? null : Math.round(input.weightKg * 100),
    bodyFatPct: input.bodyFatPct == null ? null : Math.round(input.bodyFatPct * 100),
    muscleMassKg:
      input.muscleMassKg == null ? null : Math.round(input.muscleMassKg * 100),
    notes: input.notes?.trim() || null,
  })
  const id = getInsertId(result)
  return (await listProgress(memberId)).find((row) => row.id === String(id))
}

export async function getActiveWorkoutPlan(memberId: number) {
  const db = getDb()
  const [row] = await db
    .select({
      id: workoutPlans.id,
      title: workoutPlans.title,
      plan: workoutPlans.plan,
      trainerId: workoutPlans.trainerId,
      trainerName: trainers.fullName,
      updatedAt: workoutPlans.updatedAt,
    })
    .from(workoutPlans)
    .leftJoin(trainers, eq(workoutPlans.trainerId, trainers.id))
    .where(and(eq(workoutPlans.memberId, memberId), eq(workoutPlans.isActive, true)))
    .orderBy(desc(workoutPlans.updatedAt))
    .limit(1)

  if (!row) return null
  return {
    id: String(row.id),
    title: row.title,
    plan: row.plan,
    trainerId: row.trainerId == null ? null : String(row.trainerId),
    trainerName: row.trainerName ?? 'Gym Team',
    updatedAt: row.updatedAt,
  }
}

export async function setWorkoutPlan(
  memberId: number,
  input: { trainerId?: number; title: string; plan: unknown },
) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1)
    if (!member) httpError(404, 'Member not found')

    await tx
      .update(workoutPlans)
      .set({ isActive: false })
      .where(and(eq(workoutPlans.memberId, memberId), eq(workoutPlans.isActive, true)))
    await tx.insert(workoutPlans).values({
      memberId,
      trainerId: input.trainerId ?? null,
      title: input.title.trim(),
      plan: input.plan,
      isActive: true,
    })
  }).then(() => getActiveWorkoutPlan(memberId))
}

export async function createMemberRequest(
  memberId: number,
  input: { requestType: 'freeze' | 'renew' | 'upgrade' | 'downgrade'; requestedPackage?: string },
) {
  const db = getDb()
  const existing = await db
    .select({ id: memberRequests.id })
    .from(memberRequests)
    .where(
      and(
        eq(memberRequests.memberId, memberId),
        eq(memberRequests.requestType, input.requestType),
        eq(memberRequests.status, 'Pending'),
      ),
    )
    .limit(1)
  if (existing.length) httpError(409, 'A matching request is already pending')

  const pendingKey = `${memberId}:${input.requestType}`
  try {
    const result = await db.insert(memberRequests).values({
      memberId,
      requestType: input.requestType,
      requestedPackage: input.requestedPackage?.trim() || null,
      status: 'Pending',
      pendingKey,
    })
    return { id: String(getInsertId(result)), status: 'Pending' as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/uk_member_requests_pending|pending_key|duplicate/i.test(message)) {
      httpError(409, 'A matching request is already pending')
    }
    throw error
  }
}

export async function listMemberRequests(memberId: number) {
  const db = getDb()
  const rows = await db
    .select()
    .from(memberRequests)
    .where(eq(memberRequests.memberId, memberId))
    .orderBy(desc(memberRequests.createdAt))
    .limit(50)
  return rows.map((row) => ({
    id: String(row.id),
    requestType: row.requestType,
    requestedPackage: row.requestedPackage,
    status: row.status,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  }))
}

export async function listPendingMemberRequests() {
  const db = getDb()
  const rows = await db
    .select({
      id: memberRequests.id,
      memberId: memberRequests.memberId,
      memberName: members.fullName,
      memberCode: members.memberCode,
      requestType: memberRequests.requestType,
      requestedPackage: memberRequests.requestedPackage,
      status: memberRequests.status,
      createdAt: memberRequests.createdAt,
    })
    .from(memberRequests)
    .innerJoin(members, eq(memberRequests.memberId, members.id))
    .where(eq(memberRequests.status, 'Pending'))
    .orderBy(memberRequests.createdAt)
    .limit(100)

  return rows.map((row) => ({
    id: String(row.id),
    memberId: String(row.memberId),
    memberName: row.memberName,
    memberCode: row.memberCode,
    requestType: row.requestType,
    requestedPackage: row.requestedPackage,
    status: row.status,
    createdAt: row.createdAt,
  }))
}

export async function getMemberTrainerAssignment(memberId: number) {
  const db = getDb()
  const [row] = await db
    .select({
      id: memberTrainerAssignments.id,
      memberId: memberTrainerAssignments.memberId,
      trainerId: memberTrainerAssignments.trainerId,
      trainerName: trainers.fullName,
      specialty: trainers.specialty,
      notes: memberTrainerAssignments.notes,
      assignedAt: memberTrainerAssignments.assignedAt,
    })
    .from(memberTrainerAssignments)
    .innerJoin(trainers, eq(memberTrainerAssignments.trainerId, trainers.id))
    .where(eq(memberTrainerAssignments.memberId, memberId))
    .limit(1)
  if (!row) return null
  return {
    id: String(row.id),
    memberId: String(row.memberId),
    trainerId: String(row.trainerId),
    trainerName: row.trainerName,
    specialty: row.specialty,
    notes: row.notes ?? '',
    assignedAt: row.assignedAt,
  }
}

export async function assignTrainerToMember(
  memberId: number,
  trainerId: number,
  staffId: number,
  notes?: string,
) {
  const db = getDb()
  const [member] = await db.select({ id: members.id }).from(members).where(eq(members.id, memberId)).limit(1)
  if (!member) httpError(404, 'Member not found')
  const [trainer] = await db
    .select({ id: trainers.id })
    .from(trainers)
    .where(and(eq(trainers.id, trainerId), eq(trainers.isActive, true)))
    .limit(1)
  if (!trainer) httpError(400, 'Trainer is not active')

  await db
    .insert(memberTrainerAssignments)
    .values({ memberId, trainerId, assignedByStaffId: staffId, notes: notes?.trim() || null })
    .onDuplicateKeyUpdate({
      set: {
        trainerId,
        assignedByStaffId: staffId,
        notes: notes?.trim() || null,
        updatedAt: new Date(),
      },
    })
  return getMemberTrainerAssignment(memberId)
}

export async function resolveMemberRequest(
  requestId: number,
  staffId: number,
  decision: 'approve' | 'reject',
) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(memberRequests)
      .where(
        and(
          eq(memberRequests.id, requestId),
          eq(memberRequests.status, 'Pending'),
        ),
      )
      .limit(1)
    if (!request) httpError(404, 'Pending member request not found')

    const nextStatus = decision === 'approve' ? 'Approved' : 'Rejected'
    const claimResult = await tx
      .update(memberRequests)
      .set({
        status: nextStatus,
        pendingKey: null,
        resolvedAt: new Date(),
        resolvedByStaffId: staffId,
      })
      .where(
        and(
          eq(memberRequests.id, requestId),
          eq(memberRequests.status, 'Pending'),
        ),
      )

    const affectedRows = Number(
      (claimResult as { rowsAffected?: number }).rowsAffected ?? 0,
    )
    if (affectedRows !== 1) {
      httpError(409, 'Member request was already resolved')
    }

    if (decision === 'approve') {
      await performMemberActionInDb(
        tx,
        request.memberId,
        request.requestType,
        request.requestedPackage ?? undefined,
      )
    }

    return { status: nextStatus }
  })
}

export async function listTrainerAvailability(trainerId: number) {
  const db = getDb()
  const rows = await db
    .select()
    .from(trainerWeeklyAvailability)
    .where(eq(trainerWeeklyAvailability.trainerId, trainerId))
    .orderBy(trainerWeeklyAvailability.weekday, trainerWeeklyAvailability.startMinute)
  return rows.map((row) => ({
    id: String(row.id),
    trainerId: String(row.trainerId),
    weekday: row.weekday,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  }))
}

export async function replaceTrainerAvailability(
  trainerId: number,
  slots: Array<{ weekday: number; startMinute: number; endMinute: number }>,
) {
  const db = getDb()
  const [trainer] = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.id, trainerId)).limit(1)
  if (!trainer) httpError(404, 'Trainer not found')
  for (const slot of slots) {
    if (slot.weekday < 0 || slot.weekday > 6 || slot.startMinute < 0 || slot.endMinute > 1440 || slot.startMinute >= slot.endMinute) {
      httpError(400, 'Invalid trainer availability slot')
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(trainerWeeklyAvailability).where(eq(trainerWeeklyAvailability.trainerId, trainerId))
    if (slots.length) {
      await tx.insert(trainerWeeklyAvailability).values(
        slots.map((slot) => ({ trainerId, ...slot })),
      )
    }
  })
  return listTrainerAvailability(trainerId)
}

export async function listTrainerTimeOff(trainerId: number) {
  const db = getDb()
  const rows = await db
    .select()
    .from(trainerTimeOff)
    .where(eq(trainerTimeOff.trainerId, trainerId))
    .orderBy(desc(trainerTimeOff.startsAt))
    .limit(100)
  return rows.map((row) => ({
    id: String(row.id),
    trainerId: String(row.trainerId),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reason: row.reason ?? '',
  }))
}

export async function addTrainerTimeOff(
  trainerId: number,
  input: { startsAt: Date; endsAt: Date; reason?: string },
) {
  if (input.endsAt <= input.startsAt) httpError(400, 'Time off end must be after start')
  const db = getDb()
  const [trainer] = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.id, trainerId)).limit(1)
  if (!trainer) httpError(404, 'Trainer not found')
  const result = await db.insert(trainerTimeOff).values({
    trainerId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    reason: input.reason?.trim() || null,
  })
  return { id: String(getInsertId(result)), trainerId: String(trainerId), ...input }
}

export async function listTrainerCalendar(trainerId: number, from: Date, to: Date) {
  const db = getDb()
  const rows = await db
    .select({
      id: bookings.id,
      memberId: bookings.memberId,
      memberName: members.fullName,
      sessionType: bookings.sessionType,
      scheduledAt: bookings.scheduledAt,
      durationMinutes: bookings.durationMinutes,
      status: bookings.status,
      notes: bookings.notes,
      completedAt: bookings.completedAt,
    })
    .from(bookings)
    .innerJoin(members, eq(bookings.memberId, members.id))
    .where(
      and(
        eq(bookings.trainerId, trainerId),
        gte(bookings.scheduledAt, from),
        lte(bookings.scheduledAt, to),
      ),
    )
    .orderBy(bookings.scheduledAt)
  return rows.map((row) => ({
    id: String(row.id),
    memberId: String(row.memberId),
    memberName: row.memberName,
    sessionType: row.sessionType,
    scheduledAt: row.scheduledAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    notes: row.notes ?? '',
    completedAt: row.completedAt,
  }))
}

export async function updateBookingStatus(
  bookingId: number,
  status: 'Completed' | 'Cancelled' | 'NoShow',
) {
  const db = getDb()
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  if (!booking) httpError(404, 'Booking not found')
  if (booking.status !== 'Booked') httpError(409, 'Only booked sessions can change status')
  await db
    .update(bookings)
    .set({ status, completedAt: status === 'Completed' ? new Date() : null })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'Booked')))
  return true
}
