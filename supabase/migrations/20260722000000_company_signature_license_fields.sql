-- Remaining company-identity fields requested for full multi-tenant
-- branding: license number, and the name/title used to represent the
-- contractor's own "signature" on documents (e.g. "Signed by: Jane Doe,
-- Owner"). Everything else needed (terms, warranty, payment instructions,
-- footer, logo, dba, contact info) already exists on company_settings.

alter table public.company_settings add column if not exists license_number text;
alter table public.company_settings add column if not exists signature_name text;
alter table public.company_settings add column if not exists signature_title text;
