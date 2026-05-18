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

  // Function to send notification when signed
  const sendSignatureNotification = async () => {
    try {
      // Create notification in database
      await supabase.from("notifications").insert({
        document_type: "estimate",
        document_id: id,
        document_number: estimate?.estimate_number,
        client_name: client?.name,
        status: "signed",
        read: false,
      });

      // Optional: Send email via API
      await fetch("/api/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "estimate_signed",
          clientName: client?.name,
          documentNumber: estimate?.estimate_number,
          documentId: id,
        }),
      });

      // Optional: Browser notification for admin (if they have the page open)
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Document Signed!", {
          body: `${client?.name} has signed Estimate #${estimate?.estimate_number}`,
          icon: "/icons/icon-192.png",
        });
      }
    } catch (err) {
      console.error("Notification error:", err);
    }
  };

const saveSignature = async (newSignature: Signature) => {
  const { error } = await supabase
    .from("estimates")
    .update({ signature: newSignature, status: "approved" })
    .eq("id", id);
  
  if (!error) {
    setSigned(true);
    setSignature(newSignature);
    
    // Send notification
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("📝 Document Signed!", {
        body: `${client?.name || "A client"} signed Estimate #${estimate?.estimate_number}`,
        icon: "/icons/icon-192.png",
        tag: "signature",
        silent: false,
      });
    }
    
    alert("Thank you! Your signature has been saved.");
    loadEstimate();
  } else {
    alert("Error saving signature. Please try again.");
  }
};

  // Request notification permission on load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Group items by project
  const projectMap: Record<string, any[]> = {};
  items.forEach(item => {
    const projectName = item.project_name || "Main Project";
    if (!projectMap[projectName]) {
      projectMap[projectName] = [];
    }
    projectMap[projectName].push(item);
  });

  const projects = Object.entries(projectMap).map(([name, items]) => ({
    name,
    items,
    total: items.reduce((sum, i) => sum + (i.total || 0), 0)
  }));

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
        <p className="text-xs text-gray-300">Issued: {new Date(estimate?.created_at).toLocaleDateString()}</p>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
        {/* Welcome Message */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h2 className="font-semibold text-navy mb-2">Hello, {client?.name || "Valued Customer"}!</h2>
          <p className="text-gray-600 text-sm">
            Please review your estimate below and sign at the bottom to approve.
          </p>
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-2">Customer Information</h3>
          <div className="space-y-1 text-sm">
            <p><span className="font-medium">Name:</span> {client?.name}</p>
            {client?.phone && <p><span className="font-medium">Phone:</span> {client.phone}</p>}
            {client?.email && <p><span className="font-medium">Email:</span> {client.email}</p>}
            {client?.address && <p><span className="font-medium">Address:</span> {client.address}</p>}
          </div>
        </div>

        {/* Description */}
        {estimate?.description && (
          <div className="bg-white rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-navy mb-2">Project Description</h3>
            <p className="text-gray-600">{estimate.description}</p>
          </div>
        )}

        {/* Projects and Items */}
        {projects.map((project) => (
          <div key={project.name} className="bg-white rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-navy mb-3">{project.name}</h3>
            <div className="space-y-2">
              {project.items.map((item) => (
                <div key={item.id} className="flex justify-between border-b pb-2">
                  <div className="flex-1">
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
            <div className="mt-3 pt-2 border-t text-right font-semibold">
              Project Total: {formatCurrency(project.total)}
            </div>
          </div>
        ))}

        {/* Summary */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-3">Estimate Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {estimate?.markup > 0 && (
              <div className="flex justify-between">
                <span>Markup:</span>
                <span>{formatCurrency(estimate.markup)}</span>
              </div>
            )}
            {estimate?.discount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{formatCurrency(estimate.discount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t font-bold">
              <span>Total Estimate:</span>
              <span className="text-gold">{formatCurrency(subtotal)}</span>
            </div>
          </div>
        </div>

        {/* Deposit Info */}
        {depositAmount > 0 && !signed && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <h3 className="font-semibold text-amber-800 mb-2">Deposit & Payment</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Deposit Required (50%):</span>
                <span className="font-bold">{formatCurrency(depositAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Balance Due Upon Completion:</span>
                <span>{formatCurrency(balanceDue)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Terms & Conditions */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-2">Terms & Conditions</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>1. This estimate is valid for 30 days from the date issued.</p>
            <p>2. A 50% deposit is required to begin work. Remaining balance due upon completion.</p>
            <p>3. Any changes or additions to scope must be approved in writing and may incur additional charges.</p>
            <p>4. Client is responsible for providing safe access to work areas.</p>
            <p>5. By signing below, you agree to all terms and conditions stated in this estimate.</p>
            <p className="mt-3 text-xs text-gray-400">One Square Roof LLC is licensed and insured in North Carolina.</p>
          </div>
        </div>

        {/* Signature Section */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-3">Customer Signature</h3>
          
          {signed ? (
            <div className="text-center py-6 bg-green-50 rounded-lg border border-green-200">
              <div className="text-3xl mb-2">✅</div>
              <div className="font-semibold text-green-700">Thank You!</div>
              <div className="text-sm text-green-600 mt-1">This estimate has been signed and approved.</div>
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
            <>
              <p className="text-sm text-gray-500 mb-3">By signing below, you agree to the terms and conditions above.</p>
              <SignaturePad
                onSave={saveSignature}
                existingSignature={null}
                buttonText="Sign & Approve Estimate"
              />
            </>
          )}
        </div>

        {/* Company Footer */}
        <div className="text-center text-xs text-gray-400 py-4 border-t border-gray-200">
          <p>One Square Roof LLC • Charlotte, NC • (704) 303-4112</p>
          <p className="mt-1">onesquareroof@gmail.com</p>
          <p className="mt-2">© {new Date().getFullYear()} One Square Roof LLC. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}