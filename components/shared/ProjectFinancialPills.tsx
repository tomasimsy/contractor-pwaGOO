"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { ProjectFinancialSummary } from "@/lib/queries/expenses";

// Compact at-a-glance financial strip for an Estimates/Invoices list
// row — every number comes from the single batched
// getCompanyProjectFinancialSummaries() call the parent page already
// made, so this component is pure presentation, no queries of its own.
// "--" (instead of $0.00) whenever the underlying category has no rows
// yet, so "nothing recorded" reads differently from "genuinely zero."
export default function ProjectFinancialPills({
  estimateId,
  summary,
}: {
  estimateId: string;
  summary: ProjectFinancialSummary | undefined;
}) {
  const s = summary;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Pill label="Revenue" value={s ? formatCurrency(s.revenue) : "--"} />
      <Pill label="Expenses" value={s?.hasCostData ? formatCurrency(s.expenses) : "--"} />
      <Pill
        label="Profit"
        value={s?.hasCostData ? formatCurrency(s.profit) : "--"}
        tone={
          !s?.hasCostData
            ? "neutral"
            : s.profit < 0
            ? "red"
            : s.profit > 0
            ? "green"
            : "neutral"
        }
      />
      {/* Paid Out is a payment-status figure only — read straight from
          subcontractor_payments/agent_payments, never derived from
          revenue/expenses/profit above. */}
      <Pill label="Paid Out" value={s?.hasPayouts ? formatCurrency(s.paidOut) : "--"} />
      <Pill
        label="Remaining"
        value={s?.hasAssignments ? formatCurrency(s.remainingPayouts) : "--"}
        tone={s?.hasAssignments && s.remainingPayouts > 0 ? "amber" : "neutral"}
      />
      {s?.hasCostData && (
        <Pill
          label="Margin"
          value={`${s.marginPercent.toFixed(0)}%`}
          tone={s.marginPercent < 0 ? "red" : s.marginPercent > 0 ? "green" : "neutral"}
        />
      )}

      <Link
        href={`/expense?project=${estimateId}`}
        className="ml-auto flex items-center gap-1 h-6 px-2 rounded-md border border-gray-200 bg-white text-[10px] font-medium text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors"
      >
        <Receipt size={11} /> Expenses
      </Link>
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-gray-50 text-gray-600 border-gray-200/70",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  red: "bg-rose-50 text-rose-700 border-rose-200/70",
  amber: "bg-amber-50 text-amber-700 border-amber-200/70",
};

function Pill({ label, value, tone = "neutral" }: { label: string; value: string; tone?: keyof typeof TONE_CLASSES }) {
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-medium ${TONE_CLASSES[tone]}`}>
      <span className="opacity-70 uppercase tracking-wide">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
