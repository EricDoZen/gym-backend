import {
  bigint,
  boolean,
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core'

export const staffRoleEnum = mysqlEnum('staff_role', ['owner', 'reception'])
export const memberStatusEnum = mysqlEnum('member_status', [
  'Active',
  'Expired',
  'Trial',
  'Frozen',
])
export const paymentStatusEnum = mysqlEnum('payment_status', [
  'Paid',
  'Pending',
  'Overdue',
])
export const membershipActionEnum = mysqlEnum('membership_action', [
  'freeze',
  'renew',
  'upgrade',
  'booking',
])

export const staffUsers = mysqlTable('staff_users', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: mysqlEnum('role', ['owner', 'reception']).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const membershipPackages = mysqlTable('membership_packages', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  priceMmk: bigint('price_mmk', { mode: 'number' }).notNull(),
  durationDays: int('duration_days').notNull(),
  isActive: boolean('is_active').notNull().default(true),
})

export const members = mysqlTable('members', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberCode: varchar('member_code', { length: 20 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  email: varchar('email', { length: 255 }),
  packageId: bigint('package_id', { mode: 'number' }),
  packageName: varchar('package_name', { length: 100 }).notNull(),
  status: mysqlEnum('status', ['Active', 'Expired', 'Trial', 'Frozen'])
    .notNull()
    .default('Trial'),
  joinDate: date('join_date').notNull(),
  expireDate: date('expire_date').notNull(),
  attendanceCount: int('attendance_count').notNull().default(0),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

export const trialRegistrations = mysqlTable('trial_registrations', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  email: varchar('email', { length: 255 }),
  packageCode: varchar('package_code', { length: 50 }).notNull(),
  preferredStartDate: date('preferred_start_date'),
  convertedMemberId: bigint('converted_member_id', { mode: 'number' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const checkins = mysqlTable('checkins', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  membershipType: varchar('membership_type', { length: 100 }).notNull(),
  checkedInAt: timestamp('checked_in_at').notNull().defaultNow(),
})

export const payments = mysqlTable('payments', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  packageName: varchar('package_name', { length: 100 }).notNull(),
  amountMmk: bigint('amount_mmk', { mode: 'number' }).notNull(),
  status: mysqlEnum('status', ['Paid', 'Pending', 'Overdue']).notNull(),
  paymentDate: date('payment_date').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const membershipActions = mysqlTable('membership_actions', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  action: mysqlEnum('action', [
    'freeze',
    'renew',
    'upgrade',
    'booking',
  ]).notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const contactMessages = mysqlTable('contact_messages', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  payload: json('payload').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type StaffUser = typeof staffUsers.$inferSelect
export type Member = typeof members.$inferSelect
