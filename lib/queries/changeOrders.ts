import { supabase } from "@/lib/supabase/client";
import type { ChangeOrderRow } from "@/lib/types";

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
 * using the same formula used everywhere else this total is kept in
 * sync (sum of estimate_items.total + sum of approved change_orders.total_amount)
 * — see the identical logic in app/estimates/[id]/page.tsx's
 * approveChangeOrder and app/api/change-orders/[id]/approve/route.ts.
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

  const [{ data: items }, { data: approvedCOs }] = await Promise.all([
    supabase
      .from("estimate_items")
      .select("total")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("change_orders")
      .select("total_amount")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId)
      .eq("status", "approved")
      .is("deleted_at", null),
  ]);
  const newTotal =
    (items || []).reduce((sum, i) => sum + (i.total || 0), 0) +
    (approvedCOs || []).reduce((sum, co) => sum + (co.total_amount || 0), 0);

  await supabase
    .from("estimates")
    .update({ total: newTotal })
    .eq("id", estimateId)
    .eq("company_id", companyId);
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
