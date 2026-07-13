import { FileText, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { EstimateExpenseRow } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";
import { EmptyState } from "./SubcontractorsPanel";

export default function ReceiptsPanel({ expenses }: { expenses: EstimateExpenseRow[] }) {
  const withReceipts = expenses.filter((e) => e.receipt_url || e.receipt_file_name);

  return (
    <DashboardPanel title="Receipts & Documents">
      {withReceipts.length === 0 ? (
        <EmptyState message="No receipts attached yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {withReceipts.map((expense) => (
            <a
              key={expense.id}
              href={expense.receipt_url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 ${
                expense.receipt_url ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"
              }`}
            >
              <FileText size={15} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-700 truncate">
                  {expense.receipt_file_name || expense.vendor || "Receipt"}
                </div>
                <div className="text-[10px] text-slate-400">{formatCurrency(expense.amount)}</div>
              </div>
              {expense.receipt_url && <ExternalLink size={12} className="text-slate-300 shrink-0" />}
            </a>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
