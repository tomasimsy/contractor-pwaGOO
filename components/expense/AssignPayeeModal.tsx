"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { getProjectFinancialSnapshot } from "@/lib/queries/expenses";
import { COMPANY_PERCENTAGE_OPTIONS, splitProfit, type CompanyPercentage } from "@/lib/utils/profitSplit";
import type { ProjectBundle } from "@/lib/types";

type Role = "subcontractor" | "agent";

// Assigns a subcontractor or agent to this project with an expected
// payout amount — the "during the estimate/project" step of the payout
// workflow. Picks from the company's existing subcontractors/agents, or
// quick-adds a brand-new one inline (same pattern AddExpenseSheet already
// uses), so this never blocks on a separate "go add a subcontractor
// first" trip to Settings.
//
// Shows the same revenue/committed-cost/profit breakdown used everywhere
// else on the Expense page (getProjectFinancialSnapshot — the single
// source of truth also used by summarizeFinancials), so the numbers here
// never drift from what the rest of the app shows.
export default function AssignPayeeModal({
  isOpen,
  onClose,
  bundle,
  onAssignSubcontractor,
  onAssignAgent,
  defaultRole = "subcontractor",
}: {
  isOpen: boolean;
  onClose: () => void;
  bundle: ProjectBundle;
  onAssignSubcontractor: (subcontractorId: string, name: string, trade: string | null, amount: number, notes: string | null) => Promise<void>;
  onAssignAgent: (agentId: string, name: string, amount: number, notes: string | null) => Promise<void>;
  defaultRole?: Role;
}) {
  const [role, setRole] = useState<Role>(defaultRole);
  const [payeeId, setPayeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [saving, setSaving] = useState(false);
  // Company/agent profit split — the same two presets ProjectFinancialsModal
  // offers (30% company / 70% agent, or 60% / 40%). There's no per-agent
  // "commission rate" column that's actually wired up anywhere in the app
  // (agents.commission_rate exists but nothing sets it), so this — not
  // that field — is the real source of the agent's percentage.
  const [companyPercentage, setCompanyPercentage] = useState<CompanyPercentage>(30);

  const options = role === "subcontractor" ? bundle.allSubcontractors : bundle.salesAgents;
  const snapshot = getProjectFinancialSnapshot(bundle);

  const selectedAgent = role === "agent" ? bundle.salesAgents.find((a) => a.id === payeeId) : undefined;
  // Agent's expected payout is a straight percentage of what's left over
  // after committed subcontractor cost and other expenses — same
  // "available profit" / splitProfit() math as ProjectFinancialsModal, so
  // the two can never disagree. Only pre-fills the amount field; the
  // number can still be overridden below, per "allow manual override but
  // keep the original calculation" — the calculated figure stays visible
  // in the breakdown even if overridden.
  const profitSplit = splitProfit(snapshot.availableProfit, companyPercentage);
  const calculatedAgentPayment = Math.max(profitSplit.agentAmount, 0);

  // Auto-suggest the agent payment once a payee + split are known, unless
  // the user has already typed their own amount.
  useEffect(() => {
    if (role === "agent" && payeeId && !amountTouched) {
      setAmount(calculatedAgentPayment > 0 ? calculatedAgentPayment.toFixed(2) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, payeeId, companyPercentage]);

  function reset() {
    setRole(defaultRole);
    setPayeeId("");
    setAmount("");
    setAmountTouched(false);
    setNotes("");
    setQuickAddOpen(false);
    setQuickAddName("");
    setCompanyPercentage(30);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function quickAdd() {
    const name = quickAddName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const table = role === "subcontractor" ? "subcontractors" : "agents";
      const { data, error } = await supabase
        .from(table)
        .insert({ name, company_id: bundle.project.company_id })
        .select("id, name, trade")
        .single();
      if (error) throw error;
      setPayeeId((data as any).id);
      setQuickAddOpen(false);
      setQuickAddName("");
    } finally {
      setSaving(false);
    }
  }

  const parsedAmount = Number(amount) || 0;
  const isValid = payeeId && parsedAmount > 0;

  async function handleAssign() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      if (role === "subcontractor") {
        const sub = bundle.allSubcontractors.find((s) => s.id === payeeId);
        await onAssignSubcontractor(payeeId, sub?.name ?? "Subcontractor", sub?.trade ?? null, parsedAmount, notes.trim() || null);
      } else {
        const agent = bundle.salesAgents.find((a) => a.id === payeeId);
        await onAssignAgent(payeeId, agent?.name ?? "Agent", parsedAmount, notes.trim() || null);
      }
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Assign Payout">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["subcontractor", "agent"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRole(r);
                setPayeeId("");
                setAmount("");
                setAmountTouched(false);
              }}
              className={`h-10 rounded-xl text-sm font-bold transition-colors ${
                role === r ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r === "subcontractor" ? "Subcontractor" : "Agent"}
            </button>
          ))}
        </div>

        {/* Calculation breakdown — same source-of-truth numbers as the
            Expense page's Customer Payment Status / Expense Summary
            cards, so nothing shown here can disagree with them. */}
        <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 space-y-1.5 text-sm">
          <BreakdownRow label="Project Revenue" value={formatCurrency(snapshot.revenue)} />
          {role === "subcontractor" ? (
            <>
              <BreakdownRow label="Committed Costs (existing)" value={`-${formatCurrency(snapshot.subcontractorCommitted)}`} />
              <BreakdownRow label="Other Expenses" value={`-${formatCurrency(snapshot.otherExpenses)}`} />
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 font-bold">
                <span className="text-slate-700">Remaining Profit</span>
                <span className="text-slate-900">{formatCurrency(snapshot.availableProfit)}</span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 space-y-1.5">
                <BreakdownRow label="Sub Assigned Amount" value={formatCurrency(parsedAmount)} />
                <BreakdownRow label="Paid Amount" value={formatCurrency(0)} muted />
                <BreakdownRow label="Remaining Balance" value={formatCurrency(parsedAmount)} muted />
              </div>
            </>
          ) : (
            <>
              <BreakdownRow label="Subcontractor Commitments" value={`-${formatCurrency(snapshot.subcontractorCommitted)}`} />
              <BreakdownRow label="Other Expenses" value={`-${formatCurrency(snapshot.otherExpenses)}`} />
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 font-bold">
                <span className="text-slate-700">Available Profit</span>
                <span className="text-slate-900">{formatCurrency(snapshot.availableProfit)}</span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Commission Split</span>
                  <div className="flex gap-1">
                    {COMPANY_PERCENTAGE_OPTIONS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setCompanyPercentage(pct)}
                        className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
                          companyPercentage === pct ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {100 - pct}% agent
                      </button>
                    ))}
                  </div>
                </div>
                <BreakdownRow label="Calculated Agent Payment" value={formatCurrency(calculatedAgentPayment)} />
              </div>
            </>
          )}
        </div>

        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            {role === "subcontractor" ? "Subcontractor" : "Agent"}
          </label>
          <select
            value={payeeId}
            onChange={(e) => setPayeeId(e.target.value)}
            className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors"
          >
            <option value="">Select…</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {!quickAddOpen ? (
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="flex items-center gap-1 text-xs font-bold text-emerald-700 mt-1.5"
            >
              <Plus size={12} /> Add new {role}
            </button>
          ) : (
            <div className="flex gap-2 mt-1.5">
              <input
                type="text"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                placeholder={`New ${role} name`}
                className="flex-1 h-9 rounded-lg border border-slate-200/70 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors"
              />
              <button
                type="button"
                disabled={!quickAddName.trim() || saving}
                onClick={quickAdd}
                className="h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-30"
              >
                Add
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            {role === "agent" ? "Payout Amount" : "Assigned Payout Amount"}
            {role === "agent" && selectedAgent && (
              <span className="normal-case font-medium text-slate-300"> (calculated, editable)</span>
            )}
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                setAmountTouched(true);
              }}
              placeholder="0.00"
              className="w-full h-11 pl-7 pr-3 rounded-xl border border-slate-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
            />
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
            placeholder="Scope of work, terms, etc."
            className="w-full h-11 mt-1 rounded-xl border border-slate-200/70 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <button
          type="button"
          disabled={!isValid || saving}
          onClick={handleAssign}
          className="w-full h-11 mt-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-30"
        >
          {saving ? "Assigning…" : "Assign"}
        </button>
      </div>
    </Modal>
  );
}

function BreakdownRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-slate-400" : "text-slate-500"}>{label}</span>
      <span className={`font-semibold ${muted ? "text-slate-500" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
