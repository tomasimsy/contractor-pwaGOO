"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import Modal from "@/components/ui/Modal";
import DeleteModal from "@/components/ui/DeleteModal";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

type Agent = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  commission_rate: number | null;
  notes: string | null;
  is_active: boolean;
};

const emptyForm = { name: "", phone: "", email: "", commission_rate: "", notes: "" };

function AgentsContent() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const companyId = await getCompanyId();
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, phone, email, commission_rate, notes, is_active")
      .eq("company_id", companyId)
      .order("name");
    if (error) toast.error("Couldn't load agents.");
    setAgents(data || []);
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

  function openEdit(a: Agent) {
    setEditing(a);
    setForm({
      name: a.name,
      phone: a.phone || "",
      email: a.email || "",
      commission_rate: a.commission_rate != null ? String(a.commission_rate) : "",
      notes: a.notes || "",
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
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        commission_rate: form.commission_rate.trim() ? Number(form.commission_rate) : null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("agents").update(payload).eq("id", editing.id).eq("company_id", companyId);
        if (error) throw error;
        toast.success("Agent updated.");
      } else {
        const { error } = await supabase.from("agents").insert({ ...payload, company_id: companyId });
        if (error) throw error;
        toast.success("Agent added.");
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: Agent) {
    const companyId = await getCompanyId();
    const { error } = await supabase.from("agents").update({ is_active: !a.is_active }).eq("id", a.id).eq("company_id", companyId);
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
      const { error } = await supabase.from("agents").delete().eq("id", deleteTarget.id).eq("company_id", companyId);
      if (error) throw error;
      toast.success("Agent deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DesktopShell title="Agents">
    <div className="min-h-screen md:min-h-0 bg-slate-50/70 md:bg-transparent">
      <Header title="Agents" backLink="/settings" mdHidden />
      <div className="mx-auto max-w-2xl md:max-w-none md:mx-0 p-4 md:p-0 space-y-4">
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg px-4 py-2.5"
        >
          <Plus size={15} /> Add Agent
        </button>

        {loading ? (
          <div className="text-xs text-slate-400 text-center py-8">Loading…</div>
        ) : agents.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
            No agents yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm divide-y divide-slate-100">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800 truncate">{a.name}</span>
                    {!a.is_active && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {[a.phone, a.email, a.commission_rate != null ? `${a.commission_rate}% commission` : null]
                      .filter(Boolean)
                      .join(" · ") || "No details"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(a)}
                  className="shrink-0 text-[11px] font-bold text-slate-500 hover:text-slate-700"
                >
                  {a.is_active ? "Deactivate" : "Activate"}
                </button>
                <button type="button" onClick={() => openEdit(a)} className="shrink-0 p-2 text-slate-400 hover:text-slate-600">
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(a)}
                  className="shrink-0 p-2 text-slate-300 hover:text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Agent" : "Add Agent"}>
        <div className="space-y-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Jane Smith" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} optional />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} optional />
          </div>
          <Field
            label="Default Commission %"
            value={form.commission_rate}
            onChange={(v) => setForm({ ...form, commission_rate: v.replace(/[^0-9.]/g, "") })}
            placeholder="e.g. 10"
            optional
          />
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
        title="Delete agent?"
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

export default function AgentsPage() {
  return (
    <ProtectedRoute>
      <AgentsContent />
    </ProtectedRoute>
  );
}
