/**
 * THE canonical change-order-approval workflow — mirrors
 * estimateWorkflow.ts's pattern exactly (see that file's header for the
 * full rationale): staff (authenticated session, no signature) and the
 * customer portal (anonymous, service-role route, WITH a signature)
 * both call this ONE function rather than each having their own
 * "what does approving a change order mean" logic.
 *
 * Composed entirely of existing Layer 2 methods — no new financial
 * calculations, no direct table writes.
 *
 * INVOICE SYNC. Approving now also bills the change order on the
 * estimate's invoice, via changeOrderInvoiceSync. This corrects a real
 * money bug: every INTERNAL figure (revised total, profit) re-derived
 * itself live from the approved change order, but the customer's
 * invoice did not, so they kept being billed for the original scope
 * only. The comment that used to live here claimed there was "nothing
 * to sync" because invoices and change orders were independent revenue
 * inputs — true of the internal formula, but it silently accepted that
 * nobody ever billed the customer for approved extra work.
 *
 * The sync is deliberately NON-FATAL: the approval itself has already
 * succeeded and is never rolled back over a billing problem (same
 * reasoning as estimateWorkflow.signEstimate's invoice-creation
 * failure path). A locked/absent invoice comes back as a message, not
 * an error.
 */
import type { ChangeOrderService, ChangeOrderSignature } from "./changeOrderService";
import type { EstimateService } from "./estimateService";
import type { InvoiceService } from "./invoiceService";
import { syncInvoiceWithApprovedChangeOrders } from "./changeOrderInvoiceSync";

export interface ChangeOrderWorkflowResult {
  ok: boolean;
  message?: string;
}

export interface ChangeOrderWorkflowDeps {
  changeOrderService: ChangeOrderService;
  estimateService: EstimateService;
  invoiceService: InvoiceService;
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

  // Bill it. Non-fatal by design — the approval above is already
  // committed, and failing the whole action over an un-updatable
  // invoice would lose a customer's recorded approval.
  if (!current.estimateId) return { ok: true };
  try {
    const sync = await syncInvoiceWithApprovedChangeOrders(deps, current.estimateId);
    // "no invoice yet" is silent: an unsigned estimate simply has
    // nothing to bill against, and the change order will be picked up
    // when the invoice is eventually created.
    if (sync.skipped === "locked" || (!sync.ok && sync.message)) {
      return { ok: true, message: `Change order approved. ${sync.message}` };
    }
  } catch (err) {
    return {
      ok: true,
      message: `Change order approved, but its invoice could not be updated automatically: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
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
