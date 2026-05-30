"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import Image from "next/image";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import FinancialDashboard from "@/components/FinancialDashboard";
import { Plus, FilePlus, FileText } from "lucide-react";

// Define strict types instead of any[]
interface DashboardStats {
  estimates: number;
  signed: number;
  converted: number;
  invoices: number;
  paid: number;
  pending: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
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

  // Memoize loadDashboard to prevent unnecessary recreation
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const todayString = new Date().toISOString().split("T")[0];

      // Fire all 5 requests simultaneously
      const [
        estimatesRes,
        invoicesRes,
        recentEstRes,
        recentInvRes,
        overdueRes
      ] = await Promise.all([
        supabase.from("estimates").select("signature, status"),
        supabase.from("invoices").select("status, remaining_balance"),
        supabase.from("estimates")
          .select("id, created_at, total, estimate_number, clients(name), signature")
          .order("created_at", { ascending: false })
          .eq("is_completed", false)
          .is("deleted_at", null)
          .limit(5),
        supabase.from("invoices")
          .select("id, created_at, total, invoice_number, clients(name), status")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("invoices")
          .select("id, invoice_number, total, remaining_balance, due_date, clients(name)")
          .lt("due_date", todayString)
          .neq("status", "paid")
      ]);

      // Process Stats locally in a single pass to minimize array iterations
      const nextStats: DashboardStats = {
        estimates: estimatesRes.data?.length || 0,
        signed: 0,
        converted: 0,
        invoices: invoicesRes.data?.length || 0,
        paid: 0,
        pending: 0,
      };

      estimatesRes.data?.forEach((e) => {
        if (e.signature) nextStats.signed++;
        if (e.status === "converted") nextStats.converted++;
      });

      invoicesRes.data?.forEach((i) => {
        if (i.status === "paid") nextStats.paid++;
        else if ((i.remaining_balance || 0) > 0) nextStats.pending++;
      });

      // Batch state updates together to minimize re-renders
      setStats(nextStats);
      if (recentEstRes.data) setRecentEstimates(recentEstRes.data);
      if (recentInvRes.data) setRecentInvoices(recentInvRes.data);
      if (overdueRes.data) setOverdueInvoices(overdueRes.data);

    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // Optional: Render loading state if needed
  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading dashboard...</div>;
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f7f9] pb-24 relative">
        {/* HEADER */}
        <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center">
                <Image
                  src="/OSR_logo.png"
                  alt="One Square Roof"
                  width={150}
                  height={42}
                  className="h-5 w-auto object-contain cursor-pointer"
                  priority
                />
              </Link>
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-400 rounded-lg hover:bg-gray-600 hover:text-white transition-all"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-4xl space-y-4 p-4">
          {/* QUICK ACTIONS */}
<div className="hidden md:grid grid-cols-2 gap-2">
  <Link href="/estimates/create">
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-emerald-200 hover:border-emerald-200 active:translate-y-0">
      <div className="text-xs font-semibold text-emerald-900">
        New Estimate
      </div>
      <div className="mt-0.5 text-[10px] text-emerald-700 leading-tight">
        Create estimate
      </div>
    </div>
  </Link>

  <Link href="/invoices">
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-blue-200 hover:border-blue-200 active:translate-y-0">
      <div className="text-xs font-semibold text-blue-900">
        View Invoices
      </div>
      <div className="mt-0.5 text-[10px] text-blue-700 leading-tight">
        Track payments
      </div>
    </div>
  </Link>
</div>
          {/* Financial dashboard */}
          <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
            <div className="max-w-4xl mx-auto">
              <FinancialDashboard />
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
          <div>
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
                    <div className="rounded-xl border border-gray-200 bg-white mb-1 p-2.5 shadow-sm transition hover:border-gray-300 hover:shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-gray-800">
                            {est.clients?.name || "No client"}
                          </div>

                          <div className="text-[10px] text-gray-400 leading-tight">
                            #{est.estimate_number || est.id.slice(0, 8)}
                          </div>

                          <div className="text-[10px] text-gray-400 leading-tight">
                            {formatShortDate(est.created_at)}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-gray-900">
                            {formatCurrency(est.total)}
                          </div>

                          <div
                            className={`mt-0.5 text-[10px] ${
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
          </div>

          {/* RECENT INVOICES */}
          <div>
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
                    <div className="rounded-xl border border-gray-200 bg-white mb-1 p-2.5 shadow-sm transition hover:border-gray-300 hover:shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-gray-800">
                            {inv.clients?.name || "No client"}
                          </div>

                          <div className="text-[10px] text-gray-400 leading-tight">
                            {inv.invoice_number}
                          </div>

                          <div className="text-[10px] text-gray-400 leading-tight">
                            {formatShortDate(inv.created_at)}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-gray-900">
                            {formatCurrency(inv.total)}
                          </div>

                          <span
                            className={`mt-0.5 inline-block rounded-full px-1.5 py-[1px] text-[10px] ${
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
          </div>
        </div>

            {/* FLOATING ACTION BUTTON SPEED DIAL */}
    <div 
      className="fixed bottom-6 right-6 z-50 mb-8"
      onMouseEnter={() => setIsFabOpen(true)}
      onMouseLeave={() => setIsFabOpen(false)}
    >
      {/* Action List Container */}
      <div className={`absolute bottom-16 right-0 flex flex-col items-end gap-2 transition-all duration-300 transform origin-bottom ${
        isFabOpen ? "scale-100 opacity-100 translate-y-0" : "scale-75 opacity-0 translate-y-4 pointer-events-none"
      }`}>
        {/* Action: View Invoices */}
        <div className="flex items-center gap-2">
          {/* Label styled to match your theme language */}
          <span className="bg-gray-900/90 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
            View Invoices
          </span>
          <button
            onClick={() => router.push("/invoices")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-700 text-white shadow-lg border border-gray-100 hover:bg-gray-800 transition-all"
            title="View Invoices"
          >
            <FileText size={18} />
          </button>
        </div>

        {/* Action: New Estimate */}
        <div className="flex items-center gap-2">
          {/* Label styled to match your theme language */}
          <span className="bg-gray-900/90 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
            New Estimate
          </span>
          <button
            onClick={() => router.push("/estimates/create")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 transition-all"
            title="New Estimate"
          >
            <FilePlus size={18} />
          </button>
        </div>
      </div>

      {/* Main Trigger Button */}
      <button
        onClick={() => setIsFabOpen(!isFabOpen)}
        className={`flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-xl hover:bg-green-700 transition-all duration-300 ${
          isFabOpen ? "rotate-45" : "rotate-0"
        }`}
      >
        <Plus size={24} />
      </button>
    </div>
      </div>
    </ProtectedRoute>
  );
}