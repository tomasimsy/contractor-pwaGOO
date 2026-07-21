import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { ChangeOrderRow } from "@/lib/types";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { calculateTax, calculateTotal } from "@/lib/utils/calculations";

/**
 * Change Order CRUD for the Expense page. Mirrors the business rules
 * already enforced in app/estimates/[id]/page.tsx (numbering, status
 * gating, the estimates.total recompute-on-approve formula) rather than
 * the separately-drifted app/api/change-orders/* routes, since the
 * inline page logic is what's actually live today. Deliberately kept
 * independent from that page (not a shared refactor) to avoid touching
 * a large, already-working file for this feature — see the plan's
 * "explicitly out of scope" note.
 */

/**
 * The one formula for "what should this estimate's total be right now,"
 * given its items, markup/discount/tax, and its approved change orders.
 * Mirrors app/estimates/[id]/page.tsx's saveEdit formula exactly (the
 * only place that already got markup/discount/tax right) — previously
 * approveChangeOrder had its own truncated copy that summed items +
 * approved change orders only, silently dropping markup/discount/tax
 * on every approval.
 *
 * Takes the Supabase client as a parameter (defaulting to the
 * client-side singleton) so the same formula can run from a Next.js
 * Route Handler's server-side/cookie-authenticated client too — see
 * app/api/change-orders/[id]/approve/route.ts, which used to carry its
 * own drifted copy of this same formula.
 */
export async function computeRevisedEstimateTotal(
  estimateId: string,
  companyId: string,
  client: SupabaseClient = supabase
): Promise<{ itemsSubtotal: number; approvedChangeOrderTotal: number; revisedTotal: number }> {
  const [{ data: estimate, error: estError }, { data: items, error: itemsError }, { data: approvedCOs, error: coError }] =
    await Promise.all([
      client.from("estimates").select("markup, discount, tax_rate").eq("id", estimateId).eq("company_id", companyId).single(),
      client.from("estimate_items").select("total").eq("estimate_id", estimateId).eq("company_id", companyId).is("deleted_at", null),
      client
        .from("change_orders")
        .select("total_amount")
        .eq("estimate_id", estimateId)
        .eq("company_id", companyId)
        .eq("status", "approved")
        .is("deleted_at", null),
    ]);
  if (estError) throw estError;
  if (itemsError) throw itemsError;
  if (coError) throw coError;

  const itemsSubtotal = (items || []).reduce((sum: number, i: any) => sum + (i.total || 0), 0);
  const approvedChangeOrderTotal = (approvedCOs || []).reduce((sum: number, co: any) => sum + (co.total_amount || 0), 0);
  const tax = calculateTax(itemsSubtotal, (estimate as any)?.tax_rate || 0);
  const originalTotal = calculateTotal(itemsSubtotal, (estimate as any)?.markup || 0, (estimate as any)?.discount || 0, tax);

  return { itemsSubtotal, approvedChangeOrderTotal, revisedTotal: originalTotal + approvedChangeOrderTotal };
}

/**
 * Once an estimate's true total changes (a change order was approved),
 * any already-generated invoice for it needs the same number — its own
 * `total` is a one-time snapshot taken at generation time, never
 * revisited otherwise, which is what let `remaining_balance`/`status`
 * go stale (even negative) in the database the moment a change order
 * was approved after invoicing. Recomputes remaining_balance/status/
 * payment_status the same way trg_update_invoice_payment_totals does,
 * so the two stay consistent no matter which one last touched the row.
 *
 * Takes the Supabase client as a parameter — see
 * computeRevisedEstimateTotal above for why.
 */
