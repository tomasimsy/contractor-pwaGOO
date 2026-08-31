/**
 * Single source of truth for the 9 (11 counting the 3 estimate
 * follow-up stages separately) automated customer emails — what each
 * one means, its default timing, and (Task 6) how to find candidates
 * and check the safeguard. The cron route and the Settings page both
 * defer to this file; neither hardcodes automation business logic of
 * its own. See docs/superpowers/specs/2026-08-31-email-automations-design.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerAppServices } from "./server";
import { isOutstandingInvoiceStatus } from "@/components/invoices/invoiceStatus";

/** No candidate whose anchor predates this cutoff is ever considered
 * due — without this, the first cron run after this feature deploys
 * would treat every historical completed project / paid invoice /
 * overdue invoice as newly due and mass-email the company's entire
 * client history at once. Set once, at ship time, and never moved
 * forward again (moving it forward would itself cause a backfill
 * blast for whatever gap it skips). */
export const AUTOMATION_BACKFILL_CUTOFF = "2026-08-31T00:00:00.000Z";

export type AutomationKey =
  | "payment_receipt"
  | "google_review"
  | "estimate_followup_1"
  | "estimate_followup_2"
  | "estimate_followup_3"
  | "invoice_due_reminder"
  | "invoice_overdue_reminder"
  | "job_completion_thankyou"
  | "post_job_checkin"
  | "future_project_checkin"
  | "warranty_checkin";

export type DelayUnit = "hours" | "days";

/** The fields a stored `email_automations` row (or the effective,
 * merged-with-defaults view of one) carries. */
export interface AutomationSettingFields {
  enabled: boolean;
  delayValue: number;
  delayUnit: DelayUnit;
  condition: Record<string, unknown> | null;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
}

export interface AutomationMeta {
  key: AutomationKey;
  label: string;
  description: string;
  entityTable: "projects" | "estimates" | "invoices";
  defaultDelay: { value: number; unit: DelayUnit };
  defaultEnabled: boolean;
  /** True only for payment_receipt today — "Send only when invoice is
   * paid in full" (condition.onlyIfPaidInFull). */
  supportsCondition: boolean;
  /** "after" fires at anchorAt + delay (every automation except
   * invoice_due_reminder). "before" fires at anchorAt - delay —
   * invoice_due_reminder only, since a reminder ahead of the due date
   * is the entire point. */
  delayDirection: "after" | "before";
}

