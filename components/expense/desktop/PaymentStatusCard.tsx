import { formatCurrency } from "@/lib/utils/formatting";
import type { PaymentSummary } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

const STATUS_CONFIG = {
  not_paid: { label: "Not Paid", text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", bar: "bg-rose-500" },
  partial: { label: "Partial Payment", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", bar: "bg-amber-500" },
  fully_paid: { label: "Fully Paid", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", bar: "bg-emerald-500" },
} as const;

export default function PaymentStatusCard({ payment }: { payment: PaymentSummary }) {
  const cfg = STATUS_CONFIG[payment.status];

  return (
    <DashboardPanel title="Client Payment Status">
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
      >
        {cfg.label}
      </span>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Contract</div>
          <div className="text-xs sm:text-sm font-black text-slate-800 truncate">{formatCurrency(payment.totalContractAmount)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Received</div>
          <div className="text-xs sm:text-sm font-black text-slate-800 truncate">{formatCurrency(payment.amountReceived)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Remaining</div>
          <div className="text-xs sm:text-sm font-black text-slate-800 truncate">{formatCurrency(payment.remainingBalance)}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full ${cfg.bar}`} style={{ width: `${payment.paymentPercentage}%` }} />
        </div>
        <div className="text-[11px] text-slate-400 mt-1">{payment.paymentPercentage.toFixed(0)}% received</div>
      </div>

      <div className="text-[11px] text-slate-300 mt-3 leading-relaxed">
        Summed across all invoices on this estimate.
      </div>
    </DashboardPanel>
  );
}
