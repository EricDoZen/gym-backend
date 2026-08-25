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
  package: string
  amount: number
  status: 'Paid' | 'Pending' | 'Overdue'
  date: string
}

export interface AuthUserDto {
  id: number
  email: string
  role: 'owner' | 'reception'
  name: string
}

export type StaffRole = 'owner' | 'reception'

export interface AppVariables {
  user: AuthUserDto
}
