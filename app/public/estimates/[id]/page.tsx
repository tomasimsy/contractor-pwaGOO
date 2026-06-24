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
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [pendingCoId, setPendingCoId] = useState<string | null>(null);
  const [pendingCoAmount, setPendingCoAmount] = useState<number | null>(null);

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

        // Client
        const { data: clientData } = await supabase
          .from("clients")
          .select("*")
          .eq("id", est.client_id)
          .single();
        setClient(clientData);

        // Estimate items
        const { data: itemsData } = await supabase
          .from("estimate_items")
          .select("*")
          .eq("estimate_id", id);
        setItems(itemsData || []);
        const origSum = (itemsData || []).reduce((sum, i) => sum + (i.total || 0), 0);
        setOriginalSubtotal(origSum);

        // Change orders (all, for display)
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

        // Fetch linked invoice and its payments (if any)
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased pb-16">
      {/* Top Banner */}
      <div className={`w-full py-1.5 px-4 text-center text-[10px] font-bold tracking-wide uppercase ${
        signed ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"
      }`}>
        {signed ? "✓ Signed & Approved" : "Review Required — Signature Needed Below"}
      </div>

      <div className="max-w-xl mx-auto px-3 py-4 space-y-3">
        {/* Combined Card: Company & Customer */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 grid grid-cols-2 gap-4 divide-x divide-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="bg-slate-950 text-white px-1 py-0.5 rounded font-black text-[9px] tracking-wider">OSR</span>
              <span className="text-xs font-bold text-slate-950 tracking-tight">Pros</span>
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              <p className="text-slate-900 font-semibold">One Square Roofing LLC</p>
            </div>
            <p className="text-[9px] text-slate-400 pt-1 border-t border-slate-50 font-mono">
              Issued: {formatDate(estimate?.created_at)}
            </p>
          </div>
          <div className="pl-4 space-y-1 flex flex-col justify-between">
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">Prepared For</span>
              <h3 className="text-xs font-bold text-slate-900 capitalize tracking-tight mt-0.5">
                {client?.name || "Customer"}
              </h3>
              {client?.address && <p className="text-[10px] text-slate-500 leading-tight capitalize">{client.address}</p>}
            </div>
            <div className="text-[10px] text-slate-400 space-y-0.5">
              {client?.email && <p className="lowercase truncate">✉ {client.email}</p>}
              #{estimate?.estimate_number || id?.slice(0, 6)}
            </div>
          </div>
        </div>

        {/* Project Scope Card with Connector */}
        <div className="bg-white rounded-xl border-2 border-slate-900/10 shadow-md overflow-hidden relative">
          <div className="px-4 border-b-2 border-slate-100 bg-emerald-600 h-2"></div>
          <div className="relative pl-6 py-4 space-y-6">
            <div className="absolute left-3 top-8 bottom-8 w-px border-l-2 border-dotted border-amber-400 pointer-events-none"></div>

            {estimate?.description && (
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0 z-10 relative" />
                  <span className="text-[9px] font-extrabold text-amber-900 uppercase tracking-wider">
                    Project Objective
                  </span>
                </div>
                <p className="text-xs italic leading-relaxed whitespace-pre-line capitalize font-medium bg-amber-50/40 border border-amber-200/70 rounded-lg p-3 text-amber-800 ml-4">
                  {estimate.description}
                </p>
              </div>
            )}

            {estimate?.notes && (
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0 z-10 relative" />
                  <span className="font-extrabold text-[9px] uppercase tracking-wide text-amber-900">Notes</span>
                </div>
                <div className="text-[11px] text-amber-800 bg-amber-50/40 border border-amber-200/70 rounded-lg p-3 ml-4">
                  <p className="font-medium italic">{estimate.notes}</p>
                </div>
              </div>
            )}

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
        </div>

{/* Scope Summary */}
<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-2.5 space-y-3">

  {/* Header */}
  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-700">
      Scope Summary
    </h3>

    <div className="flex items-center gap-1">
      <span className="text-[8px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
        {items.length} Items
      </span>

      {changeOrders.length > 0 && (
        <span className="text-[8px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
          {changeOrders.length} CO
        </span>
      )}
    </div>
  </div>

  {/* Projects */}
  {(() => {
    const groups = items.reduce((acc, item) => {
      const key = item.project_name || "Uncategorized";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, typeof items>);

    return Object.entries(groups).map(([projectName, projectItems]) => {
      const list = projectItems as typeof items;
      const subtotal = list.reduce((sum, i) => sum + i.total, 0);

      return (
        <div key={projectName} className="space-y-1">

          {/* Project Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#1A434E] truncate">
              {projectName}
            </span>

            <span className="text-[10px] font-mono font-black text-slate-500 shrink-0">
              {formatCurrency(subtotal)}
            </span>
          </div>

          {/* Item Rows */}
          <div className="space-y-0.5">
            {list.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 py-0.5"
              >
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />

                  <span className="text-[10px] text-slate-700 truncate">
                    {item.name}
                  </span>
                </div>

                <span className="text-[10px] font-semibold font-mono text-slate-800 shrink-0">
                  {formatCurrency(item.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    });
  })()}

  {/* Change Orders */}
  {changeOrders.length > 0 && (
    <div className="border-t border-slate-100 pt-2 space-y-1">

      <div className="text-[9px] font-black uppercase tracking-wide text-slate-500 mb-1">
        Change Orders
      </div>

      {changeOrders.map((co) => (
        <div
          key={co.id}
          className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 border transition-colors ${
            co.status === "pending"
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-100"
          }`}
        >
          {/* Left */}
          <div className="flex items-center gap-2 min-w-0 flex-1">

            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                co.status === "pending"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
            />

            <span className="text-[10px] font-medium text-slate-800 truncate">
              {co.title}
            </span>

          </div>

          {/* Right */}
          <div className="flex items-center gap-2 shrink-0">

            <span
              className={`text-[10px] font-black font-mono tracking-tight ${
                co.total_amount >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}
            >
              {co.total_amount >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(co.total_amount))}
            </span>

            {co.status === "pending" && (
              <button
                onClick={() =>
                  approveChangeOrder(co.id, co.total_amount)
                }
                className="
                  px-1.5
                  py-0.5
                  rounded-md
                  bg-amber-600
                  text-white
                  text-[8px]
                  font-bold
                  hover:bg-amber-700
                  transition-colors
                "
              >
                Approve
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )}
</div>

        {/* Combined Financial Summary + Payment History Card */}
<div className="bg-slate-900 text-white rounded-xl p-4 shadow-md border border-slate-950 flex flex-col gap-3 relative overflow-hidden">
  {/* Gradient accent */}
  <div className="absolute top-0 right-0 h-36 w-36 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />

  <div className="flex-1 text-xs space-y-1.5">
    <div className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-1.5 mb-1.5 flex justify-between items-center">
      <span>Financial Summary</span>
    </div>

    <div className="space-y-1 font-mono text-slate-400 text-[11px]">
      {/* Original Subtotal */}
      <div className="flex justify-between">
        <span>Original Estimate Subtotal</span>
        <span className="text-slate-200">{formatCurrency(originalSubtotal)}</span>
      </div>

      {/* Approved Change Orders */}
      {approvedTotal !== 0 && (
        <div className="flex justify-between text-blue-400">
          <span>Approved Change Orders</span>
          <span>+{formatCurrency(approvedTotal)}</span>
        </div>
      )}

      {/* Revised Total (always shown) */}
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
        <span><strong>Revised Total</strong></span>
        <span className="text-slate-200 font-semibold">{formatCurrency(revisedTotal)}</span>
      </div>

      {/* Deposit (always shown) */}
      <div className="flex justify-between">
        <span>Deposit (50% of Revised Total)</span>
        <span className="text-emerald-300">{formatCurrency(depositAmount)}</span>
      </div>

      {/* Payments Received (only if > 0) */}
      {totalPaid > 0 && (
        <div className="flex justify-between text-emerald-400">
          <span>Payments Received</span>
          <span>-{formatCurrency(totalPaid)}</span>
        </div>
      )}

      {/* Current Balance Due (always shown) */}
      <div className="flex justify-between border-t border-slate-800 pt-1 mt-1 text-sm font-bold">
        <span>Current Balance Due</span>
        <span className="text-white">{formatCurrency(remainingBalance)}</span>
      </div>

      {/* Pending Change Orders (yellow, if any) */}
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

  {/* Divider before payment history (only if payments exist) */}
  {payments.length > 0 && (
    <div className="border-t border-slate-700/50 my-2"></div>
  )}

  {/* Payment History (inside same card, dark theme) */}
  {payments.length > 0 && (
    <div className="space-y-1.5">
      <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider text-right">
        Payment History
      </div>
      <div className="space-y-1">
        {payments.map((p) => (
          <div key={p.id} className="flex justify-between items-center text-sm border-b border-slate-700/50 py-1.5 last:border-0">
            <div className="text-[10px]">
              <div className="font-medium text-white text-[10px]">Payment</div>
              <div className="text-[10px] text-slate-400 capitalize">
                {p.method} • {new Date(p.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="font-mono font-bold text-slate-400 text-[10px]">
              {formatCurrency(p.amount)}
            </div>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-slate-700 font-bold text-sm">
          <span className="text-slate-300 text-[10px]">Total Payments</span>
          <span className="text-emerald-400 text-[10px]">{formatCurrency(totalPaid)}</span>
        </div>
      </div>
    </div>
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
      <a href={`sms:+17043034112?&body=${encodeURIComponent(
        `Hi OSR Pros, I have a question regarding Estimate #${estimate?.estimate_number || id?.slice(0, 6)}:`
      )}`}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 bg-slate-950 text-white font-bold text-[11px] px-3.5 py-2.5 rounded-full shadow-lg"
      >
        <span>💬 Question?</span>
      </a>

      {showApproveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Approve Change Order?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Approving this change order will update the estimate total. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowApproveConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button onClick={confirmApprove}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}