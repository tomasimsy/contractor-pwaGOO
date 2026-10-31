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
import { buttonClass } from "@/components/ui/Button";
import { useCallback, useEffect, useState } from "react";
import { StickyNote, Loader2, Trash2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { listEstimateNotes, addEstimateNote, updateEstimateNote, deleteEstimateNote, type EstimateNote } from "@/lib/notes/estimateNotes";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function EstimateNotesPanel({
  companyId,
  estimateId,
  currentUserId,
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
    <section className="rounded-xl border border-[#E2E5E0] bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E5E0] px-4 py-2.5">
        <h2 className="flex items-center gap-2 font-[family-name:var(--font-doc-display)] text-[15px] font-semibold text-[#1B2430]">
          <StickyNote className="size-3.5 text-[#0B5F5E]" /> Notes
        </h2>
        <span className="text-[10px] font-medium text-[#8A93A0]">
          {notes?.length || 0}
        </span>
      </div>

      {/* Content */}
      <div className="p-3.5">
        {/* Add Note */}
        <div className="mb-3 space-y-1.5">
          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a note…"
              rows={2}
              className="w-full resize-none rounded-lg border border-[#D0D5CD] bg-white px-3 py-2 pr-20 text-sm text-[#1B2430] placeholder:text-[#8A93A0] focus:border-[#0E7C7B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0E7C7B]/20 transition-all"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draft.trim() || saving}
              className={buttonClass("primary", "absolute bottom-2 right-2 h-7 px-2.5 text-xs")}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add
            </button>
          </div>
          {error && <p className="text-[10px] text-red-600 font-medium">{error}</p>}
        </div>

        {/* Notes List */}
        {notes === null ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-[#8A93A0]" />
          </div>
        ) : notes.length === 0 ? (
          <div className="py-8 text-center">
            <StickyNote className="mx-auto size-8 text-[#8A93A0]" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-medium text-[#8A93A0]">No notes yet</p>
            <p className="text-xs text-[#8A93A0]">Add your first note above</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {notes.map((note) => {
              const isEditing = editingId === note.id;
              return (
                <div
                  key={note.id}
                  className="group rounded-lg border border-[#E2E5E0] bg-white p-3 transition-all hover:border-[#D0D5CD] hover:shadow-sm"
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        autoFocus
                        className="w-full resize-none rounded-lg border border-[#D0D5CD] bg-white px-3 py-2 text-sm text-[#1B2430] focus:border-[#0E7C7B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0E7C7B]/20 transition-all"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className={buttonClass("secondary", "h-7 px-2.5 text-xs")}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(note.id)}
                          disabled={!editDraft.trim() || editSaving}
                          className={buttonClass("primary", "h-7 px-2.5 text-xs")}
                        >
                          {editSaving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-[#1B2430] leading-relaxed">{note.body}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-[#5B6675]">
                          <span className="font-semibold text-[#1B2430]">
                            {note.authorName ?? "Team Member"}
                          </span>
                          <span className="text-[#8A93A0]">·</span>
                          <span>{formatWhen(note.createdAt)}</span>
                          {note.updatedAt && (
                            <span className="text-[#8A93A0]">(edited)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            aria-label="Edit note"
                            className="rounded p-1 text-[#8A93A0] hover:bg-[#F4F5F2] hover:text-[#1B2430]/70 transition-all"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            disabled={deletingId === note.id}
                            aria-label="Delete note"
                            className="rounded p-1 text-[#8A93A0] hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
                          >
                            {deletingId === note.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}