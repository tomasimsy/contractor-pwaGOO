"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/formatting";
import type { SubcontractorDetail } from "@/lib/queries/subcontractors";

type Tab = "summary" | "projects" | "payments";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  partial: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
};

// Expandable per-subcontractor detail — every project they're assigned
// to (estimate_subcontractors) and every payment logged against them
// (subcontractor_payments), the same tables/matching the Expense page's
// SubcontractorAssignmentsCard already uses, plus a combined-totals
// Summary tab. Loaded on demand when the row is expanded.
export default function SubcontractorDetailPanel({
  detail,
  loading,
}: {
  detail: SubcontractorDetail | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<Tab>("summary");

  if (loading) {
    return <div className="text-[13px] text-gray-400 text-center py-6">Loading payout history…</div>;
  }
  if (!detail) return null;

  const { assignments, payments, totals } = detail;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "summary", label: "Summary" },
    { key: "projects", label: "Projects", count: assignments.length },
    { key: "payments", label: "Payments", count: payments.length },
  ];

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 h-7 px-2.5 rounded-lg text-[12px] font-medium transition-colors ${
              tab === t.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 opacity-70">({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile label="Total Assigned" value={formatCurrency(totals.totalAssigned)} />
          <StatTile label="Total Paid" value={formatCurrency(totals.totalPaid)} tone="text-emerald-600" />
          <StatTile
            label="Remaining Owed"
            value={formatCurrency(totals.totalRemaining)}
            tone={totals.totalRemaining > 0 ? "text-amber-600" : "text-emerald-600"}
          />
        </div>
      )}

      {tab === "projects" && (
        <div className="divide-y divide-gray-100">
          {assignments.length === 0 ? (
            <EmptyRow label="Not assigned to any project yet." />
          ) : (
            assignments.map((a) => (
              <Link
                key={a.assignmentId}
                href={`/expense?project=${a.estimateId}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-gray-50 rounded-lg px-1 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-gray-800 truncate">{a.projectTitle}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {a.estimateNumber ? `#${a.estimateNumber}` : a.estimateId.slice(0, 8)} · Assigned{" "}
                    {formatCurrency(a.assignedAmount)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold text-gray-900">{formatCurrency(a.remainingAmount)}</div>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_STYLE[a.status]}`}>
                    {a.status === "paid" ? "Paid" : a.status === "partial" ? "Partial" : "Pending"}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "payments" && (
        <div className="divide-y divide-gray-100">
          {payments.length === 0 ? (
            <EmptyRow label="No payments recorded yet." />
          ) : (
            payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 px-1">
                <div className="min-w-0">
                  <div className="text-[13px] text-gray-800 truncate">{p.projectTitle}</div>
                  <div className="text-xs text-gray-400 mt-0.5 capitalize">
                    {p.paymentMethod || "—"} · {formatDate(p.paymentDate)}
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-emerald-600 shrink-0">{formatCurrency(p.amount)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-[14px] font-semibold mt-1 ${tone || "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-6">{label}</div>;
}
