# Email Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated Email Automations settings page where admins control the enable/delay/condition of 9 customer-facing automated emails, backed by a registry-driven extension of the existing daily cron job — reusing existing status/audit-log data as the sole source of truth for timing, with zero duplicated business logic.

**Architecture:** Two new tables (`email_automations` settings, `automation_email_log` dedup/audit) plus an in-code automation registry (`lib/services/emailAutomationRegistry.ts`) that is the single source of truth for what each automation means (anchor timestamp, safeguard check, default copy). The existing `/api/cron/daily-automations` route gains one registry-driven loop; `app/api/payments/receipt/route.ts` is refactored to read its enable/condition from settings instead of being hardcoded. A new Layer 2 `EmailAutomationService` (mirroring `companyService.ts`'s thin-wrapper-over-`lib/company.ts` pattern) backs the new Settings page.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Resend, Vitest, existing Layer 2 service pattern.

**Spec:** `docs/superpowers/specs/2026-08-31-email-automations-design.md`

## Global Constraints

- Reuse `audit_logs` (via `AuditService.recordStatusChange`, already called by `projectService.changeStatus`/`estimateService.changeStatus`) as the anchor-timestamp source for every status-transition-based automation — no new timestamp columns.
- Reuse the existing per-profile Resend/from-address resolution (`getResendClient`, `getFromAddress`, `getCompanySettingsByCompanyId`) for every send — no automation gets its own email-sending path.
- A settings row only needs to exist when it diverges from the registry default; resolution order is profile row → company row (`profile_id is null`) → registry default.
- No duplicate sends: dedup check happens **before** any send attempt, keyed by `(automation_key, entity_id)`, enforced at the DB level (unique constraint on `automation_email_log`; subject-match on `estimate_emails` for the two estimate-anchored automations).
- `payment_receipt` stays event-triggered (called from `InvoicePaymentsPanel.tsx` after `paymentService.record()`, exactly as today) — only its enable/condition come from settings; it is not polled by the cron loop unless a nonzero delay is configured.
- Every automation's safeguard (`stillEligible`) is re-checked at send time, not schedule time.

---

## Task 1: Migration — `email_automations` + `automation_email_log` tables

**Files:**
- Create: `supabase/migrations/20260907000000_email_automations.sql`

**Interfaces:**
- Produces: tables `public.email_automations`, `public.automation_email_log` with the columns/constraints below — every later task reads/writes these exact column names.

- [ ] **Step 1: Write the migration**

```sql
-- Per-company (optionally per-Business-Profile) configuration for the
-- 9 automated customer emails — see docs/superpowers/specs/
-- 2026-08-31-email-automations-design.md. A row only needs to exist
-- when it diverges from the built-in registry default
-- (lib/services/emailAutomationRegistry.ts); absence = "use the
-- default," same convention as bcc_email/email templates.
create table public.email_automations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  profile_id uuid references public.company_profiles(id), -- null = company default
  automation_key text not null check (automation_key in (
    'payment_receipt', 'google_review',
    'estimate_followup_1', 'estimate_followup_2', 'estimate_followup_3',
    'invoice_due_reminder', 'invoice_overdue_reminder',
    'job_completion_thankyou', 'post_job_checkin',
    'future_project_checkin', 'warranty_checkin'
  )),
  enabled boolean not null default true,
  delay_value integer not null default 0,
  delay_unit text not null default 'days' check (delay_unit in ('hours','days')),
  condition jsonb,
  subject_template text,
  body_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (company_id, profile_id, automation_key)
);

comment on table public.email_automations is
  'Per-company (optionally per-Business-Profile) overrides of the 9 automated-customer-email registry defaults. Absent row = use the registry default.';

alter table public.email_automations enable row level security;

create policy email_automations_select on public.email_automations
  for select using (company_id = public.current_company_id());
create policy email_automations_insert on public.email_automations
  for insert with check (company_id = public.current_company_id());
create policy email_automations_update on public.email_automations
  for update using (company_id = public.current_company_id());
create policy email_automations_delete on public.email_automations
  for delete using (company_id = public.current_company_id());

-- Generic dedup/audit log for automations anchored on an entity other
-- than an estimate (estimate-anchored automations keep using
-- estimate_emails, which already carries Resend delivery-status
-- webhooks that this simpler table deliberately does not duplicate).
-- The unique constraint IS the duplicate-prevention mechanism: a
-- second cron run attempting the same (automation_key, entity_id)
-- fails the insert, caught in application code as "already sent."
create table public.automation_email_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  automation_key text not null,
  entity_table text not null,
  entity_id uuid not null,
  sent_at timestamptz not null default now(),
  resend_email_id text,
  unique (automation_key, entity_id)
);

comment on table public.automation_email_log is
  'Dedup + audit log for automated emails anchored on a project or invoice (not an estimate — those use estimate_emails). Unique(automation_key, entity_id) is the duplicate-prevention mechanism.';

alter table public.automation_email_log enable row level security;

create policy automation_email_log_select on public.automation_email_log
  for select using (company_id = public.current_company_id());
-- No insert/update/delete policy for authenticated users — every write
-- happens through the cron route's service-role client, which bypasses
-- RLS entirely (same trust model as app/api/portal/sign/route.ts).
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260907000000_email_automations.sql
git commit -m "Add email_automations + automation_email_log tables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

**Note for the executor:** this migration cannot be applied by an agent (no DB credentials available in this environment — same constraint noted in every prior migration this session). Tell the user it needs to be run in the Supabase SQL editor before Task 4 onward can be exercised live.

---

## Task 2: Automation registry — types, metadata, and pure date math

**Files:**
- Create: `lib/services/emailAutomationRegistry.ts`
- Test: `tests/email-automation-registry.test.ts`

**Interfaces:**
- Produces:
  - `type AutomationKey` — the 11-value union matching the migration's check constraint.
  - `interface AutomationSettingFields { enabled: boolean; delayValue: number; delayUnit: "hours" | "days"; condition: Record<string, unknown> | null; subjectTemplate: string | null; bodyTemplate: string | null }`
  - `interface AutomationMeta { key: AutomationKey; label: string; description: string; entityTable: "projects" | "estimates" | "invoices"; defaultDelay: { value: number; unit: "hours" | "days" }; defaultEnabled: boolean; supportsCondition: boolean; delayDirection: "after" | "before" }`
  - `const AUTOMATION_META: AutomationMeta[]` — all 11 entries (metadata only; the Supabase-query-heavy `findCandidates`/`stillEligible`/`renderDefault` implementations are added in Task 6).
  - `function computeDueDate(anchorAt: string, delayValue: number, delayUnit: "hours" | "days", direction: "after" | "before"): Date` — pure.
  - `function isDue(dueDate: Date, now: Date): boolean` — pure (`now >= dueDate`).
- Consumes: nothing (leaf module).

- [ ] **Step 1: Write the failing test**

```ts
// tests/email-automation-registry.test.ts
import { describe, test, expect } from "vitest";
import { AUTOMATION_META, computeDueDate, isDue } from "../lib/services/emailAutomationRegistry";

describe("AUTOMATION_META", () => {
  test("has exactly the 11 automations from the design spec, each with sane defaults", () => {
    const keys = AUTOMATION_META.map((a) => a.key).sort();
    expect(keys).toEqual([
      "estimate_followup_1", "estimate_followup_2", "estimate_followup_3",
      "future_project_checkin", "google_review",
      "invoice_due_reminder", "invoice_overdue_reminder",
      "job_completion_thankyou", "payment_receipt",
      "post_job_checkin", "warranty_checkin",
    ]);
    for (const meta of AUTOMATION_META) {
      expect(meta.defaultDelay.value).toBeGreaterThanOrEqual(0);
      expect(["hours", "days"]).toContain(meta.defaultDelay.unit);
    }
  });

  test("only payment_receipt supports a condition", () => {
    const supportsCondition = AUTOMATION_META.filter((a) => a.supportsCondition).map((a) => a.key);
    expect(supportsCondition).toEqual(["payment_receipt"]);
  });

  test("only invoice_due_reminder fires before its anchor", () => {
    const before = AUTOMATION_META.filter((a) => a.delayDirection === "before").map((a) => a.key);
    expect(before).toEqual(["invoice_due_reminder"]);
  });

  test("matches the design spec's default timing", () => {
    const byKey = Object.fromEntries(AUTOMATION_META.map((a) => [a.key, a]));
    expect(byKey.payment_receipt.defaultDelay).toEqual({ value: 0, unit: "hours" });
    expect(byKey.google_review.defaultDelay).toEqual({ value: 2, unit: "days" });
    expect(byKey.estimate_followup_1.defaultDelay).toEqual({ value: 3, unit: "days" });
    expect(byKey.estimate_followup_2.defaultDelay).toEqual({ value: 7, unit: "days" });
    expect(byKey.estimate_followup_3.defaultDelay).toEqual({ value: 14, unit: "days" });
    expect(byKey.invoice_due_reminder.defaultDelay).toEqual({ value: 3, unit: "days" });
    expect(byKey.invoice_overdue_reminder.defaultDelay).toEqual({ value: 7, unit: "days" });
    expect(byKey.job_completion_thankyou.defaultDelay).toEqual({ value: 0, unit: "hours" });
    expect(byKey.post_job_checkin.defaultDelay).toEqual({ value: 30, unit: "days" });
    expect(byKey.future_project_checkin.defaultDelay).toEqual({ value: 180, unit: "days" });
    expect(byKey.warranty_checkin.defaultDelay).toEqual({ value: 365, unit: "days" });
  });
});

describe("computeDueDate", () => {
  test("'after' adds the delay to the anchor", () => {
    const due = computeDueDate("2026-01-01T00:00:00Z", 7, "days", "after");
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-08");
  });

  test("'before' subtracts the delay from the anchor", () => {
    const due = computeDueDate("2026-01-10T00:00:00Z", 3, "days", "before");
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-07");
  });

  test("hours unit", () => {
    const due = computeDueDate("2026-01-01T00:00:00Z", 6, "hours", "after");
    expect(due.toISOString()).toBe("2026-01-01T06:00:00.000Z");
  });
});

describe("isDue", () => {
  test("true once now has reached or passed dueDate", () => {
    const due = new Date("2026-01-08T00:00:00Z");
    expect(isDue(due, new Date("2026-01-07T23:59:59Z"))).toBe(false);
    expect(isDue(due, new Date("2026-01-08T00:00:00Z"))).toBe(true);
    expect(isDue(due, new Date("2026-01-09T00:00:00Z"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email-automation-registry.test.ts`
Expected: FAIL — `Cannot find module '../lib/services/emailAutomationRegistry'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/services/emailAutomationRegistry.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email-automation-registry.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/services/emailAutomationRegistry.ts tests/email-automation-registry.test.ts
git commit -m "Add email automation registry (metadata + pure due-date math)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Effective-settings resolution (pure merge) + Supabase read/write

**Files:**
- Create: `lib/emailAutomationSettings.ts`
- Test: `tests/email-automation-settings-merge.test.ts`

**Interfaces:**
- Consumes: `AutomationKey`, `AutomationSettingFields`, `AUTOMATION_META`, `getAutomationMeta` from `lib/services/emailAutomationRegistry.ts` (Task 2).
- Produces:
  - `interface StoredAutomationRow extends AutomationSettingFields { key: AutomationKey; profileId: string | null }` (shape of a raw row from the table, camelCased).
  - `function resolveEffectiveSettings(key: AutomationKey, rows: StoredAutomationRow[], profileId: string | null | undefined): AutomationSettingFields` — pure. Resolution order: a row matching `profileId` exactly → a row with `profileId === null` (company default) → the registry default (`getAutomationMeta(key).defaultDelay`/`defaultEnabled`, `condition: null`, templates `null`).
  - `async function getEffectiveAutomationSettings(supabase, companyId, key, profileId?): Promise<AutomationSettingFields>` — fetches this company's rows for `key`, calls `resolveEffectiveSettings`.
  - `async function listEffectiveAutomationSettings(supabase, companyId, profileId?): Promise<(AutomationSettingFields & { key: AutomationKey })[]>` — one entry per `AUTOMATION_META` item, for the Settings page.
  - `async function upsertAutomationSetting(supabase, companyId, profileId, key, changes: Partial<AutomationSettingFields>, updatedBy): Promise<AutomationSettingFields>` — upsert on `(company_id, profile_id, automation_key)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/email-automation-settings-merge.test.ts
import { describe, test, expect } from "vitest";
import { resolveEffectiveSettings, type StoredAutomationRow } from "../lib/emailAutomationSettings";

function row(overrides: Partial<StoredAutomationRow>): StoredAutomationRow {
  return {
    key: "google_review",
    profileId: null,
    enabled: true,
    delayValue: 2,
    delayUnit: "days",
    condition: null,
    subjectTemplate: null,
    bodyTemplate: null,
    ...overrides,
  };
}

describe("resolveEffectiveSettings", () => {
  test("falls back to the registry default when no rows exist", () => {
    const effective = resolveEffectiveSettings("google_review", [], null);
    expect(effective).toEqual({
      enabled: true,
      delayValue: 2,
      delayUnit: "days",
      condition: null,
      subjectTemplate: null,
      bodyTemplate: null,
    });
  });

  test("a company-default row (profileId null) overrides the registry default", () => {
    const rows = [row({ enabled: false, delayValue: 5 })];
    const effective = resolveEffectiveSettings("google_review", rows, null);
    expect(effective.enabled).toBe(false);
    expect(effective.delayValue).toBe(5);
  });

  test("a profile-specific row overrides the company default for that profile", () => {
    const rows = [
      row({ profileId: null, delayValue: 5 }),
      row({ profileId: "profile-a", delayValue: 9 }),
    ];
    expect(resolveEffectiveSettings("google_review", rows, "profile-a").delayValue).toBe(9);
    // A DIFFERENT profile with no row of its own falls back to the company default, not profile-a's.
    expect(resolveEffectiveSettings("google_review", rows, "profile-b").delayValue).toBe(5);
  });

  test("requesting the company default (profileId null) ignores profile-specific rows", () => {
    const rows = [
      row({ profileId: null, delayValue: 5 }),
      row({ profileId: "profile-a", delayValue: 9 }),
    ];
    expect(resolveEffectiveSettings("google_review", rows, null).delayValue).toBe(5);
  });

  test("rows for a different automation key never leak into the result", () => {
    const rows = [row({ key: "payment_receipt", enabled: false })];
    const effective = resolveEffectiveSettings("google_review", rows, null);
    expect(effective.enabled).toBe(true); // registry default, not the payment_receipt row
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email-automation-settings-merge.test.ts`
Expected: FAIL — `Cannot find module '../lib/emailAutomationSettings'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/emailAutomationSettings.ts
/**
 * Storage layer for `email_automations` — mirrors lib/company.ts's
 * shape (a plain read/write module, not a Layer 2 service) so it can
 * be called directly by both the browser-facing EmailAutomationService
 * (Task 4) and the server-only cron route (Task 7) with a service-role
 * client, the same split lib/company.ts already has for
 * getCompanySettingsByCompanyId.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTOMATION_META,
  getAutomationMeta,
  type AutomationKey,
  type AutomationSettingFields,
  type DelayUnit,
} from "./services/emailAutomationRegistry";

export interface StoredAutomationRow extends AutomationSettingFields {
  key: AutomationKey;
  profileId: string | null;
}

function registryDefault(key: AutomationKey): AutomationSettingFields {
  const meta = getAutomationMeta(key);
  return {
    enabled: meta.defaultEnabled,
    delayValue: meta.defaultDelay.value,
    delayUnit: meta.defaultDelay.unit,
    condition: null,
    subjectTemplate: null,
    bodyTemplate: null,
  };
}

/** Pure — profile row (exact match) -> company-default row
 * (profileId null) -> registry default, in that order. Rows for a
 * different automation key are ignored (defensive: callers are
 * expected to have already scoped `rows` to one key, but a caller
 * that passes the full unfiltered set must never leak another
 * automation's settings in). */
export function resolveEffectiveSettings(
  key: AutomationKey,
  rows: StoredAutomationRow[],
  profileId: string | null | undefined
): AutomationSettingFields {
  const scoped = rows.filter((r) => r.key === key);
  if (profileId) {
    const profileRow = scoped.find((r) => r.profileId === profileId);
    if (profileRow) return profileRow;
  }
  const companyRow = scoped.find((r) => r.profileId === null);
  if (companyRow) return companyRow;
  return registryDefault(key);
}

function rowToStored(row: Record<string, unknown>): StoredAutomationRow {
  return {
    key: row.automation_key as AutomationKey,
    profileId: (row.profile_id as string | null) ?? null,
    enabled: row.enabled as boolean,
    delayValue: row.delay_value as number,
    delayUnit: row.delay_unit as DelayUnit,
    condition: (row.condition as Record<string, unknown> | null) ?? null,
    subjectTemplate: (row.subject_template as string | null) ?? null,
    bodyTemplate: (row.body_template as string | null) ?? null,
  };
}

export async function getEffectiveAutomationSettings(
  supabase: SupabaseClient,
  companyId: string,
  key: AutomationKey,
  profileId?: string | null
): Promise<AutomationSettingFields> {
  const { data, error } = await supabase
    .from("email_automations")
    .select("*")
    .eq("company_id", companyId)
    .eq("automation_key", key);
  if (error) throw new Error(`Failed to load automation settings: ${error.message}`);
  return resolveEffectiveSettings(key, (data ?? []).map(rowToStored), profileId);
}

export async function listEffectiveAutomationSettings(
  supabase: SupabaseClient,
  companyId: string,
  profileId?: string | null
): Promise<(AutomationSettingFields & { key: AutomationKey })[]> {
  const { data, error } = await supabase.from("email_automations").select("*").eq("company_id", companyId);
  if (error) throw new Error(`Failed to load automation settings: ${error.message}`);
  const rows = (data ?? []).map(rowToStored);
  return AUTOMATION_META.map((meta) => ({ key: meta.key, ...resolveEffectiveSettings(meta.key, rows, profileId) }));
}

export async function upsertAutomationSetting(
  supabase: SupabaseClient,
  companyId: string,
  profileId: string | null,
  key: AutomationKey,
  changes: Partial<AutomationSettingFields>,
  updatedBy: string | null
): Promise<AutomationSettingFields> {
  const { data: existing } = await supabase
    .from("email_automations")
    .select("id, enabled, delay_value, delay_unit, condition, subject_template, body_template")
    .eq("company_id", companyId)
    .eq("automation_key", key)
    .is("profile_id", profileId === null ? null : undefined)
    .eq(profileId === null ? "id" : "profile_id", profileId === null ? undefined : profileId)
    .maybeSingle();

  const base = existing
    ? {
        enabled: existing.enabled,
        delayValue: existing.delay_value,
        delayUnit: existing.delay_unit,
        condition: existing.condition,
        subjectTemplate: existing.subject_template,
        bodyTemplate: existing.body_template,
      }
    : registryDefault(key);
  const merged = { ...base, ...changes };

  const payload = {
    company_id: companyId,
    profile_id: profileId,
    automation_key: key,
    enabled: merged.enabled,
    delay_value: merged.delayValue,
    delay_unit: merged.delayUnit,
    condition: merged.condition,
    subject_template: merged.subjectTemplate,
    body_template: merged.bodyTemplate,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("email_automations").update(payload).eq("id", existing.id);
    if (error) throw new Error(`Failed to save automation settings: ${error.message}`);
  } else {
    const { error } = await supabase.from("email_automations").insert({ ...payload, created_by: updatedBy });
    if (error) throw new Error(`Failed to save automation settings: ${error.message}`);
  }
  return merged;
}
```

**Note:** the `existing` lookup's chained `.is(...)`/`.eq(...)` above is awkward for the `profileId === null` case — simplify at implementation time to two explicit branches (one query with `.is("profile_id", null)`, one with `.eq("profile_id", profileId)`) rather than the conditional chain shown; the test in Step 1 only covers the pure `resolveEffectiveSettings` function, so this simplification doesn't affect test coverage. Concretely:

```ts
  const existingQuery = supabase
    .from("email_automations")
    .select("id, enabled, delay_value, delay_unit, condition, subject_template, body_template")
    .eq("company_id", companyId)
    .eq("automation_key", key);
  const { data: existing } = profileId === null
    ? await existingQuery.is("profile_id", null).maybeSingle()
    : await existingQuery.eq("profile_id", profileId).maybeSingle();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email-automation-settings-merge.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run `npx tsc --noEmit` to confirm the whole file type-checks**

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/emailAutomationSettings.ts tests/email-automation-settings-merge.test.ts
git commit -m "Add email automation settings storage (resolve/get/list/upsert)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `EmailAutomationService` (Layer 2) + wire into ServicesProvider

**Files:**
- Create: `lib/services/emailAutomationService.ts`
- Create: `lib/services/supabase/emailAutomationService.ts`
- Modify: `components/providers/ServicesProvider.tsx`

**Interfaces:**
- Consumes: `getEffectiveAutomationSettings`/`listEffectiveAutomationSettings`/`upsertAutomationSetting` from `lib/emailAutomationSettings.ts` (Task 3); `enforcePermission` from `lib/services/supabase/enforcePermission.ts`.
- Produces: `EmailAutomationService` interface, constructed as `services.emailAutomationService` everywhere `useServices()` is called — the exact shape Task 5's Settings page consumes.

- [ ] **Step 1: Write the interface**

```ts
// lib/services/emailAutomationService.ts
/**
 * Layer 2 — the authenticated Settings page's read/write path for
 * `email_automations`. Thin wrapper over lib/emailAutomationSettings.ts,
 * same split lib/services/companyService.ts has over lib/company.ts:
 * this file owns nothing but permission enforcement + the actor id;
 * all business meaning (what each automation does, its defaults) lives
 * in lib/services/emailAutomationRegistry.ts.
 */
import type { UUID } from "./types";
import type { AutomationKey, AutomationSettingFields } from "./emailAutomationRegistry";

export type { AutomationKey, AutomationSettingFields };

export interface EmailAutomationService {
  /** All 11 automations for this company, resolved against
   * `profileId` (null = the company-default view) — one entry per
   * AUTOMATION_META item, in that order. */
  listEffective(companyId: UUID, profileId?: UUID | null): Promise<(AutomationSettingFields & { key: AutomationKey })[]>;
  /** Upserts the given fields for one automation, scoped to
   * `profileId` (null = editing the company default). */
  upsert(
    companyId: UUID,
    profileId: UUID | null,
    key: AutomationKey,
    changes: Partial<AutomationSettingFields>
  ): Promise<AutomationSettingFields>;
}
```

- [ ] **Step 2: Write the Supabase implementation**

```ts
// lib/services/supabase/emailAutomationService.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailAutomationService } from "../emailAutomationService";
import type { UUID } from "../types";
import { listEffectiveAutomationSettings, upsertAutomationSetting } from "../../emailAutomationSettings";
import { enforcePermission } from "./enforcePermission";

export function createSupabaseEmailAutomationService(
  supabase: SupabaseClient,
  currentUserId: () => Promise<UUID | null>
): EmailAutomationService {
  async function listEffective(companyId: UUID, profileId?: UUID | null) {
    return listEffectiveAutomationSettings(supabase, companyId, profileId);
  }

  async function upsert(companyId: UUID, profileId: UUID | null, key: any, changes: any) {
    await enforcePermission(supabase, "company_settings", "update");
    const actorId = await currentUserId();
    return upsertAutomationSetting(supabase, companyId, profileId, key, changes, actorId);
  }

  return { listEffective, upsert };
}
```

- [ ] **Step 3: Wire into ServicesProvider.tsx**

Find the `companyProfileService` construction line (`const companyProfileService = createSupabaseCompanyProfileService(supabase, inMemory.validationService, currentUserId);`) and add immediately after it:

```ts
import { createSupabaseEmailAutomationService } from "@/lib/services/supabase/emailAutomationService";
// (add near the other Layer-2 imports, alongside createSupabaseCompanyProfileService)

import type { EmailAutomationService } from "@/lib/services/emailAutomationService";
// (add near the other type imports)
```

```ts
    const emailAutomationService = createSupabaseEmailAutomationService(supabase, currentUserId);
```

Add `emailAutomationService: EmailAutomationService;` to the provider's context type (next to `companyProfileService: CompanyProfileService;`), and add `emailAutomationService,` to the returned object (next to `companyProfileService,`).

- [ ] **Step 4: Run `npx tsc --noEmit`**

Expected: no errors.

- [ ] **Step 5: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS, count = previous count + 12 (the two new test files from Tasks 2–3)

- [ ] **Step 6: Commit**

```bash
git add lib/services/emailAutomationService.ts lib/services/supabase/emailAutomationService.ts components/providers/ServicesProvider.tsx
git commit -m "Add EmailAutomationService, wire into ServicesProvider

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Settings page — Email Automations

**Files:**
- Create: `app/(app)/settings/company/email-automations/page.tsx`
- Create: `components/settings/EmailAutomationRow.tsx`
- Create: `components/settings/EditAutomationModal.tsx`
- Modify: `lib/navigation.ts` (or wherever the Settings sub-nav is defined — grep for the existing `/settings/company/profiles` entry and add a sibling)

**Interfaces:**
- Consumes: `useServices().emailAutomationService` (Task 4), `useServices().companyProfileService.listForCompany` (existing), `AUTOMATION_META`/`getAutomationMeta` (Task 2), `Modal` (`components/ui/Modal.tsx`), `RequirePermission`, `useAuth`.

- [ ] **Step 1: Write `EmailAutomationRow.tsx`**

```tsx
// components/settings/EmailAutomationRow.tsx
"use client";

import { Pencil } from "lucide-react";
import type { AutomationKey, AutomationSettingFields } from "@/lib/services/emailAutomationService";
import { getAutomationMeta } from "@/lib/services/emailAutomationRegistry";

function timingLabel(delayValue: number, delayUnit: string, direction: "after" | "before"): string {
  if (delayValue === 0) return "Immediately";
  const unit = delayValue === 1 ? delayUnit.replace(/s$/, "") : delayUnit;
  return direction === "before" ? `${delayValue} ${unit} before` : `${delayValue} ${unit} after`;
}

export function EmailAutomationRow({
  automationKey,
  settings,
  onToggle,
  onEdit,
}: {
  automationKey: AutomationKey;
  settings: AutomationSettingFields;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  const meta = getAutomationMeta(automationKey);
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{meta.label}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              settings.enabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
            }`}
          >
            {settings.enabled ? "On" : "Off"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {timingLabel(settings.delayValue, settings.delayUnit, meta.delayDirection)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-5 w-9 rounded-full bg-muted transition-colors peer-checked:bg-primary" />
          <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
        </label>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Pencil className="size-3.5" /> Edit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `EditAutomationModal.tsx`**

```tsx
// components/settings/EditAutomationModal.tsx
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { AutomationKey, AutomationSettingFields } from "@/lib/services/emailAutomationService";
import { getAutomationMeta } from "@/lib/services/emailAutomationRegistry";

export function EditAutomationModal({
  automationKey,
  initial,
  onClose,
  onSave,
}: {
  automationKey: AutomationKey;
  initial: AutomationSettingFields;
  onClose: () => void;
  onSave: (changes: Partial<AutomationSettingFields>) => Promise<void>;
}) {
  const meta = getAutomationMeta(automationKey);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [delayValue, setDelayValue] = useState(initial.delayValue);
  const [delayUnit, setDelayUnit] = useState<"hours" | "days">(initial.delayUnit);
  const [onlyIfPaidInFull, setOnlyIfPaidInFull] = useState(
    Boolean(initial.condition?.onlyIfPaidInFull ?? true)
  );
  const [subjectTemplate, setSubjectTemplate] = useState(initial.subjectTemplate ?? "");
  const [bodyTemplate, setBodyTemplate] = useState(initial.bodyTemplate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        enabled,
        delayValue,
        delayUnit,
        condition: meta.supportsCondition ? { onlyIfPaidInFull } : null,
        subjectTemplate: subjectTemplate.trim() || null,
        bodyTemplate: bodyTemplate.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this automation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={meta.label}>
      <div className="space-y-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable automation
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">When</label>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground">Wait</label>
          <input
            type="number"
            min={0}
            value={delayValue}
            onChange={(e) => setDelayValue(Math.max(0, Number(e.target.value) || 0))}
            className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-sm"
          />
          <select
            value={delayUnit}
            onChange={(e) => setDelayUnit(e.target.value as "hours" | "days")}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span className="text-xs text-muted-foreground">
            {meta.delayDirection === "before" ? "before the trigger" : "after the trigger"}
          </span>
        </div>

        {meta.supportsCondition && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyIfPaidInFull} onChange={(e) => setOnlyIfPaidInFull(e.target.checked)} />
            Send only when invoice is paid in full
          </label>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Email subject</label>
          <input
            type="text"
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder="Leave blank for the default subject"
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Email body</label>
          <textarea
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            rows={5}
            placeholder="Leave blank for the default message. Supports {clientName}, {companyName}."
            className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm"
          />
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// app/(app)/settings/company/email-automations/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { AUTOMATION_META } from "@/lib/services/emailAutomationRegistry";
import type { AutomationKey, AutomationSettingFields } from "@/lib/services/emailAutomationService";
import type { CompanyProfile } from "@/lib/services/companyProfileService";
import { EmailAutomationRow } from "@/components/settings/EmailAutomationRow";
import { EditAutomationModal } from "@/components/settings/EditAutomationModal";

function EmailAutomationsContent() {
  const { emailAutomationService, companyProfileService } = useServices();
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<AutomationKey, AutomationSettingFields> | null>(null);
  const [editingKey, setEditingKey] = useState<AutomationKey | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    const [profileList, effective] = await Promise.all([
      companyProfileService.listForCompany(profile.companyId),
      emailAutomationService.listEffective(profile.companyId, selectedProfileId),
    ]);
    setProfiles(profileList);
    setSettings(Object.fromEntries(effective.map((e) => [e.key, e])) as Record<AutomationKey, AutomationSettingFields>);
    setLoading(false);
  }, [companyProfileService, emailAutomationService, profile?.companyId, selectedProfileId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(key: AutomationKey, enabled: boolean) {
    if (!profile?.companyId) return;
    await emailAutomationService.upsert(profile.companyId, selectedProfileId, key, { enabled });
    await load();
  }

  async function handleSave(key: AutomationKey, changes: Partial<AutomationSettingFields>) {
    if (!profile?.companyId) return;
    await emailAutomationService.upsert(profile.companyId, selectedProfileId, key, changes);
    await load();
  }

  return (
    <PageContainer>
      <PageHeader
        title="Email Automations"
        description="Automatically send customer emails based on estimates, invoices, payments, and completed jobs."
      />

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-foreground">Editing settings for</label>
        <select
          value={selectedProfileId ?? ""}
          onChange={(e) => setSelectedProfileId(e.target.value || null)}
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          <option value="">Company Default</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.companyName}</option>
          ))}
        </select>
      </div>

      {loading || !settings ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-2">
          {AUTOMATION_META.map((meta) => (
            <EmailAutomationRow
              key={meta.key}
              automationKey={meta.key}
              settings={settings[meta.key]}
              onToggle={(enabled) => handleToggle(meta.key, enabled)}
              onEdit={() => setEditingKey(meta.key)}
            />
          ))}
        </div>
      )}

      {editingKey && settings && (
        <EditAutomationModal
          automationKey={editingKey}
          initial={settings[editingKey]}
          onClose={() => setEditingKey(null)}
          onSave={(changes) => handleSave(editingKey, changes)}
        />
      )}
    </PageContainer>
  );
}

export default function EmailAutomationsPage() {
  return (
    <RequirePermission resource="company_settings" action="update">
      <EmailAutomationsContent />
    </RequirePermission>
  );
}
```

- [ ] **Step 4: Add the nav link**

Grep for how the existing `/settings/company/profiles` link is registered (it may be a hardcoded link inside `app/(app)/settings/page.tsx` rather than `lib/navigation.ts`, since Business Profiles is a Settings sub-page, not a top-level nav item — check both). Add an "Email Automations" entry immediately next to it, same pattern (icon: `Mail` from `lucide-react`), pointing at `/settings/company/email-automations`.

- [ ] **Step 5: Run `npx tsc --noEmit`**

Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the dev server, sign in as admin, navigate to `/settings/company/email-automations`. Confirm: all 11 rows render with their correct default label/description/timing text, the enable toggle flips immediately, "Edit" opens the modal pre-filled with current values, Save persists and the row's timing text updates, switching the profile selector shows "Company Default" values until a profile-specific save diverges them. **Note:** this requires Task 1's migration to have been run against the live database first — if it hasn't, the page will error on load (surface that clearly rather than silently failing).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/settings/company/email-automations/page.tsx" components/settings/EmailAutomationRow.tsx components/settings/EditAutomationModal.tsx lib/navigation.ts
git commit -m "Add Email Automations settings page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Registry candidate-finders, safeguards, and default copy (the Supabase-facing half)

**Files:**
- Modify: `lib/services/emailAutomationRegistry.ts`

**Interfaces:**
- Consumes: `ServerAppServices` (`lib/services/server.ts`) — `projectService`, `estimateService`, `invoiceService`, `paymentService`. `SupabaseClient` (for `audit_logs` queries — the registry needs raw Supabase access for these, since `AuditService` only exposes per-entity `getHistory`, not a company-wide "every transition to status X" query; add that raw query here rather than growing `AuditService`'s interface for a one-off).
- Produces:
  - `interface AutomationCandidate { entityId: string; anchorAt: string }`
  - `interface AutomationRuntime { findCandidates(supabase: SupabaseClient, services: ServerAppServices, companyId: string): Promise<AutomationCandidate[]>; stillEligible(services: ServerAppServices, entityId: string): Promise<boolean>; renderDefault(entity: unknown): { subject: string; body: string } }`
  - `const AUTOMATION_RUNTIME: Record<AutomationKey, AutomationRuntime>` — Task 7 (the cron loop) is the sole consumer.

- [ ] **Step 1: Add the runtime implementations**

Append to `lib/services/emailAutomationRegistry.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerAppServices } from "./server";
import { isOutstandingInvoiceStatus } from "@/components/invoices/invoiceStatus";

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
    // is event-triggered from InvoicePaymentsPanel.tsx. This entry
    // exists so a nonzero configured delay can still be honored by the
    // cron loop as a fallback path (see Task 7).
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
      body: `Thank you again for choosing ${companyName}. If you have a moment, we'd really appreciate a quick review — it helps us a lot.`,
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
```

**Note for the executor:** verify `projectService.getById` and `estimateService.getById` exist with those exact names/signatures before writing this file (grep `lib/services/projectService.ts` and `lib/services/estimateService.ts` for `getById`) — if either is named differently, use the actual name. Same for `invoiceService.getById`.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: no errors. This is the verification step for this task — the runtime functions are integration-shaped (real Supabase queries), so they're checked by type-correctness + the live manual pass in Task 8, consistent with how `app/api/payments/receipt/route.ts` and last session's cron route were verified (no mocked-Supabase unit tests exist elsewhere in this codebase for this class of code).

- [ ] **Step 3: Commit**

```bash
git add lib/services/emailAutomationRegistry.ts
git commit -m "Add candidate-finder/safeguard/default-copy runtime for all 11 automations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Cron integration — the registry-driven loop

**Files:**
- Modify: `app/api/cron/daily-automations/route.ts`

**Interfaces:**
- Consumes: `AUTOMATION_META`, `AUTOMATION_RUNTIME`, `computeDueDate`, `isDue` (Task 2 + 6); `getEffectiveAutomationSettings` (Task 3); `getCompanySettingsByCompanyId`, `getResendClient`, `getFromAddress`, `recordEmailSent` (all already imported in this file from last session).

- [ ] **Step 1: Replace the hardcoded review-request logic with the registry loop**

The existing `sendReviewRequests` function (hardcoded 7-day delay, hardcoded subject/copy) is replaced by a generic `runAutomation` used for every registry entry except `payment_receipt` (which stays event-triggered — see Task 8). Add this function and call it from the main `GET` handler's per-company loop, replacing the old `results.reviewRequests += await sendReviewRequests(...)` call:

```ts
import { AUTOMATION_META, AUTOMATION_RUNTIME, computeDueDate, isDue, type AutomationKey } from "@/lib/services/emailAutomationRegistry";
import { getEffectiveAutomationSettings } from "@/lib/emailAutomationSettings";

/**
 * Runs one registry automation for one company: resolves effective
 * settings, finds candidates, computes due dates, and sends for every
 * candidate that's due, not already logged, and still eligible.
 * Dedup happens BEFORE stillEligible/send — see this file's header and
 * the design spec's §7 for why that ordering is what actually
 * prevents duplicate sends on a repeated cron run.
 */
async function runAutomation(
  supabase: SupabaseClient,
  services: ReturnType<typeof createServerAppServices>,
  companyId: string,
  key: AutomationKey
): Promise<number> {
  const meta = AUTOMATION_META.find((a) => a.key === key)!;
  const runtime = AUTOMATION_RUNTIME[key];
  const settings = await getEffectiveAutomationSettings(supabase, companyId, key);
  if (!settings.enabled) return 0;

  const candidates = await runtime.findCandidates(supabase, services, companyId);
  const now = new Date();
  let sent = 0;

  for (const candidate of candidates) {
    const dueDate = computeDueDate(candidate.anchorAt, settings.delayValue, settings.delayUnit, meta.delayDirection);
    if (!isDue(dueDate, now)) continue;

    const alreadySent =
      meta.entityTable === "estimates"
        ? await estimateEmailAlreadySent(supabase, candidate.entityId, meta.label)
        : await projectOrInvoiceLogAlreadySent(supabase, key, candidate.entityId);
    if (alreadySent) continue;

    if (!(await runtime.stillEligible(services, candidate.entityId))) continue;

    const okToSend = await sendAutomationEmail(supabase, services, companyId, key, meta, candidate.entityId, settings);
    if (okToSend) sent++;
  }

  return sent;
}

async function projectOrInvoiceLogAlreadySent(supabase: SupabaseClient, key: AutomationKey, entityId: string): Promise<boolean> {
  const { data } = await supabase
    .from("automation_email_log")
    .select("id")
    .eq("automation_key", key)
    .eq("entity_id", entityId)
    .limit(1);
  return !!data && data.length > 0;
}

async function estimateEmailAlreadySent(supabase: SupabaseClient, estimateId: string, subject: string): Promise<boolean> {
  const { data } = await supabase
    .from("estimate_emails")
    .select("id")
    .eq("estimate_id", estimateId)
    .eq("subject", subject)
    .limit(1);
  return !!data && data.length > 0;
}
```

`sendAutomationEmail` resolves the recipient (client email — via `project.clientId`/`invoice.clientId`/`estimate.clientId` depending on `meta.entityTable`), renders the subject/body (settings template override → `runtime.renderDefault(companyName)`, with `{clientName}`/`{companyName}` substituted), sends via the existing `getResendClient`/`getFromAddress`/per-profile resolution pattern already in this file (mirror `sendReviewRequests`'s send block exactly — same `fromAddress`/`bccAddresses` construction), and on success writes to `automation_email_log` (project/invoice automations) or calls the existing `recordEmailSent` (estimate automations, using `meta.label` as the tracked subject unless a custom `subjectTemplate` is set — if a custom subject is set, use it for BOTH the sent email and the dedup-check subject, so the dedup lookup in `estimateEmailAlreadySent` above always matches what was actually sent):

```ts
async function sendAutomationEmail(
  supabase: SupabaseClient,
  services: ReturnType<typeof createServerAppServices>,
  companyId: string,
  key: AutomationKey,
  meta: (typeof AUTOMATION_META)[number],
  entityId: string,
  settings: Awaited<ReturnType<typeof getEffectiveAutomationSettings>>
): Promise<boolean> {
  let clientId: string | null = null;
  let profileId: string | null = null;
  if (meta.entityTable === "projects") {
    const project = await services.projectService.getById(entityId);
    clientId = project?.clientId ?? null;
  } else if (meta.entityTable === "estimates") {
    const estimate = await services.estimateService.getById(entityId);
    clientId = estimate?.clientId ?? null;
    profileId = estimate?.profileId ?? null;
  } else {
    const invoice = await services.invoiceService.getById(entityId);
    clientId = invoice?.clientId ?? null;
    profileId = invoice?.profileId ?? null;
  }
  if (!clientId) return false;

  const { data: client } = await supabase.from("clients").select("name, email").eq("id", clientId).maybeSingle();
  const clientEmail = (client as { email?: string } | null)?.email?.trim();
  if (!clientEmail) return false;

  const company = await getCompanySettingsByCompanyId(supabase, companyId, profileId);
  const unlessPlaceholder = (value: string | null | undefined) => (value && !value.startsWith("Add your") ? value : null);
  const fromEmail = getFromAddress(unlessPlaceholder(company.company_email));
  const fromAddress = `${company.company_name} <${fromEmail}>`;
  const bccAddresses = [fromEmail, company.bcc_email].filter((a): a is string => !!a);

  const rendered = AUTOMATION_RUNTIME[key].renderDefault(company.company_name);
  const subject = settings.subjectTemplate?.trim() || rendered.subject;
  const body = (settings.bodyTemplate?.trim() || rendered.body)
    .replaceAll("{clientName}", (client as { name?: string } | null)?.name ?? "")
    .replaceAll("{companyName}", company.company_name);

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0; padding:0; background:#f4f5f6; font-family: Helvetica, Arial, sans-serif;">
      <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius: 10px; padding: 32px;">
          <div style="font-size: 13px; font-weight: 700; color: #111827; letter-spacing: 0.02em; margin-bottom: 24px;">
            ${company.company_name}
          </div>
          <div style="font-size: 14px; line-height: 1.6; color: #1f2429; white-space: pre-wrap;">${body}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: fromAddress,
      replyTo: fromEmail,
      ...(bccAddresses.length > 0 ? { bcc: bccAddresses } : {}),
      to: clientEmail,
      subject,
      html: emailHtml,
    });
    if (result.error) {
      console.error(`Resend rejected the ${key} email:`, result.error);
      return false;
    }
    const resendEmailId = result.data?.id;
    if (meta.entityTable === "estimates") {
      if (resendEmailId) {
        await recordEmailSent(supabase, { companyId, estimateId: entityId, resendEmailId, toAddress: clientEmail, subject, createdBy: null });
      }
    } else {
      await supabase.from("automation_email_log").insert({
        company_id: companyId,
        automation_key: key,
        entity_table: meta.entityTable,
        entity_id: entityId,
        resend_email_id: resendEmailId ?? null,
      });
    }
    return true;
  } catch (err) {
    console.error(`Failed to send ${key} email:`, err);
    return false;
  }
}
```

- [ ] **Step 2: Update the per-company loop in `GET`**

Replace the old review-request block:

```ts
    try {
      results.reviewRequests += await sendReviewRequests(supabase, services, companyId);
    } catch (err) { ... }
```

with a loop over every non-`payment_receipt` automation:

```ts
    for (const meta of AUTOMATION_META) {
      if (meta.key === "payment_receipt") continue; // event-triggered, see Task 8
      try {
        results.automations = (results.automations ?? 0) + (await runAutomation(supabase, services, companyId, meta.key));
      } catch (err) {
        results.errors++;
        console.error(`Daily automations: ${meta.key} failed for company ${companyId}:`, err);
      }
    }
```

Remove the now-dead `sendReviewRequests`, `REVIEW_REQUEST_SUBJECT`, `REVIEW_REQUEST_DELAY_DAYS`, and `daysAgo` (if no longer used elsewhere in the file — `daysFromNow` is still used by `sendUnstaffedJobAlerts`, keep it). Update the `results` object's shape (`{ automations: 0, digests: 0, unstaffedAlerts: 0, errors: 0 }`) and the route's JSDoc header to describe the registry-driven design instead of the old hardcoded 7-day review request.

- [ ] **Step 3: Run `npx tsc --noEmit`**

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, same count as Task 4 (this task adds no new test file — the route is verified by type-correctness + Task 9's live manual pass, matching the codebase's established discipline for Supabase-integration routes)

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/daily-automations/route.ts
git commit -m "Extend daily-automations cron to run the full registry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Refactor Payment Receipt to read settings

**Files:**
- Modify: `app/api/payments/receipt/route.ts`

**Interfaces:**
- Consumes: `getEffectiveAutomationSettings` (Task 3).

- [ ] **Step 1: Add the settings check right after the existing balance recompute**

Find this block (already in the file):

```ts
    // Not fully paid (yet) — a normal, expected outcome for most
    // payments, not an error.
    if (remainingBalance > 0) {
      return NextResponse.json({ ok: true, sent: false, reason: "not_fully_paid" });
    }
```

Replace it with a settings-aware version — `onlyIfPaidInFull` defaults to `true` (today's exact behavior), and an admin can flip it off to send on every recorded payment regardless of remaining balance:

```ts
    const automationSettings = await getEffectiveAutomationSettings(supabase, invoice.company_id, "payment_receipt", invoice.profile_id);
    if (!automationSettings.enabled) {
      return NextResponse.json({ ok: true, sent: false, reason: "automation_disabled" });
    }
    const onlyIfPaidInFull = automationSettings.condition?.onlyIfPaidInFull !== false; // default true
    if (onlyIfPaidInFull && remainingBalance > 0) {
      return NextResponse.json({ ok: true, sent: false, reason: "not_fully_paid" });
    }
```

Add the import at the top of the file:

```ts
import { getEffectiveAutomationSettings } from "@/lib/emailAutomationSettings";
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/payments/receipt/route.ts
git commit -m "Payment receipt reads enabled/paid-in-full condition from automation settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, full count.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds — this is the check that catches a Node-only import leaking into a client bundle (the class of bug hit twice earlier this project with `web-push`); confirm the new registry/settings files are not reachable from any client-bundled page except through `ServicesProvider`'s browser-safe `emailAutomationService`.

- [ ] **Step 4: Live manual check (requires Task 1's migration already run)**

Start the dev server, sign in as admin:
1. `/settings/company/email-automations` — confirm all 11 rows, toggle one off/on, edit one's delay and custom copy, save, reload, confirm it persisted.
2. Switch the profile selector to a real Business Profile, change a setting there, switch back to Company Default, confirm the two don't clash (matches the merge tests from Task 3).
3. Record a real payment against a test invoice with the amount short of the total — confirm no receipt email attempt (still respects "not fully paid" by default). Record enough to zero the balance — confirm a receipt sends, same as before this feature existed.
4. `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview-or-prod-url>/api/cron/daily-automations` (or trigger locally with the same header) — confirm the JSON response's `automations` count and no unexpected `errors`.

- [ ] **Step 5: Report to the user**

Summarize what was verified, and explicitly flag the two things this plan cannot do without the user: (a) run the `20260907000000_email_automations.sql` migration in the Supabase SQL editor, (b) nothing new needed for `CRON_SECRET`/Vercel Cron — already configured last session.
