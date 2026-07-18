import { supabase } from "@/lib/supabase/client";
import type { ProjectBundle } from "@/lib/types";

export interface GenerateInvoiceInput {
  estimateId: string;
  companyId: string;
  clientId: string;
  estimateTotal: number;
  estimateItems: { category: string; total: number }[];
  approvedChangeOrders: { total_amount: number; tax: number; title: string }[];
  revisedTotal: number;
}

/** Generate an invoice from an estimate and its approved change orders.
 * Calculates line items, subtotals, tax, and creates the invoice record. */
export async function generateInvoiceFromEstimate(input: GenerateInvoiceInput): Promise<string> {
  // Calculate totals
  const originalEstimateTotal = input.estimateTotal;
  const approvedChangeOrderTotal = input.approvedChangeOrders.reduce((sum, co) => sum + (co.total_amount || 0), 0);
  const changeOrderTax = input.approvedChangeOrders.reduce((sum, co) => sum + (co.tax || 0), 0);

  // Line items: original estimate line items + approved change orders
  let lineItemsSummary = "Original Estimate: $" + (originalEstimateTotal || 0).toFixed(2);
  if (approvedChangeOrderTotal > 0) {
    lineItemsSummary += "; Approved Change Orders: " + input.approvedChangeOrders.map(co => `${co.title} ($${(co.total_amount || 0).toFixed(2)})`).join(", ");
  }

  // Calculate subtotal (before tax)
  const subtotal = originalEstimateTotal + approvedChangeOrderTotal;
  // Total tax from both estimate and change orders
  const totalTax = changeOrderTax; // Estimate tax is typically already included in the total
  const total = subtotal + totalTax;

  // Create invoice record
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      estimate_id: input.estimateId,
      client_id: input.clientId,
      company_id: input.companyId,
      subtotal,
      tax: totalTax,
      markup: 0,
      discount: 0,
      deposit: 0,
      deposit_amount: 0,
      deposit_paid: false,
      total,
      amount_paid: 0,
      remaining_balance: total,
      payment_status: "pending",
      status: "draft",
      issue_date: new Date().toISOString().split("T")[0],
      notes: lineItemsSummary,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Failed to create invoice");

  return data.id;
}

/** Check if an invoice already exists for an estimate */
export async function invoiceExistsForEstimate(estimateId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id")
    .eq("estimate_id", estimateId)
    .eq("is_deleted", false)
    .limit(1);

  if (error) throw error;
  return (data?.length || 0) > 0;
}
