import type { Member } from '../db/schema.js'
import type { CheckinDto, MemberDto, PaymentDto } from './types.js'
import { formatDisplayDate, formatDisplayTime } from './dates.js'

export function toMemberDto(
  row: Member,
  fallbackAvatar = '/images/img-1352436804.jpg',
): MemberDto {
  return {
    id: String(row.id),
    code: row.memberCode,
    name: row.fullName,
    phone: row.phone,
    email: row.email ?? '',
    package: row.packageName,
    status: row.status,
    joinDate: formatDisplayDate(row.joinDate),
    expireDate: formatDisplayDate(row.expireDate),
    attendance: row.attendanceCount,
    avatar: row.avatarUrl ?? fallbackAvatar,
  }
}

export function toCheckinDto(input: {
  id: number
  memberId: number
  memberName: string
  membershipType: string
  checkedInAt: Date | string
}): CheckinDto {
  return {
    id: String(input.id),
    memberId: String(input.memberId),
    memberName: input.memberName,
    time: formatDisplayTime(input.checkedInAt),
    membershipType: input.membershipType,
  }
}

export function toPaymentDto(input: {
  id: number
  memberId: number
  memberName: string
  packageName: string
  amountMmk: number
  status: 'Paid' | 'Pending' | 'Overdue'
  paymentDate: Date | string
}): PaymentDto {
  return {
    id: String(input.id),
    memberId: String(input.memberId),
    memberName: input.memberName,
    package: input.packageName,
    amount: input.amountMmk,
    status: input.status,
    date: formatDisplayDate(input.paymentDate),
  }
}
