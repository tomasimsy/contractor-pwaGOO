"use client";

import { useState } from "react";
import { X, Camera } from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHODS,
  type AssignedSubcontractor,
  type EstimateExpenseCategory,
  type NewEntryInput,
  type ProjectBundle,
} from "@/lib/types";
import { getLastCategory, getLastPaymentMethod, setLastCategory, setLastPaymentMethod } from "@/lib/expense/recent-projects";;

export type FormCategory =
  | EstimateExpenseCategory
  | "subcontractor"
  | "agent_commission";

  
const ALL_CATEGORIES: { value: FormCategory; label: string }[] = [
  ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] })),
  { value: "subcontractor", label: "Subcontractor" },
  { value: "agent_commission", label: "Agent Commission" },
];

const NEW_SUB_OPTION = "__new__";
export default function AddExpenseSheet({
  bundle,
  initialCategory,
  onClose,
  onSubmit,
  onAssignSubcontractor,
}: {
  bundle: ProjectBundle;
  initialCategory?: FormCategory;
  onClose: () => void;
  onSubmit: (input: NewEntryInput) => Promise<void>;
  onAssignSubcontractor: (
    subcontractorId: string,
    name: string,
    trade: string | null
  ) => Promise<AssignedSubcontractor>;
}) {
  const [category, setCategory] = useState<FormCategory>(
    (getLastCategory() as FormCategory) || "material"
  );
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState(getLastPaymentMethod() || "card");
  const [vendor, setVendor] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [assignmentId, setAssignmentId] = useState(""); // existing estimate_subcontractor_id, or NEW_SUB_OPTION
  const [newSubcontractorId, setNewSubcontractorId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const parsedAmount = Number(amount);
  const parsedTax = Number(tax || 0);
  const isSubcontractor = category === "subcontractor";
  const isAgent = category === "agent_commission";
  const isExpenseCategory = !isSubcontractor && !isAgent;

  const isValid =
    parsedAmount > 0 &&
    (!isSubcontractor || (assignmentId && (assignmentId !== NEW_SUB_OPTION || newSubcontractorId))) &&
    (!isAgent || agentId);

  async function handleSubmit() {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    setLastCategory(category);
    setLastPaymentMethod(paymentMethod);

    try {
      if (isExpenseCategory) {
        await onSubmit({
          kind: "expense",
          estimateId: bundle.project.id,
          companyId: bundle.project.company_id,
          category: category as EstimateExpenseCategory,
          amount: parsedAmount,
          tax: parsedTax,
          expenseDate: entryDate,
          paymentMethod,
          vendor: vendor || null,
          paidBy: paidBy || null,
          notes: notes || null,
        });
      } else if (isSubcontractor) {
        let estimateSubcontractorId = assignmentId;
        if (assignmentId === NEW_SUB_OPTION) {
          const sub = bundle.allSubcontractors.find((s) => s.id === newSubcontractorId);
          if (!sub) return;
          const assigned = await onAssignSubcontractor(sub.id, sub.name, sub.trade);
          estimateSubcontractorId = assigned.estimateSubcontractorId;
        }
        await onSubmit({
          kind: "subcontractor_payment",
          estimateId: bundle.project.id,
          companyId: bundle.project.company_id,
          estimateSubcontractorId,
          amount: parsedAmount,
          paymentDate: entryDate,
          paymentMethod,
          notes: notes || null,
        });
      } else {
        await onSubmit({
          kind: "agent_payment",
          estimateId: bundle.project.id,
          companyId: bundle.project.company_id,
          agentId,
          amount: parsedAmount,
          paymentDate: entryDate,
          paymentMethod,
          notes: notes || null,
        });
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-800">Add Expense</div>
            <div className="text-xs text-slate-400 truncate">{bundle.project.title || "Untitled Estimate"}</div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 p-2 text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Amount */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Amount</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="w-full h-14 pl-8 pr-3 rounded-xl border border-slate-200 text-2xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-300"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Category</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
              {ALL_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`min-h-[44px] rounded-lg text-xs font-bold px-2 leading-tight ${
                    category === c.value
                      ? "bg-slate-800 text-white"
                      : "bg-slate-50 text-slate-600 border border-slate-200"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subcontractor picker — assigned-to-this-project subs first,
              with a fallback to assign someone new on the fly. */}
          {isSubcontractor && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Subcontractor</label>
              <select
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
                className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800"
              >
                <option value="">Select subcontractor…</option>
                {bundle.assignedSubcontractors.map((s) => (
                  <option key={s.estimateSubcontractorId} value={s.estimateSubcontractorId}>
                    {s.name}
                    {s.trade ? ` — ${s.trade}` : ""}
                  </option>
                ))}
                <option value={NEW_SUB_OPTION}>+ Not assigned to this project yet…</option>
              </select>

              {assignmentId === NEW_SUB_OPTION && (
                <select
                  value={newSubcontractorId}
                  onChange={(e) => setNewSubcontractorId(e.target.value)}
                  className="w-full h-11 mt-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800"
                >
                  <option value="">Choose from all subcontractors…</option>
                  {bundle.allSubcontractors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.trade ? ` — ${s.trade}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {isAgent && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sales Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800"
              >
                <option value="">Select agent…</option>
                {bundle.salesAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isExpenseCategory && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Vendor <span className="normal-case font-medium text-slate-300">(optional)</span>
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Home Depot"
                  className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Tax <span className="normal-case font-medium text-slate-300">(optional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tax}
                    onChange={(e) => setTax(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00"
                    className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Paid By <span className="normal-case font-medium text-slate-300">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    placeholder="Who paid"
                    className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
              </div>
            </>
          )}

          {/* Date + payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Payment</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 capitalize"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Note <span className="normal-case font-medium text-slate-300">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was this for?"
              className="w-full h-11 mt-1 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-400"
            />
          </div>

          {/* Only estimate_expenses has receipt columns — subcontractor
              and agent payments don't, so this only shows for those
              three categories. */}
          {isExpenseCategory && (
            <button
              type="button"
              className="w-full h-11 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Camera size={14} /> Attach Receipt Photo
            </button>
          )}
        </div>

        <div className="sticky bottom-0 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-100">
          <button
            type="button"
            disabled={!isValid || isSaving}
            onClick={handleSubmit}
            className="w-full h-12 rounded-xl bg-slate-800 text-white text-sm font-bold disabled:opacity-30"
          >
            {isSaving ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}