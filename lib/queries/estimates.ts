/**
 * Estimate queries with lifecycle status management
 * Single source of truth for estimate filtering and manipulation
 */

import { supabase } from "@/lib/supabase/client";
import type { EstimateRow, EstimateStatus } from "@/lib/types";
import { ACTIVE_ESTIMATE_STATUSES, COMPLETED_ESTIMATE_STATUSES, ARCHIVED_ESTIMATE_STATUSES } from "@/lib/types";
import type { Estimate, Client, LineItem } from "@/types";
import { calculateSubtotal, calculateTax, calculateRevisedTotal } from "@/lib/utils/calculations";
import { generateEstimateNumber } from "@/lib/utils/estimateNumber";

/**
 * Get active estimates (draft, sent, approved, in progress)
 * These are the working estimates shown in the main view
 */
export async function getActiveEstimates(companyId: string) {
  return supabase
    .from("estimates")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .in("status", ACTIVE_ESTIMATE_STATUSES)
    .order("created_at", { ascending: false });
}

/**
 * Get completed estimates (finished projects)
 * These are separated from active to declutter daily workflow
 */
export async function getCompletedEstimates(companyId: string) {
  return supabase
    .from("estimates")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .in("status", COMPLETED_ESTIMATE_STATUSES)
    .order("created_at", { ascending: false });
}

/**
 * Get archived/cancelled estimates
 * Historical records that shouldn't clutter active views
 */
export async function getArchivedEstimates(companyId: string) {
  return supabase
    .from("estimates")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .in("status", ARCHIVED_ESTIMATE_STATUSES)
    .order("created_at", { ascending: false });
}

/**
 * Get all non-deleted estimates regardless of status
 */
export async function getAllEstimates(companyId: string) {
  return supabase
    .from("estimates")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
}

/**
 * Get single estimate by ID
 */
export async function getEstimateById(estimateId: string, companyId: string) {
  return supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .single();
}

/**
 * Check if estimate has financial history (prevent deletion)
 */
export async function estimateHasFinancialHistory(estimateId: string, companyId: string): Promise<boolean> {
  // Check for invoices
  const { count: invoiceCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .eq("is_deleted", false);

  if ((invoiceCount || 0) > 0) return true;

  // Check for expenses
  const { count: expenseCount } = await supabase
    .from("estimate_expenses")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if ((expenseCount || 0) > 0) return true;

  // Check for subcontractor assignments
  const { count: subCount } = await supabase
    .from("estimate_subcontractors")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if ((subCount || 0) > 0) return true;

  // Check for agent assignments
  const { count: agentCount } = await supabase
    .from("estimate_agents")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if ((agentCount || 0) > 0) return true;

  // Check for mileage
  const { count: mileageCount } = await supabase
    .from("mileage_trips")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if ((mileageCount || 0) > 0) return true;

  // Check for change orders
  const { count: coCount } = await supabase
    .from("change_orders")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", estimateId)
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if ((coCount || 0) > 0) return true;

  return false;
}

/**
 * Delete estimate - only allowed if it has no financial history
 */
export async function deleteEstimate(estimateId: string, companyId: string) {
  // Check if estimate has financial history
  const hasHistory = await estimateHasFinancialHistory(estimateId, companyId);

  if (hasHistory) {
    throw new Error("Cannot delete estimate with related financial records. Archive it instead.");
  }

  // Only allow deletion of empty draft estimates
  const { data: estimate, error: fetchError } = await getEstimateById(estimateId, companyId);

  if (fetchError) throw fetchError;
  if (!estimate) throw new Error("Estimate not found");

  // Hard delete is only allowed for empty drafts
  if (estimate.status !== "draft") {
    throw new Error("Only draft estimates can be deleted. Archive other estimates instead.");
  }

  return supabase
    .from("estimates")
    .delete()
    .eq("id", estimateId)
    .eq("company_id", companyId);
}

/**
 * Archive estimate - moves it to archived status instead of deleting
 */
export async function archiveEstimate(estimateId: string, companyId: string) {
  return supabase
    .from("estimates")
    .update({ status: "archived" as EstimateStatus })
    .eq("id", estimateId)
    .eq("company_id", companyId)
    .eq("is_deleted", false);
}

/**
 * Update estimate status
 */
export async function updateEstimateStatus(estimateId: string, companyId: string, status: EstimateStatus) {
  return supabase
    .from("estimates")
    .update({ status })
    .eq("id", estimateId)
    .eq("company_id", companyId)
    .eq("is_deleted", false);
}

/**
 * Transition estimate through lifecycle
 * Handles automatic status updates based on actions
 */
export async function transitionEstimate(
  estimateId: string,
  companyId: string,
  action: "convert_to_invoice" | "mark_in_progress" | "mark_completed" | "cancel"
) {
  const statusMap: Record<typeof action, EstimateStatus> = {
    convert_to_invoice: "converted_to_invoice",
    mark_in_progress: "project_in_progress",
    mark_completed: "completed",
    cancel: "cancelled",
  };

  return updateEstimateStatus(estimateId, companyId, statusMap[action]);
}

// ---------------------------------------------------------------------
// Unified Estimate Form — single load path (edit mode) and single save
// path (create + edit) shared by components/estimates/EstimateForm.tsx
// via lib/hooks/useEstimateForm.ts. Replaces the ad hoc raw Supabase
// calls that used to live independently in app/estimates/create/page.tsx
// and app/estimates/[id]/page.tsx.
// ---------------------------------------------------------------------

export type FormProject = {
  id: string;
  name: string;
  description: string;
  items: LineItem[];
};

export type ChangeOrderLineItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  type: "addition" | "deduction";
};

