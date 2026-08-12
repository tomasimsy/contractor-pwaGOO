-- =====================================================================
-- estimate_notes — free-text internal staff notes on an estimate.
-- ADDITIVE ONLY. No existing table touched, no calculation reads this.
--
-- Distinct from:
--   audit_logs      SYSTEM-GENERATED status-change history (estimate
--                    approved, invoice created, etc.) — the existing
--                    "Activity Timeline" section. Read-only, one row
--                    per status transition, never hand-written.
--   estimate_emails Delivery/open tracking for sent emails.
--
-- This table is the opposite: STAFF-WRITTEN, freeform ("customer
-- called, wants to add a skylight", "waiting on HOA approval"), no
-- fixed shape, no calculation ever reads it.
-- =====================================================================

create table if not exists public.estimate_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,

  body text not null check (char_length(btrim(body)) > 0),

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),

  -- Soft delete — same convention as every other staff-editable table
  -- in this app (estimates, expenses, ...): a note added by mistake
  -- disappears from view without destroying the row outright.
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create index if not exists estimate_notes_estimate_idx
  on public.estimate_notes (estimate_id, created_at desc)
  where deleted_at is null;

comment on table public.estimate_notes is
  'Free-text internal staff notes on an estimate. Staff-written, no fixed shape, distinct from audit_logs (system-generated status history). No financial calculation reads this table.';

alter table public.estimate_notes enable row level security;

drop policy if exists estimate_notes_select on public.estimate_notes;
create policy estimate_notes_select on public.estimate_notes
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists estimate_notes_insert on public.estimate_notes;
create policy estimate_notes_insert on public.estimate_notes
  for insert to authenticated
  with check (company_id = public.current_company_id());

-- Any authenticated member of the company can remove a note (not just
-- its author) — same collaborative-team model the rest of this app's
-- staff-facing tables use (e.g. expenses), not a per-user ownership
-- lock a small team would find more annoying than useful.
drop policy if exists estimate_notes_update on public.estimate_notes;
create policy estimate_notes_update on public.estimate_notes
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ---------------------------------------------------------------------
-- VERIFY — before AND after, these must be identical (additive-only):
--   select count(*) from public.estimates where deleted_at is null;
-- ---------------------------------------------------------------------
