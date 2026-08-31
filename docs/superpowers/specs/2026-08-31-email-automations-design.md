# Email Automations / Customer Communication Settings — Design

## 1. Goal

A dedicated Settings page (`/settings/company/email-automations`) where an
admin controls **when and under what conditions** the app's automated
customer emails go out — not a generic "email settings" page. Nine
automations, each independently enabled/disabled, with a configurable
delay and (for one of them) a send condition. Settings apply company-wide
by default, with an optional per–Business Profile override, matching the
existing `bcc_email`/email-template override pattern.

This is not a new email system: every automation reuses the existing
per-profile Resend/from-address resolution, and the settings only change
*when* and *whether* an email already-known-how-to-be-sent actually goes
out.

## 2. What already exists (reused, not duplicated)

- **Scheduler**: `app/api/cron/daily-automations/route.ts` — this app's
  only cron mechanism (Vercel Cron, `CRON_SECRET`-guarded, service-role
  Supabase client), built in the prior session. This design extends it;
  it does not introduce a second scheduler.
- **Status timelines for free**: every status-changing write
  (`projectService.changeStatus`, `estimateService.changeStatus`) already
  calls `AuditService.recordStatusChange`, which appends to `audit_logs`
  (`entity_table`, `entity_id`, `new_values->>'status'`, `occurred_at`).
  "When did this project become completed" / "when was this estimate
  sent" are answerable today with **zero new columns** — confirmed by
  reading `lib/services/supabase/projectService.ts` and
  `lib/services/supabase/estimateService.ts`.
- **Current status as the safeguard**: `estimate.signature` (non-null =
  signed) and `estimate.status` (`sent`/`viewed` = still pending) are the
  literal "don't follow up after signing" check. `invoice.status`
  (already derived — see `isOutstandingInvoiceStatus`,
  `components/invoices/invoiceStatus.ts`) is the literal "don't remind
  after paid" check. Neither needs new state; both are read fresh at
  send time.
- **Per-profile override pattern**: `company_settings` (company-wide
  default) + `company_profiles` (nullable per-brand override), merged
  via `mergeProfileOverrides` (`lib/company.ts`). Reused verbatim for
  automation settings scoping.
- **Existing automated sends being refactored in, not replaced**:
  - Payment Receipt (`app/api/payments/receipt/route.ts`) — currently
    hardcoded to "only when invoice reaches $0 balance." Refactored to
    read enabled/condition/delay from settings; default behavior
    unchanged.
  - Google Review request (added to the cron route last session) —
    refactored to read its delay from settings instead of a hardcoded
    constant; `company_settings.review_link` (added last session) is
    unchanged and still the review URL source.
  - `estimate_emails` tracking table — still used for dedup/audit of the
    two estimate-anchored automations (review request, follow-ups),
    exactly as the review-request automation already does.

## 3. What's genuinely new

Two tables, justified because nothing existing stores "is automation X
enabled, with what delay, under what condition" or provides a
dedup/audit log for automations anchored on an entity other than an
estimate.

### `email_automations`

```sql
create table public.email_automations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  profile_id uuid references public.company_profiles(id),  -- null = company default
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
  condition jsonb,              -- e.g. {"onlyIfPaidInFull": true} (payment_receipt only)
  subject_template text,        -- null = built-in default
  body_template text,           -- null = built-in default
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (company_id, profile_id, automation_key)
);
```

RLS: company-scoped, same 4-policy shape as `estimate_photos`/other
per-company tables (select/insert/update/delete where
`company_id = current_company_id()`).

A row only needs to exist when it diverges from the built-in default.
Resolution order when reading effective settings for one automation:
**profile-specific row → company-default row (`profile_id is null`) →
hardcoded registry default** (see §4). This means a company that never
opens the new settings page gets identical behavior to today.

### `automation_email_log`

```sql
create table public.automation_email_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  automation_key text not null,
  entity_table text not null,   -- 'projects' | 'invoices'
  entity_id uuid not null,
  sent_at timestamptz not null default now(),
  resend_email_id text,
  unique (automation_key, entity_id)
);
```

