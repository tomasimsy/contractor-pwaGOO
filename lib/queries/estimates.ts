/**
 * Estimate queries with lifecycle status management
 * Single source of truth for estimate filtering and manipulation
 */

import { supabase } from "@/lib/supabase/client";
import type { EstimateRow, EstimateStatus } from "@/lib/types";
import { ACTIVE_ESTIMATE_STATUSES, COMPLETED_ESTIMATE_STATUSES, ARCHIVED_ESTIMATE_STATUSES } from "@/lib/types";

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
