"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import { deleteEntry } from "@/lib/queries/expenses";
import { Trash2, RotateCcw } from "lucide-react";
import type { LedgerEntry } from "@/lib/types";

interface PaymentHistoryPanelProps {
  entries: LedgerEntry[];
  onEntryDeleted?: () => void;
}

export default function PaymentHistoryPanel({
  entries,
  onEntryDeleted,
}: PaymentHistoryPanelProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filter to only payment entries (subcontractor and agent payments)
  const paymentEntries = entries.filter(
    (e) => e.source === "subcontractor_payment" || e.source === "agent_payment"
  );

  // All entries shown are active (deleted entries are handled in the archived section of the page)
  const activePayments = paymentEntries;

  async function handleDeletePayment(entry: LedgerEntry) {
    if (!window.confirm(`Delete ${entry.payeeLabel} payment of ${formatCurrency(entry.amount)}?`)) {
      return;
    }

    setDeletingId(entry.id);
    try {
      await deleteEntry(entry);
      toast.success("Payment deleted");
      onEntryDeleted?.();
    } catch (err: any) {
      console.error("Failed to delete payment:", err);
      toast.error(err.message || "Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  }

  if (paymentEntries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[13px] text-gray-500">No vendor or agent payments recorded yet</p>
      </div>
    );
  }

  const getPaymentTypeLabel = (entry: LedgerEntry): string => {
    if (entry.source === "subcontractor_payment") return "Subcontractor Payment";
    if (entry.source === "agent_payment") return "Agent Payment";
    return "Payment";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left px-3 py-2 font-medium text-gray-700">Date</th>
            <th className="text-left px-3 py-2 font-medium text-gray-700">Payee</th>
            <th className="text-left px-3 py-2 font-medium text-gray-700">Type</th>
            <th className="text-right px-3 py-2 font-medium text-gray-700">Amount</th>
            <th className="text-left px-3 py-2 font-medium text-gray-700">Notes</th>
            <th className="text-center px-3 py-2 font-medium text-gray-700">Action</th>
          </tr>
        </thead>
        <tbody>
          {activePayments.map((payment) => (
            <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-900">
                {payment.date ? formatDate(payment.date) : "-"}
              </td>
              <td className="px-3 py-2 text-gray-900 font-medium">
                {payment.payeeLabel}
              </td>
              <td className="px-3 py-2 text-gray-600">
                <span className="inline-block px-2 py-1 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  {getPaymentTypeLabel(payment)}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-medium text-gray-900">
                {formatCurrency(payment.amount)}
              </td>
              <td className="px-3 py-2 text-gray-600">
                <span className="truncate max-w-xs block" title={payment.notes || ""}>
                  {payment.notes || "-"}
                </span>
              </td>
              <td className="px-3 py-2 text-center">
                <button
                  onClick={() => handleDeletePayment(payment)}
                  disabled={deletingId === payment.id}
                  className="inline-flex items-center gap-1 px-2 py-1 text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete payment"
                >
                  <Trash2 size={14} />
                  <span className="text-[11px]">Delete</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
