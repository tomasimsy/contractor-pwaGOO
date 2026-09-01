/**
 * Layer 0 — pure business-rule validation. No I/O, no Supabase import.
 * Every other service calls into this before writing, instead of each
 * one hand-rolling its own "is this amount sane" check — the old app
 * had payment-overage warnings implemented client-side, per-modal,
 * inconsistently (ReceivedPaymentModal warns on overpay; nothing else
 * did the equivalent check for subcontractor/agent payments).
 *
 * Concretely implemented (createValidationService) — pure functions
 * have no reason to stay contract-only the way DB-backed services do.
 */
import type { ValidationResult, ValidationIssue, EstimateStatus, ProjectStatus, ChangeOrderStatus } from "./types";
import type { InvoiceLifecycleStatus } from "./invoiceService";
import { hasPermission, type Role, type Resource, type PermissionAction } from "./permissions";

const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["on_hold", "completed", "cancelled"],
  on_hold: ["active", "in_progress", "cancelled"],
  // "in_progress" added as a target: "Undo Complete" on the Estimate
  // Detail page — a job marked complete by mistake (or reopened for
  // more work) needs a way back into the active workflow, not just
  // forward into archived. See EstimateDetail.tsx's handleUndoComplete.
  completed: ["archived", "in_progress"],
  cancelled: ["archived"],
  archived: [],
};

const ESTIMATE_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  // "approved" added as a direct target: the canonical signing workflow
  // (lib/services/estimateWorkflow.ts) moves an estimate straight to
  // approved the moment a valid customer signature is recorded, even if
  // it was never explicitly marked sent/viewed (e.g. signed in person,
  // or signed via the portal link before staff ever changed its
  // status). "sent"/"viewed" -> "approved" already covered the
  // send-first path; this just makes sign-first legal too.
  draft: ["sent", "approved"],
  sent: ["viewed", "approved", "rejected"],
  viewed: ["approved", "rejected"],
  // "draft" added as a target: the workflow's unsignEstimate() reverts
  // here when a signature is removed (from either "approved" or
  // "converted_to_invoice", after archiving any zero-payment invoice —
  // see estimateWorkflow.ts for the full guard).
  approved: ["converted_to_invoice", "draft"],
  rejected: ["draft"],
  // Reachable now that estimateWorkflow.signEstimate() actually sets it
  // (previously declared in the schema but never written by any code
  // path). "draft" is the unsignEstimate() revert target when a
  // signature is removed after the auto-invoice was already created —
  // only reached once the workflow has confirmed zero payments exist
  // and archived that invoice; see estimateWorkflow.ts.
  converted_to_invoice: ["draft"],
};

/** Only the LIFECYCLE half of an invoice's status is transitionable —
 * partially_paid/paid/overdue are derived from payments and dates
 * (see deriveInvoiceStatus), so there is deliberately no transition
 * INTO them: you record a payment, you don't "set an invoice paid."
 * cancelled/void are terminal; void is reachable from anywhere issued
 * because voiding is the correct escape hatch for an invoice already
 * out in the world, whereas cancelled is for one never sent. */
const INVOICE_LIFECYCLE_TRANSITIONS: Record<InvoiceLifecycleStatus, InvoiceLifecycleStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["viewed", "void"],
  viewed: ["void"],
  cancelled: [],
  void: [],
};

const CHANGE_ORDER_TRANSITIONS: Record<ChangeOrderStatus, ChangeOrderStatus[]> = {
  draft: ["pending"],
  pending: ["approved", "rejected"],
  approved: ["invoiced"],
  rejected: [],
  invoiced: [],
};

function transitionResult<S extends string>(from: S, to: S, table: Record<S, S[]>): ValidationResult {
  if (from === to) return { valid: true, issues: [] };
  const allowed = table[from] ?? [];
  if (allowed.includes(to)) return { valid: true, issues: [] };
  return {
    valid: false,
    issues: [{ field: "status", code: "illegal_transition", message: `Cannot move from "${from}" to "${to}".` }],
  };
}

export interface ValidationService {
  validatePaymentAmount(input: { amount: number; remainingBalance: number; allowOverpayment: boolean }): ValidationResult;
  validateProjectStatusTransition(from: ProjectStatus, to: ProjectStatus): ValidationResult;
  validateEstimateStatusTransition(from: EstimateStatus, to: EstimateStatus): ValidationResult;
  validateChangeOrderStatusTransition(from: ChangeOrderStatus, to: ChangeOrderStatus): ValidationResult;

  /** Lifecycle-only — see INVOICE_LIFECYCLE_TRANSITIONS. Payment-derived
   * statuses (partially_paid/paid/overdue) are not settable and so are
   * not valid targets here. */
  validateInvoiceStatusTransition(from: InvoiceLifecycleStatus, to: InvoiceLifecycleStatus): ValidationResult;
  validateLineItem(input: { name: string; quantity: number; unitPrice: number }): ValidationResult;
  validateAssignmentAmount(input: { amount: number; isFinal: boolean; priorAmount?: number }): ValidationResult;
  validateCompanyOwnership(input: { payloadCompanyId: string; sessionCompanyId: string }): ValidationResult;

