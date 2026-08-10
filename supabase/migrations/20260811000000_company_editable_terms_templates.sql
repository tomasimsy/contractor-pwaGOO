-- =====================================================================
-- Per-company overrides for the three Terms & Conditions templates.
--
-- lib/estimateTerms.ts remains the single source of the DEFAULT text
-- for 'roofing' | 'custom' | 'home_remodel'. These three columns hold
-- nothing but an OPTIONAL per-company override of that default —
-- nullable, no default value. Empty/null means "this company hasn't
-- customized this template yet, use the built-in text," exactly the
-- same convention `company_settings.terms_conditions`/`warranty_text`
-- already use (see lib/company.ts's mergeCompanyDefaults). Editing a
-- template from Settings therefore changes what EVERY estimate on that
-- key shows — past and future — the same way editing the company
-- footer message changes every future document; that is the explicit
-- point of making these dynamic rather than frozen per estimate.
--
-- Same table every PDF route, the Settings page, and the customer
-- portal already read/write via lib/company.ts's
-- getCompanySettingsByCompanyId/updateCompanySettings — no new table.
-- =====================================================================

alter table public.company_settings
  add column if not exists terms_roofing text,
  add column if not exists terms_custom text,
  add column if not exists terms_home_remodel text;

comment on column public.company_settings.terms_roofing is
  'Optional override of the built-in "roofing" Terms & Conditions template (lib/estimateTerms.ts). Null = use the built-in default.';
comment on column public.company_settings.terms_custom is
  'Optional override of the built-in "custom" Terms & Conditions template. Null = use the built-in default.';
comment on column public.company_settings.terms_home_remodel is
  'Optional override of the built-in "home_remodel" Terms & Conditions template. Null = use the built-in default.';

-- ---------------------------------------------------------------------
-- get_estimate_terms_template(p_token) — WIDENED, not replaced with a
-- new function: this function was added in this same feature (see
-- 20260810000000_estimate_terms_template.sql), created fresh by this
-- app's own tracked migrations, not the untracked live
-- `get_customer_portal` — so, unlike that one, it is safe to change in
-- place; nothing outside this feature depends on its old shape yet.
--
-- Returns JSON {key, override} instead of a bare key: the portal page
-- has no other authenticated way to read this company's override text
-- (RLS blocks a direct anon read of company_settings, same as
-- estimates), and duplicating the English default text into SQL would
-- break the single-source-of-truth this whole feature exists to keep.
-- So SQL hands back the raw ingredients; lib/estimateTerms.ts's
-- getEstimateTermsTemplate() — the one place that already knows every
-- default — does the actual fallback resolution, in TypeScript, in
-- every caller (PDF route, EstimateDetail, portal) alike.
-- ---------------------------------------------------------------------
-- Return type is changing (text -> json); CREATE OR REPLACE cannot do
-- that in place (Postgres error 42P13), so the old signature has to go
-- first. Safe here specifically because this function was created
-- fresh by THIS app's own migration earlier in this same feature
-- (20260810000000) — nothing outside it depends on the old shape yet.
drop function if exists public.get_estimate_terms_template(text);

create function public.get_estimate_terms_template(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'key', e.terms_template,
    'override', case e.terms_template
      when 'roofing' then cs.terms_roofing
      when 'custom' then cs.terms_custom
      when 'home_remodel' then cs.terms_home_remodel
      else null
    end
  )
  from public.estimates e
  left join public.company_settings cs on cs.company_id = e.company_id
  where e.customer_token = p_token
    and e.deleted_at is null
  limit 1;
$$;

grant execute on function public.get_estimate_terms_template(text) to anon, authenticated;
