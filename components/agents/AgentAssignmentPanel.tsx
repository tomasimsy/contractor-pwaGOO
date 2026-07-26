"use client";

/**
 * Commission assignment + commission payments + reimbursement payments
 * for agents on one project. The commission-vs-reimbursement UI split
 * exists because they need different inputs (a reimbursement must pick
 * which expense it settles), not because this component treats them as
 * different financial concepts — that distinction lives entirely in
 * AgentCommissionService/the ledger.
 */
import { useState } from "react";
import { useAgentAssignments } from "../../lib/hooks/useAgentAssignments";
import { LoadingState, ErrorState } from "../shared/AsyncStates";

export function AgentAssignmentPanel({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { roster, assignments, balances, pendingReimbursements, loading, error, assign, recordCommissionPayment, recordReimbursementPayment, refresh } =
    useAgentAssignments(companyId, projectId);
  const [agentId, setAgentId] = useState("");
  const [assignedAmount, setAssignedAmount] = useState(0);
  const [commissionAmounts, setCommissionAmounts] = useState<Record<string, number>>({});
  const [reimbursementAmount, setReimbursementAmount] = useState<Record<string, number>>({});
  const [reimbursementExpense, setReimbursementExpense] = useState<Record<string, string>>({});

  if (loading) return <LoadingState label="Loading agents..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4 max-w-xl">
      <section className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Select agent...</option>
          {roster.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input type="number" placeholder="Assigned commission" value={assignedAmount} onChange={(e) => setAssignedAmount(Number(e.target.value))} />
        <button
          type="button"
          disabled={!agentId || assignedAmount <= 0}
          onClick={async () => {
            await assign(agentId, assignedAmount);
            setAgentId("");
            setAssignedAmount(0);
          }}
        >
          Assign
        </button>
      </section>

      <ul className="divide-y">
        {assignments.map((a) => {
          const balance = balances[a.id];
          const owedExpenses = pendingReimbursements[a.agentId] ?? [];
          return (
            <li key={a.id} className="py-3 text-sm space-y-2">
              <div className="font-medium">{a.agentName}</div>
              {balance && (
                <div className="text-gray-600">
                  Commission: ${balance.assigned.toFixed(2)} assigned / ${balance.paid.toFixed(2)} paid / ${balance.outstanding.toFixed(2)} owed
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="number"
                  placeholder="Commission payment"
                  value={commissionAmounts[a.id] ?? 0}
                  onChange={(e) => setCommissionAmounts({ ...commissionAmounts, [a.id]: Number(e.target.value) })}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await recordCommissionPayment(a.agentId, a.id, commissionAmounts[a.id] ?? 0);
                    setCommissionAmounts({ ...commissionAmounts, [a.id]: 0 });
                  }}
                >
                  Pay commission
                </button>
              </div>

              {owedExpenses.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={reimbursementExpense[a.agentId] ?? ""}
                    onChange={(e) => setReimbursementExpense({ ...reimbursementExpense, [a.agentId]: e.target.value })}
                  >
                    <option value="">Reimburse which expense?</option>
                    {owedExpenses.map((exp) => (
                      <option key={exp.id} value={exp.id}>{exp.category} — ${exp.amount.toFixed(2)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Reimbursement amount"
                    value={reimbursementAmount[a.agentId] ?? 0}
                    onChange={(e) => setReimbursementAmount({ ...reimbursementAmount, [a.agentId]: Number(e.target.value) })}
                  />
                  <button
                    type="button"
                    disabled={!reimbursementExpense[a.agentId]}
                    onClick={async () => {
                      await recordReimbursementPayment(a.agentId, reimbursementAmount[a.agentId] ?? 0, reimbursementExpense[a.agentId]);
                      setReimbursementAmount({ ...reimbursementAmount, [a.agentId]: 0 });
                      setReimbursementExpense({ ...reimbursementExpense, [a.agentId]: "" });
                    }}
                  >
                    Pay reimbursement
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
