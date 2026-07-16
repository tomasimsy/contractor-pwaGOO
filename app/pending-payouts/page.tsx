"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowUpRight } from "lucide-react";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { addEntry, getCompanyPendingPayoutsDetailed, type DetailedPendingPayout } from "@/lib/queries/expenses";
import { formatCurrency } from "@/lib/utils/formatting";
import PayoutModal from "@/components/expense/PayoutModal";
import type { PendingPayout } from "@/lib/types";
import DesktopShell from "@/components/layout/DesktopShell";

const STATUS_STYLE: Record<PendingPayout["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  partial: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
};

// Company-wide payment action queue: every subcontractor/agent still
// owed money, grouped by the project it belongs to, so "who do I need
// to pay and for what" is answerable at a glance instead of hunting
// through each project's own Expense page one at a time. Reuses the
// exact same addEntry()/getCompanyPendingPayoutsDetailed() source of
// truth as the Expense page and the Dashboard alert, so a payment
// logged here is immediately reflected everywhere else — no separate
// payment system.
export default function PendingPayoutsPage() {
  const [payouts, setPayouts] = useState<DetailedPendingPayout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<DetailedPendingPayout | null>(null);

  const load = useCallback(async () => {
    try {
      const companyId = await getCompanyId();
      const data = await getCompanyPendingPayoutsDetailed(companyId);
      setPayouts(data);
    } catch (err: any) {
      setError(err?.message || "Couldn't load pending payouts.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (!payouts) return [];
    const byEstimate = new Map<string, DetailedPendingPayout[]>();
    for (const p of payouts) {
      const list = byEstimate.get(p.estimateId) ?? [];
      list.push(p);
      byEstimate.set(p.estimateId, list);
    }
    return Array.from(byEstimate.values())
      .map((list) => ({
        list,
        totalRemaining: list.reduce((sum, p) => sum + p.remainingAmount, 0),
      }))
      .sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [payouts]);

  const grandTotal = payouts?.reduce((sum, p) => sum + p.remainingAmount, 0) ?? 0;

  async function handleConfirmPay(amount: number) {
    if (!payTarget) return;
    try {
      if (payTarget.role === "subcontractor") {
        await addEntry({
          kind: "subcontractor_payment",
          estimateId: payTarget.estimateId,
          companyId: await getCompanyId(),
          estimateSubcontractorId: payTarget.assignmentId,
          amount,
          paymentDate: new Date().toISOString(),
          paymentMethod: null,
          notes: null,
          changeOrderId: null,
        });
      } else {
        await addEntry({
          kind: "agent_payment",
          estimateId: payTarget.estimateId,
          companyId: await getCompanyId(),
          agentId: payTarget.personId,
          estimateAgentId: payTarget.assignmentId,
          amount,
          paymentDate: new Date().toISOString(),
          paymentMethod: null,
          notes: null,
          changeOrderId: null,
        });
      }
      toast.success(`Paid ${payTarget.name} ${formatCurrency(amount)}`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Couldn't record payment.");
      throw err;
    }
  }

  return (
    <DesktopShell>
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-28 lg:pb-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">Pending Payouts</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Every subcontractor and agent still owed money, grouped by project.
            </p>
          </div>
          {payouts && payouts.length > 0 && (
            <div className="text-right shrink-0">
              <div className="text-[13px] text-gray-400">Total owed</div>
              <div className="text-xl font-semibold tracking-tight text-gray-900">{formatCurrency(grandTotal)}</div>
            </div>
          )}
        </div>

        {error && <div className="text-[13px] text-rose-600 bg-rose-50 rounded-lg p-3.5 mb-6">{error}</div>}

        {!payouts && !error && (
          <div className="text-[13px] text-gray-400 text-center py-24">Loading pending payouts…</div>
        )}

        {payouts && payouts.length === 0 && (
          <div className="text-center py-24">
            <div className="text-[13px] text-gray-500">All caught up</div>
            <div className="text-[13px] text-gray-400 mt-1">No subcontractors or agents are currently owed money.</div>
          </div>
        )}

        <div className="space-y-5">
          {groups.map(({ list, totalRemaining }) => {
            const first = list[0];
            return (
              <div key={first.estimateId} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-800 truncate">{first.projectTitle}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {first.estimateNumber && <span>#{first.estimateNumber}</span>}
                      {first.estimateNumber && first.clientName && <span> · </span>}
                      {first.clientName && <span>{first.clientName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-[13px] font-semibold text-gray-900 tabular-nums">{formatCurrency(totalRemaining)}</div>
                    <Link
                      href={`/expense?project=${first.estimateId}`}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
                    >
                      View <ArrowUpRight size={12} />
                    </Link>
                  </div>
                </div>

                <div className="divide-y divide-gray-100 px-4 sm:px-5">
                  {list.map((payout) => (
                    <div key={`${payout.role}-${payout.assignmentId}`} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] text-gray-900">{payout.name}</span>
                          <span className="text-xs text-gray-400">
                            {payout.role === "agent" ? "Agent" : payout.roleDetail || "Subcontractor"}
                          </span>
                          <span className={`text-[11px] font-medium uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[payout.status]}`}>
                            {payout.status === "paid" ? "Paid" : payout.status === "partial" ? "Partial" : "Pending"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
                          <span>Owed {formatCurrency(payout.assignedAmount)}</span>
                          <span>Paid {formatCurrency(payout.paidAmount)}</span>
                          <span className="font-medium text-amber-600">{formatCurrency(payout.remainingAmount)} remaining</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPayTarget(payout)}
                        className="shrink-0 text-[13px] font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Pay
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PayoutModal
        isOpen={!!payTarget}
        onClose={() => setPayTarget(null)}
        payout={payTarget}
        projectLabel={payTarget?.projectTitle ?? "This project"}
        onConfirm={handleConfirmPay}
      />
    </div>
    </DesktopShell>
  );
}
