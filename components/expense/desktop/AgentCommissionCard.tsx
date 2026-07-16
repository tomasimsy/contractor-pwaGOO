"use client";

import { Plus } from "lucide-react";
import DashboardPanel, { EmptyState } from "./DashboardPanel";
import PayoutRow from "./PayoutRow";
import AssignPayeeModal from "@/components/expense/AssignPayeeModal";
import PayoutModal from "@/components/expense/PayoutModal";
import type { LedgerEntry, ProjectBundle } from "@/lib/types";
import { usePayoutActions } from "./usePayoutActions";

export default function AgentCommissionCard({
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
  const agents = actions.payouts.filter((p) => p.role === "agent");

  return (
    <DashboardPanel
      title="Agent Commissions"
      accent="blue"
      action={
        <button
          type="button"
          onClick={() => actions.setAssignOpen(true)}
          className="flex items-center gap-1.5 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} /> Assign
        </button>
      }
    >
      {agents.length === 0 ? (
        <EmptyState message="No agents assigned to this project yet." />
      ) : (
        <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto -mx-1 px-1">
          {agents.map((payout) => (
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
        defaultRole="agent"
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
