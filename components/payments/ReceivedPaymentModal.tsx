"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { recordCustomerPayment } from "@/lib/queries/customerPayments";

interface ReceivedPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  invoiceTotal: number;
  remainingBalance: number;
  onPaymentRecorded?: () => void;
}

export default function ReceivedPaymentModal({
  isOpen,
  onClose,
  invoiceId,
  invoiceNumber,
  clientName,
  invoiceTotal,
  remainingBalance,
  onPaymentRecorded,
}: ReceivedPaymentModalProps) {
  const [amount, setAmount] = useState(remainingBalance);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (amount > invoiceTotal) {
      toast.error(`Amount cannot exceed invoice total of $${invoiceTotal.toFixed(2)}`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Get company ID from auth
      const { data: { user } } = await (await import("@/lib/supabase/client")).supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      const { data: profile } = await (await import("@/lib/supabase/client")).supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) {
        toast.error("Company not found");
        return;
      }

      await recordCustomerPayment({
        invoiceId,
        companyId: profile.company_id,
        amount: parseFloat(amount.toString()),
        paymentMethod,
        paymentDate,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });

      toast.success(`Payment of $${amount.toFixed(2)} recorded for invoice #${invoiceNumber}`);
      handleClose();
      onPaymentRecorded?.();
    } catch (err: any) {
      console.error("Failed to record payment:", err);

      // Check if error is due to missing migration
      if (err.message?.includes("payment_date") || err.message?.includes("reference_number")) {
        toast.error(
          "Database migration required. Please see CUSTOMER_PAYMENTS_SETUP.md for instructions.",
          { duration: 5000 }
        );
      } else {
        toast.error(err.message || "Failed to record payment");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setAmount(remainingBalance);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("bank_transfer");
    setReferenceNumber("");
    setNotes("");
    onClose();
  }

  const overpaymentAmount = amount > invoiceTotal ? amount - invoiceTotal : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Receive Payment</h2>
            <p className="text-xs text-gray-500 mt-1">Invoice #{invoiceNumber} • {clientName}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Invoice Summary */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-gray-600">Invoice Total:</span>
              <span className="font-medium text-gray-900">${invoiceTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining Balance:</span>
              <span className="font-medium text-amber-600">${remainingBalance.toFixed(2)}</span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">
              Payment Amount *
            </label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setAmount(remainingBalance)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[12px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
              >
                Full ({remainingBalance.toFixed(2)})
              </button>
              <button
                type="button"
                onClick={() => setAmount(remainingBalance / 2)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[12px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setAmount(remainingBalance * 0.25)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[12px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
              >
                25%
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              max={invoiceTotal}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {overpaymentAmount > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ Overpayment of ${overpaymentAmount.toFixed(2)}
              </p>
            )}
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">
              Payment Date *
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">
              Payment Method *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="bank_transfer">Bank Transfer / ACH</option>
              <option value="check">Check</option>
              <option value="credit_card">Credit Card</option>
              <option value="cash">Cash</option>
              <option value="zelle">Zelle</option>
              <option value="wire">Wire Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">
              Reference / Check #
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Check #, transaction ID, reference code, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this payment..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Recording..." : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
