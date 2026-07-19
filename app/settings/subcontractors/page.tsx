"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import Modal from "@/components/ui/Modal";
import DeleteModal from "@/components/ui/DeleteModal";
import SubcontractorDetailPanel from "@/components/subcontractors/SubcontractorDetailPanel";
import { getSubcontractorDetail, type SubcontractorDetail } from "@/lib/queries/subcontractors";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, ChevronDown } from "lucide-react";

type Subcontractor = {
  id: string;
  name: string;
  trade: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
};

const emptyForm = { name: "", trade: "", contact_person: "", phone: "", email: "", notes: "" };

function SubcontractorsContent() {
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Subcontractor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, SubcontractorDetail>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  // Always refetches on expand — no stale cache across opens, so a
  // payment/assignment change made elsewhere (e.g. the Expense page)
  // while this panel was closed is never shown stale.
  async function toggleSub(s: Subcontractor) {
    if (expandedId === s.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(s.id);
    setLoadingDetailId(s.id);
    try {
      const companyId = await getCompanyId();
      const detail = await getSubcontractorDetail(s.id, companyId);
      setDetailById((prev) => ({ ...prev, [s.id]: detail }));
    } finally {
      setLoadingDetailId(null);
    }
  }

  async function load() {
    setLoading(true);
    const companyId = await getCompanyId();
    const { data, error } = await supabase
      .from("subcontractors")
      .select("id, name, trade, contact_person, phone, email, notes, is_active")
      .eq("company_id", companyId)
      .order("name");
    if (error) toast.error("Couldn't load subcontractors.");
    setSubs(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: Subcontractor) {
    setEditing(s);
    setForm({
      name: s.name,
      trade: s.trade || "",
      contact_person: s.contact_person || "",
      phone: s.phone || "",
      email: s.email || "",
      notes: s.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const companyId = await getCompanyId();
      const payload = {
        name: form.name.trim(),
        trade: form.trade.trim() || null,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("subcontractors").update(payload).eq("id", editing.id).eq("company_id", companyId);
        if (error) throw error;
        toast.success("Subcontractor updated.");
      } else {
        const { error } = await supabase.from("subcontractors").insert({ ...payload, company_id: companyId });
        if (error) throw error;
        toast.success("Subcontractor added.");
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Subcontractor) {
    const companyId = await getCompanyId();
    const { error } = await supabase
      .from("subcontractors")
      .update({ is_active: !s.is_active })
      .eq("id", s.id)
      .eq("company_id", companyId);
    if (error) {
      toast.error("Couldn't update status.");
      return;
    }
    await load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const companyId = await getCompanyId();
      const { error } = await supabase.from("subcontractors").delete().eq("id", deleteTarget.id).eq("company_id", companyId);
      if (error) throw error;
      toast.success("Subcontractor deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DesktopShell title="Subcontractors">
    <div className="min-h-screen md:min-h-0 bg-slate-50/70 md:bg-transparent">
      <Header title="Subcontractors" backLink="/settings" mdHidden />
      <div className="mx-auto max-w-2xl md:max-w-none md:mx-0 p-4 md:p-0 space-y-4">
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg px-4 py-2.5"
        >
          <Plus size={15} /> Add Subcontractor
        </button>

        {loading ? (
          <div className="text-xs text-slate-400 text-center py-8">Loading…</div>
        ) : subs.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
            No subcontractors yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm divide-y divide-slate-100">
            {subs.map((s) => {
              const isExpanded = expandedId === s.id;
              return (
              <div key={s.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSub(s)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                      <span className="text-sm font-bold text-slate-800 truncate">{s.name}</span>
                      {!s.is_active && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate pl-[22px]">
                      {[s.trade, s.contact_person, s.phone, s.email].filter(Boolean).join(" · ") || "No details"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(s)}
                    className="shrink-0 text-[11px] font-bold text-slate-500 hover:text-slate-700"
                  >
                    {s.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" onClick={() => openEdit(s)} className="shrink-0 p-2 text-slate-400 hover:text-slate-600">
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(s)}
                    className="shrink-0 p-2 text-slate-300 hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {isExpanded && (
                  <SubcontractorDetailPanel detail={detailById[s.id] ?? null} loading={loadingDetailId === s.id} />
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Subcontractor" : "Add Subcontractor"}>
        <div className="space-y-3">
          <Field label="Company / Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. ABC Roofing" />
          <Field label="Trade" value={form.trade} onChange={(v) => setForm({ ...form, trade: v })} placeholder="e.g. Roofing" optional />
          <Field label="Contact Person" value={form.contact_person} onChange={(v) => setForm({ ...form, contact_person: v })} optional />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} optional />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} optional />
          </div>
          <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} optional />
          <button
            type="button"
            disabled={!form.name.trim() || saving}
            onClick={handleSave}
            className="w-full h-11 mt-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-30"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>

      <DeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete subcontractor?"
        message={`This will permanently remove "${deleteTarget?.name}". This cannot be undone.`}
        deleting={deleting}
      />
    </div>
    </DesktopShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {label} {optional && <span className="normal-case font-medium text-slate-300">(optional)</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
      />
    </div>
  );
}

export default function SubcontractorsPage() {
  return (
    <ProtectedRoute>
      <SubcontractorsContent />
    </ProtectedRoute>
  );
}
