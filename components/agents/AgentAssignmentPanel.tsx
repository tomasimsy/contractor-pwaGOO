"use client";

/**
 * Commission assignments for agents on one project, and what each is owed.
 * Commission AND reimbursements (expenses the agent paid for) are paid on
 * Payroll only — each row links there — so every check gets a date, method
 * and number and shows as one payment.
 *
 * Balance breakdown per agent:
 *   Commission Earned   = balances[assignment.id].committed  (AgentCommissionService.getBalance)
 *   Reimbursements Owed  = reimbursementsOwedByAgent[agentId] (sum of ExpenseService.listPendingReimbursements —
 *                          the SAME rows an agent-paid Expense already produces; nothing new is written here)
 *   Payments Made        = balance.paid + compensationByAgent[agentId].totalReimbursements
 *                          (commission payments + settled reimbursement payments — AgentCommissionService.getCompensationSummary)
 *   Total Outstanding     = calculateAgentOutstandingBalance(commissionEarned, reimbursementsOwed, paymentsMade)
 *                          (financialCalculations.ts — the one formula, not re-derived here)
 *
 * Recording an expense with "Paid By: Agent" already makes it reimbursable
 * with reimbursementStatus "pending" (ExpenseService.create's own default —
 * see its doc comment) — this component never creates or duplicates that
 * reimbursement record, it only reads it via useAgentAssignments.
 */
import { forwardRef, useImperativeHandle, useState } from "react";
import Link from "next/link";
import { Briefcase, Plus, Receipt, Trash2, Lock } from "lucide-react";
import { useAgentAssignments } from "@/lib/hooks/useAgentAssignments";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { useToast } from "@/components/ui/useToast";
import { calculateAgentOutstandingBalance } from "@/lib/services/financialCalculations";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface AgentAssignmentPanelRef {
  refresh: () => Promise<void>;
}

