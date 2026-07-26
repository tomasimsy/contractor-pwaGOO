-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING.
--
-- Adds `location_id` to `profiles`, closing a real gap found during
-- contractor-app-v2's authentication-completion pass: AuthProvider's
-- profile fetch selected `location_id` from `profiles` as if it
-- already existed there, and a too-broad try/catch silently treated
-- the resulting "column does not exist" Postgres error the same as
-- "no profile" — meaning role/company would silently and permanently
-- fail to load for every real user, with no visible error. The app
-- code has been fixed to not depend on this column (locationId is
-- explicitly null until this migration is applied); this migration is
-- the other half of that fix — the actual column, so a future
-- "assign a user to a location" feature has somewhere to write.
--
-- Nullable, no default-value backfill needed: every existing profile
-- simply has no location assigned yet, which is correct — "no
-- location" is a valid state for a single-location company (see
-- contractor-app-v2's LocationService/LocationProvider, which already
-- handle a company with zero locations by hiding the switcher).
--
-- Not self-referential to a `locations` table on purpose: contractor-pwa
-- itself has no `locations` table yet (multi-location so far exists
-- only in contractor-app-v2's service layer — LocationService,
-- currently only proven against the in-memory test harness, no
-- Supabase-backed implementation). Adding the FK constraint is a
-- follow-up once that table exists here too; a bare nullable uuid
-- column is the safe, additive step that doesn't block on it.
-- =====================================================================

alter table public.profiles add column if not exists location_id uuid;

comment on column public.profiles.location_id is
  'Which company location/branch this user is assigned to, if any. No FK yet — contractor-pwa has no locations table; contractor-app-v2''s LocationService is the only implementation today, in-memory only. Add the FK once a real locations table exists in this schema.';
