"use client";

/**
 * Commission assignment + commission payments + reimbursement payments
 * for agents on one project. The commission-vs-reimbursement UI split
 * exists because they need different inputs (a reimbursement must pick
 * which expense it settles), not because this component treats them as
 * different financial concepts — that distinction lives entirely in
 * AgentCommissionService/ExpenseService.
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
import { Briefcase, Plus, Receipt } from "lucide-react";
import { useAgentAssignments } from "@/lib/hooks/useAgentAssignments";
import { EmptyState } from "@/components/ui/EmptyState";
import { calculateAgentOutstandingBalance } from "@/lib/services/financialCalculations";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface AgentAssignmentPanelRef {
  refresh: () => Promise<void>;
}

export const AgentAssignmentPanel = forwardRef<AgentAssignmentPanelRef, {
  companyId: string;
  projectId: string;
  /** Called after any cost-affecting mutation — same onChanged pattern
   * SubcontractorAssignmentPanel uses. */
  onChanged?: () => void;
  /** Drops the outer border/heading — used when a parent (e.g.
   * SubAgentTabsPanel) already provides both, so they aren't doubled. */
  compact?: boolean;
}>(function AgentAssignmentPanel({ companyId, projectId, onChanged, compact = false }, ref) {
  const {
    roster, assignments, balances, pendingReimbursements, reimbursementsOwedByAgent, compensationByAgent,
    loading, error, assign, recordCommissionPayment, recordReimbursementPayment, createAgent, refresh,
  } = useAgentAssignments(companyId, projectId);
  const [agentId, setAgentId] = useState("");
  const [assignedAmount, setAssignedAmount] = useState(0);
  const [commissionAmounts, setCommissionAmounts] = useState<Record<string, number>>({});
  const [reimbursementAmount, setReimbursementAmount] = useState<Record<string, number>>({});
  const [reimbursementExpense, setReimbursementExpense] = useState<Record<string, string>>({});
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRate, setNewAgentRate] = useState("");

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  if (loading) return <div className={compact ? "text-xs text-muted-foreground" : "rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground"}>Loading agents…</div>;

  const Wrapper = compact ? "div" : "section";

  return (
    <Wrapper className={compact ? "" : "rounded-xl border border-border bg-card p-3 sm:p-4"}>
      {!compact && (
        <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Briefcase className="size-3.5" /> Agents
        </h2>
      )}

      {error && (
        <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => refresh()} className="font-medium underline">Retry</button>
        </div>
      )}

      <div className="mb-3 space-y-2 rounded-lg border border-border p-2.5 bg-muted/20">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="h-7 min-w-[120px] flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">Select agent…</option>
            {roster.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.commissionRate ? ` (${a.commissionRate}%)` : ""}</option>
            ))}
          </select>
          <button type="button" onClick={() => setShowNewAgent((v) => !v)} className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2 text-xs font-medium text-foreground hover:bg-muted">
            <Plus className="size-3" /> New
          </button>
          <input
            type="number" min="0" step="any" placeholder="Amount"
            value={assignedAmount || ""}
            onChange={(e) => setAssignedAmount(parseFloat(e.target.value) || 0)}
            className="h-7 w-28 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <button
            type="button"
            disabled={!agentId || assignedAmount <= 0}
            onClick={async () => {
              await assign(agentId, assignedAmount);
              onChanged?.();
              setAgentId("");
              setAssignedAmount(0);
            }}
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Assign
          </button>
        </div>

        {showNewAgent && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
            <input
              placeholder="Agent name" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)}
              className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <input
              type="number" min="0" step="any" placeholder="Rate %"
              value={newAgentRate} onChange={(e) => setNewAgentRate(e.target.value)}
              className="h-7 w-20 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
              className="inline-flex h-7 items-center rounded-md border border-input px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {assignments.length === 0 ? (
        <EmptyState title="No agents assigned" description="Assign an agent to this project to start tracking commissions." />
      ) : (
        <ul className="divide-y divide-border">
          {assignments.map((a) => {
            const balance = balances[a.id];
            const owedExpenses = pendingReimbursements[a.agentId] ?? [];
            const reimbursementsOwed = reimbursementsOwedByAgent[a.agentId] ?? 0;
            const compensation = compensationByAgent[a.agentId];
            const commissionEarned = balance?.committed ?? 0;
            const paymentsMade = (balance?.paid ?? 0) + (compensation?.totalReimbursements ?? 0);
            const totalOutstanding = calculateAgentOutstandingBalance(commissionEarned, reimbursementsOwed, paymentsMade);

            return (
              <li key={a.id} className="space-y-2 py-2.5 text-xs">
                <div className="font-medium text-foreground">{a.agentName}</div>

                {/* Balance breakdown — every figure is read from
                    AgentCommissionService/ExpenseService, never
                    recomputed independently. */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-muted/30 p-2 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Commission Earned</span><span className="font-medium text-foreground">{money(commissionEarned)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Reimbursements Owed</span><span className="font-medium text-foreground">{money(reimbursementsOwed)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Payments Made</span><span className="font-medium text-foreground">{money(paymentsMade)}</span></div>
                  <div className="flex justify-between border-t border-border/60 pt-1 col-span-2">
                    <span className="font-semibold text-foreground">Total Outstanding</span>
                    <span className={`font-semibold ${totalOutstanding > 0 ? "text-warning-foreground" : "text-foreground"}`}>{money(totalOutstanding)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="number" min="0" step="any" placeholder="Commission payment"
                    value={commissionAmounts[a.id] || ""}
                    onChange={(e) => setCommissionAmounts({ ...commissionAmounts, [a.id]: parseFloat(e.target.value) || 0 })}
                    className="h-7 flex-1 min-w-[120px] rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                  <button
                    type="button"
                    disabled={!commissionAmounts[a.id]}
                    onClick={async () => {
                      await recordCommissionPayment(a.agentId, a.id, commissionAmounts[a.id] ?? 0);
                      onChanged?.();
                      setCommissionAmounts({ ...commissionAmounts, [a.id]: 0 });
                    }}
                    className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Pay Comm.
                  </button>
                </div>

                {owedExpenses.length > 0 && (
                  <div className="space-y-1.5 rounded-md bg-muted/40 p-2">
                    {/* Clearly labeled reimbursement entries, each with
                        the expense's own date/category so it's obvious
                        WHY money is owed — not just an amount. */}
                    <ul className="space-y-1">
                      {owedExpenses.map((exp) => (
                        <li key={exp.id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Receipt className="size-3" />
                            <span className="font-medium text-foreground">Expense Reimbursement</span>
                            — {exp.category} · {exp.expenseDate}
                          </span>
                          <span className="font-medium text-foreground">{money(exp.amount)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={reimbursementExpense[a.agentId] ?? ""}
                        onChange={(e) => setReimbursementExpense({ ...reimbursementExpense, [a.agentId]: e.target.value })}
                        className="h-7 min-w-[120px] flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        <option value="">Select expense…</option>
                        {owedExpenses.map((exp) => (
                          <option key={exp.id} value={exp.id}>{exp.category} · {exp.expenseDate} — {money(exp.amount)}</option>
                        ))}
                      </select>
                      <input
                        type="number" min="0" step="any" placeholder="Amount"
                        value={reimbursementAmount[a.agentId] || ""}
                        onChange={(e) => setReimbursementAmount({ ...reimbursementAmount, [a.agentId]: parseFloat(e.target.value) || 0 })}
                        className="h-7 w-24 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      />
                      <button
                        type="button"
                        disabled={!reimbursementExpense[a.agentId] || !reimbursementAmount[a.agentId]}
                        onClick={async () => {
                          await recordReimbursementPayment(a.agentId, reimbursementAmount[a.agentId] ?? 0, reimbursementExpense[a.agentId]);
                          onChanged?.();
                          setReimbursementAmount({ ...reimbursementAmount, [a.agentId]: 0 });
                          setReimbursementExpense({ ...reimbursementExpense, [a.agentId]: "" });
                        }}
                        className="inline-flex h-7 items-center rounded-md border border-input px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        Reimburse
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Wrapper>
  );
});
