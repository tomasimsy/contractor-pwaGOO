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
      <div className="min-h-screen bg-slate-50/60 flex items-center justify-center font-sans antialiased">
        <div className="text-xs font-medium text-slate-400 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200/50 tracking-wide">
          Loading system overview...
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/40 pb-32 font-sans antialiased text-slate-800 relative">
        
        {/* PREMIUM LIGHT MINIMAL STICKY HEADER */}
        <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
          <div className="mx-auto max-w-xl flex items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center">
              <Image
                src="/OSR_logo.png"
                alt="One Square Roof"
                width={130}
                height={35}
                className="h-4.5 w-auto object-contain"
                priority
              />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
            >
              <LogOut size={12} />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* CONTAINER FRAME CONTAINER */}
        <div className="mx-auto max-w-xl space-y-5 p-4">

          {/* FINANCIAL DASHBOARD METRICS VIEW */}
          <div className="rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-xs">
            <FinancialDashboard />
          </div>

          {/* OVERDUE INVOICES COMPONENT ALERT STRIP */}
          {overdueInvoices.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                <AlertCircle size={11} />
                <span>Overdue Action Items ({overdueInvoices.length})</span>
              </div>
              {overdueInvoices.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`}>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3.5 transition-colors hover:bg-rose-50/80">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-rose-950 capitalize">{inv.clients?.name}</div>
                        <div className="text-[10px] font-medium text-rose-500 mt-0.5">Invoice #{inv.invoice_number}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-rose-700">{formatCurrency(inv.remaining_balance || inv.total)}</div>
                        <div className="text-[9px] font-medium text-rose-400 mt-0.5">Due {formatShortDate(inv.due_date)}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* RECENT ESTIMATES SECTION PANEL */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="text-xs font-bold text-[#05291e] uppercase tracking-wide">Recent Estimates</div>
              <Link href="/estimates" className="text-[11px] font-medium text-slate-400 hover:text-[#05291e] transition-colors">
                View all pipeline →
              </Link>
            </div>
            <div className="space-y-2">
              {recentEstimates.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-white py-6 text-center text-xs text-slate-400">
                  No estimates recorded
                </div>
              ) : (
                recentEstimates.map((est) => (
                  <Link key={est.id} href={`/estimates/${est.id}`}>
                    <div className="group rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs transition duration-150 hover:border-slate-300 capitalize">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-800 group-hover:text-slate-900 tracking-tight">
                            {est.clients?.name || "Untitled Client"}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-slate-400">
                            <span className="font-semibold text-slate-500 bg-slate-50 px-1 py-0.2 rounded border border-slate-100">
                              #{est.estimate_number || est.id.slice(0, 8)}
                            </span>
                            <span>•</span>
                            <span>{formatShortDate(est.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <div className="text-xs font-bold text-slate-900">{formatCurrency(est.total)}</div>
                          <span className={`mt-1 inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider border ${
                            est.signature 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : "bg-amber-50 text-amber-700 border-amber-100/70"
                          }`}>
                            {est.signature ? "Signed" : "Pending"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* RECENT INVOICES SECTION PANEL */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">Recent Invoices</div>
              <Link href="/invoices" className="text-[11px] font-medium text-slate-400 hover:text-[#05291e] transition-colors">
                View all tracking →
              </Link>
            </div>
            <div className="space-y-2">
              {recentInvoices.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-white py-6 text-center text-xs text-slate-400">
                  No invoices emitted
                </div>
              ) : (
                recentInvoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}>
                    <div className="group rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs transition duration-150 hover:border-slate-300 capitalize">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-800 group-hover:text-slate-900 tracking-tight">
                            {inv.clients?.name || "Untitled Client"}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-slate-400">
                            <span className="font-semibold text-slate-500 bg-slate-50 px-1 py-0.2 rounded border border-slate-100">
                              #{inv.invoice_number}
                            </span>
                            <span>•</span>
                            <span>{formatShortDate(inv.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <div className="text-xs font-bold text-slate-900">{formatCurrency(inv.total)}</div>
                          <span className={`mt-1 inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider border ${
                            inv.status === "paid" 
                              ? "bg-teal-50 text-teal-700 border-teal-100" 
                              : "bg-amber-50 text-amber-700 border-amber-100/70"
                          }`}>
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

        {/* REFINED STATE TRACKED SPEED DIAL SYSTEM */}
{/* REFINED STATE TRACKED SPEED DIAL SYSTEM */}
        <div className="fixed bottom-22 right-6 z-50 flex flex-col items-end">
          
          {/* Popout Options Container Panel */}
          <div 
            className={`flex flex-col items-end gap-2 pb-2.5 transition-all duration-200 transform origin-bottom ${
              isFabOpen ? "scale-100 opacity-100 translate-y-0 pointer-events-auto" : "scale-90 opacity-0 translate-y-3 pointer-events-none"
            }`}
            onMouseEnter={() => setIsFabOpen(true)}
            onMouseLeave={() => setIsFabOpen(false)}
          >
            {/* Speed Dial Item: Invoices Overview */}
            <div className="flex items-center gap-2">
              <span className="bg-slate-900/90 backdrop-blur-xs text-white text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-md shadow-sm">
                Invoices
              </span>
              <button
                onClick={() => router.push("/invoices")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-md border border-slate-200 hover:bg-slate-50 hover:text-[#05291e] transition"
              >
                <FileText size={15} />
              </button>
            </div>

            {/* Speed Dial Item: New Estimate Form */}
            <div className="flex items-center gap-2">
              <span className="bg-slate-900/90 backdrop-blur-xs text-white text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-md shadow-sm">
                New Estimate
              </span>
              <button
                onClick={() => router.push("/estimates/create")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#05291e] text-white shadow-md hover:bg-[#0b3c2d] transition"
              >
                <FilePlus size={15} />
              </button>
            </div>
          </div>

          {/* Main Button Trigger Element */}
          <button
            onClick={() => setIsFabOpen(!isFabOpen)}
            onMouseEnter={() => setIsFabOpen(true)}
            onMouseLeave={() => setIsFabOpen(false)}
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-[#05291e] text-white shadow-lg hover:bg-[#0b3c2d] transition-all duration-300 ${
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