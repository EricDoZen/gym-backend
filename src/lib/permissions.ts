import type { StaffPermission, StaffRole } from './types.js'

const ALL_PERMISSIONS: StaffPermission[] = [
  'member.read',
  'member.write',
  'member.checkin',
  'member.notes',
  'payment.read',
  'payment.create',
  'payment.adjust',
  'package.read',
  'package.manage',
  'trainer.read',
  'trainer.manage',
  'fitness.write',
  'reports.view',
  'staff.manage',
  'audit.view',
  'notifications.manage',
]

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  owner: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter((permission) => permission !== 'staff.manage'),
  reception: [
    'member.read',
    'member.write',
    'member.checkin',
    'member.notes',
    'payment.read',
    'payment.create',
    'package.read',
    'trainer.read',
  ],
  trainer: [
    'member.read',
    'member.notes',
    'trainer.read',
    'fitness.write',
  ],
  accountant: [
    'member.read',
    'payment.read',
    'payment.create',
    'payment.adjust',
    'package.read',
    'reports.view',
  ],
}

export function rolePermissions(role: StaffRole) {
  return [...ROLE_PERMISSIONS[role]]
}

export function hasPermission(role: StaffRole, permission: StaffPermission) {
  return ROLE_PERMISSIONS[role].includes(permission)
}
