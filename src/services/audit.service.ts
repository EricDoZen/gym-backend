import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { auditLogs } from '../db/schema.js'

export interface AuditInput {
  actorStaffId?: number | null
  actorMemberId?: number | null
  action: string
  entityType: string
  entityId?: string | number | null
  ipAddress?: string | null
  metadata?: Record<string, unknown> | null
}

export async function recordAudit(input: AuditInput) {
  const db = getDb()
  await db.insert(auditLogs).values({
    actorStaffId: input.actorStaffId ?? null,
    actorMemberId: input.actorMemberId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId == null ? null : String(input.entityId),
    ipAddress: input.ipAddress ?? null,
    metadata: input.metadata ?? null,
  })
}

export async function listAuditLogs(limit = 100, actorStaffId?: number) {
  const db = getDb()
  const base = db.select().from(auditLogs)
  const rows = actorStaffId
    ? await base
        .where(eq(auditLogs.actorStaffId, actorStaffId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
    : await base.orderBy(desc(auditLogs.createdAt)).limit(limit)

  return rows.map((row) => ({
    id: String(row.id),
    actorStaffId: row.actorStaffId == null ? null : String(row.actorStaffId),
    actorMemberId: row.actorMemberId == null ? null : String(row.actorMemberId),
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    ipAddress: row.ipAddress,
    metadata: row.metadata,
    createdAt: row.createdAt,
  }))
}
