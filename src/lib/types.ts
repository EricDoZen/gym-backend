export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
}

export interface MemberDto {
  id: string
  code: string
  name: string
  phone: string
  email: string
  package: string
  status: 'Active' | 'Expired' | 'Trial' | 'Frozen'
  joinDate: string
  expireDate: string
  attendance: number
  avatar: string
}

export interface DashboardStatsDto {
  totalMembers: number
  activeMembers: number
  monthlyRevenue: number
  todayCheckins: number
}

export interface CheckinDto {
  id: string
  memberId: string
  memberName: string
  time: string
  membershipType: string
}

export interface PaymentDto {
  id: string
  memberId: string
  memberName: string
  packageId: string
  packageCode: string
  package: string
  packagePriceMmk: number
  amount: number
  status: 'Paid' | 'Pending' | 'Overdue'
  paymentMethod: string
  referenceNo: string
  receiptNo: string
  membershipAction: 'renew' | 'upgrade' | 'downgrade' | ''
  date: string
}

export type StaffRole = 'owner' | 'manager' | 'reception' | 'trainer' | 'accountant'

export type StaffPermission =
  | 'member.read'
  | 'member.write'
  | 'member.checkin'
  | 'member.notes'
  | 'payment.read'
  | 'payment.create'
  | 'payment.adjust'
  | 'package.read'
  | 'package.manage'
  | 'trainer.read'
  | 'trainer.manage'
  | 'fitness.write'
  | 'reports.view'
  | 'staff.manage'
  | 'audit.view'
  | 'notifications.manage'

export interface AuthUserDto {
  id: number
  email: string
  role: StaffRole
  name: string
}

export interface AppVariables {
  user: AuthUserDto
}
