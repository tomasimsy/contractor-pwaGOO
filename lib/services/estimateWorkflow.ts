/**
 * THE canonical estimate-signing workflow — the single implementation
 * of "what happens when an estimate gets signed / loses its signature."
 *
 * ============================================================
 * WHY THIS FILE EXISTS
 * ============================================================
 * Two very different callers need this exact same sequence of steps:
 *   1. Staff, signing on a customer's behalf from EstimateDetail —
 *      authenticated browser session, normal RLS.
 *   2. An anonymous customer, signing via their portal link — no
 *      session at all, reaches this workflow only through
 *      app/api/portal/sign/route.ts (a server-only route using a
 *      service-role client after doing its own token check).
 *
 * Both entry points call the SAME two functions below. Neither entry
 * point contains any of its own business logic — signEstimate/
 * unsignEstimate is the only place "what does signing mean" is
 * decided, so the two paths cannot drift into different behavior.
 *
 * ============================================================
 * WHAT THIS FILE DOES *NOT* DO
 * ============================================================
 * - No new financial calculations. Every number involved (invoice
 *   subtotal/tax/total, payment totals) is produced by
 *   InvoiceService/PaymentService calling financialCalculations.ts
 *   exactly as they already do for every other caller.
 * - No direct table writes. Every step is an existing Layer 2 service
 *   method (recordSignature, changeStatus, createFromEstimate,
 *   softDelete, getSummaryForInvoice) — this file only decides WHICH
 *   of those to call and in what order.
 * - No duplicate "which invoice belongs to this estimate" logic beyond
 *   the one filter (`invoice.estimateId === estimateId`) also used by
 *   FinancialEngine.getEstimateFinancials, for the same reason: no
 *   InvoiceService.listForEstimate exists, so both callers apply the
 *   same one-line filter to invoiceService.listForProject() rather
 *   than each inventing their own.
 *
 * ============================================================
 * PATTERN FOR FUTURE PORTAL ACTIONS
 * ============================================================
 * Any future action the anonymous portal needs to trigger (e.g.
 * "customer requests a change," "customer disputes an invoice") should
 * follow this exact shape:
 *   1. Write the workflow ONCE here (or a sibling file), composed only
 *      of existing Layer 2 service methods — never raw table writes,
 *      never SQL business logic, never a second copy of a calculation.
 *   2. Staff call it via useServices() + this module, same as any other
 *      service.
 *   3. The portal calls it through a NEW, narrowly-scoped API route
 *      that (a) validates the portal token itself, exactly as
 *      app/api/portal/sign/route.ts does, (b) constructs services via
 *      lib/services/server.ts using a service-role client, and
 *      (c) calls the SAME workflow function from step 1 — never a
 *      second implementation.
 * The service-role key must never be used anywhere except inside such
 * a route, after its own token check has already run.
 */
import type { EstimateService, Estimate } from "./estimateService";
import type { InvoiceService, Invoice } from "./invoiceService";
import type { PaymentService } from "./paymentService";
import type { ProjectService } from "./projectService";
export interface EstimateWorkflowResult {
  ok: boolean;
  message?: string;
  estimate?: Estimate;
}

export interface EstimateWorkflowDeps {
  estimateService: EstimateService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  projectService: ProjectService;
}

/**
 * Best-effort nudge toward "in_progress" when an estimate gets signed —
 * a signed job is presumably about to start work, and requiring staff
 * to separately click through the Project page's own status controls
 * before "Mark Project Complete" ever becomes available was extra
 * friction for the common case. Reuses ProjectService.changeStatus/
 * ValidationService.validateProjectStatusTransition exactly as the
 * Project page's own status buttons do — no new transition rule, no
 * bypass of the existing draft->active->in_progress chain (PROJECT_
 * TRANSITIONS in validationService.ts), just walking it automatically
 * instead of requiring a click per hop.
 *
 * Deliberately does nothing (and never throws) once the project is
 * already at/past in_progress — on_hold is left alone too, since
 * putting a job on hold is itself a deliberate decision signing an
 * estimate must not silently override — and does nothing to a
 * completed/cancelled/archived project. This must never be able to
 * block or fail the signing action itself.
 */
async function advanceProjectTowardInProgress(projectService: ProjectService, projectId: string): Promise<void> {
  try {
    const project = await projectService.getById(projectId);
    if (!project) return;
    if (project.status === "draft") {
      const toActive = await projectService.changeStatus(projectId, "active");
      if (!toActive.valid) return;
    } else if (project.status !== "active") {
      return; // on_hold/in_progress/completed/cancelled/archived — leave as-is
    }
    await projectService.changeStatus(projectId, "in_progress");
  } catch {
    // Signing must succeed regardless of whether this side-effect did.
  }
}

/** Days from issue to due date for an auto-generated invoice — matches
 * the default already used by the manual "New Invoice" form's date math
 * elsewhere in the app (issue today, due in 30). */
const AUTO_INVOICE_DUE_DAYS = 30;

async function findActiveInvoicesForEstimate(
  deps: EstimateWorkflowDeps,
  estimate: Estimate
): Promise<Invoice[]> {
  // Same filter FinancialEngine.getEstimateFinancials uses — no
  // InvoiceService.listForEstimate exists, so both callers apply this
  // one-line filter to listForProject() rather than each inventing
  // their own "which invoices belong to this estimate" logic.
  const projectInvoices = await deps.invoiceService.listForProject(estimate.projectId);
  return projectInvoices.filter((inv) => inv.estimateId === estimate.id);
}

