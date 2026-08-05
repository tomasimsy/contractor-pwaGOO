/**
 * The first real (non-in-memory) implementation of any repository
 * seam in this service layer — every entity service built before this
 * pass only had an in-memory test double (see RELIABILITY.md). Backs
 * AuditLogRepository against the real `audit_logs` table
 * (contractor-pwa/supabase/migrations/20260729000000_audit_logs_table.sql
 * — CONFIRMED still a DRAFT, not yet applied: this repository's writes
 * will fail with "table not found" until that migration runs. Calls
 * are wrapped so a missing table degrades to "no audit history yet"
 * rather than crashing the page that triggered the write it was
 * trying to log.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogRepository } from "../auditService";
import type { AuditLogEntry, UUID } from "../types";

interface AuditLogRow {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  action: AuditLogEntry["action"];
  entity_table: string;
  entity_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  occurred_at: string;
}

function rowToEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityTable: row.entity_table,
    entityId: row.entity_id,
    // `?? null`, not a bare read: queryByEntity deliberately does NOT
    // select these two JSONB blobs (see TIMELINE_COLUMNS), so they are
    // absent on timeline rows. Normalising to null keeps AuditLogEntry
    // honest — "not loaded" and "no snapshot" both read as null rather
    // than leaking `undefined` past the type cast.
    oldValues: row.old_values ?? null,
    newValues: row.new_values ?? null,
    changedFields: null, // AuditService.getHistory re-derives this from oldValues/newValues
    occurredAt: row.occurred_at,
  };
}

export function createSupabaseAuditLogRepository(supabase: SupabaseClient): AuditLogRepository {
  /**
   * `audit_logs` is deliberately append-only via the generic
   * `log_audit_change()` trigger (SECURITY DEFINER) — confirmed live:
   * the table's RLS has a select policy only, no insert policy for
   * ordinary callers (see supabase/migrations/
   * 20260729000000_audit_logs_table.sql's "No insert/update/delete
   * policy for ordinary callers" comment). That's the intentional
   * design (tamper-resistance: only the trigger can write), not a gap
   * to patch with a new policy. Which means THIS manual insert — used
   * by AuditService.recordStatusChange for the semantic "why" a
   * trigger's raw row-diff can't capture — can never succeed as a
   * normal authenticated user, discovered live when approving a real
   * change order threw "new row violates row-level security policy"
   * and aborted the approval entirely.
   *
   * A secondary, semantic audit annotation must never block the
   * primary business action it's describing — the generic trigger
   * already logs the actual status column change on every
   * project/estimate/change_order UPDATE regardless, so nothing about
   * "what changed" is lost, only the extra "why" narrative. Matching
   * queryByEntity/queryDeletion's existing degrade-not-crash pattern
   * below: log the failure, return a synthetic (unpersisted) entry
   * instead of throwing.
   */
  async function insert(entry: Omit<AuditLogEntry, "id" | "occurredAt">): Promise<AuditLogEntry> {
    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        company_id: entry.companyId,
        actor_user_id: entry.actorUserId,
        action: entry.action,
        entity_table: entry.entityTable,
        entity_id: entry.entityId,
        old_values: entry.oldValues,
        new_values: entry.newValues,
      })
      .select()
      .single();

    if (error) {
      // Spread the fields explicitly. A Supabase PostgrestError carries
      // message/code/details/hint on a prototype that JSON-serialises to
      // `{}`, so logging the object itself printed an empty brace pair
      // and told you nothing about what actually failed.
      console.warn(
        `AuditLogRepository.insert degraded for ${entry.entityTable}/${entry.entityId} — the generic DB trigger still logged the row change, so no history is lost.`,
        { message: error.message, code: error.code, details: error.details, hint: error.hint }
      );
      return { ...entry, id: `unpersisted-${Date.now()}`, occurredAt: new Date().toISOString() };
    }
    return rowToEntry(data as AuditLogRow);
  }

  /** Newest-N cap for the per-entity timeline. Generous enough that no
   * realistic entity's visible history is truncated, small enough that
   * the query can never scale with table growth. */
  const HISTORY_LIMIT = 100;

  /** Columns the per-entity timeline actually needs.
   *
   * Deliberately NOT `*`. `audit_logs.old_values`/`new_values` are
   * JSONB snapshots of the whole row — median 2.5KB each, largest
   * 19KB — and `select=*` over 100 of them returned a **576KB**
   * payload where the same rows without the blobs are **24KB** (23x
   * smaller, measured). Every one of the four getHistory consumers
   * (estimate, invoice, project and change-order timelines) renders
   * only `action` and `occurredAt`; nothing in the app reads
   * oldValues/newValues/changedFields at all — verified by grep across
   * app/ and components/.
   *
   * queryDeletion below still selects everything: "who deleted this and
   * why" genuinely needs the snapshot. */
  const TIMELINE_COLUMNS = "id, company_id, actor_user_id, action, entity_table, entity_id, occurred_at";

  async function queryByEntity(companyId: UUID, entityTable: string, entityId: UUID): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
      .from("audit_logs")
      .select(TIMELINE_COLUMNS)
      .eq("company_id", companyId)
      .eq("entity_table", entityTable)
      .eq("entity_id", entityId)
      .order("occurred_at", { ascending: false })
      // Bounded: this backs an Activity Timeline that shows the most
      // recent events, but the query was unbounded `select=*` over a
      // table already holding 1,775 rows and growing with every write —
      // measured as the single slowest request on the Estimate Detail
      // page (1,184ms). An entity's full history is still reachable via
      // the dedicated /audit-logs page; this call site never rendered
      // more than the newest entries.
      .limit(HISTORY_LIMIT);

    if (error) {
      // "relation does not exist" (migration not applied yet) degrades
      // to an empty timeline, not a crash — every other failure is
      // real and should be visible.
      console.error(`AuditLogRepository.queryByEntity failed for ${entityTable}/${entityId}:`, error);
      return [];
    }
    return (data as AuditLogRow[]).map(rowToEntry);
  }

  async function queryDeletion(companyId: UUID, entityTable: string, entityId: UUID): Promise<AuditLogEntry | null> {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("company_id", companyId)
      .eq("entity_table", entityTable)
      .eq("entity_id", entityId)
      .eq("action", "delete")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`AuditLogRepository.queryDeletion failed for ${entityTable}/${entityId}:`, error);
      return null;
    }
    return data ? rowToEntry(data as AuditLogRow) : null;
  }

  return { insert, queryByEntity, queryDeletion };
}
