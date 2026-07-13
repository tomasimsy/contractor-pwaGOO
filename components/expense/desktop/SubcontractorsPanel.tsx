import { formatCurrency } from "@/lib/utils/formatting";
import type { LedgerEntry, ProjectBundle } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";
import ExpenseLedger from "@/components/expense/ExpenseLedger";

export default function SubcontractorsPanel({
  bundle,
  ledger,
  onDelete,
}: {
  bundle: ProjectBundle;
  ledger: LedgerEntry[];
  onDelete: (entry: LedgerEntry) => void;
}) {
  // Ledger entries don't carry estimate_subcontractor_id (they're a
  // display-shaped projection), so payments are matched back to their
  // subcontractor by id through the raw bundle rows instead of
  // re-deriving payeeLabel/category display logic a second time here.
  const subIdByPaymentId = new Map(
    bundle.subcontractorPayments.map((p) => [p.id, p.estimate_subcontractor_id])
  );

  const rows = bundle.assignedSubcontractors.map((sub) => {
    const payments = ledger.filter(
      (e) => e.source === "subcontractor_payment" && subIdByPaymentId.get(e.id) === sub.estimateSubcontractorId
    );
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    return { ...sub, paid, remaining: sub.contractedAmount - paid, payments };
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

export function EmptyState({ message }: { message: string }) {
  return <div className="text-xs text-slate-400 text-center py-6">{message}</div>;
}
