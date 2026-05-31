"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignaturePadInvoice from "@/components/signature/SignaturePadInvoice";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import { Receipt } from "lucide-react";

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

  // Financial totals
  const [originalSubtotal, setOriginalSubtotal] = useState(0);
  const [approvedTotal, setApprovedTotal] = useState(0);
  const [revisedTotal, setRevisedTotal] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [remainingBalance, setRemainingBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);

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
      alert("Thank you! Your signature has been saved.");
      await loadEstimate();
    } else {
      alert("Error saving signature. Please try again.");
    }
  };

  const removeSignature = async () => {
    try {
      const { error } = await supabase
        .from("estimates")
        .update({ signature: null, status: "pending" })
        .eq("id", id);
      if (error) throw error;
      alert("Signature removed");
      await loadEstimate();
    } catch (err) {
      console.error(err);
      alert("Failed to remove signature");
    }
  };

  const approveChangeOrder = async (coId: string, coAmount: number) => {
    if (!confirm("Approve this change order? The estimate total will be updated.")) return;
    setApproving(true);
    try {
      // Update change order status
      const { error: coError } = await supabase
        .from("change_orders")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", coId);
      if (coError) throw coError;

      // Recalculate approved total
      const { data: approvedCos } = await supabase
        .from("change_orders")
        .select("total_amount")
        .eq("estimate_id", id)
        .eq("status", "approved");
      const newApprovedTotal = (approvedCos || []).reduce((sum, co) => sum + (co.total_amount || 0), 0);
      const newRevisedTotal = originalSubtotal + newApprovedTotal;

      // Update estimate total in database (optional, but keeps consistency)
      await supabase
        .from("estimates")
        .update({ total: newRevisedTotal })
        .eq("id", id);

      // Refresh all data
      await loadEstimate();
      alert("Change order approved! The total has been updated.");
    } catch (err) {
      console.error(err);
      alert("Error approving change order. Please try again.");
    } finally {
      setApproving(false);
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
              <p className="text-slate-900 font-semibold">One Square Roofing</p>
              <p>Charlotte, NC</p>
              <p className="text-slate-400 font-normal">(704) 303-4112</p>
            </div>
            <p className="text-[9px] text-slate-400 pt-1 border-t border-slate-50 font-mono">
              Issued: {formatDate(estimate?.created_at)}
            </p>
          </div>
          <div className="pl-4 space-y-1 flex flex-col justify-between">
            <div>
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">Prepared For</span>
              <h3 className="text-xs font-bold text-slate-900 capitalize tracking-tight mt-0.5">{client?.name || "Customer"}</h3>
              {client?.address && <p className="text-[10px] text-slate-500 leading-tight capitalize">{client.address}</p>}
            </div>
            <div className="text-[10px] text-slate-400 space-y-0.5">
              {client?.phone && <p>📞 {client.phone}</p>}
              {client?.email && <p className="lowercase truncate">✉ {client.email}</p>}
            </div>
          </div>
        </div>

        {/* Project Scope Card */}
        <div className="bg-white rounded-xl border-2 border-slate-900/10 shadow-md overflow-hidden">
          <div className="px-4 py-3 border-b-2 border-slate-100 bg-slate-900 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-[10px] font-extrabold text-white uppercase tracking-wider">Project Scope & Estimate</h3>
            </div>
            <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono font-bold">
              #{estimate?.estimate_number || id?.slice(0, 6)}
            </span>
          </div>
          <div className="p-4 space-y-4">
            {estimate?.description && (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/60 relative">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-slate-400" />
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Project Objective</span>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line capitalize font-medium">
                  {estimate.description}
                </p>
              </div>
            )}
            {items.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Line Items</span>
                  <span className="text-[9px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                    {items.length} Item{items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map((item, idx) => (
                    <div key={item.id} className="bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5 flex justify-between items-center gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[9px] font-mono font-bold text-slate-300 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                        <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 flex-1">
                          <h4 className="text-[11px] font-bold text-slate-800 capitalize truncate">{item.name}</h4>
                          <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                            <span className="bg-slate-50 border border-slate-100 px-1 rounded text-slate-600 font-bold text-[9px]">{item.quantity} Qty</span>
                            <span className="text-slate-300 font-light">×</span>
                            <span className="font-mono text-slate-400">{formatCurrency(item.unit_price)}</span>
                          </div>
                          {item.description && <span className="text-[10px] text-slate-400 truncate italic hidden sm:inline">— {item.description}</span>}
                        </div>
                      </div>
                      <div className="text-right text-[11px] font-black font-mono text-slate-900 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {estimate?.notes && (
              <div className="text-[11px] text-amber-800 bg-amber-50/40 border border-amber-200/70 rounded-lg p-3 flex items-start gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                <div className="flex-1">
                  <span className="font-extrabold text-[9px] uppercase block mb-0.5 tracking-wide text-amber-900">Terms & Notes</span>
                  <p className="font-medium italic">{estimate.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Change Orders Section */}
        {changeOrders.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-blue-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <h3 className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">Scope Variations</h3>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {changeOrders.length} {changeOrders.length === 1 ? 'Order' : 'Orders'}
              </span>
            </div>
            <div className="space-y-2">
              {changeOrders.map((co) => (
                <div key={co.id} className={`p-3 rounded-lg flex justify-between items-center gap-3 border ${
                  co.status === "pending" ? "border-amber-200 bg-amber-50/40" :
                  co.status === "approved" ? "border-emerald-100 bg-emerald-50/20" : "border-slate-100 bg-slate-50/50"
                }`}>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-900 truncate max-w-[180px]">{co.title}</p>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        co.status === "pending" ? "bg-amber-100 text-amber-800" :
                        co.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }`}>{co.status}</span>
                    </div>
                    {co.description && <p className="text-[11px] text-slate-500 line-clamp-1 italic">— {co.description}</p>}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <p className={`text-xs font-black font-mono tracking-tight ${co.total_amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {co.total_amount >= 0 ? "+" : "-"}{formatCurrency(Math.abs(co.total_amount))}
                    </p>
                    {co.status === "pending" && (
                      <button
                        onClick={() => approveChangeOrder(co.id, co.total_amount)}
                        disabled={approving}
                        className="px-2.5 py-1 bg-amber-600 text-white text-[9px] font-bold rounded-md hover:bg-amber-700 disabled:opacity-50"
                      >
                        Approve Change Order
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial Summary */}
<div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm space-y-2.5">
  <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium">
    <span>Original Estimate Subtotal</span>
    <span>{formatCurrency(originalSubtotal)}</span>
  </div>
  {approvedTotal !== 0 && (
    <div className="flex justify-between items-center text-[11px] border-t border-slate-800/80 pt-2 font-medium">
      <span>Approved Change Orders</span>
      <span className="text-emerald-400">+{formatCurrency(approvedTotal)}</span>
    </div>
  )}
  <div className="flex justify-between items-center pt-2 border-t border-slate-800">
    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Revised Total</span>
    <span className="text-base font-black text-white tracking-tight">{formatCurrency(revisedTotal)}</span>
  </div>
  {totalPaid > 0 && (
    <div className="flex justify-between items-center text-[11px] border-t border-slate-800/80 pt-2 font-medium text-emerald-400">
      <span>Payments Received</span>
      <span>-{formatCurrency(totalPaid)}</span>
    </div>
  )}
  {/* HIGHLIGHTED REMAINING BALANCE */}
  <div className="mt-3 pt-1 border-t border-slate-700">
    <div className="flex justify-between items-center bg-amber-500/10 rounded-lg p-2 shadow-inner">
      <span className="text-sm font-black uppercase tracking-wider text-amber-300">Remaining Balance</span>
      <span className="text-xl font-black text-amber-300 tracking-tight drop-shadow-sm">{formatCurrency(remainingBalance)}</span>
    </div>
  </div>
  <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-[11px] font-medium text-slate-400">
    <span>Proposed Deposit (50% of Revised Total)</span>
    <span className="text-emerald-400 font-bold">{formatCurrency(depositAmount)}</span>
  </div>
</div>

        {/* Payment History (only if invoice exists and has payments) */}
        {payments.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Payment History</span>
            </div>
            <div className="divide-y divide-slate-100">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex items-center gap-2">
                  <Receipt size={14} className="text-emerald-500" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">{formatCurrency(p.amount)}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{p.method} • {new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
    </div>
  );
}