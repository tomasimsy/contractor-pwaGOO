"use client";

import { useState, useMemo } from "react";
import { CheckSquare, Square, Plus } from "lucide-react";
import DashboardPanel, { EmptyState } from "./desktop/DashboardPanel";
import BatchPaymentModal from "./BatchPaymentModal";
import { formatCurrency } from "@/lib/utils/formatting";
import type { PendingPayout } from "@/lib/types";

const STATUS_STYLE: Record<PendingPayout["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  partial: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
};

export default function QuickPaymentCard({
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
  const subcontractors = pendingOnly.filter((p) => p.role === "subcontractor");
  const agents = pendingOnly.filter((p) => p.role === "agent");

  const selectedPayouts = useMemo(
    () => pendingOnly.filter((p) => selected.has(p.assignmentId)),
    [pendingOnly, selected]
  );

  const selectedTotal = selectedPayouts.reduce((sum, p) => sum + p.remainingAmount, 0);

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
      <DashboardPanel title="Quick Payments" accent="emerald">
        <EmptyState message="All assignments are paid up. Great work!" />
      </DashboardPanel>
    );
  }

  return (
    <>
      <DashboardPanel
        title="Quick Payments"
        accent="emerald"
        action={
          isMultiSelectMode ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-gray-600">
                {selected.size} selected · {formatCurrency(selectedTotal)}
              </span>
              <button
                type="button"
                onClick={() => setIsMultiSelectMode(false)}
                className="text-[13px] text-gray-500 hover:text-gray-700"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsMultiSelectMode(true)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700"
            >
              <Plus size={13} /> Multi-select
            </button>
          )
        }
      >
        <div className="space-y-3">
          {subcontractors.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Subcontractors
              </div>
              <div className="divide-y divide-gray-100 space-y-0">
                {subcontractors.map((payout) => (
                  <PayoutRow
                    key={payout.assignmentId}
                    payout={payout}
                    isSelected={selected.has(payout.assignmentId)}
                    isMultiSelectMode={isMultiSelectMode}
                    onToggleSelect={() => toggleSelect(payout.assignmentId)}
                    onQuickPay={() => handleQuickPay(payout)}
                  />
                ))}
              </div>
            </div>
          )}

          {agents.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Agents
              </div>
              <div className="divide-y divide-gray-100 space-y-0">
                {agents.map((payout) => (
                  <PayoutRow
                    key={payout.assignmentId}
                    payout={payout}
                    isSelected={selected.has(payout.assignmentId)}
                    isMultiSelectMode={isMultiSelectMode}
                    onToggleSelect={() => toggleSelect(payout.assignmentId)}
                    onQuickPay={() => handleQuickPay(payout)}
                  />
                ))}
              </div>
            </div>
          )}

          {isMultiSelectMode && selected.size > 0 && (
            <button
              type="button"
              onClick={handleBatchPay}
              className="w-full h-10 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors mt-4"
            >
              Pay {selected.size} Selected ({formatCurrency(selectedTotal)})
            </button>
          )}
        </div>
      </DashboardPanel>

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

function PayoutRow({
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
  return (
    <div className="py-2.5 flex items-start justify-between gap-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {isMultiSelectMode && (
          <button
            type="button"
            onClick={onToggleSelect}
            className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-medium text-gray-900">{payout.name}</span>
            <span className="text-[11px] text-gray-500">{payout.roleDetail || payout.role}</span>
            <span className={`text-[11px] font-medium uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[payout.status]}`}>
              {payout.status}
            </span>
          </div>
          <div className="text-[12px] text-gray-500 mt-0.5">
            Owed {formatCurrency(payout.remainingAmount)} of {formatCurrency(payout.assignedAmount)}
          </div>
        </div>
      </div>

      {!isMultiSelectMode && (
        <button
          type="button"
          onClick={onQuickPay}
          className="shrink-0 text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          Pay
        </button>
      )}
    </div>
  );
}
