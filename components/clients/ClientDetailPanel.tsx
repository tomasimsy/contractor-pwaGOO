"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/formatting";
import type { ClientDetail } from "@/lib/queries/clients";

type Tab = "summary" | "estimates" | "invoices" | "payments";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Expandable per-client detail — Estimates/Invoices/Payments kept in
// their own tabs (same records the Estimates/Invoices pages show, not a
// duplicate copy) plus a combined Summary tab with the four requested
// totals. Loaded on demand by the parent page when a client row is
// expanded, so a collapsed list never pays this query cost.
export default function ClientDetailPanel({ detail, loading }: { detail: ClientDetail | null; loading: boolean }) {
  const [tab, setTab] = useState<Tab>("summary");

  if (loading) {
    return <div className="text-[13px] text-gray-400 text-center py-6">Loading client history…</div>;
  }
  if (!detail) return null;

  const { estimates, invoices, payments, totals } = detail;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "summary", label: "Summary" },
    { key: "estimates", label: "Estimates", count: estimates.length },
    { key: "invoices", label: "Invoices", count: invoices.length },
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Total Estimated" value={formatCurrency(totals.totalEstimated)} />
          <StatTile label="Total Invoiced" value={formatCurrency(totals.totalInvoiced)} />
          <StatTile label="Total Paid" value={formatCurrency(totals.totalPaid)} tone="text-emerald-600" />
          <StatTile
            label="Remaining Balance"
            value={formatCurrency(totals.remainingBalance)}
            tone={totals.remainingBalance > 0 ? "text-amber-600" : "text-emerald-600"}
          />
        </div>
      )}

      {tab === "estimates" && (
        <div className="divide-y divide-gray-100">
          {estimates.length === 0 ? (
            <EmptyRow label="No estimates for this client yet." />
          ) : (
            estimates.map((e) => (
              <Link
                key={e.id}
                href={`/estimates/${e.id}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-gray-50 rounded-lg px-1 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-gray-800 truncate">{e.title || "Untitled Estimate"}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    #{e.estimate_number || e.id.slice(0, 8)} · {formatDate(e.created_at)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold text-gray-900">{formatCurrency(e.total)}</div>
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                      e.signature ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {e.signature ? "Signed" : e.status || "Draft"}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="divide-y divide-gray-100">
          {invoices.length === 0 ? (
            <EmptyRow label="No invoices for this client yet." />
          ) : (
            invoices.map((i) => (
              <Link
                key={i.id}
                href={`/invoices/${i.id}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-gray-50 rounded-lg px-1 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-gray-800 truncate">#{i.invoice_number}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatCurrency(i.amount_paid)} / {formatCurrency(i.total)} · Due {formatDate(i.due_date)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold text-gray-900">{formatCurrency(i.remaining_balance)}</div>
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                      i.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {i.status === "paid" ? "Paid" : i.status || "Open"}
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
                  <div className="text-[13px] text-gray-800">Invoice #{p.invoice_number}</div>
                  <div className="text-xs text-gray-400 mt-0.5 capitalize">
                    {p.method || "—"} · {formatDate(p.created_at)}
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
