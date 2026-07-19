"use client";

import { useEffect, useState } from "react";
import { X, Camera, Check } from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHODS,
  type AssignedSubcontractor,
  type EstimateExpenseCategory,
  type NewEntryInput,
  type ProjectBundle,
} from "@/lib/types";
import { getLastCategory, getLastPaymentMethod, setLastCategory, setLastPaymentMethod } from "@/lib/expense/recent-projects";
import { formatCurrency } from "@/lib/utils/formatting";
import { COMPANY_PERCENTAGE_OPTIONS, splitEvenly, splitProfit, type CompanyPercentage } from "@/lib/utils/profitSplit";
import { getRecentVendors } from "@/lib/queries/expenses";
import { supabase } from "@/lib/supabase/client";

const SPLIT_TOLERANCE = 0.05; // percentage points — absorbs float rounding, not real mismatches

export type FormCategory =
  | EstimateExpenseCategory
  | "subcontractor"
  | "agent_commission";

const ALL_CATEGORIES: { value: FormCategory; label: string }[] = [
  ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] })),
  { value: "subcontractor", label: "Subcontractor Payment" },
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
    trade: string | null,
    amount: number,
    notes: string | null
  ) => Promise<AssignedSubcontractor>;
}) {
  const [category, setCategory] = useState<FormCategory>(
    initialCategory ?? ((getLastCategory() as FormCategory) || "material")
  );
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState(getLastPaymentMethod() || "card");
  const [vendor, setVendor] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [paidByAgentId, setPaidByAgentId] = useState("");
  const [assignmentId, setAssignmentId] = useState(""); // existing estimate_subcontractor_id, or NEW_SUB_OPTION
  const [newSubcontractorId, setNewSubcontractorId] = useState("");
  // Same "committed payout amount" + notes fields AssignPayeeModal collects
  // when assigning a subcontractor to a project — reusing them here (instead
  // of silently assigning with amount 0) is what keeps both entry points
  // writing the same estimate_subcontractors row shape.
  const [newSubAssignAmount, setNewSubAssignAmount] = useState("");
  const [newSubAssignNotes, setNewSubAssignNotes] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentPercentages, setAgentPercentages] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [companyPercentage, setCompanyPercentage] = useState<CompanyPercentage>(30);
  const [recentVendors, setRecentVendors] = useState<string[]>([]);
  const [changeOrderId, setChangeOrderId] = useState(""); // "" = original estimate scope

  const approvedChangeOrders = bundle.changeOrders.filter((co) => co.status === "approved");

  // Quick-add: locally-appended rows so the picker updates immediately
  // without needing the parent to reload the whole project bundle.
  const [extraSubcontractors, setExtraSubcontractors] = useState<{ id: string; name: string; trade: string | null }[]>([]);
  const [extraAgents, setExtraAgents] = useState<{ id: string; name: string }[]>([]);
  const [quickAddSubOpen, setQuickAddSubOpen] = useState(false);
  const [quickAddSubName, setQuickAddSubName] = useState("");
  const [quickAddAgentOpen, setQuickAddAgentOpen] = useState(false);
  const [quickAddAgentName, setQuickAddAgentName] = useState("");
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const allSubcontractorOptions = [...bundle.allSubcontractors, ...extraSubcontractors];
  const allAgentOptions = [...bundle.salesAgents, ...extraAgents];

  async function quickAddSubcontractor() {
    if (!quickAddSubName.trim() || quickAddSaving) return;
    setQuickAddSaving(true);
    try {
      const { data, error } = await supabase
        .from("subcontractors")
        .insert({ name: quickAddSubName.trim(), company_id: bundle.project.company_id })
        .select("id, name, trade")
        .single();
      if (error) throw error;
      setExtraSubcontractors((prev) => [...prev, data]);
      setNewSubcontractorId(data.id);
      setQuickAddSubName("");
      setQuickAddSubOpen(false);
    } finally {
      setQuickAddSaving(false);
    }
  }

  async function quickAddAgent() {
    if (!quickAddAgentName.trim() || quickAddSaving) return;
    setQuickAddSaving(true);
    try {
      const { data, error } = await supabase
        .from("agents")
        .insert({ name: quickAddAgentName.trim(), company_id: bundle.project.company_id })
        .select("id, name")
        .single();
      if (error) throw error;
      setExtraAgents((prev) => [...prev, data]);
      toggleAgent(data.id);
      setQuickAddAgentName("");
      setQuickAddAgentOpen(false);
    } finally {
      setQuickAddSaving(false);
    }
  }

  useEffect(() => {
    getRecentVendors(bundle.project.company_id)
      .then(setRecentVendors)
      .catch(() => {}); // autocomplete is a nice-to-have, never block the form on it
  }, [bundle.project.company_id]);

  const parsedAmount = Number(amount);
  const parsedTax = Number(tax || 0);
  const isSubcontractor = category === "subcontractor";
  const isAgent = category === "agent_commission";
  const isExpenseCategory = !isSubcontractor && !isAgent;

  // Same net-after-costs formula ProjectFinancialsModal uses, applied to
  // whatever's already loaded in the bundle — no extra fetch needed.
  const totalSubPaid = bundle.subcontractorPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpensesLogged = bundle.expenses.reduce((sum, e) => sum + e.amount, 0);
  const netAfterCosts = bundle.project.total - totalSubPaid - totalExpensesLogged;
  const profitSplit = splitProfit(netAfterCosts, companyPercentage);

  // Percentages are the source of truth per agent; dollar amounts are
  // always derived from them, so changing the overall Amount field
  // rescales every agent's $ share automatically instead of going stale.
  function toggleAgent(agentId: string) {
    setSelectedAgentIds((prev) => {
      const next = prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId];
      const shares = splitEvenly(100, next.length);
      setAgentPercentages(Object.fromEntries(next.map((id, i) => [id, shares[i]])));
      return next;
    });
  }

  function splitAgentsEvenly() {
    const shares = splitEvenly(100, selectedAgentIds.length);
    setAgentPercentages(Object.fromEntries(selectedAgentIds.map((id, i) => [id, shares[i]])));
  }

  function setAgentPercentage(agentId: string, pct: number) {
    setAgentPercentages((prev) => ({ ...prev, [agentId]: pct }));
  }

  function setAgentDollarAmount(agentId: string, dollars: number) {
    const pct = parsedAmount > 0 ? (dollars / parsedAmount) * 100 : 0;
    setAgentPercentage(agentId, pct);
  }

  const totalAgentPercentage = selectedAgentIds.reduce((sum, id) => sum + (agentPercentages[id] ?? 0), 0);
  const isAgentSplitValid =
    selectedAgentIds.length > 0 && Math.abs(totalAgentPercentage - 100) < SPLIT_TOLERANCE;

  const isValid =
    parsedAmount > 0 &&
    (!isSubcontractor || (assignmentId && (assignmentId !== NEW_SUB_OPTION || newSubcontractorId))) &&
    (!isAgent || isAgentSplitValid);

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
          changeOrderId: changeOrderId || null,
          paidByAgentId: paidByAgentId || null,
        });
      } else if (isSubcontractor) {
        let estimateSubcontractorId = assignmentId;
        if (assignmentId === NEW_SUB_OPTION) {
          const sub = allSubcontractorOptions.find((s) => s.id === newSubcontractorId);
          if (!sub) return;
          const assigned = await onAssignSubcontractor(
            sub.id,
            sub.name,
            sub.trade,
            Number(newSubAssignAmount) || 0,
            newSubAssignNotes.trim() || null
          );
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
          changeOrderId: changeOrderId || null,
          reimbursementFromAgentId: paidByAgentId || null,
        });
      } else {
        // Each selected agent becomes its own agent_payments row — the
        // schema already models one row per agent per payment, so a
        // multi-agent split needs no new tables or columns, just N
        // inserts. The last agent absorbs whatever cent of rounding
        // remainder is left so the rows always sum exactly to the
        // entered amount.
        const dollarShares = selectedAgentIds.map((id) => (parsedAmount * (agentPercentages[id] ?? 0)) / 100);
        const rounded = dollarShares.map((d) => Math.round(d * 100) / 100);
        const allocated = rounded.slice(0, -1).reduce((sum, d) => sum + d, 0);
        if (rounded.length > 0) rounded[rounded.length - 1] = Math.round((parsedAmount - allocated) * 100) / 100;

        for (let i = 0; i < selectedAgentIds.length; i++) {
          await onSubmit({
            kind: "agent_payment",
            estimateId: bundle.project.id,
            companyId: bundle.project.company_id,
            agentId: selectedAgentIds[i],
            amount: rounded[i],
            paymentDate: entryDate,
            paymentMethod,
            notes: notes || null,
            changeOrderId: changeOrderId || null,
            reimbursementFromAgentId: paidByAgentId || null,
          });
        }
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
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
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Amount</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="w-full h-14 pl-8 pr-3 rounded-xl border border-slate-200/70 text-2xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Category</label>
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

          {/* Link to — defaults to the original estimate scope; only
              approved change orders are selectable, since linking real
              spend to a not-yet-approved one would misstate financials. */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Link To</label>
            <select
              value={changeOrderId}
              onChange={(e) => setChangeOrderId(e.target.value)}
              className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
            >
              <option value="">Original Estimate</option>
              {approvedChangeOrders.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.change_order_number} — {co.title}
                </option>
              ))}
            </select>
          </div>

          {/* Subcontractor picker — assigned-to-this-project subs first,
              with a fallback to assign someone new on the fly. */}
          {isSubcontractor && (
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Subcontractor</label>
              <select
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
                className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
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
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={newSubcontractorId}
                      onChange={(e) => setNewSubcontractorId(e.target.value)}
                      className="flex-1 h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800"
                    >
                      <option value="">Choose from all subcontractors…</option>
                      {allSubcontractorOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.trade ? ` — ${s.trade}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setQuickAddSubOpen((v) => !v)}
                      className="shrink-0 h-11 px-3 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                    >
                      + Add New
                    </button>
                  </div>
                  {quickAddSubOpen && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        value={quickAddSubName}
                        onChange={(e) => setQuickAddSubName(e.target.value)}
                        placeholder="New subcontractor name"
                        className="flex-1 h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
                      />
                      <button
                        type="button"
                        disabled={!quickAddSubName.trim() || quickAddSaving}
                        onClick={quickAddSubcontractor}
                        className="shrink-0 h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-30"
                      >
                        {quickAddSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}

                  {/* Same "Assigned Payout Amount" / "Notes" fields
                      AssignPayeeModal collects on assignment — logging a
                      payment for a not-yet-assigned sub shouldn't create a
                      weaker assignment (amount $0, no notes) than assigning
                      them up front does. */}
                  <div className="mt-2">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Assigned Payout Amount <span className="normal-case font-medium text-slate-300">(optional)</span>
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={newSubAssignAmount}
                        onChange={(e) => setNewSubAssignAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="0.00"
                        className="w-full h-11 pl-7 pr-3 rounded-xl border border-slate-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Assignment Notes <span className="normal-case font-medium text-slate-300">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={newSubAssignNotes}
                      onChange={(e) => setNewSubAssignNotes(e.target.value)}
                      placeholder="Scope of work, terms, etc."
                      className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {isAgent && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Sales Agents <span className="normal-case font-medium text-slate-300">(select one or more)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setQuickAddAgentOpen((v) => !v)}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
                >
                  + Add New
                </button>
              </div>
              {quickAddAgentOpen && (
                <div className="flex items-center gap-2 mt-1 mb-2">
                  <input
                    type="text"
                    value={quickAddAgentName}
                    onChange={(e) => setQuickAddAgentName(e.target.value)}
                    placeholder="New agent name"
                    className="flex-1 h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
                  />
                  <button
                    type="button"
                    disabled={!quickAddAgentName.trim() || quickAddSaving}
                    onClick={quickAddAgent}
                    className="shrink-0 h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-30"
                  >
                    {quickAddSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
              <div className="mt-1 rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {allAgentOptions.length === 0 ? (
                  <div className="p-3 text-xs text-slate-400">No sales agents on this company yet.</div>
                ) : (
                  allAgentOptions.map((a) => {
                    const selected = selectedAgentIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleAgent(a.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-left ${
                          selected ? "bg-slate-800 text-white" : "text-slate-800"
                        }`}
                      >
                        <span className="truncate">{a.name}</span>
                        {selected && <Check size={15} className="shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              {selectedAgentIds.length > 0 && (
                <div className="mt-2 space-y-2">
                  {selectedAgentIds.map((id) => {
                    const agent = allAgentOptions.find((a) => a.id === id);
                    const pct = agentPercentages[id] ?? 0;
                    const dollars = (parsedAmount * pct) / 100;
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-700">
                          {agent?.name ?? "Agent"}
                        </span>
                        <div className="relative shrink-0">
                          <input
                            type="number"
                            value={Number.isFinite(pct) ? Math.round(pct * 100) / 100 : 0}
                            onChange={(e) => setAgentPercentage(id, Number(e.target.value))}
                            className="w-16 h-9 rounded-lg border border-slate-200 pl-2 pr-5 text-sm font-semibold text-slate-800 text-right"
                            step="0.1"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                        </div>
                        <div className="relative shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                          <input
                            type="number"
                            value={Number.isFinite(dollars) ? Math.round(dollars * 100) / 100 : 0}
                            onChange={(e) => setAgentDollarAmount(id, Number(e.target.value))}
                            className="w-20 h-9 rounded-lg border border-slate-200 pl-4 pr-2 text-sm font-semibold text-slate-800 text-right"
                            step="0.01"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAgent(id)}
                          className="shrink-0 p-1.5 text-slate-300 hover:text-rose-600"
                          aria-label="Remove agent"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between pt-1">
                    <span className={`text-[11px] font-bold ${isAgentSplitValid ? "text-emerald-600" : "text-rose-600"}`}>
                      Total: {totalAgentPercentage.toFixed(1)}% ({formatCurrency((parsedAmount * totalAgentPercentage) / 100)})
                    </span>
                    {selectedAgentIds.length > 1 && (
                      <button type="button" onClick={splitAgentsEvenly} className="text-[11px] font-bold text-slate-500 underline">
                        Split evenly
                      </button>
                    )}
                  </div>
                  {!isAgentSplitValid && (
                    <div className="text-[11px] text-rose-600">Splits must add up to 100% before saving.</div>
                  )}
                </div>
              )}

              {/* Same company/agent split ProjectFinancialsModal uses —
                  a calculator to help pick the commission amount, not a
                  replacement for typing one in directly above. */}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Profit Split</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  {COMPANY_PERCENTAGE_OPTIONS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCompanyPercentage(pct)}
                      className={`h-9 rounded-lg text-xs font-bold ${
                        companyPercentage === pct
                          ? "bg-slate-800 text-white"
                          : "bg-white text-slate-600 border border-slate-200"
                      }`}
                    >
                      Company {pct}% / Agent {100 - pct}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-xs text-slate-500">
                    Agent share ({profitSplit.agentPercentage}% of {formatCurrency(netAfterCosts)} net)
                  </span>
                  <span className="text-sm font-black text-slate-800">{formatCurrency(profitSplit.agentAmount)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAmount(profitSplit.agentAmount.toFixed(2))}
                  className="w-full h-9 mt-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  Use this amount
                </button>
              </div>

            </div>
          )}

          {isExpenseCategory && (
            <>
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Vendor <span className="normal-case font-medium text-slate-300">(optional)</span>
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Home Depot"
                  list="vendor-suggestions"
                  className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
                />
                <datalist id="vendor-suggestions">
                  {recentVendors.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Tax <span className="normal-case font-medium text-slate-300">(optional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tax}
                    onChange={(e) => setTax(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00"
                    className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Paid By <span className="normal-case font-medium text-slate-300">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    placeholder="Who paid"
                    className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
              </div>
            </>
          )}

          {/* Paid By — who paid for this expense */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Paid By <span className="normal-case font-medium text-slate-300">(who paid for this expense)</span>
            </label>
            <select
              value={paidByAgentId}
              onChange={(e) => setPaidByAgentId(e.target.value)}
              className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
            >
              <option value="">Company (default)</option>
              {allAgentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date + payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
              />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Payment</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800 capitalize"
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
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Note <span className="normal-case font-medium text-slate-300">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was this for?"
              className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm text-slate-800 placeholder:text-slate-400"
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
            className="w-full h-12 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-30"
          >
            {isSaving ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}