/**
 * Real Supabase-backed ChangeOrderService — implements the EXISTING
 * ChangeOrderService interface (lib/services/changeOrderService.ts)
 * against the real, live `change_orders` + `change_order_line_items`
 * tables (same shared Supabase project as contractor-pwa, whose
 * lib/queries/changeOrders.ts these tables and columns come from —
 * no new tables, no parallel schema).
 *
 * Financial rule enforcement: this service NEVER writes to
 * `estimates.total` or `projects` on approve/reject — an estimate's
 * "revised total" and a project's revenue are always DERIVED reads
 * (EstimateService callers / FinancialEngine.getProjectFinancials,
 * which already sums `listApprovedChangeOrders` — see that file's
 * revisedTotal formula, unchanged by this pass). Only an APPROVED
 * change order contributes; pending/rejected ones are excluded simply
 * by never appearing in listApprovedChangeOrders' filter.
 *
 * Every mutation below that touches a change order tied to an
 * estimate also calls estimateService.recalculateTotal(estimateId)
 * afterward — not because THIS service's formula ever includes change
 * orders (it never does), but as a self-healing step against legacy
 * contamination: contractor-pwa's ORIGINAL app cascaded an approved
 * change order's amount directly into estimates.total (the exact
 * anti-pattern this rebuild avoids), and that legacy behavior is still
 * live in real production data — found live: estimate 706de637's total
 * was $1,700 higher than its own subtotal because an old, pre-rebuild
 * change order approval had baked its amount into estimates.total back
 * on 2026-06-23, and deleting that change order today (correctly,
 * under THIS service's rules) had no way to undo a write THIS service
 * never made. Recalculating from current line items on every change-
 * order mutation self-heals any estimate carrying that stale
 * contamination, going forward, without needing a one-off data repair
 * per row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChangeOrder, ChangeOrderLineItem, ChangeOrderService } from "../changeOrderService";
import type { UUID, ChangeOrderStatus, ValidationResult } from "../types";
import type { ValidationService } from "../validationService";
import type { AuditService } from "../auditService";
import type { ProjectService } from "../projectService";
import type { EstimateService } from "../estimateService";
import type { TransactionService } from "../transactionService";
import { calculateChangeOrderRevenue } from "../financialCalculations";

interface ChangeOrderRow {
  id: string;
  company_id: string;
  project_id: string;
  estimate_id: string;
  change_order_number: string;
  title: string;
  description: string | null;
  status: string;
  total_amount: number;
  tax: number;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

interface ChangeOrderLineItemRow {
  id: string;
  change_order_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  type: string;
}

function rowToChangeOrder(row: ChangeOrderRow): ChangeOrder {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    estimateId: row.estimate_id,
    changeOrderNumber: row.change_order_number,
    title: row.title,
    description: row.description,
    status: row.status as ChangeOrderStatus,
    totalAmount: row.total_amount,
    tax: row.tax,
    approvedAt: row.approved_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

function rowToLineItem(row: ChangeOrderLineItemRow): ChangeOrderLineItem {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    total: row.total,
    type: row.type as ChangeOrderLineItem["type"],
  };
}

/** Signed sum: additions add, deductions subtract — the ONE formula for
 * deriving a flat totalAmount from an itemized breakdown, reused
 * identically by createChangeOrder and update rather than each having
 * its own copy. */
function sumLineItems(lineItems: Omit<ChangeOrderLineItem, "id" | "total">[]): number {
  return lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + (item.type === "addition" ? lineTotal : -lineTotal);
  }, 0);
}