RLS: company-scoped select only (system-written via service-role in the
cron route; no client-side insert path). The `unique` constraint is
itself the duplicate-prevention mechanism for the four project-anchored
automations and the two invoice-anchored ones — a second cron run
attempting the same `(automation_key, entity_id)` simply fails the
insert, caught and treated as "already sent."

The two estimate-anchored automations (`google_review`,
`estimate_followup_*`) keep using `estimate_emails` (subject-match
dedup) exactly as the review-request automation already does, since
that table is a better fit there (it also carries Resend
delivered/opened/clicked webhook status, which this simpler table
deliberately does not duplicate).

## 4. Automation registry

One in-code array (`lib/services/emailAutomationRegistry.ts`), the
single source of truth for "what does automation X mean" — the cron
loop and the settings page both defer to it; neither hardcodes business
logic of its own.

```ts
interface AutomationDefinition {
  key: AutomationKey;
  label: string;
  description: string;
  entityTable: "projects" | "estimates" | "invoices";
  defaultDelay: { value: number; unit: "hours" | "days" };
  defaultEnabled: boolean;
  supportsCondition: boolean;   // true only for payment_receipt
  /** "after" (default) fires at anchorAt + delay — every automation
   * except invoice_due_reminder. "before" fires at anchorAt - delay —
   * invoice_due_reminder only (delay counts backward from the due
   * date, since a reminder ahead of the deadline is the entire point). */
  delayDirection: "after" | "before";
  findCandidates(services: ServerAppServices, companyId: string):
    Promise<{ entityId: string; anchorAt: string }[]>;
  stillEligible(services: ServerAppServices, entityId: string): Promise<boolean>;
  renderDefault(entity: unknown): { subject: string; body: string };
}
```

Anchor resolution per automation (all confirmed against real service
code during design, not assumed):

| Automation | Anchor | `stillEligible` check |
|---|---|---|
| `payment_receipt` | payment's own `paymentDate` | invoice balance recomputed at send time (existing route logic, untouched) |
| `google_review` | last payment's `paymentDate` on a `paid` invoice | invoice still `paid` |
| `estimate_followup_1/2/3` | latest `audit_logs` row, `entity_table='estimates'`, `new_values->>'status'='sent'` | `estimate.status` still `sent`/`viewed` AND `estimate.signature` still null |
| `invoice_due_reminder` | `invoice.dueDate` (fires `delay` days *before*) | `isOutstandingInvoiceStatus(invoice.status)` |
| `invoice_overdue_reminder` | `invoice.dueDate` (fires `delay` days *after*) | `isOutstandingInvoiceStatus(invoice.status)` |
| `job_completion_thankyou` | `audit_logs`, `entity_table='projects'`, `new_values->>'status'='completed'` | `project.status` still `completed` |
| `post_job_checkin` | same as above | same |
| `future_project_checkin` | same as above | same |
| `warranty_checkin` | same as above | same |

The four project-anchored automations share one `findCandidates`
implementation (parameterized by nothing — they all query the identical
`audit_logs` shape) and differ only in `defaultDelay` and their default
email copy.

## 5. Cron integration

`app/api/cron/daily-automations/route.ts` gains one new per-company step
(additive — the existing weekly-digest and unstaffed-job-alert push
checks from last session are untouched):

```
for each company:
  for each entry in AUTOMATION_REGISTRY:
    settings = resolveEffectiveSettings(companyId, entry.key)   // profile override -> company default -> registry default
    if !settings.enabled: continue
    candidates = await entry.findCandidates(services, companyId)
    for each candidate:
      dueDate = entry.delayDirection === "before"
        ? candidate.anchorAt - settings.delay
        : candidate.anchorAt + settings.delay
      if today < dueDate: continue
      if alreadyLogged(entry, candidate.entityId): continue      // dedup — checked BEFORE any send attempt
      if !(await entry.stillEligible(services, candidate.entityId)): continue
      render subject/body (settings template override -> entry.renderDefault)
      send via existing per-profile Resend resolution
      write log row (automation_email_log or estimate_emails, per entry.entityTable)
```

Every company × automation pair is wrapped in its own `try/catch` — one
failure never blocks another automation or another company, matching
the isolation already in the route today.

