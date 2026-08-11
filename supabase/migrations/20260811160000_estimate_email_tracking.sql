-- =====================================================================
-- estimate_emails — delivery/open tracking for the "Email Customer"
-- action (components/estimates/EmailCustomerModal.tsx). ADDITIVE ONLY.
--
-- One row per send attempt. The staff-facing "send" API route
-- (app/api/estimates/[id]/send-email/route.ts, via
-- lib/email/sendEstimateEmail.ts) inserts a row immediately after
-- Resend accepts the message, status='sent'. Resend's webhook
-- (app/api/webhooks/resend/route.ts) then updates that same row as
-- delivery/open/bounce events arrive, matched by resend_email_id.
--
-- WHY NO UPDATE POLICY FOR AUTHENTICATED USERS: only two things are
-- ever allowed to write to this table — the send route (an INSERT,
-- under the sender's own session, hence the insert policy below) and
-- the webhook route (UPDATEs, under the SERVICE ROLE key, which
-- bypasses RLS entirely). No authenticated user should ever be able
-- to mark their own email "opened" by hand, so there is deliberately
-- no update/delete policy here at all — the only way this table's
-- status columns change is a verified webhook event from Resend
-- itself (see the webhook route's Svix signature check).
--
-- REPLY TRACKING IS OUT OF SCOPE. Resend does not track replies by
-- default; that requires a verified sending domain plus inbound-email
-- webhook configuration, a separate, heavier feature. This table only
-- ever answers "was it sent / delivered / opened / bounced."
-- =====================================================================

create table if not exists public.estimate_emails (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,

  -- Resend's own id for this send — the join key every webhook event
  -- carries (`data.email_id`). Unique so a duplicate webhook delivery
  -- (Resend, like most providers, does not guarantee exactly-once) can
  -- never create a second row for the same send.
  resend_email_id text not null unique,

  to_address text not null,
  subject text not null,

  -- Coarsest-to-finest known state. 'sent' the moment Resend accepts
  -- the message; later events move this forward, never backward (a
  -- late-arriving 'delivered' after an 'opened' does not un-open it —
  -- enforced in the webhook route, not here).
  status text not null default 'sent'
    check (status in ('sent', 'delivered', 'opened', 'bounced', 'complained', 'failed')),

  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  last_event_at timestamptz,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists estimate_emails_estimate_idx
  on public.estimate_emails (estimate_id, sent_at desc);

create index if not exists estimate_emails_resend_id_idx
  on public.estimate_emails (resend_email_id);

comment on table public.estimate_emails is
  'Delivery/open tracking for estimate emails sent via Resend. One row per send; updated by the Resend webhook as events arrive. No calculation reads this table.';

alter table public.estimate_emails enable row level security;

drop policy if exists estimate_emails_select on public.estimate_emails;
create policy estimate_emails_select on public.estimate_emails
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists estimate_emails_insert on public.estimate_emails;
create policy estimate_emails_insert on public.estimate_emails
  for insert to authenticated
  with check (company_id = public.current_company_id());

-- No update/delete policy for `authenticated` — see the header comment.
-- The webhook route updates rows using the service-role key, which
-- bypasses RLS and therefore needs no policy here at all.

-- ---------------------------------------------------------------------
-- VERIFY — before AND after, these must be identical (additive-only
-- migration, touches no existing table):
--   select count(*), sum(amount) from public.estimate_expenses where deleted_at is null;
--   select count(*) from public.estimates where deleted_at is null;
-- ---------------------------------------------------------------------
