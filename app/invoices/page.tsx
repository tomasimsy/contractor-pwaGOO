"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import { ArrowLeft, Search, AlertCircle, Link2, Send, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import DesktopShell from "@/components/layout/DesktopShell";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "pending">("all");

  useEffect(() => {
    async function fetchInvoices() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("invoices")
          .select("id, invoice_number, total, remaining_balance, due_date, created_at, status, clients(name, phone), estimates(title)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (data) setInvoices(data);
      } catch (err) {
        console.error("Error fetching invoices:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchInvoices();
  }, []);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number?.toString().includes(search);
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "paid"
          ? inv.status === "paid"
          : inv.status !== "paid";
    return matchesSearch && matchesFilter;
  });

  const isOverdue = (dueDate: string, status: string) => {
    if (status === "paid") return false;
    const todayString = new Date().toISOString().split("T")[0];
    return dueDate < todayString;
  };

  const getInvoiceUrl = (id: string) => `${window.location.origin}/public/invoices/${id}`;

  const copyLink = (inv: any) => {
    const documentUrl = getInvoiceUrl(inv.id);
    navigator.clipboard.writeText(documentUrl);
    toast.success("Link copied to clipboard!", {
      duration: 2000,
      position: "top-center",
      icon: "🔗",
      style: {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fbbf24",
        padding: "6px 12px",
        fontSize: "12px",
        minWidth: "180px",
      },
    });
  };

  const sendSMSLink = (inv: any) => {
    const phoneNumber = inv.clients?.phone;
    if (!phoneNumber) {
      toast.error("No phone number on file for this client.", {
        duration: 3000,
        position: "top-center",
      });
      return;
    }
    const documentUrl = getInvoiceUrl(inv.id);
    const balance = inv.remaining_balance || inv.total;
    const message = encodeURIComponent(
      `Hello ${inv.clients?.name || "Customer"}! Please find your invoice #${inv.invoice_number || inv.id.slice(0, 8)}
      here: ${documentUrl}\n\nTotal Due: ${formatCurrency(balance)}\nThank you!`
    );
    window.location.href = `sms:${phoneNumber}?body=${message}`;
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/60 flex items-center justify-center font-sans antialiased">
        <div className="text-xs font-semibold text-slate-400 bg-white px-4 py-2 rounded-xl shadow-xs border border-slate-200/50 tracking-wide">
          Loading invoices...
        </div>
      </div>
    );
  }

  return (
    <DesktopShell
      title="Invoices"
      actions={
        <div className="relative w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 transition-colors"
          />
        </div>
      }
    >
    <div className="min-h-screen md:min-h-0 bg-slate-50/40 md:bg-transparent pb-32 md:pb-0 font-sans antialiased text-slate-800">
      {/* HEADER CONTROLS — hidden at md+, where DesktopShell's title bar
          + search action above take over. */}
      <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-md md:hidden">
        <div className="mx-auto max-w-xl px-4 py-2.5 flex items-center gap-3">
          <Link href="/dashboard" className="p-1 text-slate-400 hover:text-[#05291e] transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs focus:bg-white focus:outline-hidden focus:border-[#05291e] transition-all"
            />
          </div>
        </div>
      </div>

      {/* RENDER LISTING */}
      <div className="mx-auto max-w-xl md:max-w-none md:mx-0 p-4 md:p-0 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[16px] font-bold uppercase tracking-wider text-emerald-700">
            All Invoices
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-2.5 py-1 text-center shadow-xs">
            <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-800">Total</div>
            <div className="text-xs font-bold text-emerald-950">{filteredInvoices.length}</div>
          </div>
        </div>

        {/* Vertical filter buttons (unchanged) */}
        <div className="fixed bottom-54 right-3 z-40 flex flex-col gap-2 items-end">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 py-3 rounded-lg text-[12px] font-semibold shadow-md transition ${
              filter === "all"
                ? "bg-emerald-600 text-white"
                : "bg-white border border-emerald-400 text-slate-600 hover:bg-emerald-50 hover:text-slate-800"
            }`}
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            All
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`px-2 py-3 rounded-lg text-[12px] font-semibold shadow-md transition ${
              filter === "pending"
                ? "bg-emerald-600 text-white"
                : "bg-white border border-emerald-400 text-slate-600 hover:bg-emerald-50 hover:text-slate-800"
            }`}
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("paid")}
            className={`px-2 py-3 rounded-lg text-[12px] font-semibold shadow-md transition ${
              filter === "paid"
                ? "bg-emerald-600 text-white"
                : "bg-white border border-emerald-400 text-slate-600 hover:bg-emerald-50 hover:text-slate-800"
            }`}
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Paid
          </button>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-white py-8 text-center text-xs text-slate-400">
            No invoices found
          </div>
        ) : (
          filteredInvoices.map((inv, index) => {
            const itemOverdue = isOverdue(inv.due_date, inv.status);
            const isEven = index % 2 === 0;

            return (
              <div
                key={inv.id}
                className={`group rounded-xl border p-3.5 py-2.5 shadow-2xs transition-all duration-150 capitalize flex items-start gap-3 ${
                  isEven ? "bg-white" : "bg-slate-50/60"
                } hover:bg-emerald-50 hover:border-emerald-200 ${
                  itemOverdue ? "border-rose-200" : "border-slate-200/70"
                }`}
              >
                {/* Arrow */}
                <div className="flex h-full items-center text-emerald-500 group-hover:text-emerald-700 transition-colors">
                  <ArrowRight size={14} className="shrink-0" />
                </div>

                {/* Left column */}
                <Link href={`/invoices/${inv.id}`} className="min-w-0 flex-1 block">
                  <div className="flex items-center gap-1.5">
                    {itemOverdue && <AlertCircle size={12} className="text-rose-500 shrink-0" />}
                    <div
                      className={`truncate text-xs font-bold tracking-tight transition-colors ${
                        itemOverdue ? "text-rose-950" : "text-slate-800 group-hover:text-emerald-800"
                      }`}
                    >
                      {inv.clients?.name || "Untitled Client"}
                    </div>
                  </div>
                  {inv.estimates?.title && (
                    <div className="truncate text-[10px] text-slate-500">{inv.estimates.title}</div>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-slate-400 transition-colors group-hover:text-slate-600">
                    <span
                      className={`font-semibold bg-slate-50 px-1 rounded border font-mono text-[9px] transition-colors ${
                        itemOverdue
                          ? "text-rose-600 border-rose-200/60 bg-rose-50 group-hover:bg-emerald-100 group-hover:border-emerald-200 group-hover:text-emerald-700"
                          : "text-slate-600 border-slate-200 group-hover:bg-emerald-100 group-hover:border-emerald-200 group-hover:text-emerald-700"
                      }`}
                    >
                      #{inv.invoice_number}
                    </span>
                    <span>•</span>
                    <span>{formatShortDate(inv.created_at)}</span>
                  </div>
                  <div className="text-[9px] font-medium mt-1">
                    {inv.status !== "paid" ? (
                      <span
                        className={
                          itemOverdue
                            ? "text-rose-500 font-bold"
                            : "text-slate-400 group-hover:text-slate-600 transition-colors"
                        }
                      >
                        Due {formatShortDate(inv.due_date)}
                      </span>
                    ) : (
                      <span className="text-teal-600 font-medium">Closed</span>
                    )}
                  </div>
                </Link>

                {/* RIGHT COLUMN – amount + badge + buttons inline */}
                <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
                  <div className="flex flex-col items-end">
                    <div
                      className={`text-xs font-bold tracking-tight transition-colors ${
                        itemOverdue ? "text-rose-700" : "text-slate-900 group-hover:text-emerald-800"
                      }`}
                    >
                      {formatCurrency(inv.remaining_balance || inv.total)}
                    </div>

                    {/* Badge and action buttons – now on the same row */}
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider border transition-colors ${
                          inv.status === "paid"
                            ? "bg-teal-100/50 text-teal-700 border-teal-200/50"
                            : inv.status === "partial"
                            ? "bg-blue-100/50 text-blue-700 border-blue-200/60 group-hover:bg-emerald-100 group-hover:text-emerald-700 group-hover:border-emerald-200"
                            : itemOverdue
                            ? "bg-rose-100/60 text-rose-700 border-rose-200 group-hover:bg-emerald-100 group-hover:text-emerald-700 group-hover:border-emerald-200"
                            : "bg-amber-100/50 text-amber-700 border-amber-200/60 group-hover:bg-emerald-100 group-hover:text-emerald-700 group-hover:border-emerald-200"
                        }`}
                      >
                        {inv.status === "paid"
                          ? "Paid"
                          : inv.status === "partial"
                          ? "Partial"
                          : itemOverdue
                          ? "Overdue"
                          : "Pending"}
                      </span>

                      {/* Action buttons inline with badge */}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => copyLink(inv)}
                          className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100"
                          title="Copy Link"
                        >
                          <Link2 size={12} />
                        </button>
                        <button
                          onClick={() => sendSMSLink(inv)}
                          className="p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-100"
                          title="Send SMS"
                        >
                          <Send size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </DesktopShell>
  );
}