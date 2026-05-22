"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import Image from "next/image";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import FinancialDashboard from "@/components/FinancialDashboard";

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    estimates: 0,
    signed: 0,
    converted: 0,
    invoices: 0,
    paid: 0,
    pending: 0,
  });
  const [recentEstimates, setRecentEstimates] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  async function loadDashboard() {
    // Load estimates stats
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id, signature, status");

    if (estimates) {
      setStats((prev) => ({
        ...prev,
        estimates: estimates.length,
        signed: estimates.filter((e) => e.signature).length,
        converted: estimates.filter((e) => e.status === "converted").length,
      }));
    }

    // Load invoices stats
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, status, remaining_balance");

    if (invoices) {
      setStats((prev) => ({
        ...prev,
        invoices: invoices.length,
        paid: invoices.filter((i) => i.status === "paid").length,
        pending: invoices.filter(
          (i) => i.status !== "paid" && (i.remaining_balance || 0) > 0,
        ).length,
      }));
    }

    // Load recent estimates
    const { data: recentEst } = await supabase
  .from("estimates")
  .select(`
    id,
    created_at,
    total,
    estimate_number,
    signature,
    clients(name)
  `)
  .is("deleted_at", null)
  .neq("status", "converted")  // Exclude converted
  .order("created_at", { ascending: false })
  .limit(5);

    // Load recent invoices
    const { data: recentInv } = await supabase
      .from("invoices")
      .select("id, created_at, total, invoice_number, clients(name), status")
      .order("created_at", { ascending: false })
      .limit(5);
    if (recentInv) setRecentInvoices(recentInv);

    // Load overdue invoices
    const { data: overdue } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, total, remaining_balance, due_date, clients(name)",
      )
      .lt("due_date", new Date().toISOString().split("T")[0])
      .neq("status", "paid");
    if (overdue) setOverdueInvoices(overdue);
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f7f9] pb-24">
        {/* HEADER */}

<div className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur">
  <div className="flex items-center justify-between px-4 py-2">
    
    <div className="flex items-center gap-3">
      <Image
        src="/OSR_logo.png"
        alt="OSR Pros LLC"
        width={40}
        height={20}
        className="h-6 w-auto object-contain"
        priority
      />
    </div>

<button
  onClick={handleLogout}
  className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:border-gray-300 transition-all"
>
  Logout
</button>
  </div>
</div>

        <div className="mx-auto max-w-4xl space-y-4 p-4">
          {/* QUICK ACTIONS */}
          <div className="grid grid-cols-2 gap-3">
            <Link href="/estimates/create">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
                <div className="text-sm font-semibold text-gray-800">
                  New Estimate
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Create estimate
                </div>
              </div>
            </Link>

            <Link href="/invoices">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
                <div className="text-sm font-semibold text-gray-800">
                  View Invoices
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Track payments
                </div>
              </div>
            </Link>
          </div>

          {/* Financial dashboard */}
          <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
            <div className="max-w-4xl mx-auto">
  <FinancialDashboard />
  {/* rest of your dashboard content */}
</div>
          </div>

          {/* OVERVIEW */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              Overview
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-400">Estimates</div>
                <div className="text-xl font-semibold text-gray-900">
                  {stats.estimates}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-gray-500">
                  <span>Signed: {stats.signed}</span>
                  <span>Converted: {stats.converted}</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-400">Invoices</div>
                <div className="text-xl font-semibold text-gray-900">
                  {stats.invoices}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-gray-500">
                  <span>Paid: {stats.paid}</span>
                  <span>Pending: {stats.pending}</span>
                </div>
              </div>
            </div>
          </div>

          {/* OVERDUE */}
          {overdueInvoices.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-red-500">
                Overdue ({overdueInvoices.length})
              </div>

              {overdueInvoices.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`}>
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 transition hover:shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-red-800">
                          {inv.clients?.name}
                        </div>
                        <div className="text-xs text-red-500">
                          {inv.invoice_number}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-red-700">
                          {formatCurrency(inv.remaining_balance || inv.total)}
                        </div>
                        <div className="text-[11px] text-red-400">
                          Due {formatShortDate(inv.due_date)}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* RECENT ESTIMATES */}
          {/* <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">
                Recent Estimates
              </div>
              <Link href="/estimates" className="text-xs text-gray-500">
                View all →
              </Link>
            </div>

            <div className="space-y-2">
              {recentEstimates.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
                  No estimates yet
                </div>
              ) : (
                recentEstimates.map((est) => (
                  <Link key={est.id} href={`/estimates/${est.id}`}>
                    <div className="rounded-2xl border border-gray-200 bg-white mb-1 p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-800">
                            {est.clients?.name || "No client"}
                          </div>
                          <div className="text-xs text-gray-400">
                            #{est.estimate_number || est.id.slice(0, 8)}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {formatShortDate(est.created_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatCurrency(est.total)}
                          </div>
                          <div
                            className={`mt-1 text-[11px] ${
                              est.signature ? "text-green-600" : "text-yellow-600"
                            }`}
                          >
                            {est.signature ? "Signed" : "Pending"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div> */}

          {/* RECENT INVOICES */}
          {/* <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">
                Recent Invoices
              </div>
              <Link href="/invoices" className="text-xs text-gray-500">
                View all →
              </Link>
            </div>

            <div className="space-y-2">
              {recentInvoices.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
                  No invoices yet
                </div>
              ) : (
                recentInvoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}>
                    <div className="rounded-2xl border border-gray-200 bg-white mb-1 p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">
                            {inv.clients?.name || "No client"}
                          </div>
                          <div className="text-xs text-gray-400">
                            {inv.invoice_number}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {formatShortDate(inv.created_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatCurrency(inv.total)}
                          </div>
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${
                              inv.status === "paid"
                                ? "bg-green-100 text-green-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {inv.status === "paid" ? "Paid" : "Pending"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div> */}
        </div>
      </div>
    </ProtectedRoute>
  );
}