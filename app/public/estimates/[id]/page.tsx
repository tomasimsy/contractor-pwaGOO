"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignaturePad from "@/components/signature/SignaturePad";
import { formatCurrency } from "@/lib/utils/formatting";

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
      // Reload to show signature
      loadEstimate();
    } else {
      alert("Error saving signature. Please try again.");
    }
  };

  const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
  const depositAmount = estimate?.deposit_amount || subtotal * 0.5;
  const balanceDue = subtotal - depositAmount;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading estimate...</div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">🔍</div>
          <h1 className="text-xl font-bold">Estimate Not Found</h1>
          <p className="text-gray-500 mt-2">This estimate may have been removed or the link is invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-navy text-white p-4 text-center">
        <h1 className="text-xl font-bold">One Square Roof LLC</h1>
        <p className="text-sm text-gold mt-1">Licensed & Insured</p>
        <p className="text-xs text-gray-300 mt-2">Estimate #{estimate?.estimate_number || id?.slice(0, 8)}</p>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
        {/* Welcome Message */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h2 className="font-semibold text-navy mb-2">Hello, {client?.name || "Valued Customer"}!</h2>
          <p className="text-gray-600 text-sm">
            Please review your estimate below and sign at the bottom to approve.
          </p>
        </div>

        {/* Description */}
        {estimate?.description && (
          <div className="bg-white rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-navy mb-2">Project Description</h3>
            <p className="text-gray-600">{estimate.description}</p>
          </div>
        )}

        {/* Items */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-3">Estimate Details</h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between border-b pb-2">
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.category}</div>
                  {item.description && (
                    <div className="text-sm text-gray-500">{item.description}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(item.total)}</div>
                  <div className="text-xs text-gray-400">
                    {item.quantity} × {formatCurrency(item.unit_price)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-3 border-t flex justify-between font-bold">
            <span>Total</span>
            <span className="text-gold">{formatCurrency(subtotal)}</span>
          </div>
        </div>

        {/* Deposit Info */}
        {depositAmount > 0 && !signed && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <h3 className="font-semibold text-amber-800 mb-2">Deposit Required</h3>
            <div className="flex justify-between">
              <span>Deposit Amount (50%):</span>
              <span className="font-bold">{formatCurrency(depositAmount)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Balance Due:</span>
              <span>{formatCurrency(balanceDue)}</span>
            </div>
          </div>
        )}

        {/* Signature Section */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-3">Customer Signature</h3>
          
          {signed ? (
            <div className="text-center py-6 bg-green-50 rounded-lg border border-green-200">
              <div className="text-3xl mb-2">✅</div>
              <div className="font-semibold text-green-700">Thank You!</div>
              <div className="text-sm text-green-600 mt-1">This estimate has been signed.</div>
              {signature && (
                <div className="mt-3 text-sm">
                  {signature.type === "type" ? (
                    <div>Signed by: {signature.value}</div>
                  ) : (
                    <div>✓ Electronic signature on file</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Date: {new Date(signature.date).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <SignaturePad
              onSave={saveSignature}
              existingSignature={null}
              buttonText="Sign & Approve Estimate"
            />
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-4">
          <p>One Square Roof LLC • Charlotte, NC • (704) 303-4112</p>
          <p className="mt-1">By signing, you agree to the terms above.</p>
        </div>
      </div>
    </div>
  );
}