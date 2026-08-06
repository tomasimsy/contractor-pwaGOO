/**
 * Supabase-backed TeamAssignmentService — see the interface for why this
 * owns assignments and deliberately owns no money.
 *
 * Member NAMES come from the `list_company_members` RPC, not a
 * `profiles` join. RLS on `profiles` scopes a caller to their OWN row
 * (verified live: a direct select returns exactly one row), so a join
 * would resolve a name only when the assignee happened to be the person
 * looking. The RPC is SECURITY DEFINER and returns every member of the
 * caller's company, plus the email — which `profiles` cannot expose,
 * since email lives in `auth.users`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TeamAssignment,
  TeamAssignmentService,
  TeamAssignmentWithName,
} from "../teamAssignmentService";
import type { ValidationService } from "../validationService";
import type { UUID, QueryScope } from "../types";

const SELECT =
  "id, company_id, estimate_id, project_id, user_id, amount, notes, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by, delete_reason";

interface Row {
  id: string;
  company_id: string;
  estimate_id: string;
  project_id: string | null;
  user_id: string;
  amount: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

function rowToAssignment(row: Row): TeamAssignment {
  return {
    id: row.id,
    companyId: row.company_id,
    estimateId: row.estimate_id,
    projectId: row.project_id,
    userId: row.user_id,
    amount: Number(row.amount ?? 0),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deleteReason: row.delete_reason,
  } as TeamAssignment;
}

export function createSupabaseTeamAssignmentService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): TeamAssignmentService {
  /** id -> display name, from the one RPC. Resolved per call rather
   * than cached: an assignment list is short and a stale name is worse
   * than a second round trip. */
  async function memberNames(): Promise<Map<string, string>> {
    const { data, error } = await supabase.rpc("list_company_members");
    if (error) return new Map();
    const rows = (data ?? []) as Array<{ id: string; email: string | null; full_name?: string | null }>;
    return new Map(
      rows.map((r) => [r.id, r.full_name?.trim() || r.email || "Unnamed user"])
    );
  }

  async function withNames(rows: Row[]): Promise<TeamAssignmentWithName[]> {
    const names = await memberNames();
    return rows.map((r) => ({
      ...rowToAssignment(r),
      memberName: names.get(r.user_id) ?? "Unknown member",
    }));
  }

  async function listForEstimate(estimateId: UUID): Promise<TeamAssignmentWithName[]> {
    const { data, error } = await supabase
      .from("estimate_team_members")
      .select(SELECT)
      .eq("estimate_id", estimateId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load team assignments: ${error.message}`);
    return withNames((data ?? []) as Row[]);
  }

  async function listAssignments(scope: QueryScope): Promise<TeamAssignmentWithName[]> {
    let query = supabase
      .from("estimate_team_members")
      .select(SELECT)
      .eq("company_id", scope.companyId)
      .is("deleted_at", null);
    if (scope.projectId) query = query.eq("project_id", scope.projectId);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load team assignments: ${error.message}`);
    return withNames((data ?? []) as Row[]);
  }

  async function assign(input: {
    companyId: UUID;
    estimateId: UUID;
    projectId: UUID | null;
    userId: UUID;
    amount: number;
    notes?: string | null;
  }): Promise<TeamAssignment> {
    if (input.amount < 0) throw new Error("Assigned labor cannot be negative.");

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_team_members")
      .insert({
        company_id: input.companyId,
        estimate_id: input.estimateId,
        project_id: input.projectId,
        user_id: input.userId,
        amount: input.amount,
        notes: input.notes?.trim() || null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select(SELECT)
      .single();

    if (error) {
      // The partial unique index is what enforces "one live assignment
      // per person per estimate"; translate its raw violation into
      // something a user can act on.
      if (error.code === "23505") {
        throw new Error("That team member is already assigned to this estimate.");
      }
      throw new Error(`Failed to assign team member: ${error.message}`);
    }
    return rowToAssignment(data as Row);
  }

  async function update(
    assignmentId: UUID,
    changes: Partial<{ amount: number; notes: string | null }>
  ): Promise<TeamAssignment> {
    if (changes.amount !== undefined && changes.amount < 0) {
      throw new Error("Assigned labor cannot be negative.");
    }
    const actorId = await currentUserId();
    const payload: Record<string, unknown> = { updated_by: actorId };
    if (changes.amount !== undefined) payload.amount = changes.amount;
    if (changes.notes !== undefined) payload.notes = changes.notes?.trim() || null;

    const { data, error } = await supabase
      .from("estimate_team_members")
      .update(payload)
      .eq("id", assignmentId)
      .select(SELECT)
      .single();
    if (error) throw new Error(`Failed to update assignment: ${error.message}`);
    return rowToAssignment(data as Row);
  }

  async function softDelete(assignmentId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) {
      throw new Error(validation.issues[0]?.message ?? "A delete reason is required.");
    }
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("estimate_team_members")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", assignmentId);
    if (error) throw new Error(`Failed to remove assignment: ${error.message}`);
  }

  async function restore(assignmentId: UUID): Promise<void> {
    const { error } = await supabase
      .from("estimate_team_members")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", assignmentId);
    if (error) throw new Error(`Failed to restore assignment: ${error.message}`);
  }

  return { listForEstimate, listAssignments, assign, update, softDelete, restore };
}
