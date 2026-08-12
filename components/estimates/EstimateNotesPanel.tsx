"use client";

/**
 * Free-text internal staff notes on an estimate — reads/writes
 * estimate_notes (supabase/migrations/20260812111600_estimate_notes.sql,
 * 20260812114200_estimate_notes_edit.sql) directly via the browser
 * Supabase client (RLS-scoped to the caller's own company). Visually
 * mirrors the Activity Timeline section right below it in
 * EstimateDetail.tsx, but the two are opposite in kind: Activity is
 * system-generated status history (read-only); this is staff-written
 * freeform notes (add/edit/delete).
 */
import { useCallback, useEffect, useState } from "react";
import { StickyNote, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { listEstimateNotes, addEstimateNote, updateEstimateNote, deleteEstimateNote, type EstimateNote } from "@/lib/notes/estimateNotes";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function EstimateNotesPanel({
  companyId,
  estimateId,
  currentUserId,
  /** The current session's own display name/email — used ONLY as a
   * fallback when `profiles.full_name` is empty for this account
   * (common on accounts that never filled in Settings), so a user
   * never sees their own note attributed to "Team Member" just
   * because that one field was left blank. */
  currentUserLabel,
}: {
  companyId: string;
  estimateId: string;
  currentUserId: string | null;
  currentUserLabel: string | null;
}) {
  const [notes, setNotes] = useState<EstimateNote[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const knownUsers = currentUserId && currentUserLabel ? { [currentUserId]: currentUserLabel } : {};
    setNotes(await listEstimateNotes(supabase, estimateId, knownUsers));
  }, [estimateId, currentUserId, currentUserLabel]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setError(null);
    const result = await addEstimateNote(supabase, { companyId, estimateId, body: draft, createdBy: currentUserId });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft("");
    await load();
  }

  async function handleDelete(noteId: string) {
    setDeletingId(noteId);
    const result = await deleteEstimateNote(supabase, { noteId, deletedBy: currentUserId });
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  function startEdit(note: EstimateNote) {
    setEditingId(note.id);
    setEditDraft(note.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(noteId: string) {
    if (!editDraft.trim() || editSaving) return;
    setEditSaving(true);
    const result = await updateEstimateNote(supabase, { noteId, body: editDraft, updatedBy: currentUserId });
    setEditSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    setEditDraft("");
    await load();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <StickyNote className="size-4 text-primary" /> Notes
      </h2>

      <div className="mb-4 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note about this estimate — e.g. a call with the customer, a site condition, a follow-up reminder…"
          rows={3}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground"
        />
        <div className="flex items-center justify-between gap-2">
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim() || saving}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Add Note
          </button>
        </div>
      </div>

      {notes === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto pr-1">
          <ul className="space-y-3">
            {notes.map((note) => {
              const isEditing = editingId === note.id;
              return (
                <li key={note.id} className="group rounded-lg border border-border/80 bg-background/50 px-3 py-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        autoFocus
                        className="w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 rounded p-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          <X className="size-3" /> Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(note.id)}
                          disabled={!editDraft.trim() || editSaving}
                          className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {editSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-xs text-foreground">{note.body}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground">
                          {note.authorName ?? "Team Member"} · {formatWhen(note.createdAt)}
                          {note.updatedAt && " (edited)"}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            aria-label="Edit note"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            disabled={deletingId === note.id}
                            aria-label="Delete note"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {deletingId === note.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