`payment_receipt` is a partial exception to this loop shape: it stays
event-triggered (called from `InvoicePaymentsPanel.tsx` right after a
payment is recorded, exactly as today), not polled by the daily cron —
an "immediate" default delay makes daily polling the wrong mechanism
for it. Its refactor is: read `enabled`/`condition.onlyIfPaidInFull`
from settings before running its existing balance-check logic, instead
of the condition being hardcoded. If `delay_value > 0` is ever
configured for it (not a default any preset offers, but the UI allows
it), the send is deferred to the next cron run using the same
`automation_email_log` dedup path as the other automations — so the
event-triggered path and the polled path share one log table and can
never double-send if a delay is configured.

## 6. Settings page & service

`app/(app)/settings/company/email-automations/page.tsx` —
`RequirePermission resource="company_settings" action="update"` (reuses
the existing permission; no new resource). A profile selector at the
top (reusing the existing Business-Profile switcher pattern) toggles
between editing the company default and one profile's overrides.

New Layer 2 `EmailAutomationService`
(`lib/services/emailAutomationService.ts` +
`lib/services/supabase/emailAutomationService.ts`, wired into
`ServicesProvider.tsx`/`lib/services/server.ts`/`inMemoryServices.ts`
like every other service):

```ts
interface EmailAutomationService {
  listEffective(companyId: UUID, profileId?: UUID | null): Promise<EffectiveAutomationSetting[]>;  // registry defaults merged with stored overrides
  upsert(companyId: UUID, profileId: UUID | null, key: AutomationKey, changes: Partial<AutomationSettingFields>): Promise<EffectiveAutomationSetting>;
}
```

All business meaning (what each key does, its default delay/copy) stays
in the registry; this service is CRUD only.

Page UI, per the 9 rows: name, description, enabled toggle (writes
immediately via `upsert`), trigger + timing summary text, "Edit"
opening a modal — Enable checkbox, `Wait [number] [days/hours]`, a
condition checkbox (Payment Receipt only: "Send only when invoice is
paid in full"), subject/body textareas (placeholder hints shown, same
convention as the existing payment-receipt template field — empty =
built-in default), Save.

## 7. Safeguards — mapped to concrete mechanisms

- **Never follow up after signed/accepted**: `stillEligible` re-checks
  `estimate.status`/`signature` at send time, not schedule time.
- **Never remind after paid**: `stillEligible` re-checks
  `isOutstandingInvoiceStatus` at send time.
- **No duplicates on repeated cron runs**: the dedup check happens
  before any send attempt, keyed by `(automation_key, entity_id)` —
  enforced at the DB level by `automation_email_log`'s unique
  constraint, not just application logic.
- **Respect disabled automations**: filtered out before
  `findCandidates` even runs.
- **Respect company email configuration**: every send goes through the
  existing per-profile `getFromAddress`/BCC resolution; no automation
  bypasses it.
- **Audit/history**: `automation_email_log` (4 project + 2 invoice
  automations) and `estimate_emails` (2 estimate automations) together
  cover all 9 — every automated send is queryable after the fact.

## 8. Out of scope (explicitly not building)

- No generic rules/condition-builder engine — 9 fixed automations, one
  condition field used by exactly one of them.
- No SMS — email only, matching the request.
- No per-recipient/per-client override — settings are company/profile
  level only.
- No retry/backoff queue — a failed send is logged as an error and
  picked up cleanly next run since nothing is marked "sent" on failure.

## 9. Files touched

New:
- `supabase/migrations/<timestamp>_email_automations.sql`
- `lib/services/emailAutomationRegistry.ts`
- `lib/services/emailAutomationService.ts`
- `lib/services/supabase/emailAutomationService.ts`
- `app/(app)/settings/company/email-automations/page.tsx`
- `components/settings/EmailAutomationRow.tsx`,
  `components/settings/EditAutomationModal.tsx`

Edited:
- `app/api/cron/daily-automations/route.ts` (add the registry-driven
  loop; existing review-request/digest/unstaffed-alert logic
  refactored to read from settings where applicable, otherwise
  untouched)
- `app/api/payments/receipt/route.ts` (read enabled/condition from
  settings instead of hardcoded)
- `components/providers/ServicesProvider.tsx`,
  `lib/services/server.ts`, `lib/services/testing/inMemoryServices.ts`
  (wire in `EmailAutomationService`)
- `lib/navigation.ts` (add the settings page link)