/**
 * Runs when a valid customer signature is recorded (staff-entered or
 * portal-signed — identical either way).
 *
 * 1. Persists the signature (EstimateService.recordSignature — the
 *    ONLY writer of that column, unchanged).
 * 2. Promotes status to "approved" if it's still in a pre-approval
 *    state (draft/sent/viewed) — a no-op if already approved/rejected/
 *    converted, so re-signing never regresses an estimate's status.
 * 3. If no active invoice exists yet for this estimate, generates one
 *    via InvoiceService.createFromEstimate (the existing, only
 *    implementation of estimate -> invoice conversion) and advances
 *    status to "converted_to_invoice".
 */
export async function signEstimate(
  deps: EstimateWorkflowDeps,
  estimateId: string,
  signature: NonNullable<Estimate["signature"]>
): Promise<EstimateWorkflowResult> {
  const { estimateService, invoiceService, projectService } = deps;

  const before = await estimateService.getById(estimateId);
  if (!before) return { ok: false, message: "Estimate not found." };

  let estimate = await estimateService.recordSignature(estimateId, signature);

  if (estimate.status === "draft" || estimate.status === "sent" || estimate.status === "viewed") {
    const result = await estimateService.changeStatus(estimateId, "approved");
    if (!result.valid || !result.estimate) {
      return { ok: false, message: result.issues?.[0]?.message ?? "Could not approve this estimate." };
    }
    estimate = result.estimate;
  }

  await advanceProjectTowardInProgress(projectService, estimate.projectId);

  const activeInvoices = await findActiveInvoicesForEstimate(deps, estimate);
  if (activeInvoices.length === 0) {
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + AUTO_INVOICE_DUE_DAYS);

    try {
      await invoiceService.createFromEstimate(estimateId, {
        issueDate: today.toISOString().slice(0, 10),
        dueDate: dueDate.toISOString().slice(0, 10),
      });
    } catch (err) {
      // The signature and approval above ALREADY succeeded and are not
      // rolled back — losing a customer's real signature over an
      // unrelated data problem (e.g. an invalid line item elsewhere on
      // the estimate) would be worse than leaving it approved-but-not-
      // yet-invoiced. Reported as ok:true with a distinct message so
      // the caller can tell "signing worked, invoicing needs a fix"
      // apart from "signing itself failed" — the two look identical to
      // a user if collapsed into one error.
      return {
        ok: true,
        estimate,
        message: `Signed and approved, but the invoice could not be generated automatically: ${
          err instanceof Error ? err.message : "unknown error"
        }. Fix the issue and re-open this estimate to retry — signing again will attempt to create the invoice once more.`,
      };
    }

    const result = await estimateService.changeStatus(estimateId, "converted_to_invoice");
    if (result.valid && result.estimate) {
      estimate = result.estimate;
    }
    // If this particular transition is somehow invalid (e.g. a
    // concurrent change), the invoice still exists and the signature
    // is still recorded — leaving status at "approved" rather than
    // failing the whole signing action, since the signature itself
    // (the thing the customer actually did) must not be lost over a
    // status-label mismatch.
  }

  return { ok: true, estimate };
}

/**
 * Runs when a signature is removed (un-signing). Preserves accounting
 * integrity by refusing to touch anything once real money has moved:
 *
 * - If any active invoice for this estimate has a payment recorded,
 *   the whole action is blocked — nothing is written, including the
 *   signature itself — and the caller must void/refund the payment(s)
 *   through the normal invoice/payment workflow first.
 * - Otherwise, any active (zero-payment) auto-generated invoice is
 *   archived via InvoiceService.softDelete (a real, reasoned soft
 *   delete — not a silent status flip), the signature is cleared, and
 *   status reverts to "draft".
 */
export async function unsignEstimate(
  deps: EstimateWorkflowDeps,
  estimateId: string
): Promise<EstimateWorkflowResult> {
  const { estimateService, invoiceService, paymentService } = deps;

  const estimate = await estimateService.getById(estimateId);
  if (!estimate) return { ok: false, message: "Estimate not found." };

  const activeInvoices = await findActiveInvoicesForEstimate(deps, estimate);

  // Batched — one query for every active invoice's payments rather
  // than two round-trips each. Same figures; this only decides whether
  // ANY payment exists.
  const paymentSummaries = Object.values(
    await paymentService.getSummariesForInvoices(activeInvoices.map((inv) => ({ id: inv.id, total: inv.total })))
  );
  const hasAnyPayment = paymentSummaries.some((s) => s.totalPaid > 0);

  if (hasAnyPayment) {
    return {
      ok: false,
      message:
        "Cannot remove this signature: a payment has already been recorded against this estimate's invoice. Void or refund the payment(s) first, then try again.",
    };
  }

  for (const inv of activeInvoices) {
    await invoiceService.softDelete(
      inv.id,
      "Auto-archived: customer signature removed before any payment was recorded."
    );
  }

  let updated = await estimateService.recordSignature(estimateId, null);

  if (updated.status === "approved" || updated.status === "converted_to_invoice") {
    const result = await estimateService.changeStatus(estimateId, "draft");
    if (result.valid && result.estimate) {
      updated = result.estimate;
    }
  }

  return { ok: true, estimate: updated };
}

export function createEstimateWorkflow(deps: EstimateWorkflowDeps) {
  return {
    signEstimate: (estimateId: string, signature: NonNullable<Estimate["signature"]>) =>
      signEstimate(deps, estimateId, signature),
    unsignEstimate: (estimateId: string) => unsignEstimate(deps, estimateId),
  };
}

export type EstimateWorkflow = ReturnType<typeof createEstimateWorkflow>;
