"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import { deleteCustomerPayment, restoreCustomerPayment } from "@/lib/queries/customerPayments";
import { Trash2, RotateCcw } from "lucide-react";
import type { CustomerPayment } from "@/lib/queries/customerPayments";

interface PaymentHistoryTableProps {
  payments: CustomerPayment[];
  onPaymentDeleted?: () => void;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  check: "Check",
  credit_card: "Credit Card",
  cash: "Cash",
  zelle: "Zelle",
  wire: "Wire Transfer",
  ach: "ACH",
  other: "Other",
};

export default function PaymentHistoryTable({
  payments,
  onPaymentDeleted,
}: PaymentHistoryTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleDeletePayment(payment: CustomerPayment) {
    if (!window.confirm(`Delete payment of ${formatCurrency(payment.amount)}?`)) {
      return;
    }

    setDeletingId(payment.id);
    try {
      await deleteCustomerPayment(payment.id);
      toast.success("Payment deleted");
      onPaymentDeleted?.();
    } catch (err: any) {
      console.error("Failed to delete payment:", err);
      toast.error(err.message || "Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRestorePayment(payment: CustomerPayment) {
    setRestoringId(payment.id);
    try {
      await restoreCustomerPayment(payment.id);
      toast.success("Payment restored");
      onPaymentDeleted?.();
    } catch (err: any) {
      console.error("Failed to restore payment:", err);
      toast.error(err.message || "Failed to restore payment");
    } finally {
      setRestoringId(null);
    }
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[13px] text-gray-500">No payments recorded yet</p>
      </div>
    );
  }

  const activePayments = payments.filter((p) => !p.deleted_at);
  const deletedPayments = payments.filter((p) => p.deleted_at);

  return (
    <div className="space-y-4">
      {/* Active Payments */}
      {activePayments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-700">Date</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Method</th>
                <th className="text-right px-3 py-2 font-medium text-gray-700">Amount</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Reference</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700">Notes</th>
                <th className="text-center px-3 py-2 font-medium text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {activePayments.map((payment) => (
                <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900">
                    {formatDate(payment.payment_date)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {payment.reference_number || "-"}
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
                      className="inline-flex items-center gap-1 px-2 py-1 text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50"
                      title="Delete payment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deleted Payments (if any) */}
      {deletedPayments.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-[12px] font-semibold text-gray-500 uppercase mb-2">Deleted Payments</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {deletedPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100 bg-gray-50 hover:bg-gray-100">
                    <td className="px-3 py-2 text-gray-500 line-through">
                      {formatDate(payment.payment_date)}
                    </td>
                    <td className="px-3 py-2 text-gray-500 line-through">
                      {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 line-through">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-3 py-2 text-gray-500" colSpan={2}>
                      {payment.reference_number || "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleRestorePayment(payment)}
                        disabled={restoringId === payment.id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50"
                        title="Restore payment"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
