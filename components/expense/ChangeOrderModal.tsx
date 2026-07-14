"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import type { ChangeOrderRow } from "@/lib/types";
import type { NewChangeOrderInput } from "@/lib/queries/changeOrders";

export default function ChangeOrderModal({
  isOpen,
  onClose,
  onSave,
  editing,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: NewChangeOrderInput) => Promise<void>;
  /** Present when editing an existing draft/rejected change order;
   * absent when creating a new one. */
  editing?: ChangeOrderRow | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(editing?.title ?? "");
      setDescription(editing?.description ?? "");
      setAmount(editing ? String(editing.total_amount) : "");
      setTax(editing ? String(editing.tax) : "");
      setNotes(editing?.notes ?? "");
    }
  }, [isOpen, editing]);

  const parsedAmount = Number(amount);
  const isValid = title.trim().length > 0 && parsedAmount > 0;

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        amount: parsedAmount,
        tax: Number(tax || 0),
        notes: notes.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? "Edit Change Order" : "New Change Order"}>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Additional siding repair"
            className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
          />
        </div>

        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Description / Scope <span className="normal-case font-medium text-slate-300">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What's changing about the scope of work?"
            className="w-full mt-1 rounded-xl border border-slate-200/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm text-slate-800 placeholder:text-slate-400 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Amount</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="w-full h-11 pl-7 pr-3 rounded-xl border border-slate-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Tax <span className="normal-case font-medium text-slate-300">(optional)</span>
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="w-full h-11 pl-7 pr-3 rounded-xl border border-slate-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Notes <span className="normal-case font-medium text-slate-300">(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes"
            className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <button
          type="button"
          disabled={!isValid || saving}
          onClick={handleSave}
          className="w-full h-11 mt-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-30"
        >
          {saving ? "Saving…" : editing ? "Save Changes" : "Create Change Order (Draft)"}
        </button>
      </div>
    </Modal>
  );
}
