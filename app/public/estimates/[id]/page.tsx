"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignaturePadInvoice from "@/components/signature/SignaturePadInvoice";
import { formatCurrency } from "@/lib/utils/formatting";
import Link from "next/link";

type Signature = { type: "draw" | "type"; value: string; date: string };

export default function PublicEstimatePage() {
const { id: paramId } = useParams(); // ← Rename to avoid confusion
  const id = Array.isArray(paramId) ? paramId[0] : paramId;
  const [estimate, setEstimate] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [tracked, setTracked] = useState(false);
 
  useEffect(() => {
    loadEstimate();
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
        
        // Track location if not already tracked for this IP/location
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
      // Get device info
      const deviceType = /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) 
        ? "mobile" 
        : "desktop";
      
      // Get IP and location
      let locationData = null;
      let ip = null;
      
      try {
        // Get IP and location from ipapi.co (free)
        const ipResponse = await fetch('https://ipapi.co/json/');
        const ipInfo = await ipResponse.json();
        ip = ipInfo.ip;
        
        locationData = {
          ip: ipInfo.ip,
          city: ipInfo.city,
          region: ipInfo.region,
          country: ipInfo.country_name,
          country_code: ipInfo.country_code,
          latitude: ipInfo.latitude,
          longitude: ipInfo.longitude,
          device: deviceType,
          viewed_at: new Date().toISOString()
        };
      } catch (e) {
        console.log("Could not fetch location");
      }
      
      if (locationData) {
        // Get existing locations
        const currentLocations = est.view_locations || [];
        
        // Check if this location already exists (same city or same IP)
        const existingLocation = currentLocations.find(
          (loc: any) => loc.city === locationData.city || loc.ip === locationData.ip
        );
        
        if (!existingLocation) {
          // New unique location - add to array
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
          
          console.log("New location tracked:", locationData.city);
        } else {
          // Same location, just update view count
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
        loadEstimate();
        } else {
        alert("Error saving signature. Please try again.");
        }
        };

        useEffect(() => {
        if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
        }
        }, []);

        const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
        const depositAmount = estimate?.deposit_amount || subtotal * 0.5;
        const balanceDue = subtotal - depositAmount;

        if (loading) {
        return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center text-gray-400">Loading estimate...</div>
        </div>
        );
        }

        if (!estimate) {
        return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-2">🔍</div>
            <h1 className="text-lg font-medium text-gray-700">Estimate Not Found</h1>
            <p className="text-gray-400 text-sm mt-2">This link may be invalid or expired.</p>
          </div>
        </div>
        );
        }

