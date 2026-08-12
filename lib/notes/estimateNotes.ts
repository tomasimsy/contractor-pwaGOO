import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads/writes `estimate_notes` (supabase/migrations/
 * 20260812111600_estimate_notes.sql). Same "not a full Layer 2
 * service" reasoning as lib/email/emailTracking.ts — a handful of call
 * sites, all inside one panel component; revisit if that changes.
 */

export interface EstimateNote {
  id: string;
  estimateId: string;
  body: string;
  createdAt: string;
  createdBy: string | null;
  /** Resolved from `profiles.full_name` when set; falls back to
   * `knownUsers` (see listEstimateNotes) for an author whose profile
   * has no full_name on file — e.g. this account's own session, which
   * `EstimateNotesPanel` supplies its own name/email for, since
   * `profiles.full_name` being empty is common on accounts that never
   * filled in Settings. Only truly unresolvable when neither source
   * has anything, which the UI shows as "Team Member". */
  authorName: string | null;
  updatedAt: string | null;
}

/** RLS-scoped to the caller's own company via the normal select
 * policy — no service-role involved, same as every other staff-facing
 * read in this app.
 *
 * `knownUsers`: display-name fallbacks the CALLER already knows
 * without a query — at minimum the current session's own name/email
 * (profiles.full_name is frequently empty for accounts that never
 * filled in Settings, which previously showed as a blank/"Unknown"
 * author on that user's own notes). `profiles.full_name`, when
 * present, always wins over this fallback. */
export async function listEstimateNotes(
  supabase: SupabaseClient,
  estimateId: string,
  knownUsers: Record<string, string> = {}
): Promise<EstimateNote[]> {
  const { data, error } = await supabase
    .from("estimate_notes")
    .select("id, estimate_id, body, created_at, created_by, updated_at")
    .eq("estimate_id", estimateId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load estimate_notes:", error);
    return [];
  }
  const rows = data || [];

  // Batched author lookup — one query for every distinct author on
  // this estimate's notes, not one query per note.
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id)));
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
    for (const p of profiles || []) {
      if (p.full_name) nameById.set(p.id, p.full_name);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    estimateId: r.estimate_id,
    body: r.body,
    createdAt: r.created_at,
    createdBy: r.created_by,
    authorName: r.created_by ? nameById.get(r.created_by) ?? knownUsers[r.created_by] ?? null : null,
    updatedAt: r.updated_at,
  }));
}

export async function addEstimateNote(
  supabase: SupabaseClient,
  input: { companyId: string; estimateId: string; body: string; createdBy: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note can't be empty." };

  const { error } = await supabase.from("estimate_notes").insert({
    company_id: input.companyId,
    estimate_id: input.estimateId,
    body,
    created_by: input.createdBy,
  });
  if (error) {
    console.error("Failed to add estimate note:", error);
    return { ok: false, error: "Failed to save the note." };
  }
  return { ok: true };
}

export async function updateEstimateNote(
  supabase: SupabaseClient,
  input: { noteId: string; body: string; updatedBy: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note can't be empty." };

  const { error } = await supabase
    .from("estimate_notes")
    .update({ body, updated_at: new Date().toISOString(), updated_by: input.updatedBy })
    .eq("id", input.noteId);
  if (error) {
    console.error("Failed to update estimate note:", error);
    return { ok: false, error: "Failed to save the edit." };
  }
  return { ok: true };
}

/** Soft delete, same convention as every other table in this app —
 * see supabase/migrations/20260812111600_estimate_notes.sql's header. */
export async function deleteEstimateNote(
  supabase: SupabaseClient,
  input: { noteId: string; deletedBy: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("estimate_notes")
    .update({ deleted_at: new Date().toISOString(), deleted_by: input.deletedBy })
    .eq("id", input.noteId);
  if (error) {
    console.error("Failed to delete estimate note:", error);
    return { ok: false, error: "Failed to delete the note." };
  }
  return { ok: true };
}
