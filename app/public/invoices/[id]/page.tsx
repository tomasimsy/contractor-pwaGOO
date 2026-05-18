"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import SignaturePad from "@/components/signature/SignaturePad";
import { formatCurrency } from "@/lib/utils/formatting";
import { Smile, ThumbsUp, FileSignature, BadgeCheck, ShieldCheck } from "lucide-react";

type Signature = { type: "draw" | "type"; value: string; date: string };

export default function PublicInvoicePage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [signature, setSignature] = useState<Signature | null>(null);

  useEffect(() => {
    loadInvoice();
  }, [id]);

  async function loadInvoice() {
    try {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .single();
      
      if (inv) {
        setInvoice(inv);
        setSigned(!!inv.signature);
        if (inv.signature) setSignature(inv.signature);
        
        const { data: clientData } = await supabase
          .from("clients")
          .select("*")
          .eq("id", inv.client_id)
          .single();
        setClient(clientData);
        
        const { data: itemsData } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", id);
        setItems(itemsData || []);
        
        const { data: paymentsData } = await supabase
          .from("invoice_payments")
          .select("*")
          .eq("invoice_id", id)
          .order("created_at", { ascending: false });
        setPayments(paymentsData || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const saveSignature = async (newSignature: Signature) => {
    const { error } = await supabase
      .from("invoices")
      .update({ signature: newSignature, status: "signed" })
      .eq("id", id);
    
    if (!error) {
      setSigned(true);
      setSignature(newSignature);
      alert("Thank you! Your signature has been saved.");
      loadInvoice();
    } else {
      alert("Error saving signature. Please try again.");
    }
  };

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
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = (invoice?.total || subtotal) - totalPaid;
  const isPaid = remainingBalance === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading invoice...</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">🔍</div>
          <h1 className="text-xl font-bold">Invoice Not Found</h1>
          <p className="text-gray-500 mt-2">This invoice may have been removed or the link is invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary text-white p-4 text-center">
        <h1 className="text-xl font-bold">One Square Roofing LLC</h1>
        <p className="text-sm text-gold mt-1">Licensed & Insured</p>
        <p className="text-xs text-gray-300 mt-2">Invoice #{invoice?.invoice_number || id?.slice(0, 8)}</p>
        <p className="text-xs text-gray-300">Date: {new Date(invoice?.created_at).toLocaleDateString()}</p>
        {invoice?.due_date && (
          <p className="text-xs text-gray-300">Due: {new Date(invoice.due_date).toLocaleDateString()}</p>
        )}
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
        {/* Welcome Message */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h2 className="font-semibold text-navy mb-2">Hello, {client?.name || "Valued Customer"}!</h2>
          <p className="text-gray-600 text-sm">
            Please review your invoice below. You can sign to confirm.
          </p>
        </div>

        {/* Customer Information */}
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
        {invoice?.description && (
          <div className="bg-white rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-navy mb-2">Description</h3>
            <p className="text-gray-600">{invoice.description}</p>
          </div>
        )}

        {/* Projects and Items */}
        {projects.map((project) => (
          <div key={project.name} className="bg-white rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-navy mb-3">{project.name}</h3>
            <div className="space-y-3">
              {project.items.map((item) => (
                <div key={item.id} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.category}</div>
                      {item.description && (
                        <div className="text-sm text-gray-500 mt-1">{item.description}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(item.total)}</div>
                      <div className="text-xs text-gray-400">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </div>
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

        {/* Financial Summary */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-3">Financial Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {invoice?.markup > 0 && (
              <div className="flex justify-between">
                <span>Markup:</span>
                <span>{formatCurrency(invoice.markup)}</span>
              </div>
            )}
            {invoice?.discount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{formatCurrency(invoice.discount)}</span>
              </div>
            )}
            {invoice?.tax > 0 && (
              <div className="flex justify-between">
                <span>Tax:</span>
                <span>{formatCurrency(invoice.tax)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t font-bold">
              <span>Total Amount:</span>
              <span className="text-gold">{formatCurrency(invoice?.total || subtotal)}</span>
            </div>
            
            {totalPaid > 0 && (
              <>
                <div className="flex justify-between text-green-600">
                  <span>Amount Paid:</span>
                  <span>-{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Balance Due:</span>
                  <span className={isPaid ? "text-green-600" : "text-gold"}>
                    {formatCurrency(remainingBalance)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-navy mb-3">Payment History</h3>
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="flex justify-between border-b pb-2 text-sm">
                  <div>
                    <span className="font-medium">{formatCurrency(payment.amount)}</span>
                    <span className="text-gray-500 ml-2 capitalize">({payment.method})</span>
                  </div>
                  <div className="text-gray-500">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {isPaid && (
                <div className="mt-2 text-center text-green-600 font-semibold text-sm">
                  ✓ This invoice has been paid in full
                </div>
              )}
            </div>
          </div>
        )}

        {/* Signature Section */}
        <div className="bg-white rounded-xl p-4 shadow-md">
          <h3 className="font-semibold text-navy mb-3">Customer Signature</h3>
          
          {signed ? (
            <div className="text-center py-6 bg-green-50 rounded-lg border border-green-200">
              <div className="flex justify-center">
                <Smile className="w-12 h-12 text-green-500 mb-2" strokeWidth={1.5} />
              </div>
              <div className="font-semibold text-green-700">Thank You!</div>
              <div className="text-sm text-green-600 mt-1">This invoice has been signed.</div>
              {signature && (
                <div className="mt-3 text-sm">
                  {signature.type === "type" ? (
                    <div>Signed by: {signature.value}</div>
                  ) : (
                    <div>✓ Electronic signature on file</div>
                  )}
                  {/* <div className="text-xs text-gray-500 mt-1">
                    Date: {new Date(signature.date).toLocaleDateString()}
                  </div> */}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">By signing below, you confirm the information above.</p>
              <SignaturePad
                onSave={saveSignature}
                existingSignature={null}
                buttonText="Sign Invoice"
              />
            </>
          )}
        </div>

        {/* Terms & Footer */}
        <div className="text-center text-xs text-gray-400 py-4 border-t border-gray-200">
          <p>One Square Roof LLC • Charlotte, NC • (704) 303-4112</p>
          <p className="mt-1">onesquareroof@gmail.com</p>
          <p className="mt-2">Thank you for your business!</p>
        </div>
      </div>
    </div>
  );
}