const removeSignature = async () => {
  try {
    const { error } = await supabase
      .from("estimates")
      .update({ signature: null })
      .eq("id", id);

    if (error) throw error;

    alert("Signature removed");
    await loadEstimate(); // or whatever refresh function you use
  } catch (err) {
    console.error(err);
    alert("Failed to remove signature");
  }
};

        return (
        <div className="min-h-screen bg-gray-100">
          {/* Header - Dark Blue */}

          <div className="max-w-2xl mx-auto px-2 py-5 space-y-5 pb-28">

            {/* COMPANY + CUSTOMER (SINGLE COMPACT BLOCK) */}
            <div className="bg-green-900 text-white rounded-xl p-3 shadow-sm">

              <div className="grid grid-cols-2 md:grid-cols-2 gap-2 text-gray-300">

                {/* Customer Side */}
                <div className="flex items-start gap-3">
                  <div className="w-1 h-10 bg-green-700 rounded-full"></div>

                  <div>
                    <h2 className="text-lg font-semibold  ">
                      Hello, {client?.name || "Valued Customer"}
                    </h2>

                    <p className="text-[12px]   mt-1 capitalize">
                      {client?.address }
                    </p>

                    {/* <p className="text-[12px] text-green-800 mt-1">
                      Please review and sign below to approve.
                    </p> */}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-300">
                      {client?.phone && <span> {client.phone}</span>}
                      {client?.email && <span> {client.email}</span>}
                    </div>
                  </div>
                </div>

                {/* Company Side */}
                <div className="flex items-start gap-3 md:justify-end md:text-right">

                  <div className="md:order-2 w-1 h-10 bg-green-900 rounded-full"></div>

                  <div className="md:order-1 text-orange-200">
                    <h2 className="text-lg font-semibold ">
                      One Square Roofing LLC
                    </h2>

                    <p className="text-[12px]   mt-1">
                      Insured
                    </p>

                    <div className="text-[10px]   mt-2">
                      Estimate #{estimate?.estimate_number || id?.slice(0, 8)}
                    </div>

                    <div className="text-[10px]  ">
                      {new Date(estimate?.created_at).toLocaleDateString()}
                    </div>
                  </div>

                </div>

              </div>

            </div>

            {/* DESCRIPTION */}
            {(estimate?.description || estimate?.notes) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-5">

              {estimate?.description && (
              <div>
                <h3 className="text-xs font-semibold  leading-relaxed. text-gray-700 mb-2   uppercase">
                  Description
                </h3>

                <div className="text-[11px] rounded-xl capitalize leading-relaxed">
                  <p className="  whitespace-pre-line">
                    {estimate.description}</p>
                  <p>***{estimate.notes}</p>

                </div>
              </div>
              )}

            </div>
            )}

            {/* Items Table */}
            <div className="bg-white rounded-xl overflow-hidden shadow-md border border-gray-200">
  <div className="bg-green-700 px-5 py-3">
    <h3 className="text-sm font-semibold text-white">Estimate Details</h3>
  </div>
  <table className="w-full">
    <thead>
      <tr className="bg-gray-100 border-b border-gray-200">
        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-600 w-[40%]">Item</th>
        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-600 w-[40%]">Description</th>
        <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-600 w-[20%]">Total</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      {items.map((item) => (
        <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
          {/* ITEM NAME */}
          <td className="px-4 py-3 align-top">
            <div className="text-[10px] font-medium text-gray-800 capitalize">
              {item.name}
            </div>
            <div className="text-[9px] text-gray-400 mt-0.5 capitalize">
              {item.quantity} × {formatCurrency(item.unit_price)}
            </div>
          </td>

          {/* DESCRIPTION */}
          <td className="px-4 py-3 align-top">
            {item.description ? (
              <div className="text-[10px] text-gray-600 leading-relaxed">
                {item.description}
              </div>
            ) : (
              <span className="text-[10px] text-gray-400 italic">
                {item.project_name || "No description"}
              </span>
            )}
          </td>

          {/* TOTAL */}
          <td className="px-4 py-3 text-right align-top">
            <div className="text-[11px] font-semibold text-green-700">
              {formatCurrency(item.total)}
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

            {/* Total - Dark Blue with Green Total */}
            <div className="bg-navy rounded-xl p-4 shadow-md">
              <div className="flex justify-between items-center bg-green">
                <span className="text-sm font-medium text-green-900">Total Amount</span>
                <span className="text-md font-bold text-gold text-green-900">{formatCurrency(subtotal)}</span>
              </div>
            </div>

            {/* Deposit (if needed) - Green accent */}
            {depositAmount > 0 && !signed && (
            <div className="bg-green-50 rounded-xl px-5 py-4 border border-green-200 ">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-green-800 font-medium ">Deposit Required (50%)</span>
                <span className="font-bold text-green-900">{formatCurrency(depositAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] mt-2">
                <span className="text-green-700">Balance Due</span>
                <span className="text-green-800 font-medium">{formatCurrency(balanceDue)}</span>
              </div>
            </div>
            )}

            {/* Terms */}
            <div className="text-xs text-gray-500 px-1 text-center">
              <p>✓ Valid for 30 days • 50% deposit required to begin work</p>
            </div>

            {/* Signature */}
            <SignaturePadInvoice
  onSave={saveSignature}
  onRemove={removeSignature}
  existingSignature={estimate?.signature}
  buttonText="Sign & Approve Estimate"
  showRemoveButton={true}
  estimateId={id}
  showDetailedBreakdown={true}
/>

            {/* Footer */}
            <div className="text-center text-[11px] text-gray-400 pt-2">
              One Square Roofing LLC • Charlotte, NC • (704) 303-4112
            </div>
          </div>
        </div>
        );
        }