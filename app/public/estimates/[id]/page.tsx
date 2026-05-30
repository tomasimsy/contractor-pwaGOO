"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignaturePadInvoice from "@/components/signature/SignaturePadInvoice";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";

type Signature = { type: "draw" | "type"; value: string; date: string };

export default function PublicEstimatePage() {
  const { id: paramId } = useParams();
  const id = Array.isArray(paramId) ? paramId[0] : paramId;

  const [estimate, setEstimate] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [tracked, setTracked] = useState(false);

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

        if (!tracked) {
          await trackLocation(est);
        }
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
            .update({
              opened_count: (est.opened_count || 0) + 1,
            })
            .eq("id", id);
        }
      }
      setTracked(true);
    } catch (err) {
      console.error("Tracking runtime execution catch boundary block:", err);
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
      loadEstimate();
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

  const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
  const depositAmount = estimate?.deposit_amount || subtotal * 0.5;
  const balanceDue = subtotal - depositAmount;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-sm font-medium text-slate-400">Loading proposal layout details...</div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="text-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm max-w-sm">
          <div className="text-2xl mb-2">📋</div>
          <h1 className="text-sm font-semibold text-slate-800">Estimate Unavailable</h1>
          <p className="text-slate-400 text-xs mt-1">This link might be broken or expired.</p>
        </div>
      </div>
    );
  }

  return (
    
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased pb-24">
      {/* Dynamic Upper Header Status Banner */}
      <div className={`w-full py-1.5 px-4 text-center text-xs font-semibold ${
        signed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700 animate-pulse"
      }`}>
        {signed ? "✓ Approved & Signed Estimate" : "● Review Requested — Signature Needed Below"}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        
        {/* Company Identity and Branding Header */}
<div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-2 gap-3">
  {/* Left Column: Company Profile */}
  <div className="min-w-0">
    <div className="flex items-center gap-1">
      <span className="bg-slate-900 text-white px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide">OSR</span>
      <span className="text-xs font-bold text-slate-900 tracking-tight">Pros</span>
    </div>
    <p className="text-[10px] text-slate-400 mt-1 font-medium truncate">One Square Roofing LLC</p>
    <p className="text-[9px] text-slate-400 leading-tight">Charlotte, NC<br />(704) 303-4112</p>
  </div>

  {/* Right Column: Estimate Metadata */}
  <div className="text-right min-w-0">
    <span className="text-[9px] uppercase font-semibold text-slate-400 tracking-wider block">Proposal Invoice</span>
    <h2 className="text-xs font-bold text-slate-900 mt-0.5 truncate">
      #{estimate?.estimate_number || id?.slice(0, 6)}
    </h2>
    <p className="text-[9px] text-slate-400 mt-0.5">Issued: {formatDate(estimate?.created_at)}</p>
  </div>
</div>

        {/* Client Address & Info Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-2 gap-3 items-start">
        {/* Left Column: Client Identity details */}
        <div className="min-w-0">
          <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Prepared For</span>
          <h3 className="text-xs font-bold text-slate-900 capitalize truncate">{client?.name || "Valued Customer"}</h3>
          {client?.address && (
            <p className="text-[10px] text-slate-500 mt-0.5 capitalize leading-tight line-clamp-2">
              {client.address}
            </p>
          )}
        </div>

        {/* Right Column: Interactive Quick Contact Nodes */}
        <div className="text-right min-w-0 space-y-1 pt-4">
          {client?.phone && (
            <p className="text-[10px] text-slate-500 font-medium truncate">
              <span className="text-slate-400 mr-1 text-[9px]">📞</span>{client.phone}
            </p>
          )}
          {client?.email && (
            <p className="text-[10px] text-slate-500 font-medium truncate lowercase">
              <span className="text-slate-400 mr-1 text-[9px]">✉</span>{client.email}
            </p>
          )}
        </div>
      </div>

        {/* MASTER WORK SCOPE MATRIX TIMELINE CONTAINER */}
      {/* DISTINCTIVE MASTER WORK SCOPE MATRIX CONTAINER */}
      <div className="bg-gradient-to-b from-white to-slate-50/50 rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100/40 overflow-hidden">
        
        {/* Distinctive Header Block with a crisp top accent line */}
        <div className="px-5 py-4 border-b border-slate-100 bg-white flex justify-between items-center relative">
          {/* High-visibility green indicator bar on the left frame edge */}
          <div className="absolute top-0 bottom-0 left-0 w-1 bg-emerald-500" />
          
          <div className="space-y-0.5 pl-1">
            <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Project Charter</span>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">Scope & Investment Breakdown</h3>
          </div>
          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full font-bold">
            {items.length} Phase{items.length === 1 ? '' : 's'} Ready
          </span>
        </div>

        <div className="p-5 relative">
          
          {/* Solid High-Contrast Emerald Timeline Stringer Thread */}
          <div className="absolute top-7 bottom-7 left-[27px] w-0.5 bg-emerald-100 z-0 pointer-events-none" />

          <div className="space-y-6 relative z-10">
            
            {/* PHASE 1: THE PROJECT SCOPE (Distinctive Elevated Summary Card) */}
            {estimate?.description && (
              <div className="flex gap-4 items-start">
                {/* Active Status Ring Node */}
                <div className="w-4 h-4 rounded-full border-4 border-emerald-500 bg-white flex-shrink-0 mt-0.5 ring-4 ring-emerald-50 shadow-sm" />
                
                <div className="space-y-1.5 flex-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    01. Objectives & Summary
                  </span>
                  {/* Elevated visual callout frame just for the scope text */}
                  <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-xl p-3.5 shadow-sm shadow-emerald-600/[0.02]">
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line capitalize font-medium">
                      {estimate.description}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PHASE 2: ITEM DETAILS (THE ACTION) */}
            {items.length > 0 && (
              <div className="flex gap-4 items-start">
                <div className="w-4 h-4 rounded-full border-2 border-emerald-500 bg-white flex-shrink-0 mt-1 ring-4 ring-emerald-50" />
                
                <div className="space-y-3 flex-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    02. Line Itemized Execution
                  </span>

                  <div className="space-y-2">
                    {items.map((item) => (
                      <div 
                        key={item.id} 
                        className="bg-white border border-slate-100 rounded-xl p-3 flex justify-between items-start gap-4 hover:border-slate-200 hover:shadow-sm transition-all duration-200"
                      >
                        <div className="space-y-1 max-w-[75%]">
                          <h4 className="text-xs font-bold text-slate-800 capitalize">
                            {item.name}
                          </h4>
                          {item.description ? (
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              {item.description}
                            </p>
                          ) : item.project_name ? (
                            <p className="text-[11px] text-slate-400 italic">
                              {item.project_name}
                            </p>
                          ) : null}
                          
                          <div className="inline-block bg-slate-50 border border-slate-100/70 text-slate-500 text-[10px] px-1.5 py-0.5 rounded font-medium">
                            {item.quantity} × {formatCurrency(item.unit_price)}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-900">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PHASE 3: ADDITIONAL NOTES */}
            {estimate?.notes && (
              <div className="flex gap-4 items-start">
                <div className="w-4 h-4 rounded-full border-2 border-emerald-500 bg-white flex-shrink-0 mt-0.5 ring-4 ring-emerald-50" />
                
                <div className="space-y-1.5 flex-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    03. Stipulations & Addendums
                  </span>
                  <div className="bg-amber-50/40 border border-amber-100/60 rounded-xl p-3 text-xs text-slate-600 leading-relaxed whitespace-pre-line capitalize italic">
                    {estimate.notes}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

        {/* Financial Aggregation Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md space-y-3.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400 font-medium">Project Total Investment</span>
            <span className="text-lg font-bold tracking-tight">{formatCurrency(subtotal)}</span>
          </div>

          {depositAmount > 0 && !signed && (
            <div className="space-y-2 pt-3 border-t border-slate-800 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Upfront Deposit Required (50%)</span>
                <span className="font-semibold text-emerald-400">{formatCurrency(depositAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500">Remaining Balance Due Upon Completion</span>
                <span className="text-slate-400 font-medium">{formatCurrency(balanceDue)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Valid Term Indicator */}
        <p className="text-[10px] text-slate-400 text-center font-medium">
          ✓ Proposal valid for 30 days • 50% deposit initialized allocation workflow schedules
        </p>

        {/* Signature Interactive Client Interaction Pad Section */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <SignaturePadInvoice 
            onSave={saveSignature} 
            onRemove={removeSignature}
            existingSignature={estimate?.signature} 
            buttonText="Sign & Approve Proposal" 
            showRemoveButton={true}
            estimateId={id} 
            showDetailedBreakdown={false} 
          />
        </div>

        {/* Footer Brand Verification Attribution */}
        <div className="text-center pt-4 space-y-2">
          <div className="text-[11px] font-medium text-slate-400">
            Thank you for your business! Secure portal powered by{" "}
            <a href="https://OSRPros.com" target="_blank" rel="noopener noreferrer" className="text-slate-600 font-semibold underline underline-offset-2 hover:text-slate-900 transition">
              OSRPros.com
            </a>
          </div>
        </div>

      </div>

      {/* FLOATING ACTION TEXT/SMS BUTTON FOR QUICK ASSISTANCE */}
<a 
  href={`sms:+17043034112?&body=${encodeURIComponent(
    `Hi OSR Pros, I have a question regarding Estimate #${estimate?.estimate_number || id?.slice(0, 6)}:`
  )}`}
  className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-full shadow-xl hover:bg-emerald-700 active:scale-95 transition-all duration-200 group border border-emerald-500/20"
>
  {/* Modern dynamic message bubble icon */}
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className="w-4 h-4 animate-pulse group-hover:scale-110 transition-transform"
  >
    <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97ZM6.75 8.25a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-6Z" clipRule="evenodd" />
  </svg>
  
  <span>Question about this quote?</span>
</a>
    </div>
  );
}