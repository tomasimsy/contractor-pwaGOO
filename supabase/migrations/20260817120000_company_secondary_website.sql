-- A company can legitimately operate under two public-facing sites (e.g.
-- a dba's own domain alongside the legal entity's), and company_website
-- only ever held one. Additive column, same convention as
-- 20260720000000_company_branding_settings.sql — nothing existing changes.
alter table public.company_settings add column if not exists company_website_2 text;