export type FormChangeOrder = {
  id: string;
  change_order_number: string;
  title: string;
  description: string | null;
  status: "draft" | "pending" | "approved" | "rejected" | "invoiced";
  total_amount: number;
  original_estimate_total: number;
  created_at: string;
  approved_at: string | null;
  lineItems: ChangeOrderLineItem[];
};

export type FormAssignedSubcontractor = {
  id: string;
  subcontractorId: string;
  name: string;
  trade: string | null;
  amount: number;
  notes: string | null;
};

export type FormAssignedAgent = {
  id: string;
  agentId: string;
  name: string;
  amount: number;
  notes: string | null;
};

export type FormPayment = {
  id: string;
  amount: number;
  method: string;
  created_at: string;
};

export type EstimateFormData = {
  estimate: Estimate;
  client: Client | null;
  projects: FormProject[];
  changeOrders: FormChangeOrder[];
  assignedSubcontractors: FormAssignedSubcontractor[];
  assignedAgents: FormAssignedAgent[];
  existingInvoiceId: string | null;
  payments: FormPayment[];
};

function groupItemsIntoProjects(items: any[]): FormProject[] {
  const projectMap: Record<string, FormProject> = {};
  items.forEach((item) => {
    const projectName = item.project_name || "Main Project";
    if (!projectMap[projectName]) {
      projectMap[projectName] = {
        id: crypto.randomUUID(),
        name: projectName,
        description: item.project_description || "",
        items: [],
      };
    }
    projectMap[projectName].items.push(item);
  });
  const projects = Object.values(projectMap);
  return projects.length > 0
    ? projects
    : [{ id: crypto.randomUUID(), name: "", description: "", items: [] }];
}

/**
 * Everything the estimate form needs to populate Edit mode in one call —
 * mirrors what app/estimates/[id]/page.tsx used to fetch across four
 * separate effects (loadEstimate, loadChangeOrders, loadPayments,
 * loadSubcontractorPaid), now a single entry point so both the form and
 * any future consumer load estimates the same way.
 */
