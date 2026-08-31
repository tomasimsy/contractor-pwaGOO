-- A plain `unique (company_id, profile_id, automation_key)` constraint
-- (20260907000000_email_automations.sql) does NOT stop two rows both
-- having profile_id IS NULL for the same (company_id, automation_key)
-- — Postgres treats NULL as never equal to NULL for uniqueness
-- purposes, so the "company default" row (profileId = null) has no
-- real DB-level duplicate protection today. Every profile-specific row
-- IS protected (non-null values compare normally), which is why the
-- race this migration fixes could only ever surface as a genuine
-- constraint violation for a non-null profile_id save — but the null
-- case was silently unprotected the whole time and needs its own
-- index to close the gap the same way.
create unique index if not exists email_automations_company_default_key
  on public.email_automations (company_id, automation_key)
  where profile_id is null;
