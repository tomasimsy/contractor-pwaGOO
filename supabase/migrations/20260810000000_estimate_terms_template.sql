-- =====================================================================
-- Terms & Conditions template selection, per estimate.
--
-- ONE COLUMN, ONE SOURCE OF TRUTH.
-- `terms_template` stores only which template the estimate was created
-- with — 'roofing' | 'custom' | 'home_remodel'. The actual TEXT for
-- each template lives in exactly one place in the app,
-- lib/estimateTerms.ts, never duplicated into this table or any other.
-- That is what lets an existing estimate "keep its original terms":
-- the key is what's frozen at creation time; every renderer (Estimate
-- Detail, the customer portal, the generated PDF) resolves that key
-- back to the same shared text.
--
-- DEFAULT 'custom' is deliberate, not arbitrary: every estimate that
-- already exists predates this column and never had roofing- or
-- remodel-specific terms — the PDF route hard-coded one generic
-- paragraph for every estimate regardless of type. That paragraph IS
-- what lib/estimateTerms.ts's "custom" template's body now holds
-- verbatim, so the default here means an existing estimate renders
-- IDENTICAL terms after this migration, not merely similar ones. No
-- backfill UPDATE is needed — the column default handles every
-- pre-existing row automatically.
-- =====================================================================

alter table public.estimates
  add column if not exists terms_template text not null default 'custom';

alter table public.estimates
  drop constraint if exists estimates_terms_template_check;

alter table public.estimates
  add constraint estimates_terms_template_check
  check (terms_template in ('roofing', 'custom', 'home_remodel'));

comment on column public.estimates.terms_template is
  'Which Terms & Conditions template this estimate was created with. The template TEXT lives in lib/estimateTerms.ts, never here — this column is only the key, so editing the shared template text does not require a migration, and an estimate''s key never silently changes on its own.';

-- ---------------------------------------------------------------------
-- Portal read: get_estimate_terms_template(p_token)
--
-- A NEW, narrowly-scoped function rather than editing the existing
-- `get_customer_portal` RPC in place — that function already exists
-- live on this Supabase project, was created outside this repo's
-- tracked migration history, and this migration cannot safely
-- introspect/rewrite it blind. Same reasoning, same pattern, as
-- `get_portal_change_orders` in
-- 20260730130000_change_order_portal_approval.sql: a second,
-- purpose-built read is zero risk to the existing portal payload the
-- page already depends on.
--
-- Scoped by the estimate's own customer_token, exactly like every
-- other portal read — a wrong token returns null, never another
-- estimate's terms.
-- ---------------------------------------------------------------------
create or replace function public.get_estimate_terms_template(p_token text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select e.terms_template
  from public.estimates e
  where e.customer_token = p_token
    and e.deleted_at is null
  limit 1;
$$;

grant execute on function public.get_estimate_terms_template(text) to anon, authenticated;
