import { supabase } from "@/lib/supabase/client";
import type { ProjectBundle } from "@/lib/types";
import { filterActive } from '@/lib/queries/softDeleteFilter';

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
  // input.estimateTotal is `estimates.total`, which approveChangeOrder()
  // already keeps current as items + markup/discount/tax + approved
  // change orders (see lib/queries/changeOrders.ts). Do NOT add
  // approvedChangeOrderTotal again here — that used to double-count
  // every change order approved before invoice generation.
  const originalEstimateTotal = input.estimateTotal;
  const approvedChangeOrderTotal = input.approvedChangeOrders.reduce((sum, co) => sum + (co.total_amount || 0), 0);
  const changeOrderTax = input.approvedChangeOrders.reduce((sum, co) => sum + (co.tax || 0), 0);

  // Line items: original estimate line items + approved change orders
  let lineItemsSummary = "Original Estimate: $" + ((originalEstimateTotal - approvedChangeOrderTotal) || 0).toFixed(2);
  if (approvedChangeOrderTotal > 0) {
    lineItemsSummary += "; Approved Change Orders: " + input.approvedChangeOrders.map(co => `${co.title} ($${(co.total_amount || 0).toFixed(2)})`).join(", ");
  }

  // estimateTotal is already change-order-inclusive; only change-order-level
  // tax (not part of the estimate's own tax_rate) is layered on top here.
  const subtotal = originalEstimateTotal;
  const totalTax = changeOrderTax;
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
