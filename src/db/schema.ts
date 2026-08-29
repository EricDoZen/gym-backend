import {
  bigint,
  boolean,
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

export const staffRoleEnum = mysqlEnum('staff_role', ['owner', 'manager', 'reception', 'trainer', 'accountant'])
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
  'downgrade',
  'booking',
])

export const staffUsers = mysqlTable(
  'staff_users',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: mysqlEnum('role', ['owner', 'manager', 'reception', 'trainer', 'accountant']).notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    passwordChangedAt: timestamp('password_changed_at'),
    lastLoginAt: timestamp('last_login_at'),
    tokenVersion: int('token_version').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('uk_staff_email').on(table.email),
  }),
)

export const membershipPackages = mysqlTable(
  'membership_packages',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    priceMmk: bigint('price_mmk', { mode: 'number' }).notNull(),
    durationDays: int('duration_days').notNull(),
    freezeAllowanceDays: int('freeze_allowance_days').notNull().default(0),
    sessionLimit: int('session_limit'),
    renewalWindowDays: int('renewal_window_days').notNull().default(30),
    allowUpgrade: boolean('allow_upgrade').notNull().default(true),
    allowDowngrade: boolean('allow_downgrade').notNull().default(true),
    effectiveFrom: date('effective_from'),
    sortOrder: int('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('uk_package_code').on(table.code),
  }),
)

export const membershipPackagePriceHistory = mysqlTable(
  'membership_package_price_history',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    packageId: bigint('package_id', { mode: 'number' }).notNull(),
    priceMmk: bigint('price_mmk', { mode: 'number' }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    createdByStaffId: bigint('created_by_staff_id', { mode: 'number' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
)

export const members = mysqlTable(
  'members',
  {
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
  },
  (table) => ({
    memberCodeUnique: uniqueIndex('uk_member_code').on(table.memberCode),
    phoneUnique: uniqueIndex('uk_member_phone').on(table.phone),
    emailUnique: uniqueIndex('uk_member_email').on(table.email),
  }),
)

export const memberAccounts = mysqlTable(
  'member_accounts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    memberId: bigint('member_id', { mode: 'number' }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    activatedAt: timestamp('activated_at').notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
    tokenVersion: int('token_version').notNull().default(0),
    passwordChangedAt: timestamp('password_changed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    memberUnique: uniqueIndex('uk_member_account_member').on(table.memberId),
  }),
)

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

export const payments = mysqlTable(
  'payments',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    memberId: bigint('member_id', { mode: 'number' }).notNull(),
    packageId: bigint('package_id', { mode: 'number' }),
    packageCode: varchar('package_code', { length: 50 }),
    packageName: varchar('package_name', { length: 100 }).notNull(),
    packagePriceMmk: bigint('package_price_mmk', { mode: 'number' }),
    amountMmk: bigint('amount_mmk', { mode: 'number' }).notNull(),
    status: mysqlEnum('status', ['Paid', 'Pending', 'Overdue']).notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }).notNull().default('Cash'),
    referenceNo: varchar('reference_no', { length: 100 }),
    receiptNo: varchar('receipt_no', { length: 50 }),
    idempotencyKey: varchar('idempotency_key', { length: 100 }),
    membershipAction: varchar('membership_action', { length: 20 }),
    paymentDate: date('payment_date').notNull(),
    createdByStaffId: bigint('created_by_staff_id', { mode: 'number' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('uk_payments_idempotency').on(table.idempotencyKey),
    receiptUnique: uniqueIndex('uk_payments_receipt').on(table.receiptNo),
  }),
)

