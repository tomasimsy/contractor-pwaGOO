import { Pencil, Trash2, FileText } from "lucide-react";
import ExpenseLedger from "@/components/expense/ExpenseLedger";
import { formatCurrency } from "@/lib/utils/formatting";
import type { LedgerEntry, PendingPayout } from "@/lib/types";
import type { PayoutActions } from "./usePayoutActions";

// Consistent financial-status palette used across the whole page:
// pending (not started) = amber, partial = blue, paid/settled = green.
const STATUS_STYLE: Record<PendingPayout["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  partial: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
};

// One assignment row — shared by the Subcontractor Assignments, Agent
// Commission, and Pending Payouts cards so "assign / edit / remove / pay
// / invoice / view history" behaves identically everywhere it appears.
export default function PayoutRow({
  payout,
  actions,
  onDelete,
  compact = false,
}: {
  payout: PendingPayout;
  actions: PayoutActions;
  onDelete: (entry: LedgerEntry) => void;
  /** Pending Payouts card uses a tighter row with no history expander. */
  compact?: boolean;
}) {
  const isEditing = actions.editingId === payout.assignmentId;
  const payments = actions.paymentsFor(payout);
  const isExpanded = actions.expandedId === payout.assignmentId;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] text-gray-900">{payout.name}</span>
            <span className="text-xs text-gray-400">
              {payout.role === "agent" ? "Agent" : payout.roleDetail || "Subcontractor"}
            </span>
            <span className={`text-[11px] font-medium uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[payout.status]}`}>
              {payout.status === "paid" ? "Paid" : payout.status === "partial" ? "Partial" : "Pending"}
            </span>
          </div>

          {!isEditing ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
              <span>Assigned {formatCurrency(payout.assignedAmount)}</span>
              <span>Paid {formatCurrency(payout.paidAmount)}</span>
              <span className={`font-medium ${payout.remainingAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {payout.remainingAmount > 0 ? `${formatCurrency(payout.remainingAmount)} remaining` : "Settled"}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={actions.editAmount}
                  onChange={(e) => actions.setEditAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-24 h-8 pl-5 pr-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              <input
                type="text"
                value={actions.editNotes}
                onChange={(e) => actions.setEditNotes(e.target.value)}
                placeholder="Notes"
                className="flex-1 min-w-[8rem] h-8 px-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              />
              <button
                type="button"
                onClick={() => actions.saveEdit(payout)}
                className="h-8 px-2.5 rounded-lg bg-gray-900 text-white text-xs font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={actions.cancelEdit}
                className="h-8 px-2.5 rounded-lg text-xs font-medium text-gray-500"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-3 shrink-0">
            {payout.remainingAmount > 0 && (
              <button
                type="button"
                onClick={() => actions.setPayoutModalTarget(payout)}
                className="text-[13px] font-medium text-white bg-emerald-600 rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition-colors"
              >
                Pay
              </button>
            )}
            {payout.role === "subcontractor" && payout.paidAmount > 0 && (
              <button
                type="button"
                onClick={() => actions.openInvoice(payout)}
                className="flex items-center gap-1 text-[13px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <FileText size={13} /> Invoice
              </button>
            )}
            {!compact && (
              <>
                <button
                  type="button"
                  onClick={() => actions.startEdit(payout)}
                  className="text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Edit payout"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => actions.handleRemove(payout)}
                  className="text-gray-300 hover:text-rose-600 transition-colors"
                  aria-label="Remove assignment"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!compact && payments.length > 0 && (
        <button
          type="button"
          onClick={() => actions.setExpandedId(isExpanded ? null : payout.assignmentId)}
          className="text-xs text-gray-400 hover:text-gray-600 mt-1.5"
        >
          {isExpanded ? "Hide" : "View"} payment history ({payments.length})
        </button>
      )}
      {!compact && isExpanded && payments.length > 0 && (
        <div className="mt-2">
          <ExpenseLedger entries={payments} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}