export async function cascadeRevisedTotalToInvoices(
  estimateId: string,
  companyId: string,
  newTotal: number,
  client: SupabaseClient = supabase
): Promise<void> {
  const { data: invoices, error } = await client
    .from("invoices")
    .select("id, amount_paid")
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .eq("is_deleted", false);
  if (error) throw error;

  for (const invoice of (invoices || []) as any[]) {
    const amountPaid = invoice.amount_paid || 0;
    const remaining = newTotal - amountPaid;
    const isPaid = amountPaid > 0 && amountPaid >= newTotal;
    const status = amountPaid === 0 ? "pending" : isPaid ? "paid" : "partial";
    const paymentStatus = amountPaid === 0 ? "unpaid" : isPaid ? "paid" : "partial";

    await client
      .from("invoices")
      .update({
        total: newTotal,
        remaining_balance: remaining,
        status,
        payment_status: paymentStatus,
        ...(isPaid ? { paid_at: new Date().toISOString() } : {}),
      })
      .eq("id", invoice.id);
  }
}

export type NewChangeOrderInput = {
  title: string;
  description: string | null;
  amount: number;
  tax: number;
  notes: string | null;
};

export async function createChangeOrder(
  estimateId: string,
  companyId: string,
  input: NewChangeOrderInput
): Promise<ChangeOrderRow> {
  const [{ count }, { data: estimate, error: estimateError }] = await Promise.all([
    supabase
      .from("change_orders")
      .select("id", { count: "exact", head: true })
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase.from("estimates").select("total").eq("id", estimateId).eq("company_id", companyId).single(),
  ]);
  if (estimateError) throw estimateError;

  const changeOrderNumber = `CO-${(count || 0) + 1}`;

  const { data, error } = await supabase
    .from("change_orders")
    .insert({
      estimate_id: estimateId,
      company_id: companyId,
      change_order_number: changeOrderNumber,
      title: input.title,
      description: input.description,
      total_amount: input.amount,
      tax: input.tax,
      notes: input.notes,
      status: "draft",
      original_estimate_total: estimate?.total ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Editable while draft (normal edit) or rejected ("Edit & Resubmit" —
 * editing a rejected change order resets it back to draft so it goes
 * through submit/approve again, matching the estimate page's rule).
 */
export async function updateChangeOrder(
  id: string,
  companyId: string,
  input: NewChangeOrderInput,
  currentStatus: "draft" | "rejected" = "draft"
): Promise<void> {
  const { error } = await supabase
    .from("change_orders")
    .update({
      title: input.title,
      description: input.description,
      total_amount: input.amount,
      tax: input.tax,
      notes: input.notes,
      ...(currentStatus === "rejected" ? { status: "draft" } : {}),
    })
    .eq("id", id)
    .eq("company_id", companyId)
    .in("status", ["draft", "rejected"]);
  if (error) throw error;
}

export async function submitChangeOrder(id: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from("change_orders")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "draft");
  if (error) throw error;
}

/**
 * Approves the change order, then recomputes and writes estimates.total
 * via computeRevisedEstimateTotal (items + markup/discount/tax +
 * approved change orders — the complete formula, not the items-and-COs-
 * only one this used to duplicate), and cascades that total to any
 * already-generated invoice so its remaining_balance/status stay correct
 * instead of going stale against a frozen snapshot.
 */
export async function approveChangeOrder(
  id: string,
  companyId: string,
  estimateId: string
): Promise<void> {
  const { error } = await supabase
    .from("change_orders")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) throw error;

  const { revisedTotal } = await computeRevisedEstimateTotal(estimateId, companyId);

  await supabase
    .from("estimates")
    .update({ total: revisedTotal })
    .eq("id", estimateId)
    .eq("company_id", companyId);

  await cascadeRevisedTotalToInvoices(estimateId, companyId, revisedTotal);
}

export async function rejectChangeOrder(id: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from("change_orders")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) throw error;
}

/** A normal .delete() — the existing trg_soft_delete trigger converts
 * this into a deleted_at/deleted_by update transparently, same as every
 * other soft-deletable table in the app. */
export async function deleteChangeOrder(id: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from("change_orders")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "draft");
  if (error) throw error;
}
