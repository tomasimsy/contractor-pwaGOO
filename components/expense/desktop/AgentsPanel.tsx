import { formatCurrency } from "@/lib/utils/formatting";
import type { LedgerEntry, ProjectBundle } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";
import { EmptyState } from "./SubcontractorsPanel";
import ExpenseLedger from "@/components/expense/ExpenseLedger";

export default function AgentsPanel({
  bundle,
  ledger,
  onDelete,
}: {
  bundle: ProjectBundle;
  ledger: LedgerEntry[];
  onDelete: (entry: LedgerEntry) => void;
}) {
  const agentNameById = new Map(bundle.salesAgents.map((a) => [a.id, a.name]));
  const agentIdByPaymentId = new Map(bundle.agentPayments.map((p) => [p.id, p.agent_id]));

  const totalsByAgent = new Map<string, number>();
  for (const payment of bundle.agentPayments) {
    if (!payment.agent_id) continue;
    totalsByAgent.set(payment.agent_id, (totalsByAgent.get(payment.agent_id) ?? 0) + payment.amount);
  }
  const rows = Array.from(totalsByAgent.entries()).map(([agentId, total]) => ({
    agentId,
    name: agentNameById.get(agentId) ?? "Unknown agent",
    total,
    payments: ledger.filter((e) => e.source === "agent_payment" && agentIdByPaymentId.get(e.id) === agentId),
  }));

  return (
    <DashboardPanel title="Agents">
      {rows.length === 0 ? (
        <EmptyState message="No agent commissions logged on this project yet." />
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.agentId} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-800">{row.name}</div>
                  <div className="text-xs text-slate-400">
                    {row.payments.length} payment{row.payments.length === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-mono font-bold text-slate-800">{formatCurrency(row.total)}</span>
              </div>
              {row.payments.length > 0 && (
                <div className="mt-2">
                  <ExpenseLedger entries={row.payments} onDelete={onDelete} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
