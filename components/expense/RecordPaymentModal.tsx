"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { X } from "lucide-react";
import type { ProjectBundle } from "@/lib/types";

type PayeeType = "subcontractor" | "agent" | "";

export default function RecordPaymentModal({
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
  const [payeeType, setPayeeType] = useState<PayeeType>("");
  const [selectedPayeeId, setSelectedPayeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const subcontractors = bundle.assignedSubcontractors || [];
  const agents = bundle.assignedAgents || [];

  const getPayeeLabel = () => {
    if (payeeType === "subcontractor") {
      const sub = subcontractors.find((s) => s.estimateSubcontractorId === selectedPayeeId);
      return sub?.name || "";
    }
    if (payeeType === "agent") {
      const agent = agents.find((a) => a.estimateAgentId === selectedPayeeId);
      return agent?.name || "";
    }
    return "";
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!payeeType || !selectedPayeeId || !amount) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) {
        toast.error("Company not found");
        return;
      }

      const companyId = profile.company_id;

      if (payeeType === "subcontractor") {
        const { error } = await supabase.from("subcontractor_payments").insert({
          estimate_subcontractor_id: selectedPayeeId,
          estimate_id: bundle.project.id,
          company_id: companyId,
          amount: parseFloat(amount),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          notes: notes || null,
        });

        if (error) throw error;
        toast.success(`Payment recorded for ${getPayeeLabel()}`);
      } else if (payeeType === "agent") {
        const selectedAgent = agents.find((a) => a.estimateAgentId === selectedPayeeId);
        if (!selectedAgent) {
          toast.error("Agent not found");
          return;
        }

        const { error } = await supabase.from("agent_payments").insert({
          estimate_id: bundle.project.id,
          agent_id: selectedAgent.agentId,
          estimate_agent_id: selectedPayeeId,
          company_id: companyId,
          amount: parseFloat(amount),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          notes: notes || null,
          payment_type: "commission",
        });

        if (error) throw error;
        toast.success(`Payment recorded for ${getPayeeLabel()}`);
      }

      onPaymentRecorded?.();
      handleClose();
    } catch (err: any) {
      console.error("Failed to record payment:", err);
      toast.error(err.message || "Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setPayeeType("");
    setSelectedPayeeId("");
    setAmount("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("bank_transfer");
    setNotes("");
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Payee Type Selection */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">
              Paying
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayeeType("subcontractor");
                  setSelectedPayeeId("");
                }}
                className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  payeeType === "subcontractor"
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Subcontractor
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayeeType("agent");
                  setSelectedPayeeId("");
                }}
                className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  payeeType === "agent"
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Agent
              </button>
            </div>
          </div>

          {/* Payee Selection */}
          {payeeType && (
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-2">
                {payeeType === "subcontractor" ? "Subcontractor" : "Agent"} *
              </label>
              <select
                value={selectedPayeeId}
                onChange={(e) => setSelectedPayeeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select...</option>
                {payeeType === "subcontractor" &&
                  subcontractors.map((sub) => (
                    <option key={sub.estimateSubcontractorId} value={sub.estimateSubcontractorId}>
                      {sub.name}
                    </option>
                  ))}
                {payeeType === "agent" &&
                  agents.map((agent) => (
                    <option key={agent.estimateAgentId} value={agent.estimateAgentId}>
                      {agent.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
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
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
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
              rows={3}
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
              {isSubmitting ? "Saving..." : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
