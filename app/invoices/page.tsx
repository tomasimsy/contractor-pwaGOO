"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase/client";
import { filterActive } from "@/lib/queries/softDeleteFilter";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import { ArrowLeft, Search, AlertCircle, Link2, Send, ArrowRight,Receipt, DollarSign, Plus } from "lucide-react";
import toast from "react-hot-toast";
import DesktopShell from "@/components/layout/DesktopShell";
import ProjectFinancialPills from "@/components/shared/ProjectFinancialPills";
import ReceivedPaymentModal from "@/components/payments/ReceivedPaymentModal";
import AddExpenseSheet, { type FormCategory } from "@/components/expense/AddExpenseSheet";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getCompanyProjectFinancialSummaries, type ProjectFinancialSummary, addEntry, assignSubcontractorToProject } from "@/lib/queries/expenses";
import { getProjectBundle } from "@/lib/queries/projects";
import type { ProjectBundle, NewEntryInput } from "@/lib/types";
import invoice from "../estimates/[id]/invoice";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "pending">("all");
  const [financials, setFinancials] = useState<Map<string, ProjectFinancialSummary>>(new Map());
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [addSheetCategory, setAddSheetCategory] = useState<FormCategory | undefined>(undefined);
  const [expenseBundle, setExpenseBundle] = useState<ProjectBundle | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvoices() {
      try {
        setLoading(true);
        // invoices.total/remaining_balance/amount_paid/status are kept
        // current with approved change orders baked in by
        // cascadeRevisedTotalToInvoices() (see lib/queries/changeOrders.ts)
        // — no separate change-order fetch or "revised" recomputation
        // needed here, it would only double-count what's already included.
        const { data, error } = await filterActive(
          supabase
            .from("invoices")
            .select("id, invoice_number, total, remaining_balance, amount_paid, due_date, created_at, status, estimate_id, is_locked, clients(name, phone), estimates(title)")
            .order("created_at", { ascending: false }),
          "invoices"
        );
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

  useEffect(() => {
    getCompanyId()
      .then((companyId) => getCompanyProjectFinancialSummaries(companyId))
      .then(setFinancials)
      .catch(() => {}); // best-effort — pills just show "--" if this fails
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

  const handleOpenAddExpense = async (invoice: any) => {
    if (!invoice.estimate_id) {
      toast.error("This invoice is not linked to an estimate.", {
        duration: 3000,
        position: "top-center",
      });
      return;
    }
    try {
      const bundle = await getProjectBundle(invoice.estimate_id);
      setExpenseBundle(bundle);
      setSelectedEstimateId(invoice.estimate_id);
      setIsAddSheetOpen(true);
    } catch (err) {
      console.error("Error loading bundle:", err);
      toast.error("Failed to load project data.", {
        duration: 3000,
        position: "top-center",
      });
    }
  };

  const handleAddEntry = async (input: NewEntryInput) => {
    try {
      await addEntry(input);
      toast.success("Expense added successfully!", {
        duration: 3000,
        position: "top-center",
      });
      setIsAddSheetOpen(false);
      setExpenseBundle(null);
      setSelectedEstimateId(null);
    } catch (err) {
      console.error("Error adding entry:", err);
      toast.error("Failed to add expense.", {
        duration: 3000,
        position: "top-center",
      });
    }
  };

  const handleAssignSubcontractor = async (
    subcontractorId: string,
    name: string,
    trade: string | null,
    amount: number,
    notes: string | null
  ) => {
    if (!expenseBundle) throw new Error("No project selected");
    const assigned = await assignSubcontractorToProject(
      expenseBundle.project.id,
      expenseBundle.project.company_id,
      subcontractorId,
      name,
      trade,
      amount,
      notes
    );
    // Update local state immediately for responsive UI feedback
    setExpenseBundle((prev) =>
      prev ? { ...prev, assignedSubcontractors: [...prev.assignedSubcontractors, assigned] } : prev
    );
    // Reload bundle in background to ensure all dependent calculations update
    if (selectedEstimateId) {
      getProjectBundle(selectedEstimateId)
        .then(setExpenseBundle)
        .catch((err) => console.error("Failed to refresh bundle after assignment:", err));
    }
    return assigned;
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
                className={`group rounded-xl border p-2.5 py-1.5 shadow-2xs transition-all duration-150 capitalize flex flex-col md:flex-row md:items-start gap-2 ${
                  isEven ? "bg-white" : "bg-slate-50/60"
                } hover:bg-emerald-50 hover:border-emerald-200 ${
                  itemOverdue ? "border-rose-200" : "border-slate-200/70"
                }`}
              >
                {/* Arrow – hidden on mobile */}
                <div className="hidden md:flex h-full items-center text-emerald-500 group-hover:text-emerald-700 transition-colors">
                  <ArrowRight size={14} className="shrink-0" />
                </div>

                {/* Left column */}
                <Link href={`/invoices/${inv.id}`} className="min-w-0 flex-1 block">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {itemOverdue && <AlertCircle size={12} className="text-rose-500 shrink-0" />}
                    <div className="truncate text-xs font-bold text-slate-800 group-hover:text-emerald-800 transition-colors tracking-tight">
                      {inv.clients?.name || "Untitled Client"}
                    </div>
                    <span className="font-semibold text-emerald-600 px-1 rounded border border-slate-200 font-mono text-[9px]">
                      #{inv.invoice_number}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-emerald-600 px-1 rounded border border-slate-200 font-mono text-[9px]">
                      {formatShortDate(inv.created_at)}
                    </span>

                    {(() => {
                      const amountPaid = inv.amount_paid || 0;
                      const total = inv.total || 0;
                      let statusLabel = "";
                      let statusColor = "";

                      if (inv.is_locked) {
                        statusLabel = "Closed";
                        statusColor = "bg-slate-100/50 text-slate-600 border-slate-200/60";
                      } else if (amountPaid >= total) {
                        statusLabel = "Fully Paid";
                        statusColor = "bg-teal-100/50 text-teal-700 border-teal-200/50";
                      } else if (amountPaid > 0) {
                        statusLabel = "Partially Paid";
                        statusColor = "bg-blue-100/50 text-blue-700 border-blue-200/60";
                      } else if (itemOverdue) {
                        statusLabel = "Overdue";
                        statusColor = "bg-rose-100/60 text-rose-700 border-rose-200";
                      } else {
                        statusLabel = "Pending";
                        statusColor = "bg-amber-100/50 text-amber-700 border-amber-200/60";
                      }

                      return (
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase ${statusColor}`}>
                          {statusLabel}
                        </span>
                      );
                    })()}
                  </div>

                  {inv.estimates?.title && (
                    <div className="truncate text-[11px] font-semibold text-slate-600 group-hover:text-slate-700 transition-colors normal-case mt-1">
                      {inv.estimates.title}
                    </div>
                  )}

                  {inv.estimate_id && (
                    <div className="hidden md:block">
                      <ProjectFinancialPills estimateId={inv.estimate_id} summary={financials.get(inv.estimate_id)} />
                    </div>
                  )}
                </Link>

                {/* RIGHT COLUMN – amount + buttons */}
                <div className="flex w-full md:w-auto shrink-0 md:flex-col md:items-end md:justify-between md:self-stretch items-center justify-between gap-2">
                  {/* Amount section */}
                  <div className="flex flex-col items-end">
                    <div className="flex flex-col items-end gap-0.5">
                      {/* Original estimate amount */}
                      <div className="text-[9px] text-slate-500 font-medium">
                        Est: {formatCurrency(inv.total)}
                      </div>

                      {/* Current amount due/paid */}
                      <div
                        className={`text-xs font-bold tracking-tight transition-colors ${
                          itemOverdue ? "text-rose-700" : "text-slate-900 group-hover:text-emerald-800"
                        }`}
                      >
                        {inv.status === "paid"
                          ? formatCurrency(inv.total)
                          : formatCurrency(inv.remaining_balance || inv.total)}
                      </div>

                      {/* Payment progress for partial invoices – mobile only */}
                      {inv.status === "partial" && (
                        <div className="text-[9px] text-slate-500 md:hidden">
                          {formatCurrency((inv.total || 0) - (inv.remaining_balance || 0))} paid
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-1.5 md:flex-nowrap justify-end">
                      {/* Receive Payment */}
                      {inv.status !== "paid" && (
                        <button
                          onClick={() => setSelectedInvoiceForPayment(inv)}
                          className="flex h-6 px-2 items-center justify-center gap-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-[11px] font-semibold whitespace-nowrap"
                          title="Receive Payment"
                        >
                          <DollarSign size={12} />
                          <span>Receive</span>
                        </button>
                      )}

                      {/* Quick Add Expense */}
                      <button
                        onClick={() => handleOpenAddExpense(inv)}
                          className="flex h-6 px-2 items-center justify-center gap-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-[11px] font-semibold whitespace-nowrap"
                        title="Quick Add Expense"
                      >
                        <Plus size={12} />
                        <span>Expense</span>
                      </button>

                      {/* Expense link */}
                  <Link
                    href={`/expense?project=${inv.estimate_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                    title="View All Expenses"
                  >
                    <Receipt size={12} />
                  </Link>

                      {/* Copy Link */}
                      <button
                        onClick={() => copyLink(inv)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                        title="Copy Link"
                      >
                        <Link2 size={12} />
                      </button>

                      {/* SMS */}
                      <button
                        onClick={() => sendSMSLink(inv)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                        title="Send SMS"
                      >
                        <Send size={12} />
                      </button>
                    </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>

    {/* Receive Payment Modal */}
    {selectedInvoiceForPayment && (() => {
      return (
        <ReceivedPaymentModal
          isOpen={true}
          onClose={() => setSelectedInvoiceForPayment(null)}
          invoiceId={selectedInvoiceForPayment.id}
          invoiceNumber={selectedInvoiceForPayment.invoice_number || selectedInvoiceForPayment.id.slice(0, 8)}
          clientName={selectedInvoiceForPayment.clients?.name || "Client"}
          invoiceTotal={selectedInvoiceForPayment.total}
          remainingBalance={selectedInvoiceForPayment.remaining_balance ?? selectedInvoiceForPayment.total}
          onPaymentRecorded={() => {
            setSelectedInvoiceForPayment(null);
            // Reload invoices to show updated payment status
            // Add small delay to ensure database trigger has completed
            setTimeout(async () => {
              try {
                const { data, error } = await filterActive(
                supabase
                  .from("invoices")
                  .select("id, invoice_number, total, remaining_balance, amount_paid, due_date, created_at, status, estimate_id, is_locked, clients(name, phone), estimates(title)")
                  .order("created_at", { ascending: false }),
                "invoices"
              );
              if (error) throw error;
              if (data) setInvoices(data);
            } catch (err) {
              console.error("Error fetching invoices:", err);
            }
          }, 300);
        }}
      />
      );
    })()}

    {/* Add Expense Sheet Modal */}
    {isAddSheetOpen && expenseBundle && (
      <AddExpenseSheet
        bundle={expenseBundle}
        initialCategory={addSheetCategory}
        onClose={() => {
          setIsAddSheetOpen(false);
          setExpenseBundle(null);
          setSelectedEstimateId(null);
        }}
        onSubmit={handleAddEntry}
        onAssignSubcontractor={handleAssignSubcontractor}
      />
    )}
    </DesktopShell>
  );
}