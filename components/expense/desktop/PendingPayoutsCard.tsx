"use client";

import DashboardPanel, { EmptyState } from "./DashboardPanel";
import PayoutRow from "./PayoutRow";
import PayoutModal from "@/components/expense/PayoutModal";
import type { LedgerEntry, ProjectBundle } from "@/lib/types";
import { usePayoutActions } from "./usePayoutActions";

// Compact "who still needs to be paid" view across both subcontractors
// and agents — the quick-scan summary; full assign/edit/remove/history
// controls live on the role-specific cards below it.
export default function PendingPayoutsCard({
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
  const pending = actions.payouts.filter((p) => p.remainingAmount > 0.004);

  return (
    <DashboardPanel title="Pending Payouts" accent="amber">
      {pending.length === 0 ? (
        <EmptyState message="Everyone assigned to this project has been paid in full." />
      ) : (
        <div className="divide-y divide-gray-100">
          {pending.map((payout) => (
            <PayoutRow key={payout.assignmentId} payout={payout} actions={actions} onDelete={onDelete} compact />
          ))}
        </div>
      )}

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