export const paymentAdjustments = mysqlTable('payment_adjustments', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  paymentId: bigint('payment_id', { mode: 'number' }).notNull(),
  adjustmentType: mysqlEnum('adjustment_type', ['refund', 'void']).notNull(),
  amountMmk: bigint('amount_mmk', { mode: 'number' }).notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  createdByStaffId: bigint('created_by_staff_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const membershipActions = mysqlTable('membership_actions', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  action: mysqlEnum('action', [
    'freeze',
    'renew',
    'upgrade',
    'downgrade',
    'booking',
  ]).notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const trainers = mysqlTable('trainers', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  specialty: varchar('specialty', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

export const trainerWeeklyAvailability = mysqlTable('trainer_weekly_availability', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  trainerId: bigint('trainer_id', { mode: 'number' }).notNull(),
  weekday: int('weekday').notNull(),
  startMinute: int('start_minute').notNull(),
  endMinute: int('end_minute').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

export const trainerTimeOff = mysqlTable('trainer_time_off', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  trainerId: bigint('trainer_id', { mode: 'number' }).notNull(),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  reason: varchar('reason', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const bookings = mysqlTable('bookings', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  trainerId: bigint('trainer_id', { mode: 'number' }),
  sessionType: varchar('session_type', { length: 100 }).notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  durationMinutes: int('duration_minutes').notNull().default(60),
  status: mysqlEnum('status', ['Booked', 'Completed', 'Cancelled', 'NoShow'])
    .notNull()
    .default('Booked'),
  completedAt: timestamp('completed_at'),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

export const memberTrainerAssignments = mysqlTable(
  'member_trainer_assignments',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    memberId: bigint('member_id', { mode: 'number' }).notNull(),
    trainerId: bigint('trainer_id', { mode: 'number' }).notNull(),
    assignedByStaffId: bigint('assigned_by_staff_id', { mode: 'number' }).notNull(),
    notes: varchar('notes', { length: 500 }),
    assignedAt: timestamp('assigned_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    memberUnique: uniqueIndex('uk_member_trainer_assignment').on(table.memberId),
  }),
)

export const memberRequests = mysqlTable(
  'member_requests',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    memberId: bigint('member_id', { mode: 'number' }).notNull(),
    requestType: mysqlEnum('request_type', ['freeze', 'renew', 'upgrade', 'downgrade']).notNull(),
    requestedPackage: varchar('requested_package', { length: 100 }),
    status: mysqlEnum('status', ['Pending', 'Approved', 'Rejected'])
      .notNull()
      .default('Pending'),
    pendingKey: varchar('pending_key', { length: 100 }),
    notes: varchar('notes', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    resolvedByStaffId: bigint('resolved_by_staff_id', { mode: 'number' }),
  },
  (table) => ({
    pendingUnique: uniqueIndex('uk_member_requests_pending').on(table.pendingKey),
  }),
)

export const progressEntries = mysqlTable('progress_entries', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  weightKg: int('weight_kg_x100'),
  bodyFatPct: int('body_fat_pct_x100'),
  muscleMassKg: int('muscle_mass_kg_x100'),
  notes: varchar('notes', { length: 500 }),
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
})

export const workoutPlans = mysqlTable('workout_plans', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  trainerId: bigint('trainer_id', { mode: 'number' }),
  title: varchar('title', { length: 255 }).notNull(),
  plan: json('plan').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

export const memberNotes = mysqlTable('member_notes', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  memberId: bigint('member_id', { mode: 'number' }).notNull(),
  createdByStaffId: bigint('created_by_staff_id', { mode: 'number' }).notNull(),
  note: varchar('note', { length: 1000 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const notifications = mysqlTable(
  'notifications',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    recipientType: mysqlEnum('recipient_type', ['staff', 'member']).notNull(),
    recipientId: bigint('recipient_id', { mode: 'number' }),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: varchar('message', { length: 1000 }).notNull(),
    channel: mysqlEnum('channel', ['internal', 'email', 'sms', 'telegram', 'viber'])
      .notNull()
      .default('internal'),
    status: mysqlEnum('status', ['Pending', 'Sent', 'Failed', 'Read'])
      .notNull()
      .default('Pending'),
    scheduledAt: timestamp('scheduled_at').notNull().defaultNow(),
    sentAt: timestamp('sent_at'),
    readAt: timestamp('read_at'),
    attempts: int('attempts').notNull().default(0),
    failureReason: varchar('failure_reason', { length: 500 }),
    dedupeKey: varchar('dedupe_key', { length: 191 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    dedupeUnique: uniqueIndex('uk_notifications_dedupe').on(table.dedupeKey),
  }),
)

export const contactMessages = mysqlTable('contact_messages', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  payload: json('payload').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const rateLimitBuckets = mysqlTable('rate_limit_buckets', {
  bucketKey: varchar('bucket_key', { length: 255 }).primaryKey(),
  count: int('count').notNull(),
  resetAtMs: bigint('reset_at_ms', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

export const auditLogs = mysqlTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  actorStaffId: bigint('actor_staff_id', { mode: 'number' }),
  actorMemberId: bigint('actor_member_id', { mode: 'number' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }),
  ipAddress: varchar('ip_address', { length: 64 }),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const appSettings = mysqlTable('app_settings', {
  settingKey: varchar('setting_key', { length: 100 }).primaryKey(),
  settingValue: text('setting_value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

export type StaffUser = typeof staffUsers.$inferSelect
export type Member = typeof members.$inferSelect
