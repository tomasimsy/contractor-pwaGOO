-- =====================================================================
-- estimate_emails — add 'clicked' tracking. ADDITIVE ONLY.
--
-- Resend's `email.clicked` webhook event fires when a recipient
-- clicks a link inside the email (here, the "View Proposal Online"
-- button — see lib/email/sendEstimateEmail.ts). This was previously
-- explicitly ignored (see the webhook route's original comment); adds
-- it as a real, tracked status, ranked ABOVE 'opened' — clicking is a
-- strictly more engaged signal than opening, and the app's status
-- only ever moves forward (lib/email/emailTracking.ts's STATUS_RANK).
-- =====================================================================

alter table public.estimate_emails
  add column if not exists clicked_at timestamptz;

alter table public.estimate_emails
  drop constraint if exists estimate_emails_status_check;

alter table public.estimate_emails
  add constraint estimate_emails_status_check
  check (status in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed'));

comment on column public.estimate_emails.clicked_at is
  'When the recipient clicked a link inside the email (Resend''s email.clicked event) — most commonly the "View Proposal Online" button.';

-- ---------------------------------------------------------------------
-- VERIFY — before AND after, these must be identical (additive-only):
--   select count(*) from public.estimate_emails;
-- ---------------------------------------------------------------------
