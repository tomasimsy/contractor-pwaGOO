-- =====================================================================
-- Real Subcontractor/Agent modules (Prompts 42/43) — schema fix-up.
--
-- All 6 underlying tables (subcontractors, agents, estimate_subcontractors,
-- estimate_agents, subcontractor_payments, agent_payments) already exist
-- live, already company-scoped by RLS, already wired into the generic
-- audit + soft-delete triggers (confirmed via the live Supabase REST
-- OpenAPI schema — no new tables created here). Two real gaps found by
-- directly probing the live schema (not guessed from migration files,
-- which for these legacy tables predate this repo's tracked history):
--
-- 1. `delete_reason` is missing on subcontractors, agents,
--    estimate_subcontractors, and estimate_agents (it DOES already
--    exist on subcontractor_payments/agent_payments). Every financial
--    soft-delete in this app requires a non-empty reason
--    (ValidationService.validateDeleteReason) and persists it — the
--    same gap fixed for estimate_areas earlier
--    (20260802000300_estimate_areas_audit_columns.sql).
--
-- 2. `estimate_subcontractors.is_final` does not exist at all.
--    ValidationService.validateAssignmentAmount already enforces
--    "an assignment marked final can no longer have its amount
--    changed" — a rule the in-memory test double already implements —
--    but the real table has nowhere to persist that flag. Only
--    SubcontractorAssignment models isFinal (AgentAssignment does not),
--    so this column is added to estimate_subcontractors only.
-- =====================================================================

alter table if exists public.subcontractors
add column if not exists delete_reason text;

alter table if exists public.agents
add column if not exists delete_reason text;

alter table if exists public.estimate_subcontractors
add column if not exists delete_reason text,
add column if not exists is_final boolean not null default false;

alter table if exists public.estimate_agents
add column if not exists delete_reason text;

comment on column public.subcontractors.delete_reason is 'Required reason text captured on soft-delete (see ValidationService.validateDeleteReason).';
comment on column public.agents.delete_reason is 'Required reason text captured on soft-delete (see ValidationService.validateDeleteReason).';
comment on column public.estimate_subcontractors.delete_reason is 'Required reason text captured on soft-delete (see ValidationService.validateDeleteReason).';
comment on column public.estimate_subcontractors.is_final is 'Once true, ValidationService blocks further contracted-amount edits (see SubcontractorService.markAssignmentFinal).';
comment on column public.estimate_agents.delete_reason is 'Required reason text captured on soft-delete (see ValidationService.validateDeleteReason).';
