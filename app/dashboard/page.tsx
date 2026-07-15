"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Image from "next/image";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import FinancialDashboard from "@/components/FinancialDashboard";
import { Plus, FilePlus, FileText, AlertCircle, LogOut } from "lucide-react";
import toast from "react-hot-toast";
import NotificationBell from "@/components/NotificationBell";
import { getCompanyPendingPayoutsSummary } from "@/lib/queries/expenses";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
 

//test
import { useNotifications } from "@/context/NotificationContext";

interface DashboardStats {
  estimates: number;
  signed: number;
  converted: number;
  invoices: number;
  paid: number;
  pending: number;
}

export default function Dashboard() {
const { addNotification } = useNotifications(); // ✅ top level test


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
  const [pendingPayouts, setPendingPayouts] = useState<{ count: number; totalRemaining: number } | null>(null);

  useEffect(() => {
    getCompanyId()
      .then((companyId) => getCompanyPendingPayoutsSummary(companyId))
      .then(setPendingPayouts)
      .catch(() => {});
  }, []);

const loadDashboard = useCallback(async () => {
  try {
    setLoading(true);
    const todayString = new Date().toISOString().split("T")[0];

    const [
      estimatesRes,
      invoicesRes,
      recentEstRes,
      recentInvRes,
      overdueRes,
    ] = await Promise.all([
      supabase.from("estimates").select("signature, status"),
      supabase.from("invoices").select("status, remaining_balance"),
      supabase
        .from("estimates")
        .select("id, created_at, total, estimate_number, title, clients(name), signature")
        .order("created_at", { ascending: false })
        .eq("is_completed", false)
        .is("deleted_at", null)
        .limit(10), // fetch 10 to have enough for sorting
      supabase
        .from("invoices")
        .select("id, created_at, total, invoice_number, clients(name), status")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, remaining_balance, due_date, clients(name)")
        .lt("due_date", todayString)
        .neq("status", "paid"),
    ]);

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

    setStats(nextStats);

    // Sort recent estimates: signed first, then by created_at descending
    let sortedRecentEstimates = recentEstRes.data || [];
    sortedRecentEstimates.sort((a, b) => {
      const aSigned = a.signature ? 1 : 0;
      const bSigned = b.signature ? 1 : 0;
      if (aSigned !== bSigned) return bSigned - aSigned; // signed first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setRecentEstimates(sortedRecentEstimates.slice(0, 5)); // take top 5

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/70 flex items-center justify-center">
        <div className="text-xs font-medium text-slate-500 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200/60">
          Loading dashboard...
        </div>
      </div>
    );
  }

  
 return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-slate-50/80 to-slate-100/60 pb-28 font-sans antialiased w-full max-w-xl mx-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl shadow-sm">
          <div className="mx-auto max-w-xl flex items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center group">
              <div className="flex items-center gap-1">
                <span className="rounded-lg bg-emerald-600 px-2 py-0.5 text-xl font-black tracking-tight text-white shadow-sm transition group-hover:bg-emerald-700">
                  OSR
                </span>
                <span className="text-xl font-medium tracking-tight text-slate-700">Pros</span>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <LogOut size={13} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-xl space-y-6 p-4">
          {/* Financial dashboard widget */}
          <div className="overflow-hidden rounded-2xl border border-emerald-600/20 bg-white shadow-md shadow-emerald-600/5 transition hover:shadow-emerald-600/10">
            <FinancialDashboard />
          </div>

          {/* Pending subcontractor/agent payouts */}
          {pendingPayouts && pendingPayouts.count > 0 && (
            <Link href="/expense">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm transition hover:shadow-md active:scale-[0.99]">
                <div>
                  <div className="text-sm font-bold text-amber-900">
                    {pendingPayouts.count} pending payout{pendingPayouts.count === 1 ? "" : "s"}
                  </div>
                  <div className="text-xs text-amber-700/80 mt-0.5">Subcontractors &amp; agents still owed money</div>
                </div>
                <div className="text-base font-black text-amber-900">{formatCurrency(pendingPayouts.totalRemaining)}</div>
              </div>
            </Link>
          )}

          {/* Overdue invoices */}
          {overdueInvoices.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-rose-700">
                <AlertCircle size={12} className="text-rose-600" />
                <span>Overdue · {overdueInvoices.length}</span>
              </div>
              {overdueInvoices.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`}>
                  <div className="group relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50/80 to-rose-100/40 p-4 shadow-sm transition hover:shadow-md hover:shadow-rose-200/30 active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-rose-900 capitalize group-hover:text-rose-800">
                          {inv.clients?.name || "Client"}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-rose-700/70">
                          <span className="font-mono">Inv. {inv.invoice_number}</span>
                          <span className="inline-block h-1 w-1 rounded-full bg-rose-300"></span>
                          <span>Due {formatShortDate(inv.due_date)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-rose-700">
                          {formatCurrency(inv.remaining_balance || inv.total)}
                        </div>
                        <div className="mt-0.5 inline-block rounded-full bg-rose-200/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-800">
                          Overdue
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Recent Estimates */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Recent Estimates</span>
              <Link href="/estimates" className="text-[10px] font-medium text-slate-400 transition hover:text-emerald-600">
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {recentEstimates.length === 0 ? (
                <div className="rounded-xl border border-slate-200/60 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
                  <span className="block text-2xl mb-1">📋</span>
                  No estimates yet
                </div>
              ) : (
                recentEstimates.map((est) => (
                  <Link key={est.id} href={`/estimates/${est.id}`}>
                    <div className="group rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md active:scale-[0.99]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-800 group-hover:text-emerald-800">
                            {est.clients?.name || "No client"}
                          </div>
                          {est.title && (
                            <div className="truncate text-xs text-slate-500">{est.title}</div>
                          )}
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                            <span>#{est.estimate_number || est.id.slice(0, 8)}</span>
                            <span className="inline-block h-1 w-1 rounded-full bg-slate-300"></span>
                            <span>{formatShortDate(est.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-700">{formatCurrency(est.total)}</div>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                            est.signature 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {est.signature ? "Signed" : "Draft"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Recent Invoices</span>
              <Link href="/invoices" className="text-[10px] font-medium text-slate-400 transition hover:text-emerald-600">
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {recentInvoices.length === 0 ? (
                <div className="rounded-xl border border-slate-200/60 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
                  <span className="block text-2xl mb-1">🧾</span>
                  No invoices yet
                </div>
              ) : (
                recentInvoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}>
                    <div className="group rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md active:scale-[0.99]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-800 group-hover:text-emerald-800">
                            {inv.clients?.name || "No client"}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                            <span>#{inv.invoice_number}</span>
                            <span className="inline-block h-1 w-1 rounded-full bg-slate-300"></span>
                            <span>{formatShortDate(inv.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-slate-900">{formatCurrency(inv.total)}</div>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                            inv.status === "paid" 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {inv.status === "paid" ? "Paid" : "Open"}
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

        {/* Refined Speed Dial (FAB) */}
        <div className="fixed bottom-24 right-6 z-50 pointer-events-none">
          {/* Pop‑out menu */}
          <div
            className={`absolute bottom-16 right-0 flex flex-col items-end gap-2 transition-all duration-200 origin-bottom ${
              isFabOpen
                ? "scale-100 opacity-100 pointer-events-auto translate-y-0"
                : "scale-90 opacity-0 pointer-events-none translate-y-4"
            }`}
          >
            <div
              className="flex items-center gap-2 pointer-events-auto"
              onMouseEnter={() => setIsFabOpen(true)}
              onMouseLeave={() => setIsFabOpen(false)}
            >
              <span className="bg-slate-800/90 backdrop-blur-sm text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-sm transition hover:bg-slate-700">
                Invoices
              </span>
              <button
                onClick={() => router.push("/invoices")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition hover:scale-105 hover:bg-emerald-700 active:scale-95"
              >
                <FileText size={15} />
              </button>
            </div>
            <div
              className="flex items-center gap-2 pointer-events-auto"
              onMouseEnter={() => setIsFabOpen(true)}
              onMouseLeave={() => setIsFabOpen(false)}
            >
              <span className="bg-slate-800/90 backdrop-blur-sm text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-sm">
                New Estimate
              </span>
              <button
                onClick={() => router.push("/estimates/create")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition hover:scale-105 hover:bg-emerald-700 active:scale-95"
              >
                <FilePlus size={15} />
              </button>
            </div>
          </div>

          {/* Main FAB button */}
          <button
            onClick={() => setIsFabOpen(!isFabOpen)}
            onMouseEnter={() => setIsFabOpen(true)}
            onMouseLeave={() => setIsFabOpen(false)}
            className={`flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xl shadow-emerald-600/40 transition-all duration-300 pointer-events-auto hover:scale-105 hover:bg-emerald-700 active:scale-95 ${
              isFabOpen ? "rotate-45" : "rotate-0"
            }`}
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </ProtectedRoute>
  );
}