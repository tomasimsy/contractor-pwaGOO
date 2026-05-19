"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignaturePadInvoice from "@/components/signature/SignaturePadInvoice";
import styles from "@/app/estimates/page.module.css";

const formatCurrency = (amount: number) => {
return new Intl.NumberFormat('en-US', {
style: 'currency',
currency: 'USD',
minimumFractionDigits: 2,
}).format(amount);
};

type Signature = { type: "draw" | "type"; value: string; date: string };

export default function PublicEstimatePage() {
const { id } = useParams();
const [estimate, setEstimate] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
      const [loading, setLoading] = useState(true);
      const [signed, setSigned] = useState(false);
      const [signature, setSignature] = useState<Signature | null>(null);

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
        }
        } catch (err) {
        console.error(err);
        } finally {
        setLoading(false);
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

        return (
        <div className="min-h-screen bg-gray-100">
          {/* Header - Dark Blue */}

          <div className="max-w-2xl mx-auto px-2 py-5 space-y-5 pb-28">

            {/* COMPANY + CUSTOMER (SINGLE COMPACT BLOCK) */}
            <div className="bg-green-900 text-white rounded-xl p-3 shadow-sm">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-300">

                {/* Customer Side */}
                <div className="flex items-start gap-3">
                  <div className="w-1 h-10 bg-green-700 rounded-full"></div>

                  <div>
                    <h2 className="text-lg font-semibold  ">
                      Hello, {client?.name || "Valued Customer"}
                    </h2>

                    <p className="text-[12px]   mt-1 capitalize">
                      {client?.address || "Please update your address"}
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
                      Insured Contractor
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

                <div className="text-[12px] rounded-xl capitalize leading-relaxed">
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
              <div className="bg-navy px-5 py-3 bg-green-900">
                <h3 className="text-sm font-semibold text-white">Estimate Details</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600">Item</th>
                    <th className={`text-left text-sm px-5 py-3 font-semibold text-gray-600 capitalize`}> Description
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">

                    {/* ITEM NAME + META */}
                    <td className="px-5 py-3 align-top ">
                      <div className="text-[11px] font-medium text-slate-800   capitalize ">
                        {item.name}
                      </div>

                      <div className="text-[8px] text-slate-400 mt-0.5 capitalize">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </div>
                    </td>

                    {/* DESCRIPTION */}
                    <td className="px-5 py-3 align-top">
                      <div className="text-[11px] text-slate-500 leading-relaxed capitalize">
                        {item.description || "—"}
                      </div>
                    </td>

                    {/* TOTAL */}
                    <td className="px-5 py-3 text-right align-top">
                      <div className="text-sm font-semibold text-emerald-700">
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
            <div
              className="bg-white rounded-xl p-5 shadow-md border border-gray-200 mt-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Customer Signature
              </h3>

              {signed ? (
              <div
                className="text-center py-6 bg-green-50 rounded-xl border-2 border-green-600 transition-all duration-200 hover:shadow-md hover:bg-green-100/60">

                <div className="text-4xl mb-2">✅</div>

                <div className="text-lg font-bold text-green-700">
                  Signed & Approved!
                </div>

                <div className="text-sm text-green-600 mt-1">
                  Thank you for your business
                </div>

                {signature && (
                <div className="mt-4 text-sm text-gray-600">
                  {signature.type === "type"
                  ? `Signed by: ${signature.value}`
                  : "Electronic signature on file"}

                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(signature.date).toLocaleDateString()}
                  </div>
                </div>
                )}

              </div>
              ) : (
              <>
                <p className="text-xs text-gray-500 mb-4">
                  By signing below, you agree to the terms and conditions above.
                </p>

                <div className="transition-all duration-200 hover:shadow-sm">
                  <SignaturePadInvoice onSave={saveSignature} existingSignature={null}
                    buttonText="Sign & Approve Estimate" />
                </div>
              </>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-[11px] text-gray-400 pt-2">
              One Square Roofing LLC • Charlotte, NC • (704) 303-4112
            </div>
          </div>
        </div>
        );
        }