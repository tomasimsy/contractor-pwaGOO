"use client";

import { useState, useMemo } from "react";
import { CheckSquare, Square, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import DashboardPanel, { EmptyState } from "./desktop/DashboardPanel";
import BatchPaymentModal from "./BatchPaymentModal";
import type { PendingPayout } from "@/lib/types";

export default function PaymentActionCenter({
  payouts,
  estimateId,
  onRefresh,
}: {
  payouts: PendingPayout[];
  estimateId: string;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [modalTarget, setModalTarget] = useState<PendingPayout[] | null>(null);

  const pendingOnly = payouts.filter((p) => p.remainingAmount > 0.004);

  const selectedPayouts = useMemo(
    () => pendingOnly.filter((p) => selected.has(p.assignmentId)),
    [pendingOnly, selected]
  );

  const selectedTotal = selectedPayouts.reduce((sum, p) => sum + p.remainingAmount, 0);
  const totalOwed = pendingOnly.reduce((sum, p) => sum + p.remainingAmount, 0);

  function toggleSelect(assignmentId: string) {
    const next = new Set(selected);
    if (next.has(assignmentId)) {
      next.delete(assignmentId);
    } else {
      next.add(assignmentId);
    }
    setSelected(next);
  }

  function handleQuickPay(payout: PendingPayout) {
    setModalTarget([payout]);
  }

  function handleBatchPay() {
    if (selectedPayouts.length === 0) return;
    setModalTarget(selectedPayouts);
  }

  if (pendingOnly.length === 0) {
    return (
      <DashboardPanel title="Who Needs to Be Paid" accent="emerald">
        <EmptyState message="All payables are caught up. Great work!" />
      </DashboardPanel>
    );
  }

  return (
    <>
      <DashboardPanel
        title="Who Needs to Be Paid"
        accent="emerald"
        action={
          isMultiSelectMode ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-gray-600">
                {selected.size} / {pendingOnly.length} selected
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsMultiSelectMode(false);
                  setSelected(new Set());
                }}
                className="text-[12px] text-gray-500 hover:text-gray-700"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsMultiSelectMode(true)}
              className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-700"
            >
              <Plus size={12} /> Multi-select
            </button>
          )
        }
      >
        {/* Mobile: Card layout */}
        <div className="space-y-3 md:hidden">
          {pendingOnly.map((payout) => (
            <PayoutCard
              key={payout.assignmentId}
              payout={payout}
              isSelected={selected.has(payout.assignmentId)}
              isMultiSelectMode={isMultiSelectMode}
              onToggleSelect={() => toggleSelect(payout.assignmentId)}
              onQuickPay={() => handleQuickPay(payout)}
            />
          ))}

          {isMultiSelectMode && selected.size > 0 && (
            <div className="border-t border-gray-200 pt-3 mt-4">
              <button
                type="button"
                onClick={handleBatchPay}
                className="w-full h-10 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors"
              >
                Pay {selected.size} Selected ({formatCurrency(selectedTotal)})
              </button>
            </div>
          )}
        </div>

        {/* Tablet/Desktop: Table layout */}
        <div className="hidden md:block">
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {isMultiSelectMode && <th className="w-10 px-4 py-3"></th>}
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Role</th>
                  <th className="px-4 py-3 text-right text-[12px] font-semibold text-gray-600">Owed</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-gray-600">Project</th>
                  <th className="px-4 py-3 text-center text-[12px] font-semibold text-gray-600">Status</th>
                  <th className="w-20 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pendingOnly.map((payout) => (
                  <tr key={payout.assignmentId} className="border-b border-gray-100 hover:bg-gray-50">
                    {isMultiSelectMode && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSelect(payout.assignmentId)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {selected.has(payout.assignmentId) ? (
                            <CheckSquare size={18} />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3 text-[13px] font-medium text-gray-900">{payout.name}</td>
                    <td className="px-4 py-3 text-[12px] text-gray-600">
                      {payout.roleDetail || (payout.role === "subcontractor" ? "Subcontractor" : "Agent")}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold text-gray-900">
                      {formatCurrency(payout.remainingAmount)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-600">(Project)</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-[11px] font-medium uppercase px-2 py-1 rounded ${
                          payout.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : payout.status === "partial"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {payout.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isMultiSelectMode && (
                        <button
                          type="button"
                          onClick={() => handleQuickPay(payout)}
                          className="text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1 transition-colors"
                        >
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isMultiSelectMode && selected.size > 0 && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="text-[13px] text-gray-600">
                {selected.size} of {pendingOnly.length} selected · Total: <span className="font-semibold">{formatCurrency(selectedTotal)}</span>
              </div>
              <button
                type="button"
                onClick={handleBatchPay}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors"
              >
                Pay Selected
              </button>
            </div>
          )}
        </div>
      </DashboardPanel>

      {/* Payment Modal */}
      {modalTarget && (
        <BatchPaymentModal
          payouts={modalTarget}
          estimateId={estimateId}
          isOpen={!!modalTarget}
          onClose={() => setModalTarget(null)}
          onRefresh={onRefresh}
          onSuccess={() => {
            setSelected(new Set());
            setIsMultiSelectMode(false);
            setModalTarget(null);
          }}
        />
      )}
    </>
  );
}

function PayoutCard({
  payout,
  isSelected,
  isMultiSelectMode,
  onToggleSelect,
  onQuickPay,
}: {
  payout: PendingPayout;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onToggleSelect: () => void;
  onQuickPay: () => void;
}) {
  const statusColor =
    payout.status === "pending"
      ? "bg-amber-50 text-amber-700"
      : payout.status === "partial"
        ? "bg-blue-50 text-blue-700"
        : "bg-emerald-50 text-emerald-700";

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-start gap-3">
        {isMultiSelectMode && (
          <button
            type="button"
            onClick={onToggleSelect}
            className="mt-0.5 text-gray-400 hover:text-gray-600"
          >
            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-900">{payout.name}</span>
            <span className={`text-[11px] font-medium uppercase px-1.5 py-0.5 rounded ${statusColor}`}>
              {payout.status}
            </span>
          </div>
          <div className="text-[12px] text-gray-600 mt-1">
            {payout.roleDetail || (payout.role === "subcontractor" ? "Subcontractor" : "Agent")}
          </div>
          <div className="text-[13px] font-semibold text-gray-900 mt-2">
            Owed: {formatCurrency(payout.remainingAmount)}
          </div>
          <div className="text-[12px] text-gray-500 mt-0.5">
            Assigned: {formatCurrency(payout.assignedAmount)}
          </div>
        </div>

        {!isMultiSelectMode && (
          <button
            type="button"
            onClick={onQuickPay}
            className="shrink-0 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded px-3 py-2 transition-colors"
          >
            Pay
          </button>
        )}
      </div>
    </div>
  );
}
