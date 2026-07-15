"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/utils/formatting";
import type { PendingPayout } from "@/lib/types";

// One-click pay confirmation — the whole point of the payout workflow
// is that this is the ONLY step required to log a subcontractor/agent
// payment: no separate "add expense" form, no picking a category, no
// re-entering who it's for. Defaults to the full remaining balance so
// the common case (pay them off) is a single click.
export default function PayoutModal({
  isOpen,
  onClose,
  payout,
  projectLabel,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  payout: PendingPayout | null;
  projectLabel: string;
  onConfirm: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (isOpen && payout) setAmount(payout.remainingAmount.toFixed(2));
  }, [isOpen, payout]);

  if (!payout) return null;

  const parsedAmount = Number(amount);
  // Never allow overpayment — clamped client-side against what's
  // actually still owed on this assignment.
  const isValid = parsedAmount > 0 && parsedAmount <= payout.remainingAmount + 0.004;

  async function handlePay() {
    if (!isValid || paying || !payout) return;
    setPaying(true);
    try {
      await onConfirm(Math.min(parsedAmount, payout.remainingAmount));
      onClose();
    } finally {
      setPaying(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Pay ${payout.name}`}>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 space-y-1.5 text-sm">
          <Row label="Role" value={payout.role === "agent" ? "Agent" : payout.roleDetail || "Subcontractor"} />
          <Row label="Project" value={projectLabel} />
          <Row label="Assigned" value={formatCurrency(payout.assignedAmount)} />
          <Row label="Already Paid" value={formatCurrency(payout.paidAmount)} />
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 font-bold">
            <span className="text-slate-700">Remaining Balance</span>
            <span className="text-slate-900">{formatCurrency(payout.remainingAmount)}</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Amount to Pay</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full h-11 pl-7 pr-3 rounded-xl border border-slate-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-slate-300 transition-colors text-sm font-semibold text-slate-800"
            />
          </div>
          {parsedAmount > payout.remainingAmount + 0.004 && (
            <div className="text-xs text-rose-600 mt-1">Can't pay more than the remaining balance.</div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200/70 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || paying}
            onClick={handlePay}
            className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-30"
          >
            {paying ? "Paying…" : "Pay"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
