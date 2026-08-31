-- The Supabase JS client's upsert({ onConflict }) can only emit a
-- plain `ON CONFLICT (cols) DO UPDATE` — it cannot express the WHERE
-- predicate Postgres requires to target a PARTIAL unique index (the
-- profile_id-IS-NULL "company default" index added in
-- 20260908000000_email_automations_null_profile_uniqueness.sql), so
-- that migration's fix was necessary but not sufficient: the actual
-- write still needs real SQL to pick between the two arbiter indexes.
--
-- SECURITY INVOKER (the default — no "security definer" here): this
-- function runs under the CALLING user's own session, so the table's
-- existing RLS insert/update policies (company_id = current_company_id())
-- still apply exactly as if the caller had written the INSERT
-- themselves — this function is a write-path convenience, not a
-- privilege escalation, unlike get_company_profile()'s SECURITY
-- DEFINER (that one exists to let an unauthenticated portal page read
-- a specific row by token, a genuinely different trust boundary).
create or replace function public.upsert_email_automation_setting(
  p_company_id uuid,
  p_profile_id uuid,
  p_automation_key text,
  p_enabled boolean,
  p_delay_value integer,
  p_delay_unit text,
  p_condition jsonb,
  p_subject_template text,
  p_body_template text,
  p_updated_by uuid
) returns public.email_automations
    language plpgsql
    as $$
declare
  result public.email_automations;
begin
  if p_profile_id is null then
    insert into public.email_automations (
      company_id, profile_id, automation_key, enabled, delay_value, delay_unit,
      condition, subject_template, body_template, created_by, updated_by, updated_at
    ) values (
      p_company_id, null, p_automation_key, p_enabled, p_delay_value, p_delay_unit,
      p_condition, p_subject_template, p_body_template, p_updated_by, p_updated_by, now()
    )
    on conflict (company_id, automation_key) where profile_id is null
    do update set
      enabled = excluded.enabled,
      delay_value = excluded.delay_value,
      delay_unit = excluded.delay_unit,
      condition = excluded.condition,
      subject_template = excluded.subject_template,
      body_template = excluded.body_template,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    returning * into result;
  else
    insert into public.email_automations (
      company_id, profile_id, automation_key, enabled, delay_value, delay_unit,
      condition, subject_template, body_template, created_by, updated_by, updated_at
    ) values (
      p_company_id, p_profile_id, p_automation_key, p_enabled, p_delay_value, p_delay_unit,
      p_condition, p_subject_template, p_body_template, p_updated_by, p_updated_by, now()
    )
    on conflict (company_id, profile_id, automation_key)
    do update set
      enabled = excluded.enabled,
      delay_value = excluded.delay_value,
      delay_unit = excluded.delay_unit,
      condition = excluded.condition,
      subject_template = excluded.subject_template,
      body_template = excluded.body_template,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    returning * into result;
  end if;
  return result;
end;
$$;