export const AgentAssignmentPanel = forwardRef<AgentAssignmentPanelRef, {
  companyId: string;
  projectId: string;
  estimateId?: string | null;
  onChanged?: () => void;
  compact?: boolean;
}>(function AgentAssignmentPanel({ companyId, projectId, estimateId, onChanged, compact = false }, ref) {
  const {
    roster, assignments, balances, paidByAssignment, pendingReimbursements, reimbursementsOwedByAgent,
    loading, error, assign, removeAssignment, createAgent, refresh,
  } = useAgentAssignments(companyId, projectId, estimateId);
  const [agentId, setAgentId] = useState("");
  const [assignedAmount, setAssignedAmount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRate, setNewAgentRate] = useState("");

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  const { ask, dialog } = useConfirmDialog();
  const { notify, toast } = useToast();

  if (loading) return <div className={compact ? "text-xs text-muted-foreground" : "rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground"}>Loading agents…</div>;

  async function handleRemove(a: (typeof assignments)[number]) {
    const confirmed = await ask({
      title: `Remove ${a.agentName} from this estimate?`,
      message: "Their recorded payments are not affected.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (confirmed === null) return;
    setBusyId(a.id);
    try {
      await removeAssignment(a.id, "User removed assignment via UI");
      onChanged?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not remove this assignment.");
    } finally {
      setBusyId(null);
    }
  }

  const Wrapper = compact ? "div" : "section";

  return (
    <Wrapper className={compact ? "" : "rounded-lg border border-gray-200 bg-white p-3 shadow-sm"}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
            <Briefcase className="size-3.5 text-emerald-500" /> Agents
          </h2>
          <span className="text-[10px] text-gray-400">{assignments.length}</span>
        </div>
      )}

      {error && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => refresh()} className="font-medium underline">Retry</button>
        </div>
      )}

      {/* Assign Section - Compact */}
      <div className="mb-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="h-7 min-w-[100px] flex-1 rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
          >
            <option value="">Select agent…</option>
            {roster.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewAgent((v) => !v)}
            className="inline-flex h-7 items-center gap-0.5 rounded border border-gray-200 px-2 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <Plus className="size-3" /> New
          </button>
          <input
            type="number" min="0" step="any" placeholder="$"
            value={assignedAmount || ""}
            onChange={(e) => setAssignedAmount(parseFloat(e.target.value) || 0)}
            className="h-7 w-20 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
          />
          <button
            type="button"
            disabled={!agentId || assignedAmount <= 0}
            onClick={async () => {
              setAssignError(null);
              try {
                await assign(agentId, assignedAmount);
                onChanged?.();
                setAgentId("");
                setAssignedAmount(0);
              } catch (err) {
                setAssignError(err instanceof Error ? err.message : "Could not assign.");
              }
            }}
            className="inline-flex h-7 items-center rounded bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Assign
          </button>
        </div>
        {assignError && <p className="text-[10px] text-red-500">{assignError}</p>}

        {showNewAgent && (
          <div className="flex flex-wrap items-center gap-1 border-t border-gray-100 pt-1.5">
            <input
              placeholder="Name" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)}
              className="h-7 flex-1 rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
            />
            <input
              type="number" min="0" step="any" placeholder="Rate %"
              value={newAgentRate} onChange={(e) => setNewAgentRate(e.target.value)}
              className="h-7 w-16 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-700 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
            />
            <button
              type="button"
              disabled={!newAgentName.trim()}
              onClick={async () => {
                const created = await createAgent(newAgentName.trim(), newAgentRate ? parseFloat(newAgentRate) : undefined);
                setAgentId(created.id);
                setNewAgentName("");
                setNewAgentRate("");
                setShowNewAgent(false);
              }}
              className="inline-flex h-7 items-center rounded bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Assignments List - Compact */}
      {assignments.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-gray-400">No agents assigned</p>
        </div>
      ) : (
        <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto pr-0.5">
          {assignments.map((a) => {
            const agent = roster.find(r => r.id === a.agentId);
            const balance = balances[a.agentId];
            const owedExpenses = pendingReimbursements?.[a.agentId] ?? [];
            const reimbursementsOwed = reimbursementsOwedByAgent?.[a.agentId] ?? 0;
            const commissionEarned = balance?.contracted ?? 0;
            const paymentsMade = balance?.paid ?? 0;
            const totalOutstanding = calculateAgentOutstandingBalance(commissionEarned, reimbursementsOwed, paymentsMade);
            const hasPayments = (paidByAssignment?.[a.id] ?? 0) > 0;

            return (
              <li key={a.id} className="py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-gray-800">{a.agentName}</span>
                      {agent?.commissionRate && (
                        <span className="text-[9px] text-gray-400">· {agent.commissionRate}%</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={`text-[10px] font-semibold ${totalOutstanding > 0 ? "text-emerald-600" : "text-gray-800"}`}>
                      {money(totalOutstanding)}
                    </div>
                    <div className="text-[9px] text-gray-400">owed</div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {hasPayments ? (
                      <span className="flex items-center gap-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 bg-gray-100">
                        <Lock className="size-2.5" /> Paid
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemove(a)}
                        disabled={busyId === a.id}
                        title="Remove" aria-label="Remove" className="rounded p-1 text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Balance breakdown - compact */}
                <div className="mt-1.5 grid grid-cols-4 gap-1 text-[10px]">
                  <div className="flex justify-between px-1.5 py-0.5 rounded bg-gray-100/50">
                    <span className="text-gray-500">Earned</span>
                    <span className="font-medium text-gray-700">{money(commissionEarned)}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-0.5 rounded bg-gray-100/50">
                    <span className="text-gray-500">Reimb.</span>
                    <span className="font-medium text-gray-700">{money(reimbursementsOwed)}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-0.5 rounded bg-gray-100/50">
                    <span className="text-gray-500">Paid</span>
                    <span className="font-medium text-gray-700">{money(paymentsMade)}</span>
                  </div>
                  <div className="flex justify-between px-1.5 py-0.5 rounded bg-emerald-100/50">
                    <span className="text-emerald-700">Owed</span>
                    <span className={`font-semibold ${totalOutstanding > 0 ? "text-emerald-600" : "text-gray-700"}`}>
                      {money(totalOutstanding)}
                    </span>
                  </div>
                </div>

                {/* Commission and reimbursements are paid on Payroll, in one check. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Link
                    href={`/payroll?person=${encodeURIComponent(`agent:${a.agentId}`)}`}
                    className="inline-flex h-6 items-center rounded border border-emerald-600/40 px-2 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    {owedExpenses.length > 0 ? "Pay commission and reimbursements in Payroll →" : "Pay commission in Payroll →"}
                  </Link>
                </div>

                {/* What they paid for and are owed back — paid in Payroll. */}
                {owedExpenses.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[9px] text-gray-400">Owed back:</span>
                    {owedExpenses.map((exp) => (
                      <span key={exp.id} className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">
                        <Receipt className="size-2" />
                        {exp.description || exp.vendor || exp.category} · {money(exp.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
      {toast}
    </Wrapper>
  );
});