export const AUTOMATION_META: AutomationMeta[] = [
  {
    key: "payment_receipt",
    label: "Payment Receipt",
    description: "Sent when a payment is recorded against an invoice.",
    entityTable: "invoices",
    defaultDelay: { value: 0, unit: "hours" },
    defaultEnabled: true,
    supportsCondition: true,
    delayDirection: "after",
  },
  {
    key: "google_review",
    label: "Google Review Request",
    description: "Asks a client to leave a review after their invoice is paid in full.",
    entityTable: "invoices",
    defaultDelay: { value: 2, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "estimate_followup_1",
    label: "Estimate Follow-Up #1",
    description: "First reminder for an estimate that's been sent but not yet accepted.",
    entityTable: "estimates",
    defaultDelay: { value: 3, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "estimate_followup_2",
    label: "Estimate Follow-Up #2",
    description: "Second reminder for an estimate that's still unaccepted.",
    entityTable: "estimates",
    defaultDelay: { value: 7, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "estimate_followup_3",
    label: "Estimate Follow-Up #3",
    description: "Final reminder for an estimate that's still unaccepted.",
    entityTable: "estimates",
    defaultDelay: { value: 14, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "invoice_due_reminder",
    label: "Invoice Due Reminder",
    description: "Reminds a client their invoice is coming due, before the due date.",
    entityTable: "invoices",
    defaultDelay: { value: 3, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "before",
  },
  {
    key: "invoice_overdue_reminder",
    label: "Overdue Invoice Reminder",
    description: "Reminds a client their invoice is overdue, after the due date passes.",
    entityTable: "invoices",
    defaultDelay: { value: 7, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "job_completion_thankyou",
    label: "Job Completion Thank You",
    description: "Sent as soon as a job is marked completed.",
    entityTable: "projects",
    defaultDelay: { value: 0, unit: "hours" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "post_job_checkin",
    label: "Post-Job Check-In",
    description: "Follows up a month after completion to make sure everything's still good.",
    entityTable: "projects",
    defaultDelay: { value: 30, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "future_project_checkin",
    label: "Future Project Check-In",
    description: "Reminds the client you're available for future projects, 6 months out.",
    entityTable: "projects",
    defaultDelay: { value: 180, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
  {
    key: "warranty_checkin",
    label: "Warranty / Maintenance Check-In",
    description: "Checks in a year after completion, around warranty/maintenance time.",
    entityTable: "projects",
    defaultDelay: { value: 365, unit: "days" },
    defaultEnabled: true,
    supportsCondition: false,
    delayDirection: "after",
  },
];

export function getAutomationMeta(key: AutomationKey): AutomationMeta {
  const meta = AUTOMATION_META.find((a) => a.key === key);
  if (!meta) throw new Error(`Unknown automation key: ${key}`);
  return meta;
}

/** Pure — anchorAt + delay ("after") or anchorAt - delay ("before"). */
export function computeDueDate(anchorAt: string, delayValue: number, delayUnit: DelayUnit, direction: "after" | "before"): Date {
  const ms = delayUnit === "hours" ? delayValue * 60 * 60 * 1000 : delayValue * 24 * 60 * 60 * 1000;
  const anchor = new Date(anchorAt).getTime();
  return new Date(direction === "before" ? anchor - ms : anchor + ms);
}

/** Pure — true once `now` has reached or passed `dueDate`. */
export function isDue(dueDate: Date, now: Date): boolean {
  return now.getTime() >= dueDate.getTime();
}

export interface AutomationCandidate {
  entityId: string;
  anchorAt: string;
}

export interface AutomationRuntime {
  findCandidates(supabase: SupabaseClient, services: ServerAppServices, companyId: string): Promise<AutomationCandidate[]>;
  stillEligible(services: ServerAppServices, entityId: string): Promise<boolean>;
  renderDefault(companyName: string): { subject: string; body: string };
}

/** Shared by the four project-anchored automations — the identical
 * audit_logs shape ("every project that transitioned to 'completed'"),
 * differing only in delay/copy. */
async function findCompletedProjects(supabase: SupabaseClient, companyId: string): Promise<AutomationCandidate[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("entity_id, occurred_at")
    .eq("company_id", companyId)
    .eq("entity_table", "projects")
    .eq("action", "status_change")
    .eq("new_values->>status", "completed")
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(`Failed to query project completions: ${error.message}`);
  // One anchor per project — the MOST RECENT completion, in case a
  // project was reopened and re-completed.
  const latestByProject = new Map<string, string>();
  for (const row of data ?? []) {
    const id = row.entity_id as string;
    if (!latestByProject.has(id)) latestByProject.set(id, row.occurred_at as string);
  }
  return Array.from(latestByProject, ([entityId, anchorAt]) => ({ entityId, anchorAt }));
}

async function projectStillCompleted(services: ServerAppServices, projectId: string): Promise<boolean> {
  const project = await services.projectService.getById(projectId);
  return project?.status === "completed";
}

async function findSentEstimates(supabase: SupabaseClient, companyId: string): Promise<AutomationCandidate[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("entity_id, occurred_at")
    .eq("company_id", companyId)
    .eq("entity_table", "estimates")
    .eq("action", "status_change")
    .eq("new_values->>status", "sent")
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(`Failed to query estimate sends: ${error.message}`);
  const latestByEstimate = new Map<string, string>();
  for (const row of data ?? []) {
    const id = row.entity_id as string;
    if (!latestByEstimate.has(id)) latestByEstimate.set(id, row.occurred_at as string);
  }
  return Array.from(latestByEstimate, ([entityId, anchorAt]) => ({ entityId, anchorAt }));
}

async function estimateStillPending(services: ServerAppServices, estimateId: string): Promise<boolean> {
  const estimate = await services.estimateService.getById(estimateId);
  if (!estimate) return false;
  return (estimate.status === "sent" || estimate.status === "viewed") && !estimate.signature;
}

async function findOutstandingInvoices(supabase: SupabaseClient, services: ServerAppServices, companyId: string): Promise<AutomationCandidate[]> {
  const invoices = await services.invoiceService.listForCompany({ companyId });
  return invoices
    .filter((inv) => isOutstandingInvoiceStatus(inv.status) && inv.dueDate)
    .map((inv) => ({ entityId: inv.id, anchorAt: `${inv.dueDate}T00:00:00Z` }));
}

async function invoiceStillOutstanding(services: ServerAppServices, invoiceId: string): Promise<boolean> {
  const invoice = await services.invoiceService.getById(invoiceId);
  return !!invoice && isOutstandingInvoiceStatus(invoice.status);
}

async function findPaidInvoices(services: ServerAppServices, companyId: string): Promise<AutomationCandidate[]> {
  const invoices = await services.invoiceService.listForCompany({ companyId });
  const paid = invoices.filter((inv) => inv.status === "paid");
  const candidates: AutomationCandidate[] = [];
  for (const inv of paid) {
    const payments = await services.paymentService.listForInvoice(inv.id);
    if (payments.length === 0) continue;
    const lastPaymentDate = payments.reduce((latest, p) => (p.paymentDate > latest ? p.paymentDate : latest), payments[0].paymentDate);
    candidates.push({ entityId: inv.id, anchorAt: `${lastPaymentDate}T00:00:00Z` });
  }
  return candidates;
}

async function invoiceStillPaid(services: ServerAppServices, invoiceId: string): Promise<boolean> {
  const invoice = await services.invoiceService.getById(invoiceId);
  return invoice?.status === "paid";
}

export const AUTOMATION_RUNTIME: Record<AutomationKey, AutomationRuntime> = {
  payment_receipt: {
    // Not polled by findCandidates in normal operation — payment_receipt
    // is event-triggered from InvoicePaymentsPanel.tsx, and the cron
    // loop explicitly skips this key.
    //
    // KNOWN LIMITATION: a nonzero configured delay is NOT honored.
    // There is no fallback path that defers this send — payment_receipt
    // only ever sends immediately, at the moment a payment is recorded.
    // The Settings modal therefore hides the delay controls for this
    // one automation rather than offering a setting nothing reads.
    findCandidates: async () => [],
    stillEligible: async () => true,
    renderDefault: (companyName) => ({
      subject: "Payment received",
      body: `Thank you for your payment. This confirms we've received it — reach out any time if you have questions.\n\n${companyName}`,
    }),
  },
  google_review: {
    findCandidates: async (_supabase, services, companyId) => findPaidInvoices(services, companyId),
    stillEligible: (services, entityId) => invoiceStillPaid(services, entityId),
    renderDefault: (companyName) => ({
      subject: "We'd love your feedback",
      body: `Thank you again for choosing ${companyName}. If you have a moment, we'd really appreciate a quick review — it helps us a lot.\n\n{reviewLink}`,
    }),
  },
  estimate_followup_1: {
    findCandidates: (supabase, _services, companyId) => findSentEstimates(supabase, companyId),
    stillEligible: (services, entityId) => estimateStillPending(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Following up on your estimate",
      body: `Just checking in — your estimate from ${companyName} is ready whenever you'd like to move forward. Let us know if you have any questions.`,
    }),
  },
  estimate_followup_2: {
    findCandidates: (supabase, _services, companyId) => findSentEstimates(supabase, companyId),
    stillEligible: (services, entityId) => estimateStillPending(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Still interested? Your estimate is waiting",
      body: `We wanted to follow up again — your estimate from ${companyName} is still available. Happy to answer any questions before you decide.`,
    }),
  },
  estimate_followup_3: {
    findCandidates: (supabase, _services, companyId) => findSentEstimates(supabase, companyId),
    stillEligible: (services, entityId) => estimateStillPending(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Final follow-up on your estimate",
      body: `This is our last check-in on the estimate from ${companyName}. If your plans have changed, no worries — just let us know if you'd like us to keep it open.`,
    }),
  },
  invoice_due_reminder: {
    findCandidates: (supabase, services, companyId) => findOutstandingInvoices(supabase, services, companyId),
    stillEligible: (services, entityId) => invoiceStillOutstanding(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Your invoice is coming due",
      body: `This is a friendly reminder that your invoice from ${companyName} is coming due soon. Let us know if you have any questions.`,
    }),
  },
  invoice_overdue_reminder: {
    findCandidates: (supabase, services, companyId) => findOutstandingInvoices(supabase, services, companyId),
    stillEligible: (services, entityId) => invoiceStillOutstanding(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Your invoice is now overdue",
      body: `Your invoice from ${companyName} is now past its due date. Please reach out if you have any questions or need to arrange payment.`,
    }),
  },
  job_completion_thankyou: {
    findCandidates: (supabase, _services, companyId) => findCompletedProjects(supabase, companyId),
    stillEligible: (services, entityId) => projectStillCompleted(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Thank you for choosing us",
      body: `Thank you for trusting ${companyName} with your project — it was a pleasure working with you. Please don't hesitate to reach out if anything comes up.`,
    }),
  },
  post_job_checkin: {
    findCandidates: (supabase, _services, companyId) => findCompletedProjects(supabase, companyId),
    stillEligible: (services, entityId) => projectStillCompleted(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Checking in on your project",
      body: `It's been a little while since we finished your project — just checking in to make sure everything's still holding up well. Reach out any time.\n\n${companyName}`,
    }),
  },
  future_project_checkin: {
    findCandidates: (supabase, _services, companyId) => findCompletedProjects(supabase, companyId),
    stillEligible: (services, entityId) => projectStillCompleted(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Thinking about your next project?",
      body: `Just a friendly reminder that ${companyName} is here whenever you're ready for your next project. We'd love to work with you again.`,
    }),
  },
  warranty_checkin: {
    findCandidates: (supabase, _services, companyId) => findCompletedProjects(supabase, companyId),
    stillEligible: (services, entityId) => projectStillCompleted(services, entityId),
    renderDefault: (companyName) => ({
      subject: "Warranty & maintenance check-in",
      body: `It's been about a year since we completed your project. If you have any warranty or maintenance questions, we're happy to help — just reply to this email.\n\n${companyName}`,
    }),
  },
};
