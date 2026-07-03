"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignaturePadInvoice from "@/components/signature/SignaturePadInvoice";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import { Receipt } from "lucide-react";
import toast from "react-hot-toast";
import ProgressDisplay from "@/components/progress/ProgressDisplay";

type Signature = { type: "draw" | "type"; value: string; date: string };
type ChangeOrder = {
  id: string;
  change_order_number: string;
  title: string;
  description: string;
  status: string;
  total_amount: number;
  created_at: string;
};
type InvoicePayment = {
  id: string;
  amount: number;
  method: string;
  created_at: string;
};

// ===== Badge component =====
const Badge = ({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "pending" | "approved" | "rejected" }) => {
  const styles = {
    default: "bg-slate-100 text-slate-700",
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${styles[variant]}`}>
      {children}
    </span>
  );
};

export default function PublicEstimatePage() {
  const { id: paramId } = useParams();
  const id = Array.isArray(paramId) ? paramId[0] : paramId;

  // Core data
  const [estimate, setEstimate] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [tracked, setTracked] = useState(false);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [approving, setApproving] = useState(false);
  const [projectsList, setProjectsList] = useState<{ name: string }[]>([]);
  const [progressRefresh, setProgressRefresh] = useState(0);

  // Financial totals
  const [originalSubtotal, setOriginalSubtotal] = useState(0);
  const [approvedTotal, setApprovedTotal] = useState(0);
  const [revisedTotal, setRevisedTotal] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [remainingBalance, setRemainingBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);

  // Modals
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [pendingCoId, setPendingCoId] = useState<string | null>(null);
  const [pendingCoAmount, setPendingCoAmount] = useState<number | null>(null);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [declineCoId, setDeclineCoId] = useState<string | null>(null);

  // Compute pending change orders total
  const pendingTotal = useMemo(() => {
    return changeOrders
      .filter(co => co.status === "pending")
      .reduce((sum, co) => sum + (co.total_amount || 0), 0);
  }, [changeOrders]);

  const projectsWithTotals = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(item => {
      const name = item.project_name || "Main Project";
      const total = item.total || 0;
      map.set(name, (map.get(name) || 0) + total);
    });
    return Array.from(map.entries()).map(([name, total]) => ({ name, total }));
  }, [items]);

  const overallTotal = useMemo(() => {
    return projectsWithTotals.reduce((sum, p) => sum + p.total, 0);
  }, [projectsWithTotals]);

  useEffect(() => {
    if (id) loadEstimate();
  }, [id]);

  // ---- Load estimate ----
  async function loadEstimate() {
    try {
      const { data: est } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", id)
        .single();

      if (est) {
        setEstimate(est);
        setSigned(!!est.signature);
        if (est.signature) setSignature(est.signature);

        const { data: clientData } = await supabase
          .from("clients")
          .select("*")
          .eq("id", est.client_id)
          .single();
        setClient(clientData);

        const { data: itemsData } = await supabase
          .from("estimate_items")
          .select("*")
          .eq("estimate_id", id);
        setItems(itemsData || []);
        const origSum = (itemsData || []).reduce((sum, i) => sum + (i.total || 0), 0);
        setOriginalSubtotal(origSum);

        const { data: cos } = await supabase
          .from("change_orders")
          .select("*")
          .eq("estimate_id", id)
          .neq("status", "draft")
          .order("created_at", { ascending: false });
        setChangeOrders(cos || []);
        const approvedSum = (cos || [])
          .filter(co => co.status === "approved")
          .reduce((sum, co) => sum + (co.total_amount || 0), 0);
        setApprovedTotal(approvedSum);

        const revTotal = origSum + approvedSum;
        setRevisedTotal(revTotal);
        setDepositAmount(revTotal * 0.5);

        const { data: invoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("estimate_id", id)
          .maybeSingle();

        let paymentList: InvoicePayment[] = [];
        let paidSum = 0;
        if (invoice) {
          const { data: pays } = await supabase
            .from("invoice_payments")
            .select("*")
            .eq("invoice_id", invoice.id)
            .order("created_at", { ascending: false });
          paymentList = pays || [];
          paidSum = paymentList.reduce((sum, p) => sum + p.amount, 0);
        }
        setPayments(paymentList);
        setTotalPaid(paidSum);
        setRemainingBalance(revTotal - paidSum);

        if (!tracked) await trackLocation(est);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Track location ----
  async function trackLocation(est: any) {
    try {
      const deviceType = /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? "mobile"
        : "desktop";
      let locationData = null;
      let ip = null;

      try {
        const ipResponse = await fetch("https://ipapi.co/json/");
        const ipInfo = await ipResponse.json();
        ip = ipInfo.ip;
        locationData = {
          ip: ipInfo.ip,
          city: ipInfo.city,
          region: ipInfo.region,
          country: ipInfo.country_name,
          device: deviceType,
          viewed_at: new Date().toISOString(),
        };
      } catch (e) {
        console.log("Could not track location parameters invisibly.");
      }

      if (locationData) {
        const currentLocations = est.view_locations || [];
        const existingLocation = currentLocations.find(
          (loc: any) => loc.city === locationData.city || loc.ip === locationData.ip
        );
        if (!existingLocation) {
          const updatedLocations = [...currentLocations, locationData];
          await supabase
            .from("estimates")
            .update({
              view_locations: updatedLocations,
              unique_locations: updatedLocations.length,
              opened_at: new Date().toISOString(),
              opened_count: (est.opened_count || 0) + 1,
              opened_device: deviceType,
              opened_ip: ip,
            })
            .eq("id", id);
        } else {
          await supabase
            .from("estimates")
            .update({ opened_count: (est.opened_count || 0) + 1 })
            .eq("id", id);
        }
      }
      setTracked(true);
    } catch (err) {
      console.error("Tracking error:", err);
    }
  }

  // ---- Signature functions ----
  const saveSignature = async (newSignature: Signature) => {
    const { error } = await supabase
      .from("estimates")
      .update({ signature: newSignature, status: "approved" })
      .eq("id", id);
    if (!error) {
      setSigned(true);
      setSignature(newSignature);
      toast.success("Thank you! Your signature has been saved.", {
        duration: 3000,
        position: "top-center",
        icon: "✍️",
        style: {
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fbbf24",
          padding: "6px 12px",
          fontSize: "12px",
        },
      });
      await loadEstimate();
    } else {
      toast.error("Error saving signature. Please try again.", {
        duration: 3000,
        position: "top-center",
      });
    }
  };

  const removeSignature = async () => {
    try {
      const { error } = await supabase
        .from("estimates")
        .update({ signature: null, status: "pending" })
        .eq("id", id);
      if (error) throw error;
      toast.success("Signature removed", {
        duration: 3000,
        position: "top-center",
        icon: "🗑️",
        style: {
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fbbf24",
          padding: "6px 12px",
          fontSize: "12px",
        },
      });
      await loadEstimate();
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove signature", {
        duration: 3000,
        position: "top-center",
      });
    }
  };

  // ---- Change Order actions ----
  const approveChangeOrder = (coId: string, coAmount: number) => {
    setPendingCoId(coId);
    setPendingCoAmount(coAmount);
    setShowApproveConfirm(true);
  };

  const confirmApprove = async () => {
    if (!pendingCoId || pendingCoAmount === null) return;
    setShowApproveConfirm(false);
    setApproving(true);
    try {
      const { error: coError } = await supabase
        .from("change_orders")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", pendingCoId);
      if (coError) throw coError;

      const { data: approvedCos } = await supabase
        .from("change_orders")
        .select("total_amount")
        .eq("estimate_id", id)
        .eq("status", "approved");
      const newApprovedTotal = (approvedCos || []).reduce((sum, co) => sum + (co.total_amount || 0), 0);
      const newRevisedTotal = originalSubtotal + newApprovedTotal;

      await supabase
        .from("estimates")
        .update({ total: newRevisedTotal })
        .eq("id", id);

      await loadEstimate();
      toast.success("Change order approved! The total has been updated.", {
        duration: 4000,
        position: "top-right",
        style: {
          background: "#009966",
          color: "#f2f2f2ff",
          border: "1px solid #026343ff",
          padding: "8px 12px",
          fontSize: "12px",
          fontWeight: "500",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        },
      });
    } catch (err) {
      console.error(err);
      toast.error("Error approving change order. Please try again.", {
        duration: 4000,
        position: "top-center",
      });
    } finally {
      setApproving(false);
      setPendingCoId(null);
      setPendingCoAmount(null);
    }
  };

  const rejectChangeOrder = (coId: string) => {
    setDeclineCoId(coId);
    setShowDeclineConfirm(true);
  };

  const confirmDecline = async () => {
    if (!declineCoId) return;
    setShowDeclineConfirm(false);
    try {
      const { error } = await supabase
        .from("change_orders")
        .update({ status: "rejected", rejected_at: new Date().toISOString() })
        .eq("id", declineCoId);
      if (error) throw error;
      toast.success("Change order declined.", {
        duration: 3000,
        position: "top-center",
        style: {
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fbbf24",
          padding: "6px 12px",
          fontSize: "12px",
        },
      });
      await loadEstimate();
    } catch (err: any) {
      console.error("Error declining change order:", err);
      toast.error(err.message || "Error declining change order.");
    } finally {
      setDeclineCoId(null);
    }
  };

  // ---- Loading and error states ----
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-[11px] font-medium text-slate-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm max-w-xs w-full">
          <h1 className="text-xs font-semibold text-slate-900">Estimate Unavailable</h1>
        </div>
      </div>
    );
  }

  // ---- Main render ----
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased pb-16 capitalize">
      {/* Top Banner */}
      <div className={`w-full py-1.5 px-4 text-center text-[10px] font-bold tracking-wide uppercase ${
        signed ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"
      }`}>
        {signed ? "✓ Signed & Approved" : "Review Required — Signature Needed Below"}
      </div>

      <div className="max-w-xl mx-auto px-3 py-4 space-y-3">
        {/* Combined Card: Company & Customer */}
        <div className="bg-white rounded-lg border border-slate-200/60 shadow-sm p-2 grid grid-cols-2 gap-2">
          <div className="pr-2 space-y-0.5">
            <div className="flex items-center gap-1">
              <span className="bg-slate-950 text-white px-1 py-[2px] rounded text-[8px] font-black tracking-wider">
                OSR
              </span>
              <span className="text-[11px] font-bold text-slate-900">Pros</span>
            </div>
            <p className="flex flex-wrap items-center gap-1 text-[9px] font-semibold text-slate-800 leading-tight">
  <span>One Square Roofing LLC</span>
  <span className="text-slate-400">| Issued: {formatDate(estimate?.created_at)}</span>
  
</p>
          </div>
          <div className="pl-2 space-y-0.5">
            <h3 className="text-[11px] font-bold text-slate-900 truncate">
              {client?.name || "Customer"} 
            </h3>
            {client?.address && <p className="text-[9px] text-slate-500 truncate d-flex">{client.address}</p>}
            {/* {client?.email && <p className="text-[8px] text-slate-400 truncate">✉ {client.email}</p>} */}
            <p className="text-slate-500 text-[8px] ">
              #{estimate?.estimate_number || id?.slice(0, 6)}
            </p>
          </div>
        </div>

        {/* Project Scope Card with Connector */}
        <div className="bg-white border border-emerald-600 rounded-xl border-[4px] shadow-sm overflow-hidden">
          {/* HEADER STRIP */}
          <div className="bg-emerald-600 px-4 py-2 flex items-center justify-between">
            <div className="text-white">
              <div className="text-[9px] uppercase tracking-widest opacity-80">Scope & Estimate</div>
              <div className="text-xs font-bold">{estimate?.name || "Project Overview"}</div>
            </div>
            <div className="text-right text-white">
              <div className="text-[9px] uppercase opacity-80">Total</div>
              <div className="text-sm font-black">{formatCurrency(revisedTotal)}</div>
            </div>
          </div>

          <div className="p-4 space-y-5">
            {/* PROGRESS */}
{projectsWithTotals.length > 0 && (
  <div className="bg-slate-50 border border-slate-100 rounded-lg p-1">
    <ProgressDisplay
      estimateId={id as string}
      projects={projectsWithTotals}
      hasPayment={totalPaid > 0}
      paymentNote={formatCurrency(totalPaid)}
      totalPaid={totalPaid}
      overallTotal={overallTotal}
      refreshKey={progressRefresh}
    />
  </div>
)}

            {/* OBJECTIVE + NOTES */}
            {(estimate?.description || estimate?.notes) && (
              <div className="space-y-3">
                {estimate?.description && (
                  <div className="border-l-2 border-amber-400 bg-amber-50/40 rounded-md p-3">
                    <div className="text-[9px] font-black uppercase tracking-wider text-amber-800 mb-1">
                      Project Objective
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-line">
                      {estimate.description}
                    </p>
                  </div>
                )}
                {estimate?.notes && (
                  <div className="border-l-2 border-slate-500 bg-amber-50/40 rounded-md p-3">
                    <div className="text-[9px] font-black uppercase tracking-wider text-amber-800 mb-1">
                      Notes*
                    </div>
                    <p className="text-[11px] text-amber-800 italic">{estimate.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* SCOPE HEADER */}
            <div className="flex items-center justify-between  border-t border-emerald-400 pt-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                Scope Summary
              </div>
              <div className="flex gap-1">
                <span className="text-[8px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-600">
                  {items.length} Items
                </span>
                {changeOrders.length > 0 && (
                  <span className="text-[8px] bg-emerald-100 px-2 py-0.5 rounded-full font-bold text-emerald-700">
                    {changeOrders.length} CO
                  </span>
                )}
              </div>
            </div>

            {/* PROJECTS */}
            <div className="space-y-4 bg-slate">
              {Object.entries(
                items.reduce((acc, item) => {
                  const key = item.project_name || "Uncategorized";
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(item);
                  return acc;
                }, {} as Record<string, typeof items>)
              ).map(([projectName, projectItems]) => {
                const list = projectItems as typeof items;
                const subtotal = list.reduce((sum, i) => sum + i.total, 0);
                return (
                  <div key={projectName} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-900 truncate">
                        {projectName}
                      </span>
                      {/* <span className="text-[10px] font-mono font-bold text-slate-600">
                        {formatCurrency(subtotal)}
                      </span> */}
                    </div>
                    <div className="space-y-0.5">
                      {list.map((item) => (
                        <div key={item.id} className="flex justify-between text-[10px]">
                          <div className="flex items-center gap-1 min-w-0">
                            <div className="w-1 h-1 rounded-full bg-slate-300" />
                            <span className="truncate text-slate-700">{item.name}</span>
                          </div>
                          <span className="font-mono font-semibold text-slate-800">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* CHANGE ORDERS */}
              {changeOrders.length > 0 && (
                <div className="space-y-2 pt-3 bg-slate-50 border-t-slate-300 border-l-5 border-l-emerald-600 pl-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                    Change Orders
                  </div>
                  {changeOrders.map((co) => (
                    <div
                      key={co.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                        co.status === "pending"
                          ? "bg-amber-50 border-amber-100"
                          : co.status === "approved"
                          ? "bg-emerald-50 border-emerald-100"
                          : co.status === "rejected"
                          ? "bg-red-50 border-red-100"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            co.status === "pending"
                              ? "bg-amber-500"
                              : co.status === "approved"
                              ? "bg-emerald-500"
                              : co.status === "rejected"
                              ? "bg-red-500"
                              : "bg-slate-400"
                          }`}
                        />
                        <span className="text-[10px] text-slate-800 font-medium truncate">
                          {co.title}
                        </span>
                        <Badge variant={co.status as any}>{co.status}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-black font-mono ${
                            co.total_amount >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {co.total_amount >= 0 ? "+" : "-"}
                          {formatCurrency(Math.abs(co.total_amount))}
                        </span>
                        {co.status === "pending" && (
                          <>
                            <button
                              onClick={() => approveChangeOrder(co.id, co.total_amount)}
                              className="px-2 py-0.5 text-[8px] font-bold bg-amber-600 text-white rounded hover:bg-amber-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectChangeOrder(co.id)}
                              className="px-2 py-0.5 text-[8px] font-bold bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial Summary Card */}
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md border border-slate-950 flex flex-col gap-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-36 w-36 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex-1 text-xs space-y-1.5">
            <div className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-1.5 mb-1.5 flex justify-between items-center">
              <span>Financial Summary</span>
            </div>
            <div className="space-y-1 font-mono text-slate-400 text-[11px]">
              {!signed && (
                <div className="flex justify-between">
                  <span>{changeOrders.length > 0 ? "Original Estimate Subtotal" : "Current Estimate"}</span>
                  <span className="text-slate-200 font-bold">{formatCurrency(originalSubtotal)}</span>
                </div>
              )}
              {approvedTotal !== 0 && (
                <div className="flex justify-between text-blue-400">
                  <span>Approved Change Orders</span>
                  <span>+{formatCurrency(approvedTotal)}</span>
                </div>
              )}
              {changeOrders.length > 0 && (
                <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
                  <span><strong>Revised Total</strong></span>
                  <span className="text-slate-200 font-semibold">{formatCurrency(revisedTotal)}</span>
                </div>
              )}
              {signed && (
                <div className="flex justify-between">
                  <span>Deposit (50% of Revised Total)</span>
                  <span className="text-emerald-300">{formatCurrency(depositAmount)}</span>
                </div>
              )}
              {totalPaid > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Payments Received</span>
                  <span>-{formatCurrency(totalPaid)}</span>
                </div>
              )}
              {signed && (
                <div className="flex justify-between border-t border-slate-800 pt-1 mt-1 text-sm font-bold">
                  <span>Current Balance Due</span>
                  <span className="text-white">{formatCurrency(remainingBalance)}</span>
                </div>
              )}
              {pendingTotal > 0 && (
                <>
                  <div className="flex justify-between text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded -mx-2">
                    <span>Pending Change Orders</span>
                    <span>+{formatCurrency(pendingTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t border-yellow-700 pt-1 mt-1 text-sm font-bold text-yellow-300 bg-yellow-900/20 px-2 py-1 rounded -mx-2">
                    <span>Potential Balance Due</span>
                    <span>{formatCurrency(remainingBalance + pendingTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          {payments.length > 0 && (
            <>
              <div className="border-t border-slate-700/50 my-2" />
              <div className="space-y-1.5">
                <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider text-right">
                  Payment History
                </div>
                {payments.map((p) => (
                  <div key={p.id} className="flex justify-between items-center text-sm border-b border-slate-700/50 py-1.5 last:border-0">
                    <div className="text-[10px]">
                      {/* <div className="font-medium text-white text-[10px]">Payment</div> */}
                      <div className="text-[10px] text-slate-400 capitalize">
                        {p.method} • {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-slate-400 text-[10px]">
                      {formatCurrency(p.amount)}
                    </div>
                  </div>
                ))}
                {/* <div className="flex justify-between pt-2 border-t border-slate-700 font-bold text-sm">
                  <span className="text-slate-300 text-[10px]">Total Payments</span>
                  <span className="text-emerald-400 text-[10px]">{formatCurrency(totalPaid)}</span>
                </div> */}
              </div>
            </>
          )}
        </div>

        {/* Signature Block */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
          <SignaturePadInvoice
            onSave={saveSignature}
            onRemove={removeSignature}
            existingSignature={estimate?.signature}
            buttonText="Sign & Accept"
            showRemoveButton={true}
            estimateId={id}
            showDetailedBreakdown={false}
          />
        </div>

        <p className="text-center text-[10px] font-medium text-slate-400 pt-2">
          Powered by <a href="https://OSRPros.com" target="_blank" rel="noreferrer" className="text-slate-500 font-bold underline">OSRPros.com</a>
        </p>
      </div>

      {/* SMS Floating Button */}
      <a
        href={`sms:+17043034112?&body=${encodeURIComponent(
          `Hi OSR Pros, I have a question regarding Estimate #${estimate?.estimate_number || id?.slice(0, 6)}:`
        )}`}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 bg-slate-950 text-white font-bold text-[11px] px-3.5 py-2.5 rounded-full shadow-lg"
      >
        <span>💬 Question?</span>
      </a>

      {/* Approve Modal */}
      {showApproveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Approve Change Order?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Approving this change order will update the estimate total. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApproveConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmApprove}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Modal */}
      {showDeclineConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Decline Change Order?</h3>
            <p className="text-sm text-gray-500 mb-4">
              This action cannot be undone. The change order will be marked as declined.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDecline}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}