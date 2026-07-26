"use client";

/**
 * Assignment + cost tracking + payments for subcontractors on one
 * project. Every "assigned/paid/outstanding" figure shown is
 * `balances[assignment.id]`, populated by
 * SubcontractorService.getBalance — never a running total kept in this
 * component's own state.
 */
import { useState } from "react";
import { useSubcontractorAssignments } from "../../lib/hooks/useSubcontractorAssignments";
import { LoadingState, ErrorState } from "../shared/AsyncStates";

export function SubcontractorAssignmentPanel({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { roster, assignments, balances, loading, error, assign, recordPayment, markFinal, refresh } = useSubcontractorAssignments(companyId, projectId);
  const [subcontractorId, setSubcontractorId] = useState("");
  const [contractedAmount, setContractedAmount] = useState(0);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>({});

  if (loading) return <LoadingState label="Loading subcontractors..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4 max-w-xl">
      <section className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select value={subcontractorId} onChange={(e) => setSubcontractorId(e.target.value)}>
          <option value="">Select subcontractor...</option>
          {roster.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.trade})</option>
          ))}
        </select>
        <input type="number" placeholder="Contracted amount" value={contractedAmount} onChange={(e) => setContractedAmount(Number(e.target.value))} />
        <button
          type="button"
          disabled={!subcontractorId || contractedAmount <= 0}
          onClick={async () => {
            await assign(subcontractorId, contractedAmount);
            setSubcontractorId("");
            setContractedAmount(0);
          }}
        >
          Assign
        </button>
      </section>

      <ul className="divide-y">
        {assignments.map((a) => {
          const balance = balances[a.id];
          return (
            <li key={a.id} className="py-3 text-sm space-y-1">
              <div className="font-medium">{a.subcontractorName} ({a.trade})</div>
              {balance && (
                <div className="text-gray-600">
                  Assigned ${balance.assigned.toFixed(2)} — Paid ${balance.paid.toFixed(2)} — Outstanding ${balance.outstanding.toFixed(2)}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="number"
                  placeholder="Payment amount"
                  value={paymentAmounts[a.id] ?? 0}
                  onChange={(e) => setPaymentAmounts({ ...paymentAmounts, [a.id]: Number(e.target.value) })}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await recordPayment(a.id, paymentAmounts[a.id] ?? 0, new Date().toISOString().slice(0, 10));
                    setPaymentAmounts({ ...paymentAmounts, [a.id]: 0 });
                  }}
                >
                  Record payment
                </button>
                {!a.isFinal && (
                  <button type="button" onClick={() => markFinal(a.id)}>Mark final</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
