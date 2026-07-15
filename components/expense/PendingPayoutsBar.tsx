"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { PendingPayout, ProjectBundle } from "@/lib/types";
import { addEntry } from "@/lib/queries/expenses";
import PayoutModal from "./PayoutModal";
import toast from "react-hot-toast";

// The "highly visible pending payout notification" — a sticky queue of
// everyone still owed money on the currently open project, so paying
// them out is a couple of taps away instead of hunting through the
// Payouts tab. Only rendered once the client has started paying (or the
// project is complete), same condition the caller already computes.
export default function PendingPayoutsBar({
  bundle,
  payouts,
  onRefresh,
}: {
  bundle: ProjectBundle;
  payouts: PendingPayout[];
  onRefresh: () => Promise<void>;
}) {
  const [target, setTarget] = useState<PendingPayout | null>(null);

  if (payouts.length === 0) return null;

  const companyId = bundle.project.company_id;
  const projectLabel = bundle.project.title || bundle.project.estimate_number || "This project";

  async function handlePay(amount: number) {
    if (!target) return;
    try {
      if (target.role === "subcontractor") {
        await addEntry({
          kind: "subcontractor_payment",
          estimateId: bundle.project.id,
          companyId,
          estimateSubcontractorId: target.assignmentId,
          amount,
          paymentDate: new Date().toISOString(),
          paymentMethod: null,
          notes: null,
          changeOrderId: null,
        });
      } else {
        await addEntry({
          kind: "agent_payment",
          estimateId: bundle.project.id,
          companyId,
          agentId: target.personId,
          estimateAgentId: target.assignmentId,
          amount,
          paymentDate: new Date().toISOString(),
          paymentMethod: null,
          notes: null,
          changeOrderId: null,
        });
      }
      toast.success(`Paid ${target.name} ${formatCurrency(amount)}`);
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't record payment.");
      throw err;
    }
  }

  return (
    <>
      <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-amber-200/70 bg-amber-50/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="shrink-0 text-xs font-medium text-amber-700 pr-1">Pending payouts</span>
            {payouts.map((p) => (
              <button
                key={`${p.role}-${p.assignmentId}`}
                type="button"
                onClick={() => setTarget(p)}
                className="shrink-0 flex items-center gap-1.5 rounded-full bg-white border border-amber-300 text-amber-900 text-[13px] pl-3 pr-2.5 py-1.5 hover:bg-amber-100 transition-colors"
              >
                Pay {p.name}
                <span className="font-semibold">{formatCurrency(p.remainingAmount)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <PayoutModal
        isOpen={!!target}
        onClose={() => setTarget(null)}
        payout={target}
        projectLabel={projectLabel}
        onConfirm={handlePay}
      />
    </>
  );
}