  /** Every FINANCIAL record's softDelete requires a non-empty reason —
   * "the record was deleted" with no explanation is not an acceptable
   * audit trail for money. UI-layer forms surface this as a required
   * field on the delete confirmation, not an afterthought. */
  validateDeleteReason(reason: string | null | undefined): ValidationResult;

  /** Service-level permission check (layer 2 of 3 — see
   * permissions.ts's file header for the full defense-in-depth
   * picture). Every Layer 2 service's create/update/delete/approve
   * method calls this FIRST, before touching any data, using the
   * caller's role from the current session — never trusting a role
   * value the caller claims in a request payload. */
  validatePermission(role: Role, resource: Resource, action: PermissionAction): ValidationResult;
}

export function createValidationService(): ValidationService {
  function validatePaymentAmount({ amount, remainingBalance, allowOverpayment }: { amount: number; remainingBalance: number; allowOverpayment: boolean }): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (amount <= 0) issues.push({ field: "amount", code: "must_be_positive", message: "Payment amount must be greater than zero." });
    if (!allowOverpayment && amount > remainingBalance) {
      issues.push({
        field: "amount",
        code: "exceeds_balance",
        message: `Amount ($${amount.toFixed(2)}) exceeds the remaining balance ($${remainingBalance.toFixed(2)}). Set allowOverpayment to record it anyway.`,
      });
    }
    return { valid: issues.length === 0, issues };
  }

  function validateProjectStatusTransition(from: ProjectStatus, to: ProjectStatus): ValidationResult {
    return transitionResult(from, to, PROJECT_TRANSITIONS);
  }
  function validateEstimateStatusTransition(from: EstimateStatus, to: EstimateStatus): ValidationResult {
    return transitionResult(from, to, ESTIMATE_TRANSITIONS);
  }
  function validateChangeOrderStatusTransition(from: ChangeOrderStatus, to: ChangeOrderStatus): ValidationResult {
    return transitionResult(from, to, CHANGE_ORDER_TRANSITIONS);
  }

  function validateInvoiceStatusTransition(from: InvoiceLifecycleStatus, to: InvoiceLifecycleStatus): ValidationResult {
    return transitionResult(from, to, INVOICE_LIFECYCLE_TRANSITIONS);
  }

  function validateLineItem({ name, quantity, unitPrice }: { name: string; quantity: number; unitPrice: number }): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (!name.trim()) issues.push({ field: "name", code: "required", message: "Line item name is required." });
    if (quantity <= 0) issues.push({ field: "quantity", code: "must_be_positive", message: "Quantity must be greater than zero." });
    if (unitPrice < 0) issues.push({ field: "unitPrice", code: "must_be_non_negative", message: "Unit price cannot be negative." });
    return { valid: issues.length === 0, issues };
  }

  function validateAssignmentAmount({ amount, isFinal, priorAmount }: { amount: number; isFinal: boolean; priorAmount?: number }): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (amount < 0) issues.push({ field: "amount", code: "must_be_non_negative", message: "Assignment amount cannot be negative." });
    if (isFinal && priorAmount !== undefined && amount !== priorAmount) {
      issues.push({ field: "amount", code: "assignment_locked", message: "This assignment is marked final and can no longer be changed." });
    }
    return { valid: issues.length === 0, issues };
  }

  function validateCompanyOwnership({ payloadCompanyId, sessionCompanyId }: { payloadCompanyId: string; sessionCompanyId: string }): ValidationResult {
    if (payloadCompanyId !== sessionCompanyId) {
      return { valid: false, issues: [{ field: "companyId", code: "company_mismatch", message: "This record does not belong to your company." }] };
    }
    return { valid: true, issues: [] };
  }

  function validateDeleteReason(reason: string | null | undefined): ValidationResult {
    if (!reason || !reason.trim()) {
      return { valid: false, issues: [{ field: "reason", code: "required", message: "A reason is required to delete a financial record." }] };
    }
    return { valid: true, issues: [] };
  }

  function validatePermission(role: Role, resource: Resource, action: PermissionAction): ValidationResult {
    if (!hasPermission(role, resource, action)) {
      return {
        valid: false,
        issues: [{ field: "role", code: "permission_denied", message: `Role "${role}" cannot "${action}" on "${resource}".` }],
      };
    }
    return { valid: true, issues: [] };
  }

  return {
    validatePaymentAmount,
    validateProjectStatusTransition,
    validateEstimateStatusTransition,
    validateChangeOrderStatusTransition,
    validateInvoiceStatusTransition,
    validateLineItem,
    validateAssignmentAmount,
    validateCompanyOwnership,
    validateDeleteReason,
    validatePermission,
  };
}
