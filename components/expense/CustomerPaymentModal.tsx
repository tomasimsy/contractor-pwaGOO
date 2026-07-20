"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { recordCustomerPayment } from "@/lib/queries/customerPayments";
import { formatCurrency } from "@/lib/utils/formatting";
import type { ProjectBundle } from "@/lib/types";

export default function CustomerPaymentModal({
  isOpen,
  onClose,
  bundle,
  onPaymentRecorded,
}: {
  isOpen: boolean;
  onClose: () => void;
  bundle: ProjectBundle;
  onPaymentRecorded?: () => void;
}) {
  const invoices = bundle.invoices || [];

  // Calculate revised total for each invoice (includes approved change orders)
  const getRevisedTotal = (invoiceId: string) => {
    const approvedChangeOrdersTotal = (bundle.changeOrders || [])
      .filter(co => co.status === 'approved')
      .reduce((sum, co) => sum + (co.total_amount || 0), 0);
    return approvedChangeOrdersTotal;
  };

  // Auto-select invoice if only one exists, otherwise empty
  const defaultInvoiceId = invoices.length === 1 ? invoices[0].id : "";
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(defaultInvoiceId);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-fill amount when invoice is selected
  useEffect(() => {
    if (selectedInvoiceId) {
      const invoice = invoices.find((inv) => inv.id === selectedInvoiceId);
      if (invoice) {
        setAmount(invoice.remaining_balance.toString());
      }
    }
  }, [selectedInvoiceId, invoices]);

  if (!isOpen) return null;

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId);
  const selectedInvoiceRevisedTotal = selectedInvoice ? selectedInvoice.total + getRevisedTotal(selectedInvoice.id) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedInvoiceId || !amount) {
      toast.error("Please select an invoice and enter an amount");
      return;
    }

    if (selectedInvoice && parseFloat(amount) > selectedInvoiceRevisedTotal) {
      toast.error(`Amount cannot exceed invoice total of ${formatCurrency(selectedInvoiceRevisedTotal)}`);
      return;
    }

    setIsSubmitting(true);
    try {
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
        invoiceId: selectedInvoiceId,
        companyId: profile.company_id,
        amount: parseFloat(amount),
        paymentMethod,
        paymentDate,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });

      toast.success(
        `Payment of ${formatCurrency(parseFloat(amount))} recorded for invoice #${selectedInvoice?.invoice_number}`
      );
      handleClose();
      onPaymentRecorded?.();
    } catch (err: any) {
      console.error("Failed to record payment:", err);
      if (err.message?.includes("payment_date") || err.message?.includes("reference_number")) {
        toast.error("Database migration required. Please see CUSTOMER_PAYMENTS_SETUP.md for instructions.", {
          duration: 5000,
        });
      } else {
        toast.error(err.message || "Failed to record payment");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setSelectedInvoiceId(defaultInvoiceId);
    setAmount("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("bank_transfer");
    setReferenceNumber("");
    setNotes("");
    onClose();
  }

  const paymentMethods = [
    { value: "bank_transfer", label: "Bank Transfer" },
    { value: "check", label: "Check" },
    { value: "credit_card", label: "Credit Card" },
    { value: "cash", label: "Cash" },
    { value: "zelle", label: "Zelle" },
    { value: "wire", label: "Wire Transfer" },
    { value: "ach", label: "ACH" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">💰 Receive Payment</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Project Context Summary */}
          <div className="bg-blue-50 rounded-lg p-3.5 space-y-2 border border-blue-200">
            <div className="text-xs font-medium text-blue-900 uppercase tracking-wide">Project Context</div>

            <div className="text-[13px]">
              <div className="text-gray-600">Project:</div>
              <div className="font-medium text-gray-900">{bundle.project.title}</div>
            </div>

            <div className="text-[13px]">
              <div className="text-gray-600">Client:</div>
              <div className="font-medium text-gray-900">{bundle.client.name}</div>
            </div>

            {selectedInvoice && (
              <>
                <div className="pt-2 border-t border-blue-200 space-y-1.5">
                  <div className="text-[13px] font-medium text-gray-900">
                    Invoice #{selectedInvoice.invoice_number}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div>
                      <div className="text-gray-600">Total:</div>
                      <div className="font-medium text-gray-900">{formatCurrency(selectedInvoiceRevisedTotal)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Received:</div>
                      <div className="font-medium text-emerald-600">{formatCurrency(selectedInvoice.amount_paid)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Remaining:</div>
                      <div className="font-medium text-amber-600">{formatCurrency(selectedInvoice.remaining_balance)}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Invoice Selection - Only show if multiple invoices */}
          {invoices.length > 1 && (
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-2">Invoice *</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select an invoice...</option>
                {invoices.map((invoice) => {
                  const revisedTotal = invoice.total + getRevisedTotal(invoice.id);
                  return (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoice_number} • {formatCurrency(revisedTotal)} (Balance:{" "}
                      {formatCurrency(invoice.remaining_balance)})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">Reference Number</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g., Check #, Transaction ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this payment..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !selectedInvoiceId || !amount}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Recording..." : "Record Payment"}
          </button>
        </form>
      </div>
    </div>
  );
}
