"use client";

import { Plus } from "lucide-react";
import DashboardPanel, { EmptyState } from "./DashboardPanel";
import PayoutRow from "./PayoutRow";
import AssignPayeeModal from "@/components/expense/AssignPayeeModal";
import PayoutModal from "@/components/expense/PayoutModal";
import type { LedgerEntry, ProjectBundle } from "@/lib/types";
import { usePayoutActions } from "./usePayoutActions";

export default function SubcontractorAssignmentsCard({
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
  const subs = actions.payouts.filter((p) => p.role === "subcontractor");

  return (
    <DashboardPanel
      title="Subcontractor Assignments"
      accent="blue"
      action={
        <button
          type="button"
          onClick={() => actions.setAssignOpen(true)}
          className="flex items-center gap-1.5 text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} /> Assign
        </button>
      }
    >
      {subs.length === 0 ? (
        <EmptyState message="No subcontractors assigned to this project yet." />
      ) : (
        <div className="divide-y divide-gray-100">
          {subs.map((payout) => (
            <PayoutRow key={payout.assignmentId} payout={payout} actions={actions} onDelete={onDelete} />
          ))}
        </div>
      )}

      <AssignPayeeModal
        isOpen={actions.assignOpen}
        onClose={() => actions.setAssignOpen(false)}
        bundle={bundle}
        onAssignSubcontractor={actions.handleAssignSubcontractor}
        onAssignAgent={actions.handleAssignAgent}
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
