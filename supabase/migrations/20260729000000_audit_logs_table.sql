-- =====================================================================
-- DRAFT — REVIEW BEFORE RUNNING. Reliability system, part 1: audit
-- logs. Tracks exactly six things: user, company, action, record
-- changed, old value, new value, timestamp.
--
-- Companion to the existing set_audit_fields()/soft_delete_instead()
-- triggers (20260715000100/20260715000200): those write
-- created_by/updated_by/deleted_by onto the row itself, answering "who
-- last touched this row." They do not answer "what did this row look
-- like before, and what changed" — that's what this table is for.
-- =====================================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('create', 'update', 'delete', 'restore', 'status_change')),
  entity_table text not null,
  entity_id uuid not null,
  old_values jsonb, -- null for 'create' — nothing existed before
  new_values jsonb, -- null for 'delete' — nothing exists after
  occurred_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Reliability system: who did what to which record, old value -> new value, when. Company-scoped, append-only (no update/delete policy — see below).';

create index if not exists audit_logs_entity_idx on public.audit_logs(entity_table, entity_id, occurred_at desc);
create index if not exists audit_logs_company_idx on public.audit_logs(company_id, occurred_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (company_id = public.current_company_id());

-- No insert/update/delete policy for ordinary callers — audit_logs is
-- written ONLY by the trigger function below (SECURITY DEFINER) and by
-- application code going through the same elevated path for the
-- semantic status-change entries AuditService.recordStatusChange
-- writes (see lib/services/auditService.ts in contractor-app-v2). A
-- user with write access to their own company's rows must never be
-- able to also rewrite or erase the history of those writes — that
-- would defeat the entire point of an audit log.

-- ---------------------------------------------------------------------
-- Generic logging trigger — same "one function, applied to a table
-- list via a loop" pattern as set_audit_fields()/soft_delete_instead(),
-- so every table gets identical treatment with no per-table code.
-- Captures the full old/new row as jsonb; AuditService diffs them into
-- field-level changes on read (see auditService.ts's diffFields) so
-- the DB side stays a dumb, reliable recorder rather than needing to
-- know which columns matter.
-- ---------------------------------------------------------------------

create or replace function public.log_audit_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_action text;
  v_company_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_company_id := NEW.company_id;
  elsif TG_OP = 'DELETE' then
    v_action := 'delete';
    v_company_id := OLD.company_id;
  else
    -- soft_delete_instead() converts real DELETEs into an UPDATE that
    -- sets deleted_at — distinguish "this update was actually a
    -- delete" so the audit log's `action` reflects the real business
    -- event, not "update", the same way AuditService.recordStatusChange
    -- captures semantic meaning a trigger alone can't infer.
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      v_action := 'delete';
    elsif OLD.deleted_at is not null and NEW.deleted_at is null then
      v_action := 'restore';
    else
      v_action := 'update';
    end if;
    v_company_id := NEW.company_id;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_table, entity_id, old_values, new_values)
  values (
    v_company_id,
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
  );

  return coalesce(NEW, OLD);
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'estimates', 'invoices', 'clients',
    'invoice_payments',
    'estimate_expenses', 'subcontractor_payments', 'agent_payments',
    'estimate_subcontractors', 'estimate_agents',
    'change_orders',
    'projects'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_audit_log on public.%I', t);
    execute format(
      'create trigger trg_audit_log after insert or update or delete on public.%I for each row execute function public.log_audit_change()',
      t
    );
  end loop;
end $$;

-- NOTE: this trigger runs AFTER set_audit_fields() and AFTER
-- soft_delete_instead() intercepts a real DELETE (both BEFORE
-- triggers), so by the time this fires, a "delete" is already the
-- UPDATE that soft_delete_instead() produced — this trigger never
-- actually sees a real DELETE on the tables covered by
-- soft_delete_instead() (estimates/invoices excluded from that one,
-- per its own comment, so those two DO still hit the TG_OP = 'DELETE'
-- branch above if a genuine hard delete happens via /deleted's
-- "Delete All Permanently").
