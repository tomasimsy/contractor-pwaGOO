"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function InvoicePage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    convertToInvoice();
  }, [id]);

  async function convertToInvoice() {
    try {
      // Load estimate data
      const { data: estimate, error: estimateError } = await supabase
        .from("estimates")
        .select("*, estimate_items(*), clients(*)")
        .eq("id", id)
        .single();

      if (estimateError || !estimate) {
        console.error("Estimate not found");
        router.push("/estimates");
        return;
      }

      // Check if already converted
      if (estimate.status === "converted") {
        alert("This estimate has already been converted to an invoice");
        router.push(`/invoices/${estimate.invoice_id}`);
        return;
      }

      // Create invoice
      const invoiceNumber = `INV-${Date.now()}`;
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          estimate_id: id,
          client_id: estimate.client_id,
          invoice_number: invoiceNumber,
          description: estimate.description,
          subtotal: estimate.subtotal,
          total: estimate.total,
          notes: estimate.notes,
          status: "pending",
          issue_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        })
        .select()
        .single();

      if (invoiceError || !invoice) {
        console.error("Error creating invoice:", invoiceError);
        alert("Failed to create invoice");
        router.push(`/estimates/${id}`);
        return;
      }

      const invoiceId = invoice.id;

      // Copy items to invoice
      const { data: items } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", id);

      if (items && items.length > 0) {
        const invoiceItems = items.map((i) => ({
          invoice_id: invoiceId,
          project_name: i.project_name,
          category: i.category,
          name: i.name,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          taxable: i.taxable,
          total: i.total,
        }));

        await supabase.from("invoice_items").insert(invoiceItems);
      }

      // Update estimate status
      await supabase
        .from("estimates")
        .update({ status: "converted", invoice_id: invoiceId })
        .eq("id", id);

      alert("Invoice created successfully!");
      router.push(`/invoices/${invoiceId}`);
      
    } catch (error) {
      console.error("Conversion error:", error);
      alert("Error converting to invoice");
      router.push(`/estimates/${id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-lg">Converting to invoice...</div>
        <div className="text-sm text-gray-500 mt-2">Please wait</div>
      </div>
    </div>
  );
}