"use client";

import { useState } from "react";
import { Plus, ChevronDown, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase/client";
import DashboardPanel, { EmptyState } from "./DashboardPanel";
import PayoutRow from "./PayoutRow";
import AssignPayeeModal from "@/components/expense/AssignPayeeModal";
import PayoutModal from "@/components/expense/PayoutModal";
import { formatCurrency } from "@/lib/utils/formatting";
import type { LedgerEntry, ProjectBundle } from "@/lib/types";
import { usePayoutActions } from "./usePayoutActions";

export default function AgentCommissionCard({
  bundle,
  ledger,
  onDelete,
  onRefresh,
}: {
  bundle: ProjectBundle;
  ledger: LedgerEntry[];
  onDelete: (entry: LedgerEntry) => void;
  onRefresh: () => Promise<void>;
}) {
  const actions = usePayoutActions(bundle, ledger, onDelete, onRefresh);
  const agents = actions.payouts.filter((p) => p.role === "agent");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Group expenses by agent
  const expensesByAgent = new Map<string, typeof bundle.expenses>();
  for (const expense of bundle.expenses) {
    if (expense.paid_by_agent_id && !expense.deleted_at) {
      if (!expensesByAgent.has(expense.paid_by_agent_id)) {
        expensesByAgent.set(expense.paid_by_agent_id, []);
      }
      expensesByAgent.get(expense.paid_by_agent_id)!.push(expense);
    }
  }

  return (
    <DashboardPanel
      title="Agent Payables"
      accent="blue"
      action={
        <button
          type="button"
          onClick={() => actions.setAssignOpen(true)}
          className="flex items-center gap-1.5 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} /> Assign
        </button>
      }
    >
      {agents.length === 0 ? (
        <EmptyState message="No agents with pending payables on this project yet." />
      ) : (
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto -mx-1 px-1">
          {agents.map((payout) => {
            const agentExpenses = expensesByAgent.get(payout.personId) ?? [];
            const isExpanded = expandedAgent === payout.assignmentId;

            return (
              <div key={payout.assignmentId} className="py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-900">{payout.name}</span>
                      {agentExpenses.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedAgent(isExpanded ? null : payout.assignmentId)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <ChevronDown size={16} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                    <div className="text-[12px] text-gray-500 mt-1 space-y-0.5">
                      {payout.commissionAmount !== undefined && payout.commissionAmount > 0 && (
                        <div>Commission: {formatCurrency(payout.commissionAmount)}</div>
                      )}
                      {payout.reimbursementAmount !== undefined && payout.reimbursementAmount > 0 && (
                        <div>Expenses Paid: {formatCurrency(payout.reimbursementAmount)}</div>
                      )}
                      <div className="font-medium text-gray-900 mt-1">
                        Total Owed: {formatCurrency(payout.remainingAmount)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => actions.setPayoutModalTarget(payout)}
                    className="shrink-0 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 transition-colors ml-3"
                  >
                    Pay
                  </button>
                </div>

                {isExpanded && (agentExpenses.length > 0 || bundle.agentPayments.some(p => p.agent_id === payout.personId && !p.deleted_at)) && (
                  <div className="mt-3 ml-2 pl-3 border-l-2 border-gray-200 space-y-3">
                    {/* Expenses Paid by Agent */}
                    {agentExpenses.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-gray-600 uppercase">Expenses Paid by Agent</div>
                        {agentExpenses.map((expense) => (
                          <div key={expense.id} className="text-[12px] text-gray-700 space-y-0.5">
                            <div className="flex justify-between gap-2">
                              <span className="capitalize">{expense.category}</span>
                              <span className="font-medium">{formatCurrency(expense.amount + (expense.tax ?? 0))}</span>
                            </div>
                            {expense.expense_date && (
                              <div className="text-[11px] text-gray-500">{new Date(expense.expense_date).toLocaleDateString()}</div>
                            )}
                            {expense.vendor && <div className="text-[11px] text-gray-500">{expense.vendor}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Payment History */}
                    {bundle.agentPayments.filter(p => p.agent_id === payout.personId && p.estimate_id === bundle.project.id && !p.deleted_at).length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-gray-600 uppercase">Payment History</div>
                        <div className="space-y-1">
                          {bundle.agentPayments
                            .filter(p => p.agent_id === payout.personId && p.estimate_id === bundle.project.id && !p.deleted_at)
                            .sort((a, b) => new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime())
                            .map((payment) => (
                              <div key={payment.id} className="flex items-center justify-between text-[12px] text-gray-700 bg-gray-50 rounded px-2 py-1.5">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{formatCurrency(payment.amount)}</span>
                                    {payment.payment_method && (
                                      <span className="text-[10px] text-gray-500 capitalize">{payment.payment_method}</span>
                                    )}
                                  </div>
                                  {payment.payment_date && (
                                    <div className="text-[11px] text-gray-500">{new Date(payment.payment_date).toLocaleDateString()}</div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm("Delete this payment?")) return;
                                    try {
                                      const { error } = await supabase.from("agent_payments").update({ deleted_at: new Date().toISOString() }).eq("id", payment.id);
                                      if (error) throw error;
                                      toast.success("Payment deleted");
                                      await onRefresh();
                                    } catch (err) {
                                      toast.error("Failed to delete payment");
                                    }
                                  }}
                                  className="shrink-0 text-gray-400 hover:text-red-600 transition-colors ml-2 p-1"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AssignPayeeModal
        isOpen={actions.assignOpen}
        onClose={() => actions.setAssignOpen(false)}
        bundle={bundle}
        onAssignSubcontractor={actions.handleAssignSubcontractor}
        onAssignAgent={actions.handleAssignAgent}
        defaultRole="agent"
      />

      <PayoutModal
        isOpen={!!actions.payoutModalTarget}
        onClose={() => actions.setPayoutModalTarget(null)}
        payout={actions.payoutModalTarget}
        projectLabel={actions.projectLabel}
        onConfirm={actions.handlePay}
      />
    </DashboardPanel>
  );
}
