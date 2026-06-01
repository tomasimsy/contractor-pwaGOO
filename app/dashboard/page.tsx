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
          .select("id, created_at, total, estimate_number, clients(name), signature")
          .order("created_at", { ascending: false })
          .eq("is_completed", false)
          .is("deleted_at", null)
          .limit(5),
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
      <div className="min-h-screen bg-slate-50/60 pb-28 font-sans antialiased">
        {/* Sticky header */}
        <div className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto max-w-xl flex items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center">
              <div className="flex items-center gap-1">
                <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-xl font-black tracking-tight text-white">
                  OSR
                </span>
                <span className="text-xl font-medium tracking-tight text-slate-700">Pros</span>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            >
              <LogOut size={13} />
              <span>Logout</span>
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-xl space-y-5 p-4">
          {/* Financial dashboard widget */}
          <div className="rounded-2xl border border-emerald-700/70 bg-white shadow-sm overflow-hidden">
            <FinancialDashboard />
          </div>

          {/* Overdue invoices */}
          {overdueInvoices.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-rose-600">
                <AlertCircle size={12} />
                <span>Overdue · {overdueInvoices.length}</span>
              </div>
              {overdueInvoices.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`}>
                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 transition hover:bg-rose-50/80">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-rose-900 capitalize">{inv.clients?.name || "Client"}</div>
                        <div className="text-[10px] font-medium text-rose-600 mt-0.5">Inv. {inv.invoice_number}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-rose-700">{formatCurrency(inv.remaining_balance || inv.total)}</div>
                        <div className="text-[9px] text-rose-500 mt-0.5">Due {formatShortDate(inv.due_date)}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Recent Estimates */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Recent Estimates</span>
              <Link href="/estimates" className="text-[10px] font-medium text-slate-400 hover:text-emerald-700 transition">
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {recentEstimates.length === 0 ? (
                <div className="rounded-xl border border-slate-200/70 bg-white py-6 text-center text-xs text-slate-400">
                  No estimates yet
                </div>
              ) : (
                recentEstimates.map((est) => (
                  <Link key={est.id} href={`/estimates/${est.id}`}>
                    <div className="group rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-800">
                            {est.clients?.name || "No client"}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-emerald-600">
                            <span className="font-mono">#{est.estimate_number || est.id.slice(0, 8)}</span>
                            <span>•</span>
                            <span>{formatShortDate(est.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-emerald-700">{formatCurrency(est.total)}</div>
                          <span className={`mt-1 inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
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
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Recent Invoices</span>
              <Link href="/invoices" className="text-[10px] font-medium text-slate-400 hover:text-emerald-700 transition">
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {recentInvoices.length === 0 ? (
                <div className="rounded-xl border border-slate-200/70 bg-white py-6 text-center text-xs text-slate-400">
                  No invoices yet
                </div>
              ) : (
                recentInvoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}>
                    <div className="group rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-800">
                            {inv.clients?.name || "No client"}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-emerald-600">
                            <span className="font-mono">#{inv.invoice_number}</span>
                            <span>•</span>
                            <span>{formatShortDate(inv.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-900">{formatCurrency(inv.total)}</div>
                          <span className={`mt-1 inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
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
<div className="fixed bottom-21 right-6 z-50">
          {/* Pop‑out menu */}
          <div
            className={`absolute bottom-16 right-0 flex flex-col items-end gap-2 transition-all duration-200 origin-bottom ${
              isFabOpen
                ? "scale-100 opacity-100 pointer-events-auto translate-y-0"
                : "scale-90 opacity-0 pointer-events-none translate-y-4"
            }`}
            onMouseEnter={() => setIsFabOpen(true)}
            onMouseLeave={() => setIsFabOpen(false)}
          >
            <div className="flex items-center gap-2">
              <span className="bg-emerald-700 backdrop-blur-sm text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-md shadow-sm hover:bg-emerald-600 hover:text-white  transition">
                Invoices
              </span>
              <button
                onClick={() => router.push("/invoices")}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white shadow-md border border-slate-200 hover:bg-emerald-600 hover:text-white transition"
              >
                <FileText size={15} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-700 backdrop-blur-sm text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-md shadow-sm">
                New Estimate
              </span>
              <button
                onClick={() => router.push("/estimates/create")}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white shadow-md hover:bg-emerald-600 transition"
              >
                <FilePlus size={15} />
              </button>
            </div>
          </div>

          {/* Main FAB button */}
          <button
            onClick={() => setIsFabOpen(!isFabOpen)}
            onMouseEnter={() => setIsFabOpen(true)}
            onMouseLeave={() => setIsFabOpen(true)}
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-800 transition-all duration-300 ${
              isFabOpen ? "rotate-45" : "rotate-0"
            }`}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </ProtectedRoute>
  );
}