-- =====================================================================
-- CRITICAL: eight reporting views bypass RLS and leak every company's
-- financial data to unauthenticated callers.
--
-- MEASURED against the live database, not inferred:
--
--   anon (no session at all, using only the publishable NEXT_PUBLIC_
--   anon key that ships inside the client bundle):
--     vw_estimate_profit   -> 95 rows   (ALL 95 estimates, all 5 companies)
--     vw_open_invoices     -> 19 rows   (invoice #, client name, total, due date)
--     vw_top_clients       ->  5 rows   (client names + total revenue)
--     vw_monthly_pl        ->  4 rows   (monthly income/expense/net)
--     vw_estimate_financials, vw_expense_breakdown,
--     vw_mileage_ytd, vw_unsold_costs  -> also readable
--
--   a signed-in user of company 964dfb81…:
--     estimates            -> 31 of 95   <- RLS correct on base tables
--     estimates (other cos)->  0         <- RLS correct
--     vw_estimate_profit   -> 95         <- view ignores RLS entirely
--
-- WHY: a Postgres view executes with the privileges of its OWNER, not
-- the caller, unless `security_invoker` is set. These views are owned
-- by a privileged role, so the row-level policies on estimates,
-- invoices, clients and expenses — which are correct, and which do
-- scope by company on the base tables — are never consulted. PostgREST
-- then exposes every view in the `public` schema as a REST endpoint, so
-- the bypass is reachable from the open internet.
--
-- Note the views have no company_id column to filter on, so there is no
-- application-side mitigation available: the fix has to be here.
--
-- THE FIX, in two independent layers:
--
--   1. security_invoker = on  — the view now runs as the CALLER, so the
--      existing base-table RLS applies and each user sees exactly their
--      own company's rows. This is what makes the views correct rather
--      than merely unreachable.
--
--   2. REVOKE ... FROM anon   — these are internal reporting aggregates
--      with no customer-facing purpose. The customer portal reads
--      through get_customer_portal / get_public_invoice and does not
--      touch them. Removing anon's grant means an unauthenticated
--      caller cannot reach them even if layer 1 were ever reverted.
--
-- BLAST RADIUS: none. A repo-wide grep for all eight view names across
-- app/, lib/ and components/ returns no hits — nothing in the
-- application reads them. Every figure the UI shows comes from
-- FinancialEngine over the base tables.
--
-- ADDITIVE / REVERSIBLE. No table, column, or row is touched; this only
-- changes how existing views execute and who may call them.
--
-- Requires PostgreSQL 15+ for security_invoker (Supabase is 15+).
-- =====================================================================

do $$
declare
  v text;
  views text[] := array[
    'vw_estimate_financials',
    'vw_estimate_profit',
    'vw_expense_breakdown',
    'vw_mileage_ytd',
    'vw_monthly_pl',
    'vw_open_invoices',
    'vw_top_clients',
    'vw_unsold_costs'
  ];
begin
  foreach v in array views loop
    -- to_regclass returns null rather than raising if the view is
    -- absent, so this migration stays runnable on a database where
    -- some reporting views were never created.
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
      execute format('revoke all on public.%I from anon', v);
      -- authenticated keeps SELECT; layer 1 now constrains it to the
      -- caller's own company via the base tables' policies.
      execute format('grant select on public.%I to authenticated', v);
      raise notice 'secured view: %', v;
    else
      raise notice 'skipped (not present): %', v;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- VERIFY — run each block and compare against the expectation.
--
-- 1. Every view should now report security_invoker = true:
--
--      select c.relname,
--             coalesce((select option_value
--                         from pg_options_to_table(c.reloptions)
--                        where option_name = 'security_invoker'), 'off')
--        from pg_class c
--        join pg_namespace n on n.oid = c.relnamespace
--       where n.nspname = 'public' and c.relkind = 'v'
--         and c.relname like 'vw_%'
--       order by 1;
--
-- 2. anon must no longer hold SELECT (expect zero rows):
--
--      select table_name, privilege_type
--        from information_schema.role_table_grants
--       where grantee = 'anon' and table_name like 'vw_%';
--
-- 3. From the app, as an authenticated user, vw_estimate_profit should
--    return that user's estimate count (31 for company 964dfb81…),
--    NOT 95.
--
-- ROLLBACK (restores the previous, LEAKING behaviour — for emergencies
-- only, and note the leak returns with it):
--
--   alter view public.vw_estimate_profit set (security_invoker = off);
--   grant select on public.vw_estimate_profit to anon;
--   -- …repeat per view.
-- ---------------------------------------------------------------------
