import { formatCurrency } from "@/lib/utils/formatting";
import type { ProjectBundle } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";
import { EmptyState } from "./SubcontractorsPanel";

export default function AgentsPanel({ bundle }: { bundle: ProjectBundle }) {
  const agentNameById = new Map(bundle.salesAgents.map((a) => [a.id, a.name]));
  const totalsByAgent = new Map<string, number>();
  for (const payment of bundle.agentPayments) {
    if (!payment.agent_id) continue;
    totalsByAgent.set(payment.agent_id, (totalsByAgent.get(payment.agent_id) ?? 0) + payment.amount);
  }
  const rows = Array.from(totalsByAgent.entries()).map(([agentId, total]) => ({
    agentId,
    name: agentNameById.get(agentId) ?? "Unknown agent",
    total,
    paymentCount: bundle.agentPayments.filter((p) => p.agent_id === agentId).length,
  }));

  return (
    <DashboardPanel title="Agents">
      {rows.length === 0 ? (
        <EmptyState message="No agent commissions logged on this project yet." />
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.agentId} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-800">{row.name}</div>
                <div className="text-xs text-slate-400">
                  {row.paymentCount} payment{row.paymentCount === 1 ? "" : "s"}
                </div>
              </div>
              <span className="shrink-0 text-sm font-mono font-bold text-slate-800">{formatCurrency(row.total)}</span>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
