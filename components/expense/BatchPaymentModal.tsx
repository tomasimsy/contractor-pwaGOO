"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { addEntry } from "@/lib/queries/expenses";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { formatCurrency } from "@/lib/utils/formatting";
import type { PendingPayout } from "@/lib/types";

export default function BatchPaymentModal({
  payouts,
  estimateId,
  isOpen,
  onClose,
  onRefresh,
  onSuccess,
}: {
  payouts: PendingPayout[];
  estimateId: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSuccess: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>(
    Object.fromEntries(payouts.map((p) => [p.assignmentId, p.remainingAmount]))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalAmount = Object.values(amounts).reduce((sum, a) => sum + a, 0);

  const handleAmountChange = (assignmentId: string, value: string) => {
    const num = parseFloat(value) || 0;
    setAmounts((prev) => ({ ...prev, [assignmentId]: Math.max(0, num) }));
  };

  const handleSubmit = async () => {
    if (totalAmount <= 0) {
      toast.error("Please enter at least one payment amount");
      return;
    }

    setIsSubmitting(true);
    try {
      const companyId = await getCompanyId();
      let successCount = 0;
      const errors: string[] = [];

      for (const payout of payouts) {
        const amount = amounts[payout.assignmentId];
        if (amount <= 0) continue;

        try {
          if (payout.role === "subcontractor") {
            await addEntry({
              kind: "subcontractor_payment",
              estimateId,
              companyId,
              estimateSubcontractorId: payout.assignmentId,
              amount,
              paymentDate: new Date().toISOString(),
              paymentMethod: null,
              notes: null,
              changeOrderId: null,
            });
          } else {
            await addEntry({
              kind: "agent_payment",
              estimateId,
              companyId,
              agentId: payout.personId,
              estimateAgentId: payout.assignmentId,
              amount,
              paymentDate: new Date().toISOString(),
              paymentMethod: null,
              notes: null,
              changeOrderId: null,
            });
          }
          successCount++;
        } catch (err: any) {
          errors.push(`${payout.name}: ${err?.message || "Payment failed"}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Recorded ${successCount} payment${successCount !== 1 ? "s" : ""}`);
        await onRefresh();
        onSuccess();
      }

      if (errors.length > 0) {
        errors.forEach((err) => toast.error(err));
      }
    } catch (err: any) {
      toast.error(err?.message || "Couldn't process payments");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Confirm Batch Payment</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <div className="space-y-3">
            {payouts.map((payout) => (
              <div key={payout.assignmentId} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-gray-900">{payout.name}</div>
                    <div className="text-[12px] text-gray-500">
                      Owed: {formatCurrency(payout.remainingAmount)} of {formatCurrency(payout.assignedAmount)}
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amounts[payout.assignmentId] || ""}
                    onChange={(e) => handleAmountChange(payout.assignmentId, e.target.value.replace(/[^0-9.]/g, ""))}
                    disabled={isSubmitting}
                    className="w-full h-10 pl-6 pr-3 rounded-lg border border-gray-200 text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:opacity-50"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-700">Total Payment</span>
              <span className="text-lg font-semibold text-gray-900">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || totalAmount <= 0}
            className="flex-1 h-10 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Processing…" : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
