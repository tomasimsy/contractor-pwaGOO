-- =====================================================================
-- audit_logs: index the per-entity timeline lookup.
--
-- MEASURED, not guessed. On the Estimate Detail page this was the
-- single slowest request of the 145 that page issued:
--
--     audit_logs?select=*&company_id=eq...&entity_table=eq...&entity_id=eq...
--       -> 1,184 ms  (and a second identical call at 761 ms)
--
-- The table holds ~1,775 rows and grows with EVERY audited write, so
-- this cost rises forever. No index on it exists anywhere in
-- supabase/migrations — confirmed by grep.
--
-- The filter is an exact-equality triple plus a sort, which a single
-- composite index serves completely:
--     where company_id = ? and entity_table = ? and entity_id = ?
--     order by occurred_at desc
--
-- Column order matters: the three equality predicates come first (most
-- selective last), then the sort column, so Postgres can satisfy both
-- the lookup AND the ordering from the index without a sort step.
--
-- ADDITIVE ONLY. No table, no column, no data touched — this creates
-- an index and nothing else. CONCURRENTLY so it does not lock writes
-- while building.
--
-- NOTE: `create index concurrently` cannot run inside a transaction
-- block. Run this file on its own; do not wrap it in begin/commit.
-- =====================================================================

create index concurrently if not exists audit_logs_entity_timeline_idx
  on public.audit_logs (company_id, entity_table, entity_id, occurred_at desc);

comment on index public.audit_logs_entity_timeline_idx is
  'Serves AuditLogRepository.queryByEntity (per-entity Activity Timeline): equality on company_id/entity_table/entity_id plus occurred_at DESC ordering, from one index.';

-- ---------------------------------------------------------------------
-- VERIFY — before and after. Expect a Seq Scan before, an Index Scan
-- using audit_logs_entity_timeline_idx after.
--
--   explain analyze
--   select * from public.audit_logs
--    where company_id = '<uuid>' and entity_table = 'estimates' and entity_id = '<uuid>'
--    order by occurred_at desc
--    limit 100;
--
-- ROLLBACK (safe, instant):
--   drop index concurrently if exists public.audit_logs_entity_timeline_idx;
-- ---------------------------------------------------------------------
