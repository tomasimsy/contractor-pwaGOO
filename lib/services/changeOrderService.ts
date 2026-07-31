/**
 * Layer 2 — owns `change_orders`. Extracted out of EstimateService
 * during the service-layer completion pass: change orders were
 * originally modeled as EstimateService methods (createChangeOrder/
 * approveChangeOrder/listApprovedChangeOrders) because a change order
 * amends a proposal. On review that conflated two different lifecycle
 * documents under one service — a change order has its own approval
 * workflow, its own ledger event ("change_order_approved"), and its
 * own CRUD, distinct from an estimate's create/edit/sign flow. Splitting
 * it out is a MOVE, not a duplication: the logic (and its ledger
 * behavior) is unchanged, only which file owns it.
 */
import type { UUID, AuditedEntity, ValidationResult, ChangeOrderStatus } from "./types";
import type { Estimate } from "./estimateService";

/** Reuses the exact shape Estimate signatures already use (see
 * estimateService.ts's `signature` field) rather than defining a
 * parallel type — a change order's customer approval signature and an
 * estimate's are the same kind of fact, captured the same way. */
export type ChangeOrderSignature = NonNullable<Estimate["signature"]>;

/** One line of a change order's itemized breakdown — mirrors the live
 * `change_order_line_items` table (contractor-pwa's existing schema,
 * reused as-is, not duplicated). `type` distinguishes added scope
 * from removed/credited scope; totalAmount is the signed sum of these
 * when line items are used instead of a flat amount. */
export interface ChangeOrderLineItem {
  id: UUID;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  type: "addition" | "deduction";
}

/** A contract modification against a project's scope, against a
 * specific estimate (Client -> Project -> Estimate -> Change Order —
 * matches the live `change_orders` table, which has both `estimate_id`
 * and `project_id`). Approved change orders are one of FinancialEngine's
 * three normalized revenue inputs (invoices, payments, approved change
 * orders). NOT folded into estimates.total the way contractor-pwa did
 * (that cascade was exactly the "duplicated estimate field" this
 * rebuild removes) — an estimate's "revised total" (its own total plus
 * approved change orders) is always a DERIVED read, computed the same
 * way FinancialEngine derives a project's revised total, never written
 * back onto the estimate row. */
export interface ChangeOrder extends AuditedEntity {
  projectId: UUID;
  estimateId: UUID;
  changeOrderNumber: string;
  title: string;
  description: string | null;
  status: ChangeOrderStatus;
  totalAmount: number;
  tax: number;
  approvedAt: string | null;
  /** Customer e-signature captured on approval (portal) or null for a
   * staff approval with no signature on file. Same shape as
   * Estimate["signature"] — see ChangeOrderSignature above. */
  signature: ChangeOrderSignature | null;
}

export interface ChangeOrderService {
  getById(changeOrderId: UUID): Promise<(ChangeOrder & { lineItems: ChangeOrderLineItem[] }) | null>;
  listForProject(projectId: UUID): Promise<ChangeOrder[]>;

  /** Change orders against one specific estimate — the List page's
   * "Estimate relationship" and the Estimate Detail page's Change
   * Orders section both read through this rather than filtering
   * listForProject client-side. */
  listForEstimate(estimateId: UUID): Promise<ChangeOrder[]>;

  /** Creates a change order in "pending" status (this app exposes only
   * Pending/Approved/Rejected — "draft" and "invoiced" remain valid
   * ValidationService transition states for callers that need them,
   * but nothing in this UI creates a draft). Writes nothing to the
   * ledger — only an APPROVED change order is a real financial fact
   * (see approveChangeOrder). `totalAmount` is derived from
   * `lineItems` when provided (signed sum: additions add, deductions
   * subtract) via the SAME summation this service already used for a
   * flat amount — no separate/duplicate math for the itemized case. */
  createChangeOrder(input: {
    companyId: UUID;
    projectId: UUID;
    estimateId: UUID;
    changeOrderNumber: string;
    title: string;
    description?: string | null;
    lineItems?: Omit<ChangeOrderLineItem, "id" | "total">[];
    totalAmount: number;
    tax: number;
  }): Promise<ChangeOrder>;

  /** Title/description/tax and, when provided, a full line-item
   * replacement (same replace-in-place pattern EstimateService's
   * updateLineItems already uses) — re-derives totalAmount from the
   * new line items the same way createChangeOrder does. Only valid
   * while the change order is still pending or rejected (an approved
   * change order is a booked financial fact and must not be edited in
   * place — reject and recreate instead). */
  update(
    changeOrderId: UUID,
    changes: Partial<{ title: string; description: string | null; tax: number; totalAmount: number; lineItems: Omit<ChangeOrderLineItem, "id" | "total">[] }>
  ): Promise<ChangeOrder>;

  changeStatus(changeOrderId: UUID, toStatus: ChangeOrderStatus): Promise<ValidationResult & { changeOrder?: ChangeOrder }>;

  /** Approving a change order appends "change_order_approved" to the
   * ledger for its total (+tax) — revenue booked at approval, the same
   * accrual moment InvoiceService books "invoice_issued." Rejecting or
   * leaving one in draft/pending writes nothing to the ledger.
   *
   * `signature`, when provided, is persisted alongside the approval —
   * used by the customer portal's approval flow (changeOrderWorkflow.ts)
   * so a portal approval carries the same proof-of-approval an estimate
   * signature does. Staff approving in-app pass no signature. */
  approveChangeOrder(changeOrderId: UUID, signature?: ChangeOrderSignature | null): Promise<ChangeOrder>;

  /** Approved change orders for a PROJECT — this is what FinancialEngine
   * reads for its change-order revenue input. Scoped by projectId, not
   * a single estimate, because a change order amends the job's
   * contract value regardless of which estimate was active when it
   * was approved. */
  listApprovedChangeOrders(projectId: UUID): Promise<ChangeOrder[]>;

  /** `reason` validated the same way as every other financial record's
   * softDelete (see ValidationService.validateDeleteReason). Deleting
   * an APPROVED change order must exclude its booked
   * "change_order_approved" revenue from every active calculation —
   * see TransactionService's "deleted records must never affect
   * calculations" contract, which this type was found to be violating
   * (referenceIsActive treated every change_order reference as always
   * active, deleted or not) while building the integration test suite
   * for this exact workflow ("Add/Delete Change Orders"). */
  softDelete(changeOrderId: UUID, reason: string): Promise<void>;

  /** Restoring an approved change order re-includes its revenue in
   * every derived total (Estimate revised total, Project approved
   * change order revenue) — nothing extra to recompute, since none of
   * those figures are cached: they're always derived fresh from
   * whatever listForEstimate/listForProject returns, which excludes
   * deleted_at rows at the query level. Matches ClientService/
   * ProjectService's restore pattern. */
  restore(changeOrderId: UUID): Promise<void>;
}
