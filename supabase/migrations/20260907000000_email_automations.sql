-- Per-company (optionally per-Business-Profile) configuration for the
-- 9 automated customer emails — see docs/superpowers/specs/
-- 2026-08-31-email-automations-design.md. A row only needs to exist
-- when it diverges from the built-in registry default
-- (lib/services/emailAutomationRegistry.ts); absence = "use the
-- default," same convention as bcc_email/email templates.
create table if not exists public.email_automations (
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

create index if not exists email_automations_company_id_idx on public.email_automations(company_id);

drop policy if exists email_automations_select on public.email_automations;
create policy email_automations_select on public.email_automations
  for select using (company_id = public.current_company_id());
drop policy if exists email_automations_insert on public.email_automations;
create policy email_automations_insert on public.email_automations
  for insert with check (company_id = public.current_company_id());
drop policy if exists email_automations_update on public.email_automations;
create policy email_automations_update on public.email_automations
  for update using (company_id = public.current_company_id());
drop policy if exists email_automations_delete on public.email_automations;
create policy email_automations_delete on public.email_automations
  for delete using (company_id = public.current_company_id());

-- Generic dedup/audit log for automations anchored on an entity other
-- than an estimate (estimate-anchored automations keep using
-- estimate_emails, which already carries Resend delivery-status
-- webhooks that this simpler table deliberately does not duplicate).
-- The unique constraint IS the duplicate-prevention mechanism: a
-- second cron run attempting the same (automation_key, entity_id)
-- fails the insert, caught in application code as "already sent."
create table if not exists public.automation_email_log (
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

create index if not exists automation_email_log_company_id_idx on public.automation_email_log(company_id);

drop policy if exists automation_email_log_select on public.automation_email_log;
create policy automation_email_log_select on public.automation_email_log
  for select using (company_id = public.current_company_id());
-- No insert/update/delete policy for authenticated users — every write
-- happens through the cron route's service-role client, which bypasses
-- RLS entirely (same trust model as app/api/portal/sign/route.ts).
