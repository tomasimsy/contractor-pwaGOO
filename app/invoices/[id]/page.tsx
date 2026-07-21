"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { Invoice, Client, Project, Signature } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import SignaturePad from "@/components/signature/SignaturePad";
import PaymentModal from "@/components/payments/PaymentModal";
import ReceivedPaymentModal from "@/components/payments/ReceivedPaymentModal";
import PaymentHistoryTable from "@/components/payments/PaymentHistoryTable";
import PaymentStatusCard from "@/components/payments/PaymentStatusCard";
import { getInvoicePayments } from "@/lib/queries/customerPayments";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ProjectFinancialsModal from "@/components/ProjectFinancialsModal";
import toast from "react-hot-toast";
import { calculateProjectFinancials } from "@/lib/queries/financialCalculations";
import { getProjectBundle } from "@/lib/queries/projects";

import { Trash2, Lock, Unlock, AlertCircle, ArrowLeft, FileText, Receipt, DollarSign } from "lucide-react";
import { deleteCustomerPayment } from "@/lib/queries/customerPayments";

export default function InvoicePage() {
  const router = useRouter();
  const { id } = useParams();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [estimateItems, setEstimateItems] = useState<any[]>([]);
  const [invoiceLineItems, setInvoiceLineItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [changeOrders, setChangeOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceivedPaymentModal, setShowReceivedPaymentModal] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [locking, setLocking] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [invoicePayments, setInvoicePayments] = useState<any[]>([]);
  // Modal states
  const [showFinancialsModal, setShowFinancialsModal] = useState(false);
  const [estimateId, setEstimateId] = useState<string | null>(null);

  // ----- Core data -----
  const [originalSubtotal, setOriginalSubtotal] = useState(0);
  const [approvedChangeTotal, setApprovedChangeTotal] = useState(0);
  const [revisedTotal, setRevisedTotal] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [remainingBalance, setRemainingBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [isFullyPaid, setIsFullyPaid] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [canLock, setCanLock] = useState(false);
  const [canUnlock, setCanUnlock] = useState(false);
  const [isOverdue, setIsOverdue] = useState(false);

  // Edit Mode State
  const [fabOpen, setFabOpen] = useState(false);
  const [estimateTitle, setEstimateTitle] = useState<string | null>(null);

  useEffect(() => {
    loadInvoice();
  }, [id]);

  useEffect(() => {
    // The invoice already carries the real FK to its estimate — no need
    // to re-derive it by string-matching invoice/estimate numbers, which
    // silently fails whenever the two numbering schemes don't coincide.
    setEstimateId(invoice?.estimate_id ?? null);
  }, [invoice]);

  // ----- loadInvoice with skipLoading flag -----
  async function loadInvoice(skipLoading = false) {
    try {
      if (!skipLoading) setLoading(true);
      const companyId = await getCompanyId();
      const { data: inv, error: invError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .eq("is_deleted", false)
        .single();

      if (invError || !inv) {
        console.error("Invoice not found");
        return;
      }
      if (invError) throw invError;
      setInvoice(inv);
      setIsLocked(inv?.is_locked === true);

      if (inv.client_id) {
        const { data: cl } = await supabase
          .from("clients")
          .select("*")
          .eq("id", inv.client_id)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .single();
        if (cl) setClient(cl);
      }

      // Load projects (phases)
      const { data: projs } = await supabase
        .from("projects")
        .select("*, line_items(*)")
        .eq("invoice_id", id);
      if (projs) setProjects(projs);

      // Invoice line items — this used to read a table ("invoice_line_items")
      // that nothing in the app ever writes to (confirmed: it doesn't exist
      // in the live schema), so this section always rendered empty. The
      // real rows created at invoice time live in `invoice_items`.
      const { data: invLines } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", id)
        .is("deleted_at", null);
      if (invLines) setInvoiceLineItems(invLines);

      if (inv.estimate_id) {
        const { data: est } = await supabase
          .from("estimates")
          .select("title")
          .eq("id", inv.estimate_id)
          .eq("company_id", companyId)
          .eq("is_deleted", false)
          .single();
        setEstimateTitle(est?.title ?? null);
      } else {
        setEstimateTitle(null);
      }

      // Fetch payments
      const { data: pays } = await supabase
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      const paymentsData = pays || [];
      setPayments(paymentsData);

      // Use unified engine for all financial calculations
      if (inv.estimate_id) {
        try {
          const bundle = await getProjectBundle(inv.estimate_id);
          const financials = calculateProjectFinancials(bundle);

          setEstimateItems(bundle.estimateItems || []);
          setChangeOrders(bundle.changeOrders || []);
          setOriginalSubtotal(financials.originalEstimateTotal);
          setApprovedChangeTotal(financials.approvedChangeOrderTotal);
          setRevisedTotal(financials.revisedTotal);
          setTotalPaid(financials.amountPaid);
          setRemainingBalance(financials.remainingBalance);

          console.log('[Invoice Detail] Financials calculated:', {
            invoice_number: inv.invoice_number,
            base_total: inv.total,
            approved_cos: financials.approvedChangeOrderTotal,
            revisedTotal: financials.revisedTotal,
            amountPaid: financials.amountPaid,
            remainingBalance: financials.remainingBalance,
          });

          // Use the invoice's actual configured deposit if one was set
          const deposit = inv.deposit_amount > 0 ? inv.deposit_amount : financials.revisedTotal * 0.5;
          setDepositAmount(deposit);

          const fullyPaid = financials.remainingBalance <= 0;
          const overdue = inv.due_date && !fullyPaid && financials.remainingBalance > 0 && new Date(inv.due_date) < new Date();
          setIsFullyPaid(fullyPaid);
          setIsOverdue(overdue);
          setCanLock(fullyPaid && !inv.is_locked);
          setCanUnlock(inv.is_locked === true);
        } catch (err) {
          console.error("Error calculating financials:", err);
          // Fallback if bundle fetch fails
          setEstimateItems([]);
          setChangeOrders([]);
        }
      } else {
        // Invoice with no estimate - use invoice total
        setOriginalSubtotal(inv.total || 0);
        setApprovedChangeTotal(0);
        setRevisedTotal(inv.total || 0);
        setTotalPaid(paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0));
        const remaining = (inv.total || 0) - (paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0));
        setRemainingBalance(remaining);
        setDepositAmount(inv.deposit_amount > 0 ? inv.deposit_amount : (inv.total || 0) * 0.5);
        setIsFullyPaid(remaining <= 0);
        setIsOverdue(inv.due_date && remaining > 0 && new Date(inv.due_date) < new Date());
        setCanLock(remaining <= 0 && !inv.is_locked);
        setCanUnlock(inv.is_locked === true);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading invoice data");
    } finally {
      if (!skipLoading) setLoading(false);
    }
  }

  // Refresh for modal – skip loading state
  const refreshInvoice = () => loadInvoice(true);

  // ----- Lock / Unlock -----
  const toggleLock = async () => {
    if (locking) return;
    setLocking(true);
    try {
      const newLockStatus = !isLocked;
      const { data: { user } } = await supabase.auth.getUser();
      const updateData: any = { is_locked: newLockStatus };
      if (newLockStatus) {
        updateData.locked_at = new Date().toISOString();
        updateData.locked_by = user?.email || user?.id || "unknown";
      } else {
        updateData.locked_at = null;
        updateData.locked_by = null;
      }
      const { error } = await supabase.from("invoices").update(updateData).eq("id", id);
      if (error) throw error;
      await loadInvoice();
      toast.success(newLockStatus ? "Invoice locked" : "Invoice unlocked");
    } catch (err) {
      console.error(err);
      toast.error("Error updating lock status");
    } finally {
      setLocking(false);
    }
  };

  // ----- Record payment -----
  const recordPayment = async (amount: number, method: string) => {
    if (isLocked) {
      toast.error("Invoice is locked. Cannot record payments.");
      return;
    }
    setSavingPayment(true);
    try {
      const companyId = await getCompanyId();
      const { error: paymentError } = await supabase.from("invoice_payments").insert({
        invoice_id: id,
        company_id: companyId,
        amount,
        method,
        created_at: new Date().toISOString(),
      });
      if (paymentError) throw paymentError;

      const newPaid = totalPaid + amount;
      const newRemaining = revisedTotal - newPaid;
      const nowFullyPaid = newRemaining <= 0;
      const updateData: any = {
        amount_paid: newPaid,
        remaining_balance: newRemaining,
        status: nowFullyPaid ? "paid" : "partial",
      };
      if (nowFullyPaid) updateData.paid_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", id);
      if (updateError) {
        // The payment row is already saved at this point — surface the
        // failure loudly rather than reporting success, since the
        // invoice's cached totals are now stale until this is retried.
        throw new Error(`Payment saved, but invoice totals failed to update: ${updateError.message}`);
      }

      await loadInvoice();
      toast.success(`Payment of ${formatCurrency(amount)} recorded`);
      setShowPaymentModal(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error recording payment");
    } finally {
      setSavingPayment(false);
    }
  };

  // ----- Delete payment -----
  const deletePayment = async (paymentId: string) => {
    if (isLocked) {
      toast.error("Invoice is locked. Cannot delete payments.");
      return;
    }
    const paymentToDelete = payments.find(p => p.id === paymentId);
    if (!paymentToDelete) return;
    if (!confirm(`Delete payment of ${formatCurrency(paymentToDelete.amount)}?`)) return;
    setDeletingPaymentId(paymentId);
    try {
      // Use soft delete which triggers automatic invoice update via database trigger
      await deleteCustomerPayment(paymentId);
      await loadInvoice();
      toast.success("Payment deleted");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error deleting payment");
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // Helper for status badge
  const getStatusBadge = () => {
    if (isLocked) return { text: "Locked", color: "bg-slate-100 text-slate-600 border-slate-200" };
    if (isFullyPaid) return { text: "Paid", color: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    if (isOverdue) return { text: "Overdue", color: "bg-rose-50 text-rose-700 border-rose-100" };
    return { text: "Pending", color: "bg-amber-50 text-amber-700 border-amber-100" };
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-slate-50/70 flex items-center justify-center">
          <div className="text-xs font-semibold text-slate-400 font-mono tracking-wider animate-pulse">LOADING INVOICE LEDGER...</div>
        </div>
      </ProtectedRoute>
    );
  }

  const status = getStatusBadge();
  // For display: original subtotal may be zero if no estimate items; fallback to invoice line items sum
  const displaySubtotal = originalSubtotal > 0 ? originalSubtotal : invoiceLineItems.reduce((s, i) => s + (i.total || 0), 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/70 pb-20 text-slate-800 antialiased text-xs">
        {/* Sticky Header (same as before – unchanged) */}
        <div className="sticky top-0 z-50 max-w-3xl mx-auto w-full px-4 pt-3 pb-2 bg-slate-50/95 backdrop-blur-md">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3 flex flex-col gap-2.5 relative overflow-hidden transition-all">
            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="flex items-center gap-2.5 min-w-0">
                <button onClick={() => router.back()} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 border border-slate-100 bg-white shadow-3xs transition-all active:scale-95 shrink-0">
                  <ArrowLeft size={14} />
                </button>
                <div className="min-w-0">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Customer</span>
                  <h3 className="text-xs font-black text-slate-800 tracking-tight truncate">{client?.name || "Unassigned Account"}</h3>
                  {client?.email && <p className="text-[10px] text-slate-400 font-medium truncate hidden sm:block mt-0.5">{client.email}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 min-w-0 justify-self-end w-full max-w-[180px] sm:max-w-none">
                <div className="min-w-0 text-left sm:text-right sm:ml-auto">
                  <div className="flex items-center sm:justify-end gap-1.5 flex-wrap">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Invoice</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border tracking-wide uppercase scale-90 origin-left sm:origin-right ${status.color}`}>
                      {status.text}
                    </span>
                  </div>
                  <p className="text-xs font-bold font-mono text-slate-600 block tracking-tight truncate mt-0.5">
                    #{invoice?.invoice_number || id?.slice(0, 8)}
                  </p>
                  {estimateTitle && (
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{estimateTitle}</p>
                  )}
                </div>
                <div className="shrink-0 flex gap-1.5 items-center">
                  {estimateId && (
                    <Link
                      href={`/expense?project=${estimateId}`}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-200/60 bg-white shadow-3xs transition-all text-[11px] font-bold flex items-center gap-1"
                    >
                      <DollarSign size={13} /><span className="hidden sm:inline">Expenses</span>
                    </Link>
                  )}
                  <button
                    onClick={async () => {
                      const { data: { session } } = await supabase.auth.getSession();
                      window.open(`/api/invoices/${id}/pdf?token=${session?.access_token ?? ""}`, "_blank");
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl border border-slate-200/60 bg-white shadow-3xs transition-all text-[11px] font-bold flex items-center gap-1"
                  >
                    <FileText size={13} /><span className="hidden sm:inline">PDF</span>
                  </button>
                </div>
              </div>
            </div>
            {isLocked ? (
              <div className="mt-0.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0"><Lock size={12} className="text-slate-400 shrink-0" /><p className="text-[11px] font-medium text-slate-500 truncate">Invoice locked {invoice?.locked_by && <span className="text-slate-400">by {invoice.locked_by}</span>}</p></div>
                {canUnlock && <button onClick={toggleLock} disabled={locking} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 shadow-3xs">{locking ? "..." : "Unlock"}</button>}
              </div>
            ) : isFullyPaid ? (
              <div className="mt-0.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0"><AlertCircle size={12} className="text-amber-500 shrink-0" /><p className="text-[11px] font-medium text-amber-800 truncate">Fully paid. Lock to prevent changes.</p></div>
                <button onClick={toggleLock} disabled={locking} className="rounded-lg bg-amber-600 text-white px-2.5 py-1 text-[10px] font-black hover:bg-amber-700">{locking ? "..." : "Lock"}</button>
                <button onClick={() => { setShowFinancialsModal(true); setFabOpen(false); }} className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-3 py-1.5 text-xs shadow-md hover:bg-emerald-500 transition-colors">
                  <DollarSign size={12} /> <span>Project Payments</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 space-y-4">
          {/* Projects (Phase) – unchanged */}
          <div className="space-y-3.5">
            {projects.map((project, index) => (
              <div key={project.id} className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden group">
                <div className="bg-slate-900 text-white px-3.5 py-2 flex items-center justify-between gap-3 shadow-inner">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[9px] font-extrabold text-emerald-400 bg-emerald-950/60 border border-emerald-900/50 px-2 py-0.5 rounded font-mono tracking-tight shrink-0">
                      PHASE {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-xs font-black truncate text-slate-100">{project.name}</h3>
                  </div>
                </div>
                <div className="px-3.5 py-1 divide-y divide-slate-100">
                  {project.line_items?.map((item, itemIdx) => (
                    <div key={item.id} className="py-2 flex justify-between items-center gap-3 transition-all">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[9px] font-mono font-bold text-slate-300 shrink-0">{String(itemIdx + 1).padStart(2, '0')}</span>
                        <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 flex-1">
                          <h4 className="text-[11px] font-bold text-slate-800 capitalize tracking-tight truncate max-w-[120px] sm:max-w-[160px] shrink-0">{item.name}</h4>
                          <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1 shrink-0 mt-0.5 sm:mt-0">
                            <span className="bg-slate-50 border border-slate-100 px-1 rounded text-slate-600 font-bold text-[9px]">{item.quantity} Qty</span>
                            <span className="text-slate-300 font-light">×</span>
                            <span className="font-mono text-slate-400">{formatCurrency(item.unit_price)}</span>
                          </div>
                          {item.description && <span className="text-[10px] text-slate-400 font-medium truncate italic hidden xs:inline-block sm:ml-1">— {item.description}</span>}
                        </div>
                      </div>
                      <div className="text-right text-[11px] font-black font-mono text-slate-900 tracking-tight whitespace-nowrap bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md min-w-[65px] shrink-0">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Original Estimate Items (if any) – styled same as before */}
          {estimateItems.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-emerald-200/60 shadow-md overflow-hidden">
              <div className="relative bg-gradient-to-r from-emerald-50 to-slate-50 border-b border-emerald-100 px-3.5 py-1.5 flex justify-between items-center">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l" />
                <h3 className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1"><span className="text-emerald-600">📋</span> Original Scope Baseline Items</h3>
                <span className="text-[9px] text-emerald-700 font-bold bg-white border border-emerald-200/60 px-2 py-0.5 rounded shadow-sm">{estimateItems.length} Item{estimateItems.length !== 1 && 's'}</span>
              </div>
              <div className="px-3.5 py-1 divide-y divide-slate-100">
                {estimateItems.map((item, idx) => (
                  <div key={item.id || idx} className="py-2 flex justify-between items-center gap-3 hover:bg-emerald-50/20 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[9px] font-mono font-bold text-slate-400 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 flex-1">
                        <h4 className="text-[11px] font-bold text-slate-800 capitalize tracking-tight truncate max-w-[120px] sm:max-w-[160px] shrink-0">{item.name}</h4>
                        <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1 shrink-0 mt-0.5 sm:mt-0">
                          <span className="bg-slate-50 border border-slate-200/50 px-1 rounded text-slate-600 font-bold text-[9px]">{item.quantity || 1} Qty</span>
                          <span className="text-slate-300 font-light">×</span>
                          <span className="font-mono text-slate-500">{formatCurrency(item.unit_price || 0)}</span>
                        </div>
                        {item.description && <span className="text-[10px] text-slate-400 font-medium truncate italic hidden xs:inline-block sm:ml-1">— {item.description}</span>}
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-bold font-mono text-slate-800 tracking-tight whitespace-nowrap bg-slate-100/70 border border-slate-200/60 px-2 py-0.5 rounded-md min-w-[65px] shrink-0">
                      {formatCurrency(item.total || 0)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-emerald-100 bg-gradient-to-r from-emerald-50/60 to-slate-50/60 px-3.5 py-1.5 flex justify-between items-center text-[10px] font-medium">
                <span className="text-emerald-700 font-bold">📊 Subtotal (Original Scope)</span>
                <span className="font-mono font-bold text-slate-800 bg-white/60 px-2 py-0.5 rounded shadow-sm">{formatCurrency(originalSubtotal)}</span>
              </div>
            </div>
          )}

          {/* Invoice Line Items (fallback, if any) */}
          {invoiceLineItems.length > 0 && estimateItems.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200/60 px-3.5 py-1.5 flex justify-between items-center">
                <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Invoice Line Items</h3>
                <span className="text-[9px] text-slate-500 font-bold bg-white border border-slate-200/60 px-2 py-0.5 rounded">{invoiceLineItems.length} Core Items</span>
              </div>
              <div className="px-3.5 py-1 divide-y divide-slate-100">
                {invoiceLineItems.map((item, idx) => (
                  <div key={item.id || idx} className="py-2 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[9px] font-mono font-bold text-slate-300 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 flex-1">
                        <h4 className="text-[11px] font-bold text-slate-800 capitalize tracking-tight truncate max-w-[120px] sm:max-w-[160px] shrink-0">{item.name}</h4>
                        <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1 shrink-0 mt-0.5 sm:mt-0">
                          <span className="bg-slate-50 border border-slate-100 px-1 rounded text-slate-600 font-bold text-[9px]">{item.quantity} Qty</span>
                          <span className="text-slate-300 font-light">×</span>
                          <span className="font-mono text-slate-400">{formatCurrency(item.unit_price)}</span>
                        </div>
                        {item.description && <span className="text-[10px] text-slate-400 font-medium truncate italic hidden xs:inline-block sm:ml-1">— {item.description}</span>}
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-black font-mono text-slate-900 tracking-tight whitespace-nowrap bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md min-w-[65px] shrink-0">
                      {formatCurrency(item.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Change Orders */}
          {changeOrders.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm shadow-blue-50/40 p-4 space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 relative z-10">
                <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" /><h3 className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">Project Scope Variations (Change Orders)</h3></div>
                <span className="text-[9px] text-blue-600 font-bold bg-blue-50 border border-blue-100/60 px-2 py-0.5 rounded">{changeOrders.filter(co => co.status === "approved").length} Applied</span>
              </div>
              <div className="space-y-1 relative z-10">
                {changeOrders.map(co => (
                  <div key={co.id} className={`px-2.5 py-1.5 rounded-xl border flex justify-between items-center gap-3 ${co.status === "approved" ? "border-emerald-100 bg-emerald-50/20" : "border-slate-100 bg-slate-50/40 opacity-60"}`}>
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-[9px] font-mono font-medium text-slate-400 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 shrink-0">{co.change_order_number || "CO"}</span>
                      <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2"><h4 className="text-[11px] font-bold text-slate-800 truncate max-w-[140px] sm:max-w-xs">{co.title}</h4>{co.description && <span className="text-[10px] text-slate-400 truncate italic hidden xs:inline-block">— {co.description}</span>}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[8px] px-1.5 py-0.2 rounded font-extrabold uppercase scale-90 ${co.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{co.status}</span>
                      <span className={`text-[11px] font-black font-mono tracking-tight min-w-[65px] text-right ${co.total_amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {co.total_amount >= 0 ? "+" : ""}{formatCurrency(co.total_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Summary Card – now using correct revisedTotal from estimate items */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md border border-slate-950 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-36 w-36 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
            <div className="flex-1 text-xs space-y-1.5">
              <div className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-1.5 mb-1.5">Summary</div>
              <div className="space-y-1 pr-0 sm:pr-6 font-mono text-slate-400 text-[11px]">
                <div className="flex justify-between"><span>Original Estimate Subtotal:</span><span className="text-slate-200">{formatCurrency(originalSubtotal > 0 ? originalSubtotal : displaySubtotal)}</span></div>
                {approvedChangeTotal !== 0 && <div className="flex justify-between text-blue-400"><span>Approved Change Orders:</span><span>+{formatCurrency(approvedChangeTotal)}</span></div>}
                <div className="flex justify-between border-t border-slate-700 pt-1 mt-1"><span><strong>Revised Total:</strong></span><span className="text-slate-200 font-semibold">{formatCurrency(revisedTotal)}</span></div>
                <div className="flex justify-between"><span>Deposit (50% of Revised Total):</span><span className="text-emerald-300">{formatCurrency(depositAmount)}</span></div>
                {totalPaid > 0 && <div className="flex justify-between text-emerald-400"><span>Payments Received:</span><span>-{formatCurrency(totalPaid)}</span></div>}
              </div>
            </div>
            <div className="text-left sm:text-right border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-5 shrink-0 flex flex-col justify-center min-w-[140px]">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Current Balance Due</span>
              <span className="text-2xl font-black font-mono text-white tracking-tight leading-none block mt-1.5">{formatCurrency(remainingBalance)}</span>
              <span className="text-[8px] text-slate-400 mt-0.5">After deposit + payments</span>
            </div>
          </div>

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200/60 flex justify-between items-center">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Transaction Ledger</span>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200/60 px-1.5 py-0.5 rounded">{payments.length} Payment{payments.length !== 1 && 's'}</span>
              </div>
              <div className="divide-y divide-slate-100 px-3.5">
                {payments.map(p => (
                  <div key={p.id} className="py-2.5 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100/40 shrink-0"><Receipt size={12} /></div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-800 font-mono">{formatCurrency(p.amount)}</div>
                        <div className="text-[10px] font-medium text-slate-400 mt-0.5 capitalize flex items-center gap-1.5"><span>● {p.method}</span><span className="text-slate-200">|</span><span>{new Date(p.created_at).toLocaleDateString()}</span></div>
                      </div>
                    </div>
                    {!isLocked && <button onClick={() => deletePayment(p.id)} disabled={deletingPaymentId === p.id} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-slate-50 rounded-lg disabled:opacity-50">{deletingPaymentId === p.id ? <span className="text-[9px] font-mono">...</span> : <Trash2 size={13} />}</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pay Button */}
          {!isLocked && remainingBalance > 0 && (
            <button onClick={() => setShowReceivedPaymentModal(true)} className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 transition shadow-md shadow-emerald-600/10">
              💰 Receive Payment ({formatCurrency(remainingBalance)})
            </button>
          )}

          {/* Signature */}
          {!isLocked && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <div className="bg-slate-50 px-3.5 py-1.5 border-b border-slate-200/60"><span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Authorized Endorsement</span></div>
              <div className="p-2.5 bg-slate-50/50"><SignaturePad onSave={() => {}} existingSignature={invoice?.signature} buttonText="Apply Binding Signature" /></div>
            </div>
          )}
        </div>

        <PaymentModal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} onSave={recordPayment} remainingBalance={remainingBalance} saving={savingPayment} />

        {/* New Enhanced Received Payment Modal */}
        {invoice && (
          <ReceivedPaymentModal
            isOpen={showReceivedPaymentModal}
            onClose={() => setShowReceivedPaymentModal(false)}
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoice_number || invoice.id.slice(0, 8)}
            clientName={client?.name || "Client"}
            invoiceTotal={revisedTotal}
            remainingBalance={remainingBalance}
            onPaymentRecorded={() => {
              setShowReceivedPaymentModal(false);
              refreshInvoice();
            }}
          />
        )}

        {/* Secondary Modals – render only when estimateId is available */}
        {showFinancialsModal && estimateId && (
          <ProjectFinancialsModal
            isOpen={showFinancialsModal}
            onClose={() => setShowFinancialsModal(false)}
            estimateId={estimateId}
            estimateTotal={invoice?.total || 0}
            onRefresh={refreshInvoice}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}