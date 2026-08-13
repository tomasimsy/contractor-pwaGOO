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
    <section className="rounded-xl border border-[#d4a000]/20 bg-[#f7ecc8] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#d4a000]/15 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-black">
          <StickyNote className="size-3.5 text-[#7a5200]" /> Notes
        </h2>
        <span className="text-[10px] font-medium text-black/50">
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
              className="w-full resize-none rounded-lg border border-[#d4a000]/20 bg-[#fdf6e0] px-3 py-2 pr-20 text-sm text-black placeholder:text-black/40 focus:border-[#b8960f] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#d4a000]/20 transition-all"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draft.trim() || saving}
              className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-[#070401] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#5c3d00] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
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
            <Loader2 className="size-5 animate-spin text-black/20" />
          </div>
        ) : notes.length === 0 ? (
          <div className="py-8 text-center">
            <StickyNote className="mx-auto size-8 text-black/10" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-medium text-black/40">No notes yet</p>
            <p className="text-xs text-black/30">Add your first note above</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {notes.map((note) => {
              const isEditing = editingId === note.id;
              return (
                <div
                  key={note.id}
                  className="group rounded-lg border border-[#d4a000]/15 bg-[#fdf6e0] p-3 transition-all hover:border-[#b8960f]/30 hover:bg-[#fdf6e0]/80 hover:shadow-sm"
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        autoFocus
                        className="w-full resize-none rounded-lg border border-[#d4a000]/20 bg-[#fdf6e0] px-3 py-2 text-sm text-black focus:border-[#b8960f] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#d4a000]/20 transition-all"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg px-3 py-1 text-[11px] font-medium text-black/60 hover:bg-black/5 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(note.id)}
                          disabled={!editDraft.trim() || editSaving}
                          className="rounded-lg bg-[#7a5200] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#5c3d00] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                        >
                          {editSaving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-black leading-relaxed">{note.body}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-black/60">
                          <span className="font-semibold text-black/80">
                            {note.authorName ?? "Team Member"}
                          </span>
                          <span className="text-black/20">·</span>
                          <span>{formatWhen(note.createdAt)}</span>
                          {note.updatedAt && (
                            <span className="text-black/20">(edited)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            aria-label="Edit note"
                            className="rounded p-1 text-black/30 hover:bg-black/5 hover:text-black/70 transition-all"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            disabled={deletingId === note.id}
                            aria-label="Delete note"
                            className="rounded p-1 text-black/30 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
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