export function createSupabaseChangeOrderService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  auditService: AuditService,
  transactionService: TransactionService,
  currentUserId: () => Promise<UUID | null>,
  projectService: ProjectService,
  estimateService: EstimateService
): ChangeOrderService {
  async function assertEstimateAndProjectOwnership(estimateId: UUID, projectId: UUID, companyId: UUID) {
    const project = await projectService.getById(projectId);
    if (!project) throw new Error("Project not found.");
    const projectOwnership = validationService.validateCompanyOwnership({ payloadCompanyId: project.companyId, sessionCompanyId: companyId });
    if (!projectOwnership.valid) throw new Error(projectOwnership.issues[0]?.message ?? "This project does not belong to your company.");

    const estimate = await estimateService.getById(estimateId);
    if (!estimate) throw new Error("Estimate not found.");
    const estimateOwnership = validationService.validateCompanyOwnership({ payloadCompanyId: estimate.companyId, sessionCompanyId: companyId });
    if (!estimateOwnership.valid) throw new Error(estimateOwnership.issues[0]?.message ?? "This estimate does not belong to your company.");
    if (estimate.projectId !== projectId) throw new Error("This estimate does not belong to the selected project.");
    return estimate;
  }

  async function getById(changeOrderId: UUID): Promise<(ChangeOrder & { lineItems: ChangeOrderLineItem[] }) | null> {
    const { data: row, error } = await supabase.from("change_orders").select("*").eq("id", changeOrderId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Failed to load change order: ${error.message}`);
    if (!row) return null;

    const { data: itemRows, error: itemsError } = await supabase.from("change_order_line_items").select("*").eq("change_order_id", changeOrderId);
    if (itemsError) throw new Error(`Failed to load change order line items: ${itemsError.message}`);

    return { ...rowToChangeOrder(row as ChangeOrderRow), lineItems: (itemRows as ChangeOrderLineItemRow[]).map(rowToLineItem) };
  }

  async function listForProject(projectId: UUID): Promise<ChangeOrder[]> {
    const { data, error } = await supabase.from("change_orders").select("*").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list change orders: ${error.message}`);
    return (data as ChangeOrderRow[]).map(rowToChangeOrder);
  }

  async function listForEstimate(estimateId: UUID): Promise<ChangeOrder[]> {
    const { data, error } = await supabase.from("change_orders").select("*").eq("estimate_id", estimateId).is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list change orders: ${error.message}`);
    return (data as ChangeOrderRow[]).map(rowToChangeOrder);
  }

  async function createChangeOrder(input: {
    companyId: UUID;
    projectId: UUID;
    estimateId: UUID;
    changeOrderNumber: string;
    title: string;
    description?: string | null;
    lineItems?: Omit<ChangeOrderLineItem, "id" | "total">[];
    totalAmount: number;
    tax: number;
  }): Promise<ChangeOrder> {
    const estimate = await assertEstimateAndProjectOwnership(input.estimateId, input.projectId, input.companyId);

    if (input.lineItems) {
      for (const li of input.lineItems) {
        const check = validationService.validateLineItem({ name: li.description, quantity: li.quantity, unitPrice: li.unitPrice });
        if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
      }
    }
    const totalAmount = input.lineItems ? sumLineItems(input.lineItems) : input.totalAmount;

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("change_orders")
      .insert({
        company_id: input.companyId,
        project_id: input.projectId,
        estimate_id: input.estimateId,
        change_order_number: input.changeOrderNumber,
        title: input.title,
        description: input.description ?? null,
        status: "pending",
        total_amount: totalAmount,
        tax: input.tax,
        // NOT NULL, no default, on the live table (contractor-pwa's own
        // createChangeOrder always sets this too) — a snapshot of the
        // estimate's total at the moment this change order was
        // proposed, for historical reference only. Never read back by
        // this service: the "Estimate Impact" / revised-total figures
        // shown to users are always derived fresh from the estimate's
        // CURRENT total, not this frozen snapshot.
        original_estimate_total: estimate.total,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create change order: ${error.message}`);

    const changeOrder = rowToChangeOrder(data as ChangeOrderRow);

    if (input.lineItems && input.lineItems.length > 0) {
      const { error: itemsError } = await supabase.from("change_order_line_items").insert(
        input.lineItems.map((li) => ({
          change_order_id: changeOrder.id,
          company_id: input.companyId,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unitPrice,
          total: li.quantity * li.unitPrice,
          type: li.type,
        }))
      );
      if (itemsError) throw new Error(`Failed to save change order line items: ${itemsError.message}`);
    }

    await estimateService.recalculateTotal(input.estimateId);
    return changeOrder;
  }

  async function update(
    changeOrderId: UUID,
    changes: Partial<{ title: string; description: string | null; tax: number; totalAmount: number; lineItems: Omit<ChangeOrderLineItem, "id" | "total">[] }>
  ): Promise<ChangeOrder> {
    const { data: currentRow, error: currentError } = await supabase.from("change_orders").select("*").eq("id", changeOrderId).single();
    if (currentError) throw new Error(`Failed to load change order: ${currentError.message}`);
    const current = rowToChangeOrder(currentRow as ChangeOrderRow);
    if (current.status !== "pending" && current.status !== "rejected") {
      throw new Error(`Cannot edit a change order that is already "${current.status}".`);
    }

    let totalAmount = changes.totalAmount;
    if (changes.lineItems) {
      for (const li of changes.lineItems) {
        const check = validationService.validateLineItem({ name: li.description, quantity: li.quantity, unitPrice: li.unitPrice });
        if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
      }
      totalAmount = sumLineItems(changes.lineItems);

      const { error: deleteError } = await supabase.from("change_order_line_items").delete().eq("change_order_id", changeOrderId);
      if (deleteError) throw new Error(`Failed to update change order line items: ${deleteError.message}`);
      if (changes.lineItems.length > 0) {
        const { error: insertError } = await supabase.from("change_order_line_items").insert(
          changes.lineItems.map((li) => ({
            change_order_id: changeOrderId,
            company_id: current.companyId,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unitPrice,
            total: li.quantity * li.unitPrice,
            type: li.type,
          }))
        );
        if (insertError) throw new Error(`Failed to save change order line items: ${insertError.message}`);
      }
    }

    const payload: Record<string, unknown> = {};
    if (changes.title !== undefined) payload.title = changes.title;
    if (changes.description !== undefined) payload.description = changes.description;
    if (changes.tax !== undefined) payload.tax = changes.tax;
    if (totalAmount !== undefined) payload.total_amount = totalAmount;
    // Editing a rejected change order resends it through the approval
    // workflow — matches contractor-pwa's "Edit & Resubmit" behavior.
    if (current.status === "rejected") payload.status = "pending";

    const { data, error } = await supabase.from("change_orders").update(payload).eq("id", changeOrderId).select().single();
    if (error) throw new Error(`Failed to update change order: ${error.message}`);
    await estimateService.recalculateTotal(current.estimateId);
    return rowToChangeOrder(data as ChangeOrderRow);
  }

  async function changeStatus(changeOrderId: UUID, toStatus: ChangeOrderStatus): Promise<ValidationResult & { changeOrder?: ChangeOrder }> {
    const { data: currentRow, error } = await supabase.from("change_orders").select("*").eq("id", changeOrderId).single();
    if (error) throw new Error(`Failed to load change order: ${error.message}`);
    const current = rowToChangeOrder(currentRow as ChangeOrderRow);

    const validation = validationService.validateChangeOrderStatusTransition(current.status, toStatus);
    if (!validation.valid) return validation;

    const { data, error: updateError } = await supabase.from("change_orders").update({ status: toStatus }).eq("id", changeOrderId).select().single();
    if (updateError) throw new Error(`Failed to change change order status: ${updateError.message}`);
    const changeOrder = rowToChangeOrder(data as ChangeOrderRow);

    const actorId = await currentUserId();
    await auditService.recordStatusChange({
      companyId: changeOrder.companyId,
      entityTable: "change_orders",
      entityId: changeOrder.id,
      fromStatus: current.status,
      toStatus,
      actorUserId: actorId,
    });

    await estimateService.recalculateTotal(changeOrder.estimateId);
    return { valid: true, issues: [], changeOrder };
  }

  /** Approving books "change_order_approved" to the in-memory ledger
   * (TransactionService — no live `financial_transactions` table wired
   * to any real service yet, matching every other real service in this
   * app today) for reconciliation parity with the in-memory
   * implementation. The financial rule that actually matters —
   * FinancialEngine's revisedTotal — does NOT read this ledger; it
   * reads listApprovedChangeOrders directly (see that method below),
   * so this booking is a secondary record, not the source of truth. */
  async function approveChangeOrder(changeOrderId: UUID): Promise<ChangeOrder> {
    const result = await changeStatus(changeOrderId, "approved");
    if (!result.valid || !result.changeOrder) {
      throw new Error(result.issues.map((i) => i.message).join("; ") || "Failed to approve change order.");
    }
    const changeOrder = result.changeOrder;

    const { data, error } = await supabase.from("change_orders").update({ approved_at: new Date().toISOString() }).eq("id", changeOrderId).select().single();
    if (error) throw new Error(`Failed to record approval time: ${error.message}`);
    const approved = rowToChangeOrder(data as ChangeOrderRow);

    const actorId = await currentUserId();
    await transactionService.append({
      companyId: approved.companyId,
      projectId: approved.projectId,
      type: "change_order_approved",
      amount: calculateChangeOrderRevenue(approved.totalAmount, approved.tax),
      referenceId: approved.id,
      referenceType: "change_order",
      createdBy: actorId,
      transactionDate: new Date().toISOString().slice(0, 10),
    });

    return approved;
  }

  async function listApprovedChangeOrders(projectId: UUID): Promise<ChangeOrder[]> {
    const { data, error } = await supabase.from("change_orders").select("*").eq("project_id", projectId).eq("status", "approved").is("deleted_at", null);
    if (error) throw new Error(`Failed to list approved change orders: ${error.message}`);
    return (data as ChangeOrderRow[]).map(rowToChangeOrder);
  }

  async function softDelete(changeOrderId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "A delete reason is required.");

    const { data: currentRow, error: currentError } = await supabase.from("change_orders").select("estimate_id").eq("id", changeOrderId).single();
    if (currentError) throw new Error(`Failed to load change order: ${currentError.message}`);

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("change_orders")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", changeOrderId);
    if (error) throw new Error(`Failed to delete change order: ${error.message}`);

    await estimateService.recalculateTotal((currentRow as { estimate_id: string }).estimate_id);
  }

  async function restore(changeOrderId: UUID): Promise<void> {
    const { data: currentRow, error: currentError } = await supabase.from("change_orders").select("estimate_id").eq("id", changeOrderId).single();
    if (currentError) throw new Error(`Failed to load change order: ${currentError.message}`);

    const { error } = await supabase
      .from("change_orders")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", changeOrderId);
    if (error) throw new Error(`Failed to restore change order: ${error.message}`);

    await estimateService.recalculateTotal((currentRow as { estimate_id: string }).estimate_id);
  }

  return { getById, listForProject, listForEstimate, createChangeOrder, update, changeStatus, approveChangeOrder, listApprovedChangeOrders, softDelete, restore };
}
