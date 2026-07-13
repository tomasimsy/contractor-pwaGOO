import { formatCurrency } from "@/lib/utils/formatting";
import type { ProjectBundle } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

export default function SubcontractorsPanel({ bundle }: { bundle: ProjectBundle }) {
  const rows = bundle.assignedSubcontractors.map((sub) => {
    const paid = bundle.subcontractorPayments
      .filter((p) => p.estimate_subcontractor_id === sub.estimateSubcontractorId)
      .reduce((sum, p) => sum + p.amount, 0);
    return { ...sub, paid, remaining: sub.contractedAmount - paid };
  });

  return (
    <DashboardPanel title="Subcontractors">
      {rows.length === 0 ? (
        <EmptyState message="No subcontractors assigned to this project yet." />
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.estimateSubcontractorId} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-slate-800">{row.name}</span>
                {row.trade && <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">{row.trade}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                <span>Contracted {formatCurrency(row.contractedAmount)}</span>
                <span>Paid {formatCurrency(row.paid)}</span>
                <span className={row.remaining > 0 ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"}>
                  {row.remaining > 0 ? `${formatCurrency(row.remaining)} left` : "Settled"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="text-xs text-slate-400 text-center py-6">{message}</div>;
}
