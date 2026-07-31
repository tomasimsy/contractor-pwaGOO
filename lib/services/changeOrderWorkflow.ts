/**
 * THE canonical change-order-approval workflow — mirrors
 * estimateWorkflow.ts's pattern exactly (see that file's header for the
 * full rationale): staff (authenticated session, no signature) and the
 * customer portal (anonymous, service-role route, WITH a signature)
 * both call this ONE function rather than each having their own
 * "what does approving a change order mean" logic.
 *
 * Composed entirely of existing Layer 2 ChangeOrderService methods — no
 * new financial calculations, no direct table writes. ChangeOrderService
 * already recalculates the parent estimate's total as a self-healing
 * step on every mutation (see its own header comment), and
 * FinancialEngine/getEstimateFinancials already derive the "revised
 * total" (estimate total + approved change orders) as a live read, not
 * a cached one — so approving here needs no separate "now update the
 * estimate/invoice/FinancialEngine" step of its own. Invoices are
 * deliberately NEVER written here: this app's ChangeOrderService has
 * never cascaded a change order's amount into any invoice row (the
 * legacy anti-pattern its header explicitly calls out), so there is
 * nothing to "sync" — every invoice/profit figure that should reflect
 * an approved change order already re-derives it live.
 */
import type { ChangeOrderService, ChangeOrderSignature } from "./changeOrderService";

export interface ChangeOrderWorkflowResult {
  ok: boolean;
  message?: string;
}

export interface ChangeOrderWorkflowDeps {
  changeOrderService: ChangeOrderService;
}

/**
 * Approves a pending change order, optionally recording a customer
 * signature (the portal always passes one; staff pass none). Only a
 * "pending" change order may be approved through here — matches the
 * ValidationService state machine (CHANGE_ORDER_TRANSITIONS), checked
 * up front so the portal gets a clear, specific message instead of
 * whatever changeStatus's generic validation error says.
 */
export async function approveChangeOrder(
  deps: ChangeOrderWorkflowDeps,
  changeOrderId: string,
  signature?: ChangeOrderSignature | null
): Promise<ChangeOrderWorkflowResult> {
  const { changeOrderService } = deps;

  const current = await changeOrderService.getById(changeOrderId);
  if (!current) return { ok: false, message: "Change order not found." };
  if (current.status !== "pending") {
    return { ok: false, message: `This change order is already "${current.status}" and cannot be approved again.` };
  }

  try {
    await changeOrderService.approveChangeOrder(changeOrderId, signature);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to approve this change order." };
  }

  return { ok: true };
}

export function createChangeOrderWorkflow(deps: ChangeOrderWorkflowDeps) {
  return {
    approveChangeOrder: (changeOrderId: string, signature?: ChangeOrderSignature | null) =>
      approveChangeOrder(deps, changeOrderId, signature),
  };
}

export type ChangeOrderWorkflow = ReturnType<typeof createChangeOrderWorkflow>;
