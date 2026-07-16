import { FileText, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import type { EstimateExpenseRow } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";
import { EmptyState } from "./DashboardPanel";

export default function ReceiptsPanel({ expenses }: { expenses: EstimateExpenseRow[] }) {
  const withReceipts = expenses.filter((e) => e.receipt_url || e.receipt_file_name);

  return (
    <DashboardPanel title="Receipts & Documents" accent="gray">
      {withReceipts.length === 0 ? (
        <EmptyState message="No receipts attached yet." />
      ) : (
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto -mx-1 px-1">
          {withReceipts.map((expense) => (
            <a
              key={expense.id}
              href={expense.receipt_url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-2.5 py-2 transition-colors ${
                expense.receipt_url ? "hover:text-gray-900 cursor-pointer" : "cursor-default"
              }`}
            >
              <FileText size={14} className="text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-gray-700 truncate">
                  {expense.receipt_file_name || expense.vendor || "Receipt"}
                </div>
              </div>
              <span className="text-[13px] tabular-nums text-gray-400 shrink-0">{formatCurrency(expense.amount)}</span>
              {expense.receipt_url && <ExternalLink size={12} className="text-gray-300 shrink-0" />}
            </a>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