export async function getEstimateFormData(
  estimateId: string,
  companyId: string
): Promise<EstimateFormData> {
  const [
    { data: estimate, error: estimateError },
    { data: items, error: itemsError },
    { data: changeOrderRows, error: coError },
    { data: subRows, error: subError },
    { data: agentRows, error: agentError },
    { data: invoiceRow },
  ] = await Promise.all([
    supabase.from("estimates").select("*").eq("id", estimateId).eq("company_id", companyId).is("deleted_at", null).single(),
    supabase.from("estimate_items").select("*").eq("estimate_id", estimateId).eq("company_id", companyId).is("deleted_at", null),
    supabase
      .from("change_orders")
      .select("*")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("estimate_subcontractors")
      .select("id, subcontractor_id, amount, notes, subcontractors(id, name, trade)")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("estimate_agents")
      .select("id, agent_id, amount, notes, agents(id, name)")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase.from("invoices").select("id").eq("estimate_id", estimateId).eq("company_id", companyId).maybeSingle(),
  ]);
  if (estimateError) throw estimateError;
  if (itemsError) throw itemsError;
  if (coError) throw coError;
  if (subError) throw subError;
  if (agentError) throw agentError;

  let client: Client | null = null;
  if (estimate?.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select("*")
      .eq("id", estimate.client_id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .single();
    client = c;
  }

  const changeOrderIds = (changeOrderRows || []).map((co: any) => co.id);
  const { data: lineItemRows } =
    changeOrderIds.length > 0
      ? await supabase
          .from("change_order_line_items")
          .select("*")
          .in("change_order_id", changeOrderIds)
          .eq("company_id", companyId)
          .is("deleted_at", null)
      : { data: [] as any[] };

  const lineItemsByCO: Record<string, ChangeOrderLineItem[]> = {};
  (lineItemRows || []).forEach((li: any) => {
    if (!lineItemsByCO[li.change_order_id]) lineItemsByCO[li.change_order_id] = [];
    lineItemsByCO[li.change_order_id].push({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      total: li.total,
      type: li.type,
    });
  });

  const changeOrders: FormChangeOrder[] = (changeOrderRows || []).map((co: any) => ({
    id: co.id,
    change_order_number: co.change_order_number,
    title: co.title,
    description: co.description,
    status: co.status,
    total_amount: co.total_amount,
    original_estimate_total: co.original_estimate_total,
    created_at: co.created_at,
    approved_at: co.approved_at,
    lineItems: lineItemsByCO[co.id] || [],
  }));

  const assignedSubcontractors: FormAssignedSubcontractor[] = (subRows || []).map((s: any) => ({
    id: s.id,
    subcontractorId: s.subcontractor_id,
    name: s.subcontractors?.name || "Unknown",
    trade: s.subcontractors?.trade ?? null,
    amount: s.amount || 0,
    notes: s.notes,
  }));

  const assignedAgents: FormAssignedAgent[] = (agentRows || []).map((a: any) => ({
    id: a.id,
    agentId: a.agent_id,
    name: a.agents?.name || "Unknown",
    amount: a.amount || 0,
    notes: a.notes,
  }));

  let payments: FormPayment[] = [];
  if (invoiceRow?.id) {
    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("id")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId);
    const invoiceIds = (invoiceRows ?? []).map((inv: any) => inv.id);
    if (invoiceIds.length > 0) {
      const { data: paymentRows } = await supabase
        .from("invoice_payments")
        .select("*")
        .in("invoice_id", invoiceIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      payments = paymentRows || [];
    }
  }

  return {
    estimate: estimate as Estimate,
    client,
    projects: groupItemsIntoProjects(items || []),
    changeOrders,
    assignedSubcontractors,
    assignedAgents,
    existingInvoiceId: invoiceRow?.id ?? null,
    payments,
  };
}

export type SaveEstimateInput = {
  clientId: string;
  title: string;
  description: string;
  notes: string;
  markup: number;
  discount: number;
  taxRate: number;
  depositAmount: number;
  projects: FormProject[];
};

/**
 * The one save path for both modes. Create inserts (via upsert against
 * the id the form pre-generated for the photo-draft-row pattern — see
 * useEstimateForm); Edit updates in place and never touches
 * estimate_number, so it can never regenerate. Both delete+reinsert
 * estimate_items (matching the edit page's existing pattern) — simplest
 * correct approach since no per-item id stability is relied on elsewhere.
 */
export async function saveEstimate(
  input: SaveEstimateInput,
  mode: "create" | "edit",
  companyId: string,
  estimateId: string
): Promise<{ id: string; estimateNumber: string | null }> {
  const allItems = input.projects.flatMap((project) =>
    project.items.map((item) => ({
      ...item,
      project_name: project.name,
      project_description: project.description,
    }))
  );

  const subtotal = calculateSubtotal(allItems);
  const tax = calculateTax(subtotal, input.taxRate);

  // An edit must never silently zero out an already-approved change
  // order's contribution to the total just because line items changed.
  let approvedChangeOrderTotal = 0;
  if (mode === "edit") {
    const { data: approvedCOs, error } = await supabase
      .from("change_orders")
      .select("total_amount")
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId)
      .eq("status", "approved")
      .is("deleted_at", null);
    if (error) throw error;
    approvedChangeOrderTotal = (approvedCOs || []).reduce((sum: number, co: any) => sum + (co.total_amount || 0), 0);
  }

  const total = calculateRevisedTotal(subtotal, input.markup, input.discount, tax, approvedChangeOrderTotal);

  let estimateNumber: string | null = null;

  if (mode === "create") {
    estimateNumber = await generateEstimateNumber();
    const { error } = await supabase.from("estimates").upsert(
      {
        id: estimateId,
        client_id: input.clientId,
        estimate_number: estimateNumber,
        title: input.title || null,
        description: input.description || null,
        notes: input.notes || null,
        markup: input.markup,
        discount: input.discount,
        tax_rate: input.taxRate,
        deposit_amount: input.depositAmount,
        subtotal,
        total,
        status: "pending",
        company_id: companyId,
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("estimates")
      .update({
        client_id: input.clientId,
        title: input.title || null,
        description: input.description || null,
        notes: input.notes || null,
        markup: input.markup,
        discount: input.discount,
        tax_rate: input.taxRate,
        deposit_amount: input.depositAmount,
        subtotal,
        total,
      })
      .eq("id", estimateId)
      .eq("company_id", companyId);
    if (error) throw error;

    const { error: deleteError } = await supabase
      .from("estimate_items")
      .delete()
      .eq("estimate_id", estimateId)
      .eq("company_id", companyId);
    if (deleteError) throw deleteError;
  }

  const itemsToInsert = allItems.map((item) => ({
    estimate_id: estimateId,
    project_name: item.project_name || null,
    project_description: item.project_description || null,
    category: item.category,
    name: item.name,
    description: item.description || null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    taxable: item.taxable,
    total: item.quantity * item.unit_price,
    company_id: companyId,
  }));

  if (itemsToInsert.length > 0) {
    const { error: itemsError } = await supabase.from("estimate_items").insert(itemsToInsert);
    if (itemsError) throw itemsError;
  }

  return { id: estimateId, estimateNumber };
}
