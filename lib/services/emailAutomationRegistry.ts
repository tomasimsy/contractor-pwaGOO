/**
 * Single source of truth for the 9 (11 counting the 3 estimate
 * follow-up stages separately) automated customer emails — what each
 * one means, its default timing, and (Task 6) how to find candidates
 * and check the safeguard. The cron route and the Settings page both
 * defer to this file; neither hardcodes automation business logic of
 * its own. See docs/superpowers/specs/2026-08-31-email-automations-design.md.
 */

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
