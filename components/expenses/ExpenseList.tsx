"use client";

/**
 * Edit/Delete for existing expenses. Reimbursement status (owed vs.
 * paid) is intentionally NOT rendered here — that's the payables view
 * (see components/agents/AgentPayablesTable.tsx), sourced from
 * FinancialEngine/TransactionService.getReimbursementBalance, not
 * re-derived from the raw expense list.
 *
 * Deleting a financial record always prompts for a reason — this
 * component enforces that at the UI level (won't even call the
 * service without one) as the first of the three layers described in
 * RELIABILITY.md; ValidationService.validateDeleteReason enforces it
 * again at the service level regardless of what this form does.
 */
import { useState } from "react";
import { useExpenses } from "../../lib/hooks/useExpenses";
import { LoadingState, ErrorState } from "../shared/AsyncStates";

export function ExpenseList({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { expenses, loading, error, update, remove, restore } = useExpenses(companyId, projectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  if (loading) return <LoadingState label="Loading expenses..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <ul className="divide-y max-w-xl">
      {expenses.map((e) => (
        <li key={e.id} className="flex items-center justify-between py-2 text-sm">
          {editingId === e.id ? (
            <>
              <input type="number" value={editAmount} onChange={(ev) => setEditAmount(Number(ev.target.value))} />
              <button
                type="button"
                onClick={async () => {
                  await update(e.id, { amount: editAmount });
                  setEditingId(null);
                }}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <span>
                {e.category} — ${e.amount.toFixed(2)} — {e.vendor ?? "no vendor"}
                {e.paidByAgentId && " (paid by agent)"}
                {e.deletedAt && ` (deleted: ${e.deleteReason ?? "no reason recorded"})`}
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {!e.deletedAt && (
                  <button type="button" onClick={() => { setEditingId(e.id); setEditAmount(e.amount); }}>Edit</button>
                )}
                {e.deletedAt ? (
                  <button type="button" onClick={() => restore(e.id)}>Restore</button>
                ) : deletingId === e.id ? (
                  <>
                    <input placeholder="Reason for deletion (required)" value={deleteReason} onChange={(ev) => setDeleteReason(ev.target.value)} />
                    <button
                      type="button"
                      className="text-red-600"
                      disabled={!deleteReason.trim()}
                      onClick={async () => {
                        await remove(e.id, deleteReason);
                        setDeletingId(null);
                        setDeleteReason("");
                      }}
                    >
                      Confirm delete
                    </button>
                  </>
                ) : (
                  <button type="button" className="text-red-600" onClick={() => setDeletingId(e.id)}>Delete</button>
                )}
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
