/**
 * Layer 0 — read/write path for the audit log. Tracks exactly what
 * reliability requires: user, company, action, record changed, old
 * value, new value, timestamp (see AuditLogEntry in types.ts).
 *
 * The DB already writes created_by/updated_by/deleted_by via trigger
 * (contractor-pwa's set_audit_fields()/soft_delete_instead()
 * migrations) — those columns answer "who last touched this row."
 * They do NOT answer "what did this row look like before, and what
 * changed" — that's what audit_logs (a separate table, see
 * supabase/migrations/20260729000000_audit_logs_table.sql) and this
 * service exist for.
 *
 * WRITES: contractor-pwa's pattern is a generic DB trigger that logs
 * every UPDATE/DELETE automatically, which is why services didn't
 * need to remember to call anything for basic row changes. This
 * service's `record()` is for the one thing a trigger CAN'T capture:
 * semantic status transitions ("estimate moved from sent to approved,
 * because the customer signed") — a trigger sees the column value
 * change but not the business meaning, and the service that made the
 * change is what knows the meaning.
 */
import type { UUID, AuditLogEntry } from "./types";

/** The data-access seam — same pattern as TransactionService's
 * QueryExecutor: this service contains the LOGIC (diffing, filtering,
 * shaping), the repository is the thin, swappable data-access
 * implementation (Supabase today, anything else later). */
export interface AuditLogRepository {
  insert(entry: Omit<AuditLogEntry, "id" | "occurredAt">): Promise<AuditLogEntry>;
  queryByEntity(companyId: UUID, entityTable: string, entityId: UUID): Promise<AuditLogEntry[]>;
  queryDeletion(companyId: UUID, entityTable: string, entityId: UUID): Promise<AuditLogEntry | null>;
}

export interface AuditService {
  /** Full change history for one entity, newest first, scoped to the
   * caller's own company (an owner must never see another company's
   * audit trail, even by guessing an entityId). */
  getHistory(companyId: UUID, entityTable: string, entityId: UUID): Promise<AuditLogEntry[]>;

  /** Every status-changing write (project status, estimate status,
   * change-order approval, etc.) calls this so there is one queryable
   * timeline per entity — the exact thing missing from the old schema,
   * where "when did this estimate become approved" was unanswerable
   * after the fact. */
  recordStatusChange(input: {
    companyId: UUID;
    entityTable: string;
    entityId: UUID;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: UUID | null;
  }): Promise<void>;

  /** Who deleted this row, when, and why (delete_reason) — surfaces
   * columns that exist at the DB level but that no page in
   * contractor-pwa ever displayed (the /deleted page shows the list,
   * not who removed each item or why). */
  getDeletionInfo(companyId: UUID, entityTable: string, entityId: UUID): Promise<{
    deletedBy: UUID | null;
    deletedAt: string | null;
    deleteReason: string | null;
  } | null>;
}

function diffFields(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null
): Record<string, { before: unknown; after: unknown }> | null {
  if (!oldValues || !newValues) return null;
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const changed: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changed[key] = { before: oldValues[key], after: newValues[key] };
    }
  }
  return Object.keys(changed).length > 0 ? changed : null;
}

export function createAuditService(repository: AuditLogRepository): AuditService {
  async function getHistory(companyId: UUID, entityTable: string, entityId: UUID): Promise<AuditLogEntry[]> {
    const entries = await repository.queryByEntity(companyId, entityTable, entityId);
    // Newest first, and re-derive changedFields defensively rather than
    // trusting whatever the repository returned verbatim — a diff is
    // cheap to recompute and this keeps the "before/after" shown to a
    // user always consistent with oldValues/newValues, even if a past
    // write path stored changedFields inconsistently.
    return entries
      .map((e) => ({ ...e, changedFields: diffFields(e.oldValues, e.newValues) }))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async function recordStatusChange(input: {
    companyId: UUID;
    entityTable: string;
    entityId: UUID;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: UUID | null;
  }): Promise<void> {
    await repository.insert({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: "status_change",
      entityTable: input.entityTable,
      entityId: input.entityId,
      oldValues: input.fromStatus === null ? null : { status: input.fromStatus },
      newValues: { status: input.toStatus },
      changedFields: { status: { before: input.fromStatus, after: input.toStatus } },
    });
  }

  async function getDeletionInfo(companyId: UUID, entityTable: string, entityId: UUID) {
    const entry = await repository.queryDeletion(companyId, entityTable, entityId);
    if (!entry) return null;
    return {
      deletedBy: entry.actorUserId,
      deletedAt: entry.occurredAt,
      deleteReason: (entry.newValues?.deleteReason as string | undefined) ?? null,
    };
  }

  return { getHistory, recordStatusChange, getDeletionInfo };
}
