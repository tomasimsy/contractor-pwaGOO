--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accounting_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.accounting_method AS ENUM (
    'cash',
    'accrual'
);


--
-- Name: agent_classification; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_classification AS ENUM (
    'employee',
    'independent_contractor'
);


--
-- Name: entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.entity_type AS ENUM (
    'sole_proprietorship',
    'single_member_llc',
    'multi_member_llc',
    'partnership',
    's_corp',
    'c_corp'
);


--
-- Name: tax_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_category AS ENUM (
    'revenue',
    'cost_of_goods_sold',
    'materials',
    'labor',
    'equipment',
    'vehicle_mileage',
    'vehicle_fuel',
    'vehicle_maintenance',
    'office_supplies',
    'utilities',
    'rent',
    'insurance',
    'professional_services',
    'subcontractor',
    'agent_commission',
    'agent_reimbursement',
    'meals_entertainment',
    'travel',
    'depreciation',
    'other_expense'
);


--
-- Name: approve_public_change_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_public_change_order(p_change_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_estimate_id uuid;
  v_original_subtotal numeric;
  v_new_approved_total numeric;
begin
  select estimate_id into v_estimate_id from public.change_orders where id = p_change_order_id;
  if v_estimate_id is null then
    raise exception 'Change order not found';
  end if;

  update public.change_orders
  set status = 'approved', approved_at = now()
  where id = p_change_order_id;

  select coalesce(sum(total), 0) into v_original_subtotal
  from public.estimate_items where estimate_id = v_estimate_id;

  select coalesce(sum(total_amount), 0) into v_new_approved_total
  from public.change_orders where estimate_id = v_estimate_id and status = 'approved';

  update public.estimates
  set total = v_original_subtotal + v_new_approved_total
  where id = v_estimate_id;
end;
$$;


--
-- Name: create_company_and_owner(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_company_and_owner(p_company_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid;
  v_existing uuid;
  v_slug text;
begin
  select company_id into v_existing from public.profiles where id = auth.uid();
  if v_existing is not null then
    raise exception 'You already belong to a company.';
  end if;

  v_slug := regexp_replace(lower(trim(p_company_name)), '[^a-z0-9]+', '-', 'g')
    || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.companies (name, slug) values (p_company_name, v_slug)
    returning id into v_company_id;

  insert into public.profiles (id, company_id, role)
    values (auth.uid(), v_company_id, 'owner')
  on conflict (id) do update set company_id = v_company_id, role = 'owner';

  return v_company_id;
end;
$$;


--
-- Name: current_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_company_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(
    -- Try to get company_id from JWT claims (if using custom claims)
    (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid,
    -- Fallback: query the profiles table for the authenticated user
    (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  )
$$;


--
-- Name: current_invoice_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_invoice_token() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.invoice_token', true), '')
$$;


--
-- Name: FUNCTION current_invoice_token(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.current_invoice_token() IS 'The per-request customer invoice token, set by the public invoice page. NULL when absent, so token-scoped RLS policies fail closed.';


--
-- Name: current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid()
$$;


--
-- Name: get_company_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_company_profile(p_profile_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select row_to_json(cp)
  from (
    select id, company_id, company_name, logo_url, company_phone, company_email, company_website, company_address, footer_message, portal_domain, email_message_template
    from public.company_profiles
    where id = p_profile_id
      and deleted_at is null
  ) cp;
$$;


--
-- Name: get_customer_portal(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_portal(p_token text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'estimate', jsonb_build_object(
      'id', est.id,
      'estimate_number', est.estimate_number,
      'title', est.title,
      'description', est.description,
      'status', est.status,
      'subtotal', est.subtotal,
      'markup', est.markup,
      'discount', est.discount,
      'tax_rate', est.tax_rate,
      'total', est.total,
      'deposit_amount', est.deposit_amount,
      'signature', est.signature,
      'created_at', est.created_at
    ),
    'line_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', it.id, 'name', it.name, 'description', it.description,
        'quantity', it.quantity, 'unit_price', it.unit_price, 'total', it.total
      ) order by it.created_at)
      from public.estimate_items it
      where it.estimate_id = est.id and it.deleted_at is null
    ), '[]'::jsonb),
    -- APPROVED only. Pending/draft/rejected are internal deliberations;
    -- a customer must never see work we considered and declined.
    'change_orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'change_order_number', co.change_order_number,
        'title', co.title,
        'description', co.description,
        'total_amount', coalesce(co.total_amount, 0),
        'tax', coalesce(co.tax, 0),
        'approved_at', co.approved_at
      ) order by co.approved_at nulls last, co.created_at)
      from public.change_orders co
      where co.estimate_id = est.id
        and co.status = 'approved'
        and co.deleted_at is null
    ), '[]'::jsonb),
    -- Invoices raised against this estimate, each with its own payments
    -- so the portal can show a real balance per invoice. Voided and
    -- cancelled invoices are excluded — a customer should not be
    -- presented with a bill that was withdrawn.
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', inv.id,
        'invoice_number', inv.invoice_number,
        'status', inv.status,
        'issue_date', inv.issue_date,
        'due_date', inv.due_date,
        'subtotal', inv.subtotal,
        'tax', inv.tax,
        'total', inv.total,
        'customer_token', inv.customer_token,  -- so the portal can deep-link to the invoice's own page/PDF
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'amount', p.amount, 'payment_date', p.payment_date, 'method', p.method
          ) order by p.payment_date)
          from public.invoice_payments p
          where p.invoice_id = inv.id and p.deleted_at is null
        ), '[]'::jsonb)
      ) order by inv.issue_date nulls last, inv.created_at)
      from public.invoices inv
      where inv.estimate_id = est.id
        and inv.deleted_at is null
        and coalesce(inv.status, '') not in ('void', 'cancelled')
    ), '[]'::jsonb),
    'client', (
      select jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'address', c.address)
      from public.clients c
      where c.id = est.client_id and c.deleted_at is null
    ),
    'company', (
      select jsonb_build_object(
        'company_name', cs.company_name, 'dba', cs.dba,
        'company_address', cs.company_address, 'company_phone', cs.company_phone,
        'company_email', cs.company_email, 'footer_message', cs.footer_message,
        'payment_instructions', cs.payment_instructions,
        'terms_conditions', cs.terms_conditions, 'warranty_text', cs.warranty_text
      )
      from public.company_settings cs
      where cs.company_id = est.company_id
    )
  )
  from public.estimates est
  where est.customer_token is not null
    and est.customer_token = p_token
    and est.deleted_at is null;
$$;


--
-- Name: FUNCTION get_customer_portal(p_token text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_customer_portal(p_token text) IS 'Public, token-scoped read of one job (estimate + approved change orders + invoices) for the customer portal. SECURITY DEFINER; allowlisted columns only; read-only.';


--
-- Name: get_estimate_terms_template(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_estimate_terms_template(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: get_portal_change_orders(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_portal_change_orders(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(json_agg(row_to_json(co) order by co.created_at desc), '[]'::json)
  from (
    select
      co.id, co.change_order_number, co.title, co.description, co.status,
      co.total_amount, co.tax, co.approved_at, co.signature, co.created_at
    from public.change_orders co
    join public.estimates e on e.id = co.estimate_id
    where e.customer_token = p_token
      and e.deleted_at is null
      and co.deleted_at is null
  ) co;
$$;


--
-- Name: get_portal_estimate_areas(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_portal_estimate_areas(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(json_agg(row_to_json(a) order by a.sequence_number), '[]'::json)
  from public.estimate_areas a
  join public.estimates e on e.id = a.estimate_id
  where e.customer_token = p_token
    and e.deleted_at is null
    and a.deleted_at is null;
$$;


--
-- Name: get_portal_estimate_items(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_portal_estimate_items(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(json_agg(row_to_json(ei)), '[]'::json)
  from public.estimate_items ei
  join public.estimates e on e.id = ei.estimate_id
  where e.customer_token = p_token
    and e.deleted_at is null
    and ei.deleted_at is null;
$$;


--
-- Name: get_portal_estimate_pdf_data(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_portal_estimate_pdf_data(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when e.id is null then null else json_build_object(
    'estimate', row_to_json(e),
    'client', (select row_to_json(cl) from public.clients cl where cl.id = e.client_id),
    'items', (
      select coalesce(json_agg(row_to_json(ei)), '[]'::json)
      from public.estimate_items ei
      where ei.estimate_id = e.id and ei.deleted_at is null
    ),
    'roofing_areas', (
      select coalesce(json_agg(row_to_json(ea) order by ea.sequence_number), '[]'::json)
      from public.estimate_areas ea
      where ea.estimate_id = e.id and ea.deleted_at is null
    ),
    'roofing_area_photos', (
      select coalesce(json_agg(row_to_json(eap) order by eap.display_order), '[]'::json)
      from public.estimate_area_photos eap
      where eap.estimate_area_id in (
        select ea.id from public.estimate_areas ea where ea.estimate_id = e.id and ea.deleted_at is null
      ) and eap.deleted_at is null
    ),
    'estimate_photos', (
      select coalesce(json_agg(row_to_json(ep) order by ep.display_order), '[]'::json)
      from public.estimate_photos ep
      where ep.estimate_id = e.id and ep.deleted_at is null
    ),
    'change_orders', (
      select coalesce(json_agg(json_build_object('total_amount', co.total_amount, 'tax', co.tax, 'status', co.status)), '[]'::json)
      from public.change_orders co
      where co.estimate_id = e.id and co.company_id = e.company_id and co.deleted_at is null
    ),
    'company_settings', (select row_to_json(cs) from public.company_settings cs where cs.company_id = e.company_id),
    'company_name', (select c.name from public.companies c where c.id = e.company_id)
  ) end
  from public.estimates e
  where e.customer_token = p_token
    and e.deleted_at is null;
$$;


--
-- Name: get_portal_estimate_photos(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_portal_estimate_photos(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'estimate_photos', (
      select coalesce(json_agg(row_to_json(ep) order by ep.photo_type, ep.display_order), '[]'::json)
      from (
        select p.id, p.photo_type, p.storage_path, p.display_order
        from public.estimate_photos p
        join public.estimates e on e.id = p.estimate_id
        where e.customer_token = p_token
          and e.deleted_at is null
          and p.deleted_at is null
      ) ep
    ),
    'area_photos', (
      select coalesce(json_agg(row_to_json(ap) order by ap.area_name, ap.photo_type, ap.display_order), '[]'::json)
      from (
        select p.id, p.photo_type, p.storage_path, p.display_order,
               a.id as area_id, a.area_name
        from public.estimate_area_photos p
        join public.estimate_areas a on a.id = p.estimate_area_id
        join public.estimates e on e.id = a.estimate_id
        where e.customer_token = p_token
          and e.deleted_at is null
          and a.deleted_at is null
          and p.deleted_at is null
      ) ap
    )
  );
$$;


--
-- Name: get_portal_estimate_profile_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_portal_estimate_profile_id(p_token text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select profile_id
  from public.estimates
  where customer_token = p_token
    and deleted_at is null;
$$;


--
-- Name: get_portal_invoice_profile_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_portal_invoice_profile_id(p_token text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select profile_id
  from public.invoices
  where customer_token = p_token
    and deleted_at is null;
$$;


--
-- Name: get_public_estimate_bundle(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_estimate_bundle(p_estimate_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'estimate', (select to_json(e) from public.estimates e where e.id = p_estimate_id),
    'client', (
      select to_json(c) from public.clients c
      where c.id = (select client_id from public.estimates where id = p_estimate_id)
    ),
    'items', (
      select coalesce(json_agg(i), '[]'::json) from public.estimate_items i
      where i.estimate_id = p_estimate_id and i.deleted_at is null
    ),
    'change_orders', (
      select coalesce(json_agg(co order by co.created_at desc), '[]'::json)
      from public.change_orders co
      where co.estimate_id = p_estimate_id and co.status <> 'draft' and co.deleted_at is null
    ),
    'invoice_id', (
      select id from public.invoices where estimate_id = p_estimate_id limit 1
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = (select id from public.invoices where estimate_id = p_estimate_id limit 1)
        and p.deleted_at is null
    )
  );
$$;


--
-- Name: get_public_invoice(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_invoice(p_token text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', inv.id,
      'invoice_number', inv.invoice_number,
      'status', inv.status,
      'issue_date', inv.issue_date,
      'due_date', inv.due_date,
      'subtotal', inv.subtotal,
      'tax', inv.tax,
      'total', inv.total,
      'discount', inv.discount,
      'description', inv.description,
      'notes', inv.notes,
      'signature', inv.signature,
      'signed_date', inv.signed_date
    ),
    'client', (
      select jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'address', c.address)
      from public.clients c
      where c.id = inv.client_id and c.deleted_at is null
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', it.id, 'name', it.name, 'description', it.description,
        'quantity', it.quantity, 'unit_price', it.unit_price, 'total', it.total
      ) order by it.created_at)
      from public.invoice_items it
      where it.invoice_id = inv.id and it.deleted_at is null
    ), '[]'::jsonb),
    'change_orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'change_order_number', co.change_order_number,
        'title', co.title,
        'description', co.description,
        'amount', coalesce(co.total_amount, 0) + coalesce(co.tax, 0),
        'approved_at', co.approved_at
      ) order by co.approved_at nulls last, co.created_at)
      from public.change_orders co
      where co.estimate_id = inv.estimate_id
        and co.status = 'approved'
        and co.deleted_at is null
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount', p.amount, 'payment_date', p.payment_date, 'method', p.method
      ) order by p.payment_date)
      from public.invoice_payments p
      where p.invoice_id = inv.id and p.deleted_at is null
    ), '[]'::jsonb),
    'company', (
      select jsonb_build_object(
        'company_name', cs.company_name, 'dba', cs.dba,
        'company_address', cs.company_address, 'company_phone', cs.company_phone,
        'company_email', cs.company_email, 'footer_message', cs.footer_message,
        'payment_instructions', cs.payment_instructions
      )
      from public.company_settings cs
      where cs.company_id = inv.company_id
    )
  )
  from public.invoices inv
  where inv.customer_token is not null
    and inv.customer_token::text = p_token
    and inv.deleted_at is null;
$$;


--
-- Name: FUNCTION get_public_invoice(p_token text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_public_invoice(p_token text) IS 'Public, token-scoped read of ONE invoice for the customer-facing page. SECURITY DEFINER: the token is an argument and scoping happens inside, so PostgREST callers cannot widen it. Read-only; internal columns are stripped.';


--
-- Name: get_public_invoice_bundle(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_invoice_bundle(p_invoice_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'invoice', (select to_json(i) from public.invoices i where i.id = p_invoice_id),
    'client', (
      select to_json(c) from public.clients c
      where c.id = (select client_id from public.invoices where id = p_invoice_id)
    ),
    'items', (
      select coalesce(json_agg(it), '[]'::json) from public.invoice_items it
      where it.invoice_id = p_invoice_id and it.deleted_at is null
    ),
    'payments', (
      select coalesce(json_agg(p order by p.created_at desc), '[]'::json)
      from public.invoice_payments p
      where p.invoice_id = p_invoice_id and p.deleted_at is null
    )
  );
$$;


--
-- Name: list_company_members(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_company_members() RETURNS TABLE(id uuid, email text, role text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, u.email, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.company_id = public.current_company_id();
$$;


--
-- Name: log_audit_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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


--
-- Name: mirror_agent_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirror_agent_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id from public.estimate_agents where id = new.estimate_agent_id;

  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    new.company_id, v_project_id, 'expense',
    case when new.payment_type = 'reimbursement' then 'agent_reimbursement' else 'agent_commission' end,
    'agent_payments', new.id,
    new.amount, coalesce(new.payment_date::date, new.created_at::date), new.payment_method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    category = excluded.category,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;


--
-- Name: mirror_estimate_expense(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirror_estimate_expense() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    new.company_id, new.project_id, 'expense',
    case new.category when 'material' then 'material_expense' when 'labor' then 'labor_expense' else 'other_expense' end,
    'estimate_expenses', new.id,
    new.amount, coalesce(new.expense_date, new.created_at::date), new.payment_method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    category = excluded.category,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;


--
-- Name: mirror_invoice_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirror_invoice_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_company_id uuid;
  v_project_id uuid;
begin
  select i.company_id, i.project_id into v_company_id, v_project_id
  from public.invoices i where i.id = new.invoice_id;

  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    v_company_id, v_project_id, 'income', 'customer_payment', 'invoice_payments', new.id,
    new.amount, coalesce(new.payment_date, new.created_at::date), new.method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;


--
-- Name: mirror_subcontractor_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirror_subcontractor_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id from public.estimate_subcontractors where id = new.estimate_subcontractor_id;

  insert into public.financial_transactions (
    company_id, project_id, direction, category, source_table, source_id,
    amount, transaction_date, payment_method, notes, deleted_at
  ) values (
    new.company_id, v_project_id, 'expense', 'subcontractor_payment', 'subcontractor_payments', new.id,
    new.amount, coalesce(new.payment_date::date, new.created_at::date), new.payment_method, new.notes, new.deleted_at
  )
  on conflict (source_table, source_id) do update set
    amount = excluded.amount,
    transaction_date = excluded.transaction_date,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    project_id = excluded.project_id,
    deleted_at = excluded.deleted_at;

  return new;
end;
$$;


--
-- Name: redeem_company_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_company_invite(p_token uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_invite record;
  v_existing uuid;
begin
  select company_id into v_existing from public.profiles where id = auth.uid();
  if v_existing is not null then
    raise exception 'You already belong to a company.';
  end if;

  select * into v_invite from public.company_invites
    where token = p_token
    for update;

  if v_invite is null then
    raise exception 'Invite not found.';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'This invite has already been used or revoked.';
  end if;
  if v_invite.expires_at < now() then
    update public.company_invites set status = 'expired' where id = v_invite.id;
    raise exception 'This invite has expired.';
  end if;

  insert into public.profiles (id, company_id, role)
    values (auth.uid(), v_invite.company_id, v_invite.role)
  on conflict (id) do update set company_id = v_invite.company_id, role = v_invite.role;

  update public.company_invites
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;

  return v_invite.company_id;
end;
$$;


--
-- Name: reject_public_change_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_public_change_order(p_change_order_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.change_orders
  set status = 'rejected', rejected_at = now()
  where id = p_change_order_id;
$$;


--
-- Name: remove_public_estimate_signature(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_public_estimate_signature(p_estimate_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.estimates
  set signature = null, status = 'pending'
  where id = p_estimate_id;
$$;


--
-- Name: set_audit_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_audit_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: sign_estimate_via_token(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sign_estimate_via_token(p_token text, p_signature_type text, p_signature_value text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.estimates%rowtype;
begin
  if p_signature_type not in ('draw', 'type') then
    return null;
  end if;
  if p_signature_value is null or length(trim(p_signature_value)) = 0 then
    return null;
  end if;

  update public.estimates
  set signature = jsonb_build_object(
        'type', p_signature_type,
        'value', p_signature_value,
        'date', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      -- Signing is acceptance. Only advance a still-open estimate;
      -- never move an already-approved or converted one backwards.
      status = case when coalesce(status, '') in ('draft', 'sent', 'viewed', 'pending')
                    then 'approved' else status end,
      updated_at = now()
  where customer_token is not null
    and customer_token = p_token
    and deleted_at is null
    and signature is null                                  -- guard 2
    and coalesce(status, '') <> 'converted_to_invoice'     -- guard 3
  returning * into v_row;

  if not found then
    return null;
  end if;

  return jsonb_build_object('estimate_number', v_row.estimate_number, 'signed', true);
end;
$$;


--
-- Name: FUNCTION sign_estimate_via_token(p_token text, p_signature_type text, p_signature_value text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sign_estimate_via_token(p_token text, p_signature_type text, p_signature_value text) IS 'Customer-portal estimate signing. SECURITY DEFINER; token-scoped; refuses to overwrite an existing signature or sign a converted/deleted estimate.';


--
-- Name: sign_public_estimate(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sign_public_estimate(p_estimate_id uuid, p_signature jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.estimates
  set signature = p_signature, status = 'approved'
  where id = p_estimate_id;
$$;


--
-- Name: sign_public_invoice(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sign_public_invoice(p_invoice_id uuid, p_signature jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.invoices
  set signature = p_signature, status = 'signed'
  where id = p_invoice_id;
$$;


--
-- Name: soft_delete_instead(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_instead() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
begin
  execute format(
    'update public.%I set deleted_at = now(), deleted_by = auth.uid() where id = $1',
    TG_TABLE_NAME
  ) using OLD.id;
  return null; -- cancels the real DELETE
end;
$_$;


--
-- Name: sync_expense_legacy_category(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_expense_legacy_category() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.category := case new.expense_type
    when 'materials' then 'material'
    when 'labor'     then 'labor'
    else 'other'
  end;
  return new;
end;
$$;


--
-- Name: track_public_estimate_view(uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_public_estimate_view(p_estimate_id uuid, p_location jsonb, p_device text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_locations jsonb;
  already_seen boolean;
begin
  select coalesce(view_locations, '[]'::jsonb), coalesce(opened_count, 0) > 0
  into current_locations, already_seen
  from public.estimates where id = p_estimate_id;

  if p_location is not null and not exists (
    select 1 from jsonb_array_elements(current_locations) loc
    where loc->>'city' = p_location->>'city' or loc->>'ip' = p_location->>'ip'
  ) then
    update public.estimates
    set
      view_locations = current_locations || jsonb_build_array(p_location),
      unique_locations = jsonb_array_length(current_locations) + 1,
      opened_at = now(),
      opened_count = coalesce(opened_count, 0) + 1,
      opened_device = p_device,
      opened_ip = p_location->>'ip'
    where id = p_estimate_id;
  else
    update public.estimates
    set opened_count = coalesce(opened_count, 0) + 1
    where id = p_estimate_id;
  end if;
end;
$$;


--
-- Name: update_invoice_payment_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invoice_payment_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  total_paid numeric;
  invoice_total numeric;
begin
  -- Calculate total paid (excluding deleted payments)
  select coalesce(sum(amount), 0) into total_paid
  from public.invoice_payments
  where invoice_id = coalesce(new.invoice_id, old.invoice_id)
    and deleted_at is null;

  -- Get the invoice total
  select total into invoice_total
  from public.invoices
  where id = coalesce(new.invoice_id, old.invoice_id);

  -- Update the invoice with new payment totals
  update public.invoices
  set
    amount_paid = total_paid,
    remaining_balance = invoice_total - total_paid,
    payment_status = case
      when total_paid = 0 then 'unpaid'
      when total_paid >= invoice_total then 'paid'
      else 'partial'
    end,
    status = case
      when total_paid = 0 then 'pending'
      when total_paid >= invoice_total then 'paid'
      else 'partial'
    end,
    paid_at = case
      when total_paid >= invoice_total then now()
      else paid_at
    end
  where id = coalesce(new.invoice_id, old.invoice_id);

  return coalesce(new, old);
end;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid,
    agent_id uuid,
    amount numeric NOT NULL,
    payment_date timestamp without time zone DEFAULT now(),
    payment_method text DEFAULT 'bank_transfer'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    change_order_id uuid,
    estimate_agent_id uuid,
    payment_type character varying(20) DEFAULT 'commission'::character varying,
    expense_id uuid,
    reimbursement_from_agent_id uuid,
    delete_reason text
);


--
-- Name: COLUMN agent_payments.reimbursement_from_agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_payments.reimbursement_from_agent_id IS 'Optional: agent responsible for reimbursing this commission';


--
-- Name: agent_tax_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tax_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    company_id uuid NOT NULL,
    classification public.agent_classification NOT NULL,
    tax_withholding_percentage numeric(5,2) DEFAULT 0,
    ytd_commissions numeric(12,2) DEFAULT 0,
    ytd_reimbursements numeric(12,2) DEFAULT 0,
    ytd_tax_withheld numeric(12,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    commission_percentage numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    notes text,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    commission_rate numeric,
    delete_reason text
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    entity_table text NOT NULL,
    entity_id uuid NOT NULL,
    old_values jsonb,
    new_values jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'restore'::text, 'status_change'::text])))
);


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS 'Reliability system: who did what to which record, old value -> new value, when. Company-scoped, append-only (no update/delete policy — see below).';


--
-- Name: bill_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    vendor text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    expense_type text DEFAULT 'miscellaneous'::text NOT NULL,
    notes text,
    frequency text NOT NULL,
    interval_count integer DEFAULT 1 NOT NULL,
    start_date date NOT NULL,
    next_due_date date NOT NULL,
    end_date date,
    max_occurrences integer,
    occurrences_generated integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text,
    CONSTRAINT bill_schedules_amount_non_negative CHECK ((amount >= (0)::numeric)),
    CONSTRAINT bill_schedules_frequency_check CHECK ((frequency = ANY (ARRAY['weekly'::text, 'monthly'::text, 'yearly'::text]))),
    CONSTRAINT bill_schedules_interval_count_check CHECK ((interval_count >= 1)),
    CONSTRAINT bill_schedules_max_occurrences_check CHECK (((max_occurrences IS NULL) OR (max_occurrences >= 1)))
);


--
-- Name: TABLE bill_schedules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bill_schedules IS 'Recurring bill TEMPLATES. Holds no cost: generating an occurrence writes one ordinary estimate_expenses row (with a due_date). No FinancialEngine input reads this table.';


--
-- Name: change_order_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.change_order_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    change_order_id uuid NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1,
    unit_price numeric(10,2) NOT NULL,
    total numeric(10,2) NOT NULL,
    type text DEFAULT 'addition'::text,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: change_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.change_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid NOT NULL,
    change_order_number text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    original_estimate_total numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    approved_at timestamp without time zone,
    approved_by uuid,
    notes text,
    rejected_at timestamp without time zone,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone,
    tax numeric DEFAULT 0 NOT NULL,
    project_id uuid,
    is_deleted boolean DEFAULT false NOT NULL,
    delete_reason text,
    signature jsonb
);


--
-- Name: COLUMN change_orders.signature; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.change_orders.signature IS 'Customer e-signature captured on portal approval: {type, value, date}. Null for staff-approved change orders with no customer signature on file.';


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp without time zone,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    delete_reason text
);


--
-- Name: COLUMN clients.delete_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.delete_reason IS 'Required by ValidationService.validateDeleteReason for any real user-initiated delete — see the identical column/comment on estimates/invoices/projects (20260729000100_soft_delete_reason.sql, 20260801000100_add_projects_location_id_and_delete_reason.sql).';


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    address text,
    phone text,
    email text,
    tax_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone
);


--
-- Name: company_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    storage_path text NOT NULL,
    file_type text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    expiration_date date,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_by uuid,
    deleted_at timestamp with time zone,
    delete_reason text,
    CONSTRAINT company_documents_category_check CHECK ((category = ANY (ARRAY['llc_articles'::text, 'ein_letter'::text, 'irs_documents'::text, 'w9'::text, 'form_1099'::text, 'business_license'::text, 'contractor_license'::text, 'insurance'::text, 'workers_comp'::text, 'bond'::text, 'banking'::text, 'tax_documents'::text, 'other'::text])))
);


--
-- Name: TABLE company_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_documents IS 'Business documents (licenses, insurance, tax forms, etc.) — metadata row per file; the file itself lives in the company-documents storage bucket at storage_path.';


--
-- Name: company_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    invited_by uuid,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    created_by uuid,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_invites_role_check CHECK ((role = 'member'::text)),
    CONSTRAINT company_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: company_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    company_name text NOT NULL,
    logo_url text,
    company_phone text,
    company_email text,
    company_website text,
    company_address text,
    footer_message text,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    delete_reason text,
    portal_domain text,
    email_message_template text
);


--
-- Name: TABLE company_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_profiles IS 'Customer-facing brand identities for one legal company (e.g. a dba operating under a second name). Selected per estimate/invoice via their nullable profile_id column; never duplicates company_id, financial data, or any calculation.';


--
-- Name: COLUMN company_profiles.portal_domain; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profiles.portal_domain IS 'This profile''s customer-facing base URL (e.g. https://osrpros.com) for estimate/invoice portal links. Null = no override; the app''s fixed default origin is used instead. Validated at the application layer (HTTPS only, no path/query/fragment, no local/private hostnames) — see lib/portalDomainValidation.ts.';


--
-- Name: COLUMN company_profiles.email_message_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profiles.email_message_template IS 'This profile''s default "Email Customer" message body. Supports {clientName} and {companyName} placeholders. Null = use buildDefaultEstimateMessage''s built-in default instead.';


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text DEFAULT 'One Square Roof LLC'::text,
    company_address text DEFAULT 'Charlotte, North Carolina'::text,
    company_phone text DEFAULT '(704) 303-4112'::text,
    company_email text DEFAULT 'onesquareroof@gmail.com'::text,
    company_website text DEFAULT ''::text,
    company_logo text,
    tax_id text,
    default_deposit_percentage integer DEFAULT 50,
    terms_conditions text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone,
    dba text,
    logo_url text,
    footer_message text,
    payment_instructions text,
    warranty_text text,
    license_number text,
    signature_name text,
    signature_title text,
    business_type text,
    city text,
    state text,
    zip text,
    country text,
    insurance_policy text,
    brand_color text,
    notes text,
    terms_roofing text,
    terms_custom text,
    terms_home_remodel text,
    company_website_2 text
);


--
-- Name: COLUMN company_settings.business_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.business_type IS 'e.g. LLC, Sole Proprietorship, S-Corp — free text, no fixed enum needed yet.';


--
-- Name: COLUMN company_settings.brand_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.brand_color IS 'Hex color (e.g. #1E40AF) used for future branded documents/portal theming.';


--
-- Name: COLUMN company_settings.terms_roofing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.terms_roofing IS 'Optional override of the built-in "roofing" Terms & Conditions template (lib/estimateTerms.ts). Null = use the built-in default.';


--
-- Name: COLUMN company_settings.terms_custom; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.terms_custom IS 'Optional override of the built-in "custom" Terms & Conditions template. Null = use the built-in default.';


--
-- Name: COLUMN company_settings.terms_home_remodel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.terms_home_remodel IS 'Optional override of the built-in "home_remodel" Terms & Conditions template. Null = use the built-in default.';


--
-- Name: company_tax_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_tax_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    entity_type public.entity_type DEFAULT 'sole_proprietorship'::public.entity_type NOT NULL,
    tax_year integer NOT NULL,
    fiscal_year_start_month integer DEFAULT 1 NOT NULL,
    fiscal_year_end_month integer DEFAULT 12 NOT NULL,
    accounting_method public.accounting_method DEFAULT 'cash'::public.accounting_method NOT NULL,
    state character varying(2),
    ein character varying(20),
    business_name character varying(255),
    agent_classification public.agent_classification DEFAULT 'independent_contractor'::public.agent_classification NOT NULL,
    subcontractor_1099_threshold numeric(10,2) DEFAULT 600 NOT NULL,
    collect_sales_tax boolean DEFAULT false,
    sales_tax_rate numeric(5,4) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_size integer,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: estimate_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid,
    agent_id uuid,
    amount numeric DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    project_id uuid,
    delete_reason text
);


--
-- Name: estimate_area_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_area_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_area_id uuid NOT NULL,
    company_id uuid NOT NULL,
    category text DEFAULT 'material'::text NOT NULL,
    name text NOT NULL,
    description text,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    unit text,
    total numeric DEFAULT 0 NOT NULL,
    taxable boolean DEFAULT true NOT NULL,
    sequence_number integer DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT estimate_area_line_items_category_check CHECK ((category = ANY (ARRAY['material'::text, 'labor'::text, 'other'::text]))),
    CONSTRAINT estimate_area_line_items_unit_check CHECK (((unit IS NULL) OR (unit = ANY (ARRAY['EA'::text, 'SF'::text, 'SQFT'::text, 'SQ'::text, 'LF'::text, 'FT'::text, 'HR'::text, 'DAY'::text, 'LS'::text]))))
);


--
-- Name: TABLE estimate_area_line_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estimate_area_line_items IS 'Line items scoped to a single estimate_areas row (Estimate Roof V2). Mirrors estimate_items structure. Does not affect estimate_areas.area_total, which remains a separate, manually-set flat field used by the existing (V1) Roofing tab.';


--
-- Name: estimate_area_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_area_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_area_id uuid NOT NULL,
    company_id uuid NOT NULL,
    photo_type text NOT NULL,
    storage_path text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT estimate_area_photos_photo_type_check CHECK ((photo_type = ANY (ARRAY['before'::text, 'after'::text])))
);


--
-- Name: TABLE estimate_area_photos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estimate_area_photos IS 'Before/after photos for roof areas in roofing estimates.';


--
-- Name: estimate_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid NOT NULL,
    company_id uuid NOT NULL,
    area_name text NOT NULL,
    sequence_number integer DEFAULT 0 NOT NULL,
    scope_items text,
    area_total numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    measurements text,
    inspection_notes text,
    notes text,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    delete_reason text,
    quantity numeric DEFAULT 1 NOT NULL,
    quantity_unit text,
    defect text,
    location text,
    corrective_action text,
    materials_included text,
    material_cost numeric DEFAULT 0 NOT NULL,
    labor_cost numeric DEFAULT 0 NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    estimated_repair_cost numeric DEFAULT 0 NOT NULL,
    CONSTRAINT estimate_areas_quantity_unit_check CHECK (((quantity_unit IS NULL) OR (quantity_unit = ANY (ARRAY['EA'::text, 'SF'::text, 'LF'::text, 'SQ'::text, 'Bundle'::text, 'Sheet'::text, 'Roll'::text, 'Piece'::text, 'Hour'::text, 'Day'::text, 'Other'::text]))))
);


--
-- Name: TABLE estimate_areas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estimate_areas IS 'Roof area/section within a roofing estimate. Parent of estimate_area_photos.';


--
-- Name: COLUMN estimate_areas.measurements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.measurements IS 'Optional free-text measurements for this roof area (Estimate Roof V2). Null for legacy rows.';


--
-- Name: COLUMN estimate_areas.inspection_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.inspection_notes IS 'Optional inspection/condition notes for this roof area (Estimate Roof V2). Null for legacy rows.';


--
-- Name: COLUMN estimate_areas.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.notes IS 'Optional general notes for this roof area (Estimate Roof V2). Null for legacy rows.';


--
-- Name: COLUMN estimate_areas.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.quantity IS 'Repair item quantity (Estimate Roof V2).';


--
-- Name: COLUMN estimate_areas.quantity_unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.quantity_unit IS 'Unit for quantity: EA, SF, LF, SQ, Bundle, Sheet, Roll, Piece, Hour, Day, Other.';


--
-- Name: COLUMN estimate_areas.defect; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.defect IS 'Defect description (multi-line).';


--
-- Name: COLUMN estimate_areas.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.location IS 'Where on the roof/property this defect is located.';


--
-- Name: COLUMN estimate_areas.corrective_action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.corrective_action IS 'Planned corrective action (multi-line).';


--
-- Name: COLUMN estimate_areas.materials_included; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.materials_included IS 'Materials included in the repair (multi-line).';


--
-- Name: COLUMN estimate_areas.material_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.material_cost IS 'Material cost for this repair item.';


--
-- Name: COLUMN estimate_areas.labor_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.labor_cost IS 'Labor cost for this repair item.';


--
-- Name: COLUMN estimate_areas.tax; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.tax IS 'Tax amount for this repair item.';


--
-- Name: COLUMN estimate_areas.estimated_repair_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_areas.estimated_repair_cost IS 'Auto-calculated: material_cost + labor_cost + tax. Always written by RoofingAreaService, never caller-supplied directly — see calculateAreaRepairCost() in lib/services/financialCalculations.ts.';


--
-- Name: estimate_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    estimate_id uuid NOT NULL,
    resend_email_id text NOT NULL,
    to_address text NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    bounced_at timestamp with time zone,
    complained_at timestamp with time zone,
    last_event_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clicked_at timestamp with time zone,
    CONSTRAINT estimate_emails_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'opened'::text, 'clicked'::text, 'bounced'::text, 'complained'::text, 'failed'::text])))
);


--
-- Name: TABLE estimate_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estimate_emails IS 'Delivery/open tracking for estimate emails sent via Resend. One row per send; updated by the Resend webhook as events arrive. No calculation reads this table.';


--
-- Name: COLUMN estimate_emails.clicked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_emails.clicked_at IS 'When the recipient clicked a link inside the email (Resend''s email.clicked event) — most commonly the "View Proposal Online" button.';


--
-- Name: estimate_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid,
    category text DEFAULT 'other'::text,
    description text,
    amount numeric NOT NULL,
    expense_date date DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    vendor text,
    tax numeric DEFAULT 0 NOT NULL,
    payment_method text,
    paid_by text DEFAULT 'company'::text NOT NULL,
    receipt_url text,
    receipt_storage_path text,
    receipt_file_name text,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    change_order_id uuid,
    paid_by_agent_id uuid,
    project_id uuid,
    delete_reason text,
    tax_category public.tax_category,
    expense_type text DEFAULT 'miscellaneous'::text NOT NULL,
    payee_type text,
    payee_id uuid,
    paid_by_id uuid,
    reimbursable boolean DEFAULT false NOT NULL,
    reimbursement_status text DEFAULT 'not_applicable'::text NOT NULL,
    is_paid boolean DEFAULT true NOT NULL,
    due_date date,
    bill_number text,
    CONSTRAINT estimate_expenses_expense_type_check CHECK ((expense_type = ANY (ARRAY['materials'::text, 'labor'::text, 'subcontractor'::text, 'agent_commission'::text, 'permit'::text, 'equipment'::text, 'reimbursement'::text, 'miscellaneous'::text]))),
    CONSTRAINT estimate_expenses_paid_by_check CHECK ((paid_by = ANY (ARRAY['company'::text, 'agent'::text, 'subcontractor'::text, 'employee'::text, 'customer'::text]))),
    CONSTRAINT estimate_expenses_payee_id_check CHECK (((payee_type IS NULL) OR (payee_type = ANY (ARRAY['vendor'::text, 'other'::text])) OR (payee_id IS NOT NULL))),
    CONSTRAINT estimate_expenses_payee_type_check CHECK (((payee_type IS NULL) OR (payee_type = ANY (ARRAY['vendor'::text, 'subcontractor'::text, 'agent'::text, 'employee'::text, 'other'::text])))),
    CONSTRAINT estimate_expenses_reimbursement_status_check CHECK ((reimbursement_status = ANY (ARRAY['not_applicable'::text, 'pending'::text, 'reimbursed'::text])))
);


--
-- Name: COLUMN estimate_expenses.paid_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_expenses.paid_by IS 'paid_by_TYPE: who fronted the cash (company/agent/subcontractor/employee/customer). Reused rather than adding a duplicate column — it was NULL on every row when the Expenses module landed. Pairs with paid_by_id. When it is ''agent'', paid_by_agent_id is mirrored so the original app keeps working.';


--
-- Name: COLUMN estimate_expenses.is_paid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_expenses.is_paid IS 'Has this expense actually been settled with the payee? Independent of reimbursement_status, which tracks paying back whoever FRONTED it. An unpaid vendor bill is is_paid=false; an agent-fronted purchase is is_paid=true (the vendor got paid) with reimbursement_status=''pending''.';


--
-- Name: COLUMN estimate_expenses.due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_expenses.due_date IS 'When this cost is DUE (not when it was incurred — that is expense_date). Non-null marks the row as a Bill: something received from a vendor/payee with a payment deadline. Null for ordinary job costs. No financial calculation reads this column.';


--
-- Name: COLUMN estimate_expenses.bill_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_expenses.bill_number IS 'The vendor''s own invoice/bill number, for reconciling against their statement. Free text, nullable.';


--
-- Name: estimate_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid NOT NULL,
    file_name text NOT NULL,
    url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    image_url text,
    storage_path text,
    project_name text,
    caption text,
    tag text,
    latitude double precision,
    longitude double precision,
    captured_at timestamp with time zone,
    annotations jsonb DEFAULT '[]'::jsonb NOT NULL,
    stage text DEFAULT 'before'::text NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT estimate_images_stage_check CHECK ((stage = ANY (ARRAY['before'::text, 'during'::text, 'after'::text])))
);


--
-- Name: estimate_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid,
    category text,
    name text NOT NULL,
    description text,
    quantity numeric DEFAULT 1,
    unit_price numeric DEFAULT 0,
    taxable boolean DEFAULT false,
    total numeric DEFAULT 0,
    project_name text,
    updated_at timestamp with time zone DEFAULT now(),
    project_description text,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    unit text,
    group_name text,
    CONSTRAINT estimate_items_unit_check CHECK (((unit IS NULL) OR (unit = ANY (ARRAY['EA'::text, 'SF'::text, 'SQFT'::text, 'SQ'::text, 'LF'::text, 'FT'::text, 'HR'::text, 'DAY'::text, 'LS'::text]))))
);


--
-- Name: COLUMN estimate_items.unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_items.unit IS 'Optional unit of measure for the line item (EA, SF, SQFT, SQ, LF, FT, HR, DAY, LS). Null for legacy rows.';


--
-- Name: COLUMN estimate_items.group_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_items.group_name IS 'Optional project/section label for grouping line items in the estimate form and PDF. Null = ungrouped (flat), the behavior every estimate had before this column existed.';


--
-- Name: estimate_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    estimate_id uuid NOT NULL,
    body text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    updated_at timestamp with time zone,
    updated_by uuid,
    CONSTRAINT estimate_notes_body_check CHECK ((char_length(btrim(body)) > 0))
);


--
-- Name: TABLE estimate_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estimate_notes IS 'Free-text internal staff notes on an estimate. Staff-written, no fixed shape, distinct from audit_logs (system-generated status history). No financial calculation reads this table.';


--
-- Name: COLUMN estimate_notes.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimate_notes.updated_at IS 'Set only when the note body has been edited after creation. Null means never edited.';


--
-- Name: estimate_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid NOT NULL,
    company_id uuid NOT NULL,
    photo_type text NOT NULL,
    storage_path text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT estimate_photos_photo_type_check CHECK ((photo_type = ANY (ARRAY['before'::text, 'after'::text])))
);


--
-- Name: TABLE estimate_photos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estimate_photos IS 'Before/after photos for the entire estimate (distinct from estimate_area_photos which are per-area).';


--
-- Name: estimate_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid,
    signature_type text NOT NULL,
    signature_value text NOT NULL,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: estimate_subcontractors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_subcontractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid,
    subcontractor_id uuid,
    amount numeric DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    project_id uuid,
    delete_reason text,
    is_final boolean DEFAULT false NOT NULL
);


--
-- Name: estimate_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    estimate_id uuid NOT NULL,
    project_id uuid,
    user_id uuid NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text,
    CONSTRAINT estimate_team_members_amount_non_negative CHECK ((amount >= (0)::numeric))
);


--
-- Name: TABLE estimate_team_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estimate_team_members IS 'Team members (profiles) assigned to an estimate, with an assigned-labor commitment. Additive: no FinancialEngine input reads this table, so no existing total changes. Amounts owed come from estimate_expenses (paid_by=employee), not from here.';


--
-- Name: estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    description text,
    notes text,
    subtotal numeric DEFAULT 0,
    markup numeric DEFAULT 0,
    discount numeric DEFAULT 0,
    deposit numeric DEFAULT 0,
    tax numeric DEFAULT 0,
    total numeric DEFAULT 0,
    cover_processing_fee boolean DEFAULT false,
    auto_generate_invoice boolean DEFAULT false,
    expiration_enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    image_url text,
    image_urls text[],
    tax_rate numeric(10,2) DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    signature jsonb,
    deposit_amount numeric DEFAULT 0,
    deposit_percentage integer DEFAULT 0,
    deposit_paid boolean DEFAULT false,
    deposit_paid_date timestamp without time zone,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    estimate_number text,
    deleted_at timestamp without time zone,
    opened_at timestamp without time zone,
    opened_count integer DEFAULT 0,
    opened_device text,
    opened_ip text,
    view_locations jsonb DEFAULT '[]'::jsonb,
    unique_locations integer DEFAULT 0,
    is_deleted boolean DEFAULT false,
    completed_at timestamp without time zone,
    is_completed boolean DEFAULT false,
    deposit_signature text,
    deposit_signed_at timestamp with time zone,
    final_signature text,
    final_signed_at timestamp with time zone,
    title text,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    property_address text,
    project_id uuid,
    delete_reason text,
    customer_token text,
    estimate_type text DEFAULT 'standard'::text NOT NULL,
    terms_template text DEFAULT 'custom'::text NOT NULL,
    profile_id uuid,
    CONSTRAINT estimates_estimate_type_check CHECK ((estimate_type = ANY (ARRAY['standard'::text, 'roofing'::text]))),
    CONSTRAINT estimates_terms_template_check CHECK ((terms_template = ANY (ARRAY['roofing'::text, 'custom'::text, 'home_remodel'::text])))
);


--
-- Name: COLUMN estimates.project_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimates.project_id IS 'The job this estimate belongs to. Nullable during migration; becomes NOT NULL once every row is backfilled (see ARCHITECTURE_MIGRATION_PLAN.md Phase 7). estimate_id remains the FK children use to reach this estimate until then — do not remove estimate_id yet.';


--
-- Name: COLUMN estimates.estimate_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimates.estimate_type IS 'Estimate classification: standard (line-item based) or roofing (area-based with photos).';


--
-- Name: COLUMN estimates.terms_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimates.terms_template IS 'Which Terms & Conditions template this estimate was created with. The template TEXT lives in lib/estimateTerms.ts, never here — this column is only the key, so editing the shared template text does not require a migration, and an estimate''s key never silently changes on its own.';


--
-- Name: COLUMN estimates.profile_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estimates.profile_id IS 'Which brand/business profile this estimate presents as to the customer (PDF/email/portal). Null = the company''s own default identity, unchanged from today.';


--
-- Name: expense_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_id uuid NOT NULL,
    company_id uuid NOT NULL,
    receipt_file_url text,
    receipt_date date,
    receipt_amount numeric(12,2),
    receipt_vendor character varying(255),
    uploaded_at timestamp without time zone DEFAULT now(),
    uploaded_by uuid
);


--
-- Name: financial_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    direction text NOT NULL,
    category text NOT NULL,
    source_table text NOT NULL,
    source_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_method text,
    notes text,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT financial_transactions_category_check CHECK ((category = ANY (ARRAY['customer_payment'::text, 'subcontractor_payment'::text, 'agent_commission'::text, 'agent_reimbursement'::text, 'material_expense'::text, 'labor_expense'::text, 'other_expense'::text, 'mileage_reimbursement'::text]))),
    CONSTRAINT financial_transactions_direction_check CHECK ((direction = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: TABLE financial_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.financial_transactions IS 'Derived, append-only ledger mirroring every money-movement row (customer payments, subcontractor/agent payments, expenses, mileage) tagged by project. Source tables remain authoritative — this table is safe to drop and rebuild at any time from them.';


--
-- Name: invoice_change_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_change_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid,
    description text,
    items jsonb,
    total numeric,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid,
    name text NOT NULL,
    description text,
    quantity numeric DEFAULT 1,
    unit_price numeric DEFAULT 0,
    total numeric DEFAULT 0,
    category text,
    project_name text,
    taxable boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid,
    amount numeric NOT NULL,
    method text,
    created_at timestamp without time zone DEFAULT now(),
    payment_type character varying(50) DEFAULT 'custom'::character varying,
    signature_used text,
    notes text,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    payment_date date DEFAULT CURRENT_DATE,
    reference_number text,
    delete_reason text
);


--
-- Name: COLUMN invoice_payments.method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_payments.method IS 'Payment method: cash, check, ach, credit_card, zelle, bank_transfer, other';


--
-- Name: COLUMN invoice_payments.delete_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_payments.delete_reason IS 'Required by application-level validation (ValidationService.validateDeleteReason) for every financial-record soft delete. Nullable at the column level only as a safety net for the trigger-intercepted stray hard DELETE path — see soft_delete_instead().';


--
-- Name: invoice_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    last_sequence integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid,
    client_id uuid,
    status text DEFAULT 'unpaid'::text,
    subtotal numeric DEFAULT 0,
    tax numeric DEFAULT 0,
    total numeric NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    deposit numeric DEFAULT 0,
    description text DEFAULT 0,
    discount numeric DEFAULT 0,
    remaining_balance numeric DEFAULT 0,
    due_date date,
    image_url text,
    invoice_number text,
    issue_date date,
    markup numeric DEFAULT 0,
    signature text,
    signed_date timestamp with time zone,
    customer_token text,
    deposit_amount numeric DEFAULT 0,
    deposit_paid boolean DEFAULT false,
    deposit_paid_date timestamp without time zone,
    amount_paid numeric DEFAULT 0,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    overdue boolean DEFAULT false,
    deleted_at timestamp without time zone,
    is_deleted boolean DEFAULT false,
    paid_at timestamp without time zone,
    is_locked boolean DEFAULT false,
    locked_at timestamp with time zone,
    locked_by text,
    deposit_paid_at timestamp without time zone,
    final_payment_paid_at timestamp without time zone,
    change_order_id uuid,
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    project_id uuid,
    delete_reason text,
    lifecycle_status text DEFAULT 'draft'::text NOT NULL,
    profile_id uuid,
    CONSTRAINT invoices_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['draft'::text, 'sent'::text, 'viewed'::text, 'cancelled'::text, 'void'::text])))
);


--
-- Name: COLUMN invoices.signature; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.signature IS 'invoice signature';


--
-- Name: COLUMN invoices.project_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.project_id IS 'The job this invoice bills. Nullable during migration — see estimates.project_id comment.';


--
-- Name: COLUMN invoices.lifecycle_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.lifecycle_status IS 'Where the invoice is in its DOCUMENT lifecycle: draft -> sent -> viewed, or cancelled/void. Owned exclusively by App V2. Never derived from payments — whether an invoice reads as paid, partially paid or overdue is computed at read time from the invoice_payments rows plus the due date (deriveInvoiceStatus). Do NOT mirror payment state into this column; that conflation is precisely the bug this column exists to fix. The legacy `status` column keeps its old payment-flavoured meaning for the original app.';


--
-- Name: COLUMN invoices.profile_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.profile_id IS 'Copied from the source estimate at invoice creation (see InvoiceService.createFromEstimate) so an estimate and the invoice it produces always present the same brand. Null = the company''s own default identity, unchanged from today.';


--
-- Name: mileage_trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mileage_trips (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    estimate_id uuid,
    start_image text NOT NULL,
    end_image text NOT NULL,
    start_lat double precision NOT NULL,
    start_lng double precision NOT NULL,
    end_lat double precision NOT NULL,
    end_lng double precision NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    distance_miles numeric NOT NULL,
    distance_meters numeric NOT NULL,
    duration_seconds integer NOT NULL,
    duration_minutes integer NOT NULL,
    route_summary text,
    reimbursement numeric NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    project_id uuid
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    company_id uuid NOT NULL,
    full_name text,
    avatar_url text,
    role text DEFAULT 'owner'::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    location_id uuid,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'office'::text, 'sales'::text, 'project_manager'::text, 'accountant'::text, 'subcontractor'::text, 'agent'::text])))
);


--
-- Name: COLUMN profiles.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.role IS 'One of: admin, office, sales, project_manager, accountant, subcontractor, agent. Mirrors the Role type and PERMISSION_MATRIX in contractor-app-v2/lib/services/permissions.ts — the two must be kept in sync by hand; there is no shared source of truth between SQL and TypeScript for this list.';


--
-- Name: COLUMN profiles.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.location_id IS 'Which company location/branch this user is assigned to, if any. No FK yet — contractor-pwa has no locations table; contractor-app-v2''s LocationService is the only implementation today, in-memory only. Add the FK once a real locations table exists in this schema.';


--
-- Name: project_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_id uuid NOT NULL,
    project_name text NOT NULL,
    milestone_order integer NOT NULL,
    title text NOT NULL,
    note text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    company_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone,
    project_id uuid
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    client_id uuid,
    project_number text,
    name text NOT NULL,
    description text,
    address text,
    status text DEFAULT 'draft'::text NOT NULL,
    start_date date,
    end_date date,
    assigned_user_id uuid,
    legacy_estimate_id uuid,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    delete_reason text,
    location_id uuid,
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'in_progress'::text, 'on_hold'::text, 'completed'::text, 'cancelled'::text, 'archived'::text])))
);


--
-- Name: TABLE projects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.projects IS 'The customer job/lifecycle container. Parent of estimates, invoices, expenses, subcontractor/agent assignments, change orders, and tax data for that job. Introduced to stop estimates from doubling as the project entity — see ARCHITECTURE_MIGRATION_PLAN.md.';


--
-- Name: COLUMN projects.legacy_estimate_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.legacy_estimate_id IS 'TRANSITIONAL ONLY. 1:1 link back to the estimate this project was backfilled from. Do not read from new code. Dropped in the Phase 7 cleanup migration.';


--
-- Name: COLUMN projects.delete_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.delete_reason IS 'Required by ValidationService.validateDeleteReason at the application layer for any real user-initiated delete; nullable at the column level only as a safety net for the soft-delete trigger''s own stray-DELETE interception path, same convention as every other soft-deletable table.';


--
-- Name: COLUMN projects.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.location_id IS 'Which company location/branch this project belongs to, if any. No FK yet — see profiles.location_id''s identical comment.';


--
-- Name: roofing_area_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roofing_area_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    area_name text DEFAULT ''::text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    quantity_unit text,
    defect text,
    location text,
    corrective_action text,
    materials_included text,
    scope_items text,
    material_cost numeric DEFAULT 0 NOT NULL,
    labor_cost numeric DEFAULT 0 NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    delete_reason text
);


--
-- Name: TABLE roofing_area_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roofing_area_templates IS 'Technician-saved templates for roof area fields (RoofingAreasEditorV2) — company-scoped, applied client-side to prefill a new area, never referenced by estimate_areas itself.';


--
-- Name: subcontractor_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontractor_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estimate_subcontractor_id uuid,
    amount numeric NOT NULL,
    payment_method text DEFAULT 'cash'::text,
    payment_date timestamp without time zone DEFAULT now(),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    estimate_id uuid,
    company_id uuid NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    change_order_id uuid,
    reimbursement_from_agent_id uuid,
    delete_reason text
);


--
-- Name: COLUMN subcontractor_payments.reimbursement_from_agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subcontractor_payments.reimbursement_from_agent_id IS 'Optional: agent responsible for reimbursing this subcontractor payment';


--
-- Name: subcontractor_tax_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontractor_tax_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subcontractor_id uuid NOT NULL,
    company_id uuid NOT NULL,
    w9_received boolean DEFAULT false,
    w9_received_date date,
    w9_legal_name character varying(255),
    w9_ein character varying(20),
    requires_1099 boolean DEFAULT false,
    last_1099_filed_year integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: subcontractors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    company_name text,
    phone text,
    email text,
    created_at timestamp without time zone DEFAULT now(),
    company_id uuid NOT NULL,
    trade text,
    notes text,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    contact_person text,
    is_active boolean DEFAULT true NOT NULL,
    delete_reason text
);


--
-- Name: tax_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    audit_type character varying(100),
    severity character varying(20),
    entity_type character varying(50),
    entity_id uuid,
    message text,
    resolved boolean DEFAULT false,
    resolved_at timestamp without time zone,
    resolved_by uuid,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: vw_estimate_financials; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_estimate_financials WITH (security_invoker='on') AS
 WITH active_estimates AS (
         SELECT DISTINCT invoices.estimate_id
           FROM public.invoices
          WHERE (invoices.status = ANY (ARRAY['paid'::text, 'partial'::text]))
        ), change_order_totals AS (
         SELECT change_orders.estimate_id,
            sum(change_orders.total_amount) AS co_total
           FROM public.change_orders
          WHERE (change_orders.status = 'approved'::text)
          GROUP BY change_orders.estimate_id
        ), sub_payments AS (
         SELECT es.estimate_id,
            sum(sp_1.amount) AS sub_paid
           FROM (public.estimate_subcontractors es
             LEFT JOIN public.subcontractor_payments sp_1 ON ((sp_1.estimate_subcontractor_id = es.id)))
          GROUP BY es.estimate_id
        ), agent_payments AS (
         SELECT agent_payments.estimate_id,
            sum(agent_payments.amount) AS agent_paid
           FROM public.agent_payments
          GROUP BY agent_payments.estimate_id
        ), other_expenses AS (
         SELECT estimate_expenses.estimate_id,
            sum(estimate_expenses.amount) AS other_exp
           FROM public.estimate_expenses
          GROUP BY estimate_expenses.estimate_id
        ), invoice_payments AS (
         SELECT invoices.estimate_id,
            sum(invoices.amount_paid) AS payments_received
           FROM public.invoices
          WHERE (invoices.status = ANY (ARRAY['paid'::text, 'partial'::text]))
          GROUP BY invoices.estimate_id
        ), invoice_stats AS (
         SELECT invoices.estimate_id,
            count(*) AS invoice_count,
            max(invoices.created_at) AS last_payment_date
           FROM public.invoices
          WHERE (invoices.status = ANY (ARRAY['paid'::text, 'partial'::text]))
          GROUP BY invoices.estimate_id
        )
 SELECT e.id AS estimate_id,
    e.estimate_number,
    c.name AS client_name,
    c.id AS client_id,
    e.status,
    e.created_at,
    e.total AS original_total,
    COALESCE(co.co_total, (0)::numeric) AS change_order_total,
    (e.total + COALESCE(co.co_total, (0)::numeric)) AS revised_total,
    COALESCE(sp.sub_paid, (0)::numeric) AS subcontractor_paid,
    COALESCE(ap.agent_paid, (0)::numeric) AS agent_paid,
    COALESCE(oe.other_exp, (0)::numeric) AS other_expenses,
    COALESCE(ip.payments_received, (0)::numeric) AS payments_received,
    ((e.total + COALESCE(co.co_total, (0)::numeric)) - COALESCE(ip.payments_received, (0)::numeric)) AS remaining_balance,
    ((e.total + COALESCE(co.co_total, (0)::numeric)) - ((COALESCE(sp.sub_paid, (0)::numeric) + COALESCE(ap.agent_paid, (0)::numeric)) + COALESCE(oe.other_exp, (0)::numeric))) AS company_profit,
        CASE
            WHEN ((e.total + COALESCE(co.co_total, (0)::numeric)) > (0)::numeric) THEN ((((e.total + COALESCE(co.co_total, (0)::numeric)) - ((COALESCE(sp.sub_paid, (0)::numeric) + COALESCE(ap.agent_paid, (0)::numeric)) + COALESCE(oe.other_exp, (0)::numeric))) / (e.total + COALESCE(co.co_total, (0)::numeric))) * (100)::numeric)
            ELSE (0)::numeric
        END AS profit_margin,
    COALESCE(inv_stats.invoice_count, (0)::bigint) AS invoice_count,
    inv_stats.last_payment_date
   FROM (((((((public.estimates e
     LEFT JOIN public.clients c ON ((c.id = e.client_id)))
     LEFT JOIN change_order_totals co ON ((co.estimate_id = e.id)))
     LEFT JOIN sub_payments sp ON ((sp.estimate_id = e.id)))
     LEFT JOIN agent_payments ap ON ((ap.estimate_id = e.id)))
     LEFT JOIN other_expenses oe ON ((oe.estimate_id = e.id)))
     LEFT JOIN invoice_payments ip ON ((ip.estimate_id = e.id)))
     LEFT JOIN invoice_stats inv_stats ON ((inv_stats.estimate_id = e.id)))
  WHERE ((e.id IN ( SELECT active_estimates.estimate_id
           FROM active_estimates)) AND (e.deleted_at IS NULL))
  ORDER BY e.created_at DESC;


--
-- Name: vw_estimate_profit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_estimate_profit WITH (security_invoker='on') AS
 SELECT e.id AS estimate_id,
    c.name AS client_name,
    e.status,
        CASE
            WHEN (e.status = ANY (ARRAY['completed'::text, 'accepted'::text])) THEN e.total
            ELSE (0)::numeric
        END AS revenue,
    COALESCE(sum(ee.amount), (0)::numeric) AS direct_expenses,
    COALESCE(sum(ap.amount), (0)::numeric) AS agent_costs,
    COALESCE(sum(sp.amount), (0)::numeric) AS subcontractor_costs,
    COALESCE(sum((m.distance_miles * 0.655)), (0)::numeric) AS mileage_cost,
    ((((
        CASE
            WHEN (e.status = ANY (ARRAY['completed'::text, 'accepted'::text])) THEN e.total
            ELSE (0)::numeric
        END - COALESCE(sum(ee.amount), (0)::numeric)) - COALESCE(sum(ap.amount), (0)::numeric)) - COALESCE(sum(sp.amount), (0)::numeric)) - COALESCE(sum((m.distance_miles * 0.655)), (0)::numeric)) AS gross_profit
   FROM (((((public.estimates e
     LEFT JOIN public.clients c ON ((c.id = e.client_id)))
     LEFT JOIN public.estimate_expenses ee ON ((ee.estimate_id = e.id)))
     LEFT JOIN public.agent_payments ap ON ((ap.estimate_id = e.id)))
     LEFT JOIN public.subcontractor_payments sp ON ((sp.estimate_id = e.id)))
     LEFT JOIN public.mileage_trips m ON ((m.estimate_id = e.id)))
  GROUP BY e.id, e.total, e.status, c.name;


--
-- Name: vw_expense_breakdown; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_expense_breakdown WITH (security_invoker='on') AS
 SELECT category,
    sum(amount) AS total
   FROM public.estimate_expenses
  GROUP BY category
  ORDER BY (sum(amount)) DESC;


--
-- Name: vw_mileage_ytd; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_mileage_ytd WITH (security_invoker='on') AS
 SELECT sum(distance_miles) AS total_miles,
    sum((distance_miles * 0.655)) AS deduction
   FROM public.mileage_trips
  WHERE (EXTRACT(year FROM created_at) = EXTRACT(year FROM now()));


--
-- Name: vw_monthly_pl; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_monthly_pl WITH (security_invoker='on') AS
 WITH income AS (
         SELECT date_trunc('month'::text, estimates.created_at) AS month,
            sum(estimates.total) AS income
           FROM public.estimates
          WHERE (estimates.status = ANY (ARRAY['completed'::text, 'accepted'::text]))
          GROUP BY (date_trunc('month'::text, estimates.created_at))
        ), expenses AS (
         SELECT date_trunc('month'::text, (estimate_expenses.expense_date)::timestamp without time zone) AS month,
            sum(estimate_expenses.amount) AS expense
           FROM public.estimate_expenses
          GROUP BY (date_trunc('month'::text, (estimate_expenses.expense_date)::timestamp without time zone))
        )
 SELECT COALESCE(i.month, (e.month)::timestamp with time zone) AS month,
    COALESCE(i.income, (0)::numeric) AS income,
    COALESCE(e.expense, (0)::numeric) AS expense,
    (COALESCE(i.income, (0)::numeric) - COALESCE(e.expense, (0)::numeric)) AS net
   FROM (income i
     FULL JOIN expenses e ON ((i.month = e.month)))
  ORDER BY COALESCE(i.month, (e.month)::timestamp with time zone) DESC;


--
-- Name: vw_open_invoices; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_open_invoices WITH (security_invoker='on') AS
 SELECT i.id,
    i.invoice_number,
    c.name AS client_name,
    i.total,
    i.due_date,
    i.created_at
   FROM (public.invoices i
     LEFT JOIN public.clients c ON ((c.id = i.client_id)))
  WHERE ((i.paid_at IS NULL) AND (i.status <> 'paid'::text))
  ORDER BY i.due_date;


--
-- Name: vw_top_clients; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_top_clients WITH (security_invoker='on') AS
 SELECT c.name AS client_name,
    sum(e.total) AS total_revenue,
    count(e.id) AS job_count
   FROM (public.estimates e
     JOIN public.clients c ON ((c.id = e.client_id)))
  WHERE (e.status = ANY (ARRAY['completed'::text, 'accepted'::text]))
  GROUP BY c.name
  ORDER BY (sum(e.total)) DESC
 LIMIT 5;


--
-- Name: vw_unsold_costs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_unsold_costs WITH (security_invoker='on') AS
 SELECT sum(ee.amount) AS total_cost
   FROM (public.estimate_expenses ee
     JOIN public.estimates e ON ((e.id = ee.estimate_id)))
  WHERE (e.status = ANY (ARRAY['draft'::text, 'sent'::text, 'rejected'::text]));


--
-- Name: agent_payments agent_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_pkey PRIMARY KEY (id);


--
-- Name: agent_tax_info agent_tax_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tax_info
    ADD CONSTRAINT agent_tax_info_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bill_schedules bill_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_schedules
    ADD CONSTRAINT bill_schedules_pkey PRIMARY KEY (id);


--
-- Name: change_order_line_items change_order_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_pkey PRIMARY KEY (id);


--
-- Name: change_orders change_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: company_documents company_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_documents
    ADD CONSTRAINT company_documents_pkey PRIMARY KEY (id);


--
-- Name: company_invites company_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invites
    ADD CONSTRAINT company_invites_pkey PRIMARY KEY (id);


--
-- Name: company_invites company_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invites
    ADD CONSTRAINT company_invites_token_key UNIQUE (token);


--
-- Name: company_profiles company_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profiles
    ADD CONSTRAINT company_profiles_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: company_tax_settings company_tax_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_tax_settings
    ADD CONSTRAINT company_tax_settings_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: estimate_agents estimate_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_pkey PRIMARY KEY (id);


--
-- Name: estimate_area_line_items estimate_area_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_line_items
    ADD CONSTRAINT estimate_area_line_items_pkey PRIMARY KEY (id);


--
-- Name: estimate_area_photos estimate_area_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_photos
    ADD CONSTRAINT estimate_area_photos_pkey PRIMARY KEY (id);


--
-- Name: estimate_areas estimate_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_areas
    ADD CONSTRAINT estimate_areas_pkey PRIMARY KEY (id);


--
-- Name: estimate_emails estimate_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_emails
    ADD CONSTRAINT estimate_emails_pkey PRIMARY KEY (id);


--
-- Name: estimate_emails estimate_emails_resend_email_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_emails
    ADD CONSTRAINT estimate_emails_resend_email_id_key UNIQUE (resend_email_id);


--
-- Name: estimate_expenses estimate_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_pkey PRIMARY KEY (id);


--
-- Name: estimate_images estimate_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_images
    ADD CONSTRAINT estimate_images_pkey PRIMARY KEY (id);


--
-- Name: estimate_items estimate_items_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_items
    ADD CONSTRAINT estimate_items_pkey1 PRIMARY KEY (id);


--
-- Name: estimate_notes estimate_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_notes
    ADD CONSTRAINT estimate_notes_pkey PRIMARY KEY (id);


--
-- Name: estimate_photos estimate_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_photos
    ADD CONSTRAINT estimate_photos_pkey PRIMARY KEY (id);


--
-- Name: estimate_signatures estimate_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_signatures
    ADD CONSTRAINT estimate_signatures_pkey PRIMARY KEY (id);


--
-- Name: estimate_subcontractors estimate_subcontractors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_pkey PRIMARY KEY (id);


--
-- Name: estimate_team_members estimate_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_pkey PRIMARY KEY (id);


--
-- Name: estimates estimates_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_pkey1 PRIMARY KEY (id);


--
-- Name: expense_receipts expense_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_receipts
    ADD CONSTRAINT expense_receipts_pkey PRIMARY KEY (id);


--
-- Name: financial_transactions financial_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (id);


--
-- Name: financial_transactions financial_transactions_source_table_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_source_table_source_id_key UNIQUE (source_table, source_id);


--
-- Name: invoice_change_orders invoice_change_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_change_orders
    ADD CONSTRAINT invoice_change_orders_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: invoice_sequences invoice_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_pkey PRIMARY KEY (id);


--
-- Name: invoice_sequences invoice_sequences_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_year_key UNIQUE (year);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: mileage_trips mileage_trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_trips
    ADD CONSTRAINT mileage_trips_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_milestones project_milestones_estimate_id_project_name_milestone_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_estimate_id_project_name_milestone_order_key UNIQUE (estimate_id, project_name, milestone_order);


--
-- Name: project_milestones project_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: roofing_area_templates roofing_area_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roofing_area_templates
    ADD CONSTRAINT roofing_area_templates_pkey PRIMARY KEY (id);


--
-- Name: subcontractor_payments subcontractor_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_pkey PRIMARY KEY (id);


--
-- Name: subcontractor_tax_info subcontractor_tax_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_tax_info
    ADD CONSTRAINT subcontractor_tax_info_pkey PRIMARY KEY (id);


--
-- Name: subcontractors subcontractors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_pkey PRIMARY KEY (id);


--
-- Name: tax_audit_log tax_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_audit_log
    ADD CONSTRAINT tax_audit_log_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_company_idx ON public.audit_logs USING btree (company_id, occurred_at DESC);


--
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_table, entity_id, occurred_at DESC);


--
-- Name: audit_logs_entity_timeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_timeline_idx ON public.audit_logs USING btree (company_id, entity_table, entity_id, occurred_at DESC);


--
-- Name: INDEX audit_logs_entity_timeline_idx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.audit_logs_entity_timeline_idx IS 'Serves AuditLogRepository.queryByEntity (per-entity Activity Timeline): equality on company_id/entity_table/entity_id plus occurred_at DESC ordering, from one index.';


--
-- Name: bill_schedules_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_schedules_due_idx ON public.bill_schedules USING btree (company_id, next_due_date) WHERE (is_active AND (deleted_at IS NULL));


--
-- Name: change_orders_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX change_orders_project_id_idx ON public.change_orders USING btree (project_id);


--
-- Name: company_documents_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_documents_category_idx ON public.company_documents USING btree (company_id, category) WHERE (deleted_at IS NULL);


--
-- Name: company_documents_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_documents_company_id_idx ON public.company_documents USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: company_profiles_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_profiles_company_id_idx ON public.company_profiles USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_agents_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_agents_project_id_idx ON public.estimate_agents USING btree (project_id);


--
-- Name: estimate_area_line_items_area_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_area_line_items_area_id_idx ON public.estimate_area_line_items USING btree (estimate_area_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_area_line_items_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_area_line_items_company_id_idx ON public.estimate_area_line_items USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_area_photos_area_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_area_photos_area_id_idx ON public.estimate_area_photos USING btree (estimate_area_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_area_photos_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_area_photos_company_id_idx ON public.estimate_area_photos USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_area_photos_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_area_photos_type_idx ON public.estimate_area_photos USING btree (photo_type) WHERE (deleted_at IS NULL);


--
-- Name: estimate_areas_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_areas_company_id_idx ON public.estimate_areas USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_areas_estimate_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_areas_estimate_id_idx ON public.estimate_areas USING btree (estimate_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_emails_estimate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_emails_estimate_idx ON public.estimate_emails USING btree (estimate_id, sent_at DESC);


--
-- Name: estimate_emails_resend_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_emails_resend_id_idx ON public.estimate_emails USING btree (resend_email_id);


--
-- Name: estimate_expenses_bills_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_expenses_bills_due_idx ON public.estimate_expenses USING btree (company_id, due_date) WHERE ((due_date IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: estimate_expenses_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_expenses_category_idx ON public.estimate_expenses USING btree (category);


--
-- Name: estimate_expenses_estimate_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_expenses_estimate_id_idx ON public.estimate_expenses USING btree (estimate_id);


--
-- Name: estimate_expenses_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_expenses_project_id_idx ON public.estimate_expenses USING btree (project_id);


--
-- Name: estimate_images_estimate_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_images_estimate_id_idx ON public.estimate_images USING btree (estimate_id);


--
-- Name: estimate_images_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_images_stage_idx ON public.estimate_images USING btree (estimate_id, stage);


--
-- Name: estimate_notes_estimate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_notes_estimate_idx ON public.estimate_notes USING btree (estimate_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: estimate_photos_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_photos_company_id_idx ON public.estimate_photos USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_photos_estimate_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_photos_estimate_id_idx ON public.estimate_photos USING btree (estimate_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_subcontractors_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_subcontractors_project_id_idx ON public.estimate_subcontractors USING btree (project_id);


--
-- Name: estimate_team_members_estimate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_team_members_estimate_idx ON public.estimate_team_members USING btree (company_id, estimate_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_team_members_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX estimate_team_members_unique_active ON public.estimate_team_members USING btree (estimate_id, user_id) WHERE (deleted_at IS NULL);


--
-- Name: estimate_team_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimate_team_members_user_idx ON public.estimate_team_members USING btree (company_id, user_id) WHERE (deleted_at IS NULL);


--
-- Name: estimates_company_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX estimates_company_number_unique ON public.estimates USING btree (company_id, estimate_number) WHERE ((estimate_number IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: estimates_customer_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX estimates_customer_token_key ON public.estimates USING btree (customer_token) WHERE (customer_token IS NOT NULL);


--
-- Name: estimates_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estimates_project_id_idx ON public.estimates USING btree (project_id);


--
-- Name: financial_transactions_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_transactions_category_idx ON public.financial_transactions USING btree (company_id, category) WHERE (deleted_at IS NULL);


--
-- Name: financial_transactions_company_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_transactions_company_date_idx ON public.financial_transactions USING btree (company_id, transaction_date) WHERE (deleted_at IS NULL);


--
-- Name: financial_transactions_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_transactions_project_id_idx ON public.financial_transactions USING btree (project_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_agent_payments_change_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_payments_change_order_id ON public.agent_payments USING btree (change_order_id);


--
-- Name: idx_agent_payments_estimate_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_payments_estimate_agent_id ON public.agent_payments USING btree (estimate_agent_id);


--
-- Name: idx_agent_payments_expense_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_payments_expense_id ON public.agent_payments USING btree (expense_id);


--
-- Name: idx_agent_payments_payment_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_payments_payment_type ON public.agent_payments USING btree (payment_type);


--
-- Name: idx_agent_payments_reimbursement_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_payments_reimbursement_agent ON public.agent_payments USING btree (reimbursement_from_agent_id);


--
-- Name: idx_agent_tax_info_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tax_info_company_id ON public.agent_tax_info USING btree (company_id);


--
-- Name: idx_clients_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_deleted_at ON public.clients USING btree (deleted_at);


--
-- Name: idx_company_tax_settings_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_tax_settings_company_id ON public.company_tax_settings USING btree (company_id);


--
-- Name: idx_estimate_expenses_change_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_expenses_change_order_id ON public.estimate_expenses USING btree (change_order_id);


--
-- Name: idx_estimate_expenses_estimate_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_expenses_estimate_active ON public.estimate_expenses USING btree (estimate_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_estimate_expenses_paid_by_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_expenses_paid_by_agent_id ON public.estimate_expenses USING btree (paid_by_agent_id);


--
-- Name: idx_estimate_expenses_payee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_expenses_payee ON public.estimate_expenses USING btree (payee_type, payee_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_estimate_expenses_project_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_expenses_project_active ON public.estimate_expenses USING btree (project_id, expense_type) WHERE (deleted_at IS NULL);


--
-- Name: idx_estimate_expenses_reimbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimate_expenses_reimbursement ON public.estimate_expenses USING btree (company_id, reimbursement_status) WHERE ((deleted_at IS NULL) AND (reimbursable = true));


--
-- Name: idx_estimates_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_client_id ON public.estimates USING btree (client_id);


--
-- Name: idx_estimates_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_completed_at ON public.estimates USING btree (completed_at);


--
-- Name: idx_estimates_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_created_at ON public.estimates USING btree (created_at);


--
-- Name: idx_estimates_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_deleted_at ON public.estimates USING btree (deleted_at);


--
-- Name: idx_estimates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_estimates_status ON public.estimates USING btree (status);


--
-- Name: idx_expense_receipts_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_receipts_company_id ON public.expense_receipts USING btree (company_id);


--
-- Name: idx_invoice_payments_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_company_id ON public.invoice_payments USING btree (company_id, payment_date DESC);


--
-- Name: idx_invoice_payments_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_invoice_id ON public.invoice_payments USING btree (invoice_id);


--
-- Name: idx_invoice_payments_invoice_id_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_invoice_id_date ON public.invoice_payments USING btree (invoice_id, payment_date DESC);


--
-- Name: idx_invoice_payments_payment_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_payment_type ON public.invoice_payments USING btree (payment_type);


--
-- Name: idx_invoices_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_deleted_at ON public.invoices USING btree (deleted_at);


--
-- Name: idx_invoices_lifecycle_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_lifecycle_status ON public.invoices USING btree (company_id, lifecycle_status);


--
-- Name: idx_mileage_trips_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mileage_trips_user_id ON public.mileage_trips USING btree (user_id);


--
-- Name: idx_subcontractor_payments_change_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcontractor_payments_change_order_id ON public.subcontractor_payments USING btree (change_order_id);


--
-- Name: idx_subcontractor_payments_reimbursement_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcontractor_payments_reimbursement_agent ON public.subcontractor_payments USING btree (reimbursement_from_agent_id);


--
-- Name: idx_subcontractor_tax_info_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcontractor_tax_info_company_id ON public.subcontractor_tax_info USING btree (company_id);


--
-- Name: idx_tax_audit_log_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_audit_log_company_id ON public.tax_audit_log USING btree (company_id);


--
-- Name: invoices_company_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_company_number_unique ON public.invoices USING btree (company_id, invoice_number) WHERE ((invoice_number IS NOT NULL) AND (is_deleted IS NOT TRUE));


--
-- Name: invoices_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_project_id_idx ON public.invoices USING btree (project_id);


--
-- Name: mileage_trips_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mileage_trips_project_id_idx ON public.mileage_trips USING btree (project_id);


--
-- Name: project_milestones_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_milestones_project_id_idx ON public.project_milestones USING btree (project_id);


--
-- Name: projects_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_client_id_idx ON public.projects USING btree (client_id) WHERE (deleted_at IS NULL);


--
-- Name: projects_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_company_id_idx ON public.projects USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: projects_company_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_company_number_unique ON public.projects USING btree (company_id, project_number) WHERE ((deleted_at IS NULL) AND (project_number IS NOT NULL));


--
-- Name: projects_legacy_estimate_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_legacy_estimate_id_idx ON public.projects USING btree (legacy_estimate_id);


--
-- Name: projects_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_status_idx ON public.projects USING btree (company_id, status) WHERE (deleted_at IS NULL);


--
-- Name: roofing_area_templates_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roofing_area_templates_company_id_idx ON public.roofing_area_templates USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: agent_payments trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.agent_payments FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: agents trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: change_order_line_items trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.change_order_line_items FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: change_orders trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: clients trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: companies trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: company_invites trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.company_invites FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: company_settings trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: documents trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimate_agents trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimate_agents FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimate_areas trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimate_areas FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimate_expenses trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimate_expenses FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimate_images trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimate_images FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimate_items trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimate_items FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimate_signatures trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimate_signatures FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimate_subcontractors trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimate_subcontractors FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: estimates trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: financial_transactions trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: invoice_change_orders trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.invoice_change_orders FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: invoice_items trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: invoice_payments trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: invoice_sequences trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.invoice_sequences FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: invoices trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: mileage_trips trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.mileage_trips FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: profiles trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: project_milestones trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: projects trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: subcontractor_payments trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.subcontractor_payments FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: subcontractors trg_audit_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fields BEFORE INSERT OR UPDATE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


--
-- Name: agent_payments trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.agent_payments FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: change_orders trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: clients trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: estimate_agents trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.estimate_agents FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: estimate_expenses trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.estimate_expenses FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: estimate_subcontractors trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.estimate_subcontractors FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: estimates trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: invoice_payments trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: invoices trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: projects trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: subcontractor_payments trg_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.subcontractor_payments FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();


--
-- Name: agent_payments trg_mirror_agent_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mirror_agent_payment AFTER INSERT OR UPDATE ON public.agent_payments FOR EACH ROW EXECUTE FUNCTION public.mirror_agent_payment();


--
-- Name: estimate_expenses trg_mirror_estimate_expense; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mirror_estimate_expense AFTER INSERT OR UPDATE ON public.estimate_expenses FOR EACH ROW EXECUTE FUNCTION public.mirror_estimate_expense();


--
-- Name: invoice_payments trg_mirror_invoice_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mirror_invoice_payment AFTER INSERT OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.mirror_invoice_payment();


--
-- Name: subcontractor_payments trg_mirror_subcontractor_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mirror_subcontractor_payment AFTER INSERT OR UPDATE ON public.subcontractor_payments FOR EACH ROW EXECUTE FUNCTION public.mirror_subcontractor_payment();


--
-- Name: agent_payments trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.agent_payments FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: agents trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: change_order_line_items trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.change_order_line_items FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: change_orders trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: clients trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: company_settings trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: documents trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_agents trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.estimate_agents FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_area_photos trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.estimate_area_photos FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_areas trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.estimate_areas FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_expenses trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.estimate_expenses FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_images trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.estimate_images FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_items trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.estimate_items FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_subcontractors trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.estimate_subcontractors FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: invoice_items trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: invoice_payments trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: mileage_trips trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.mileage_trips FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: project_milestones trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: projects trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: subcontractor_payments trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.subcontractor_payments FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: subcontractors trg_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soft_delete BEFORE DELETE ON public.subcontractors FOR EACH ROW EXECUTE FUNCTION public.soft_delete_instead();


--
-- Name: estimate_expenses trg_sync_expense_legacy_category; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_expense_legacy_category BEFORE INSERT OR UPDATE OF expense_type ON public.estimate_expenses FOR EACH ROW EXECUTE FUNCTION public.sync_expense_legacy_category();


--
-- Name: invoice_payments trg_update_invoice_payment_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_invoice_payment_totals AFTER INSERT OR DELETE OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.update_invoice_payment_totals();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: estimate_items update_estimate_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_estimate_items_updated_at BEFORE UPDATE ON public.estimate_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: estimates update_estimates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_estimates_updated_at BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_payments agent_payments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_payments agent_payments_change_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: agent_payments agent_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_estimate_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_estimate_agent_id_fkey FOREIGN KEY (estimate_agent_id) REFERENCES public.estimate_agents(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: agent_payments agent_payments_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.estimate_expenses(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_reimbursement_from_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_reimbursement_from_agent_id_fkey FOREIGN KEY (reimbursement_from_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_tax_info agent_tax_info_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tax_info
    ADD CONSTRAINT agent_tax_info_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_tax_info agent_tax_info_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tax_info
    ADD CONSTRAINT agent_tax_info_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agents agents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: agents agents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agents agents_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agents agents_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: bill_schedules bill_schedules_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_schedules
    ADD CONSTRAINT bill_schedules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: bill_schedules bill_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_schedules
    ADD CONSTRAINT bill_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: bill_schedules bill_schedules_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_schedules
    ADD CONSTRAINT bill_schedules_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id);


--
-- Name: bill_schedules bill_schedules_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_schedules
    ADD CONSTRAINT bill_schedules_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: bill_schedules bill_schedules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_schedules
    ADD CONSTRAINT bill_schedules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: change_order_line_items change_order_line_items_change_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE CASCADE;


--
-- Name: change_order_line_items change_order_line_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: change_order_line_items change_order_line_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: change_order_line_items change_order_line_items_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: change_order_line_items change_order_line_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_order_line_items
    ADD CONSTRAINT change_order_line_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: change_orders change_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: change_orders change_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: change_orders change_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: change_orders change_orders_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: change_orders change_orders_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: change_orders change_orders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: change_orders change_orders_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.change_orders
    ADD CONSTRAINT change_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: clients clients_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: clients clients_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: clients clients_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: clients clients_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: companies companies_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: companies companies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_documents company_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_documents
    ADD CONSTRAINT company_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_documents company_documents_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_documents
    ADD CONSTRAINT company_documents_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: company_documents company_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_documents
    ADD CONSTRAINT company_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: company_invites company_invites_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invites
    ADD CONSTRAINT company_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_invites company_invites_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invites
    ADD CONSTRAINT company_invites_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_invites company_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invites
    ADD CONSTRAINT company_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_invites company_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invites
    ADD CONSTRAINT company_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_invites company_invites_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_invites
    ADD CONSTRAINT company_invites_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_profiles company_profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profiles
    ADD CONSTRAINT company_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_profiles company_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profiles
    ADD CONSTRAINT company_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: company_profiles company_profiles_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profiles
    ADD CONSTRAINT company_profiles_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: company_profiles company_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profiles
    ADD CONSTRAINT company_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: company_settings company_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: company_settings company_settings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_settings company_settings_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_settings company_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_tax_settings company_tax_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_tax_settings
    ADD CONSTRAINT company_tax_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_tax_settings company_tax_settings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_tax_settings
    ADD CONSTRAINT company_tax_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: company_tax_settings company_tax_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_tax_settings
    ADD CONSTRAINT company_tax_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: documents documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: documents documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_agents estimate_agents_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: estimate_agents estimate_agents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_agents estimate_agents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_agents estimate_agents_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_agents estimate_agents_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_agents estimate_agents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: estimate_agents estimate_agents_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_agents
    ADD CONSTRAINT estimate_agents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_area_line_items estimate_area_line_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_line_items
    ADD CONSTRAINT estimate_area_line_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: estimate_area_line_items estimate_area_line_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_line_items
    ADD CONSTRAINT estimate_area_line_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: estimate_area_line_items estimate_area_line_items_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_line_items
    ADD CONSTRAINT estimate_area_line_items_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: estimate_area_line_items estimate_area_line_items_estimate_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_line_items
    ADD CONSTRAINT estimate_area_line_items_estimate_area_id_fkey FOREIGN KEY (estimate_area_id) REFERENCES public.estimate_areas(id) ON DELETE CASCADE;


--
-- Name: estimate_area_line_items estimate_area_line_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_line_items
    ADD CONSTRAINT estimate_area_line_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: estimate_area_photos estimate_area_photos_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_photos
    ADD CONSTRAINT estimate_area_photos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: estimate_area_photos estimate_area_photos_estimate_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_area_photos
    ADD CONSTRAINT estimate_area_photos_estimate_area_id_fkey FOREIGN KEY (estimate_area_id) REFERENCES public.estimate_areas(id) ON DELETE CASCADE;


--
-- Name: estimate_areas estimate_areas_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_areas
    ADD CONSTRAINT estimate_areas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: estimate_areas estimate_areas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_areas
    ADD CONSTRAINT estimate_areas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: estimate_areas estimate_areas_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_areas
    ADD CONSTRAINT estimate_areas_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: estimate_areas estimate_areas_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_areas
    ADD CONSTRAINT estimate_areas_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_areas estimate_areas_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_areas
    ADD CONSTRAINT estimate_areas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: estimate_emails estimate_emails_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_emails
    ADD CONSTRAINT estimate_emails_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: estimate_emails estimate_emails_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_emails
    ADD CONSTRAINT estimate_emails_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: estimate_emails estimate_emails_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_emails
    ADD CONSTRAINT estimate_emails_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_expenses estimate_expenses_change_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE SET NULL;


--
-- Name: estimate_expenses estimate_expenses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_expenses estimate_expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_expenses estimate_expenses_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_expenses estimate_expenses_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_expenses estimate_expenses_paid_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_paid_by_agent_id_fkey FOREIGN KEY (paid_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: estimate_expenses estimate_expenses_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: estimate_expenses estimate_expenses_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_expenses
    ADD CONSTRAINT estimate_expenses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_images estimate_images_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_images
    ADD CONSTRAINT estimate_images_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_images estimate_images_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_images
    ADD CONSTRAINT estimate_images_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_images estimate_images_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_images
    ADD CONSTRAINT estimate_images_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_images estimate_images_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_images
    ADD CONSTRAINT estimate_images_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_images estimate_images_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_images
    ADD CONSTRAINT estimate_images_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_items estimate_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_items
    ADD CONSTRAINT estimate_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_items estimate_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_items
    ADD CONSTRAINT estimate_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_items estimate_items_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_items
    ADD CONSTRAINT estimate_items_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_items estimate_items_estimate_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_items
    ADD CONSTRAINT estimate_items_estimate_id_fkey1 FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_items estimate_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_items
    ADD CONSTRAINT estimate_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_notes estimate_notes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_notes
    ADD CONSTRAINT estimate_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: estimate_notes estimate_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_notes
    ADD CONSTRAINT estimate_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: estimate_notes estimate_notes_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_notes
    ADD CONSTRAINT estimate_notes_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id);


--
-- Name: estimate_notes estimate_notes_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_notes
    ADD CONSTRAINT estimate_notes_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_notes estimate_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_notes
    ADD CONSTRAINT estimate_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: estimate_photos estimate_photos_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_photos
    ADD CONSTRAINT estimate_photos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: estimate_photos estimate_photos_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_photos
    ADD CONSTRAINT estimate_photos_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_signatures estimate_signatures_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_signatures
    ADD CONSTRAINT estimate_signatures_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_signatures estimate_signatures_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_signatures
    ADD CONSTRAINT estimate_signatures_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_signatures estimate_signatures_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_signatures
    ADD CONSTRAINT estimate_signatures_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_signatures estimate_signatures_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_signatures
    ADD CONSTRAINT estimate_signatures_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_signatures estimate_signatures_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_signatures
    ADD CONSTRAINT estimate_signatures_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_subcontractors estimate_subcontractors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimate_subcontractors estimate_subcontractors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_subcontractors estimate_subcontractors_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_subcontractors estimate_subcontractors_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_subcontractors estimate_subcontractors_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: estimate_subcontractors estimate_subcontractors_subcontractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_subcontractor_id_fkey FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id) ON DELETE CASCADE;


--
-- Name: estimate_subcontractors estimate_subcontractors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_subcontractors
    ADD CONSTRAINT estimate_subcontractors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimate_team_members estimate_team_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: estimate_team_members estimate_team_members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: estimate_team_members estimate_team_members_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id);


--
-- Name: estimate_team_members estimate_team_members_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: estimate_team_members estimate_team_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: estimate_team_members estimate_team_members_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: estimate_team_members estimate_team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_team_members
    ADD CONSTRAINT estimate_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: estimates estimates_client_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_client_id_fkey1 FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: estimates estimates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: estimates estimates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimates estimates_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estimates estimates_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.company_profiles(id) ON DELETE SET NULL;


--
-- Name: estimates estimates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: estimates estimates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: expense_receipts expense_receipts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_receipts
    ADD CONSTRAINT expense_receipts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: expense_receipts expense_receipts_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_receipts
    ADD CONSTRAINT expense_receipts_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.estimate_expenses(id) ON DELETE CASCADE;


--
-- Name: expense_receipts expense_receipts_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_receipts
    ADD CONSTRAINT expense_receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: financial_transactions financial_transactions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: financial_transactions financial_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: financial_transactions financial_transactions_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: financial_transactions financial_transactions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: financial_transactions financial_transactions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_change_orders invoice_change_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_change_orders
    ADD CONSTRAINT invoice_change_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: invoice_change_orders invoice_change_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_change_orders
    ADD CONSTRAINT invoice_change_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_change_orders invoice_change_orders_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_change_orders
    ADD CONSTRAINT invoice_change_orders_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_change_orders invoice_change_orders_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_change_orders
    ADD CONSTRAINT invoice_change_orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_change_orders invoice_change_orders_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_change_orders
    ADD CONSTRAINT invoice_change_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_items invoice_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: invoice_items invoice_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_items invoice_items_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_payments invoice_payments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: invoice_payments invoice_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_payments invoice_payments_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_payments invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_payments invoice_payments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_sequences invoice_sequences_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: invoice_sequences invoice_sequences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_sequences invoice_sequences_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoice_sequences invoice_sequences_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_change_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id);


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.company_profiles(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: mileage_trips mileage_trips_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_trips
    ADD CONSTRAINT mileage_trips_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: mileage_trips mileage_trips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_trips
    ADD CONSTRAINT mileage_trips_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: mileage_trips mileage_trips_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_trips
    ADD CONSTRAINT mileage_trips_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: mileage_trips mileage_trips_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_trips
    ADD CONSTRAINT mileage_trips_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: mileage_trips mileage_trips_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_trips
    ADD CONSTRAINT mileage_trips_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: mileage_trips mileage_trips_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_trips
    ADD CONSTRAINT mileage_trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_milestones project_milestones_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: project_milestones project_milestones_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_milestones project_milestones_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_milestones project_milestones_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE;


--
-- Name: project_milestones project_milestones_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: project_milestones project_milestones_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: projects projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_legacy_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_legacy_estimate_id_fkey FOREIGN KEY (legacy_estimate_id) REFERENCES public.estimates(id) ON DELETE SET NULL;


--
-- Name: projects projects_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: roofing_area_templates roofing_area_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roofing_area_templates
    ADD CONSTRAINT roofing_area_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: roofing_area_templates roofing_area_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roofing_area_templates
    ADD CONSTRAINT roofing_area_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: roofing_area_templates roofing_area_templates_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roofing_area_templates
    ADD CONSTRAINT roofing_area_templates_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: roofing_area_templates roofing_area_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roofing_area_templates
    ADD CONSTRAINT roofing_area_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: subcontractor_payments subcontractor_payments_change_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE SET NULL;


--
-- Name: subcontractor_payments subcontractor_payments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: subcontractor_payments subcontractor_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subcontractor_payments subcontractor_payments_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subcontractor_payments subcontractor_payments_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id);


--
-- Name: subcontractor_payments subcontractor_payments_estimate_subcontractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_estimate_subcontractor_id_fkey FOREIGN KEY (estimate_subcontractor_id) REFERENCES public.estimate_subcontractors(id) ON DELETE CASCADE;


--
-- Name: subcontractor_payments subcontractor_payments_reimbursement_from_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_reimbursement_from_agent_id_fkey FOREIGN KEY (reimbursement_from_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: subcontractor_payments subcontractor_payments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_payments
    ADD CONSTRAINT subcontractor_payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subcontractor_tax_info subcontractor_tax_info_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_tax_info
    ADD CONSTRAINT subcontractor_tax_info_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: subcontractor_tax_info subcontractor_tax_info_subcontractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_tax_info
    ADD CONSTRAINT subcontractor_tax_info_subcontractor_id_fkey FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id) ON DELETE CASCADE;


--
-- Name: subcontractors subcontractors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: subcontractors subcontractors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subcontractors subcontractors_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subcontractors subcontractors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tax_audit_log tax_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_audit_log
    ADD CONSTRAINT tax_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tax_audit_log tax_audit_log_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_audit_log
    ADD CONSTRAINT tax_audit_log_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);


--
-- Name: agent_payments Company isolation agent_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation agent_payments" ON public.agent_payments TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: agents Company isolation agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation agents" ON public.agents TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: change_order_line_items Company isolation change_order_line_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation change_order_line_items" ON public.change_order_line_items TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: change_orders Company isolation change_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation change_orders" ON public.change_orders TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: clients Company isolation clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation clients" ON public.clients TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: company_settings Company isolation company_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation company_settings" ON public.company_settings TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: documents Company isolation documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation documents" ON public.documents TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: estimate_agents Company isolation estimate_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation estimate_agents" ON public.estimate_agents TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: estimate_expenses Company isolation estimate_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation estimate_expenses" ON public.estimate_expenses TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: estimate_images Company isolation estimate_images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation estimate_images" ON public.estimate_images TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: estimate_items Company isolation estimate_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation estimate_items" ON public.estimate_items TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: estimate_signatures Company isolation estimate_signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation estimate_signatures" ON public.estimate_signatures TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: estimate_subcontractors Company isolation estimate_subcontractors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation estimate_subcontractors" ON public.estimate_subcontractors TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: estimates Company isolation estimates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation estimates" ON public.estimates TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_change_orders Company isolation invoice_change_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation invoice_change_orders" ON public.invoice_change_orders TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_items Company isolation invoice_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation invoice_items" ON public.invoice_items TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_payments Company isolation invoice_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation invoice_payments" ON public.invoice_payments TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoice_sequences Company isolation invoice_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation invoice_sequences" ON public.invoice_sequences TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoices Company isolation invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation invoices" ON public.invoices TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: mileage_trips Company isolation mileage_trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation mileage_trips" ON public.mileage_trips TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: project_milestones Company isolation project_milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation project_milestones" ON public.project_milestones TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: subcontractor_payments Company isolation subcontractor_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation subcontractor_payments" ON public.subcontractor_payments TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: subcontractors Company isolation subcontractors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Company isolation subcontractors" ON public.subcontractors TO authenticated USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: subcontractor_payments Enable all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all for authenticated users" ON public.subcontractor_payments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: company_tax_settings Users can update tax settings for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update tax settings for their company" ON public.company_tax_settings FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: agent_tax_info Users can view agent tax info for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view agent tax info for their company" ON public.agent_tax_info FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: expense_receipts Users can view expense receipts for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view expense receipts for their company" ON public.expense_receipts FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: subcontractor_tax_info Users can view subcontractor tax info for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view subcontractor tax info for their company" ON public.subcontractor_tax_info FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: tax_audit_log Users can view tax audit logs for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tax audit logs for their company" ON public.tax_audit_log FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: company_tax_settings Users can view tax settings for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tax settings for their company" ON public.company_tax_settings FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: agent_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_payments agent_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_payments_select ON public.agent_payments FOR SELECT USING (((company_id = public.current_company_id()) AND ((public.current_user_role() <> 'agent'::text) OR (agent_id = ( SELECT agents.id
   FROM public.agents
  WHERE ((agents.id = agent_payments.agent_id) AND (agents.company_id = public.current_company_id())))))));


--
-- Name: agent_tax_info; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_tax_info ENABLE ROW LEVEL SECURITY;

--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: bill_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_schedules bill_schedules_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bill_schedules_delete ON public.bill_schedules FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));


--
-- Name: bill_schedules bill_schedules_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bill_schedules_insert ON public.bill_schedules FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: bill_schedules bill_schedules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bill_schedules_select ON public.bill_schedules FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));


--
-- Name: bill_schedules bill_schedules_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bill_schedules_update ON public.bill_schedules FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: change_order_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.change_order_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: change_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: change_orders change_orders_public_estimate_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY change_orders_public_estimate_token_select ON public.change_orders FOR SELECT USING (((status = 'approved'::text) AND (deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = change_orders.estimate_id) AND (e.customer_token IS NOT NULL) AND (e.customer_token = public.current_invoice_token()) AND (e.deleted_at IS NULL))))));


--
-- Name: change_orders change_orders_public_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY change_orders_public_token_select ON public.change_orders FOR SELECT USING (((status = 'approved'::text) AND (deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.estimate_id = change_orders.estimate_id) AND (i.customer_token IS NOT NULL) AND (i.customer_token = public.current_invoice_token()) AND (i.deleted_at IS NULL))))));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_public_invoice_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_public_invoice_token_select ON public.clients FOR SELECT USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.client_id = clients.id) AND (i.customer_token IS NOT NULL) AND (i.customer_token = public.current_invoice_token()) AND (i.deleted_at IS NULL))))));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_select ON public.companies FOR SELECT USING ((id = public.current_company_id()));


--
-- Name: companies companies_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_update ON public.companies FOR UPDATE USING ((id = public.current_company_id()));


--
-- Name: company_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: company_documents company_documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_documents_delete ON public.company_documents FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: company_documents company_documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_documents_insert ON public.company_documents FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: company_documents company_documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_documents_select ON public.company_documents FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: company_documents company_documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_documents_update ON public.company_documents FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: company_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: company_invites company_invites_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_invites_insert ON public.company_invites FOR INSERT WITH CHECK (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'owner'::text))))));


--
-- Name: company_invites company_invites_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_invites_select ON public.company_invites FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: company_invites company_invites_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_invites_update ON public.company_invites FOR UPDATE USING (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'owner'::text))))));


--
-- Name: company_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: company_profiles company_profiles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_delete ON public.company_profiles FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: company_profiles company_profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_insert ON public.company_profiles FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: company_profiles company_profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_select ON public.company_profiles FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: company_profiles company_profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_update ON public.company_profiles FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings company_settings_public_invoice_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_public_invoice_token_select ON public.company_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.company_id = company_settings.company_id) AND (i.customer_token IS NOT NULL) AND (i.customer_token = public.current_invoice_token()) AND (i.deleted_at IS NULL)))));


--
-- Name: company_tax_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_tax_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_area_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_area_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_area_line_items estimate_area_line_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_line_items_delete ON public.estimate_area_line_items FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_area_line_items estimate_area_line_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_line_items_insert ON public.estimate_area_line_items FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_area_line_items estimate_area_line_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_line_items_select ON public.estimate_area_line_items FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: estimate_area_line_items estimate_area_line_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_line_items_update ON public.estimate_area_line_items FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_area_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_area_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_area_photos estimate_area_photos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_photos_delete ON public.estimate_area_photos FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_area_photos estimate_area_photos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_photos_insert ON public.estimate_area_photos FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_area_photos estimate_area_photos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_photos_select ON public.estimate_area_photos FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: estimate_area_photos estimate_area_photos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_area_photos_update ON public.estimate_area_photos FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_areas estimate_areas_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_areas_delete ON public.estimate_areas FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_areas estimate_areas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_areas_insert ON public.estimate_areas FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_areas estimate_areas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_areas_select ON public.estimate_areas FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: estimate_areas estimate_areas_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_areas_update ON public.estimate_areas FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_emails estimate_emails_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_emails_insert ON public.estimate_emails FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_emails estimate_emails_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_emails_select ON public.estimate_emails FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));


--
-- Name: estimate_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_expenses estimate_expenses_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_expenses_delete ON public.estimate_expenses FOR DELETE USING (((company_id = public.current_company_id()) AND (public.current_user_role() = ANY (ARRAY['admin'::text, 'office'::text, 'accountant'::text]))));


--
-- Name: estimate_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_images ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_items estimate_items_public_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_items_public_token_select ON public.estimate_items FOR SELECT USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.estimates e
  WHERE ((e.id = estimate_items.estimate_id) AND (e.customer_token IS NOT NULL) AND (e.customer_token = public.current_invoice_token()) AND (e.deleted_at IS NULL))))));


--
-- Name: estimate_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_notes estimate_notes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_notes_insert ON public.estimate_notes FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_notes estimate_notes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_notes_select ON public.estimate_notes FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));


--
-- Name: estimate_notes estimate_notes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_notes_update ON public.estimate_notes FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_photos estimate_photos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_photos_delete ON public.estimate_photos FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_photos estimate_photos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_photos_insert ON public.estimate_photos FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_photos estimate_photos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_photos_select ON public.estimate_photos FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: estimate_photos estimate_photos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_photos_update ON public.estimate_photos FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: estimate_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_subcontractors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_subcontractors ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_team_members estimate_team_members_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_team_members_delete ON public.estimate_team_members FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));


--
-- Name: estimate_team_members estimate_team_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_team_members_insert ON public.estimate_team_members FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimate_team_members estimate_team_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_team_members_select ON public.estimate_team_members FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));


--
-- Name: estimate_team_members estimate_team_members_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_team_members_update ON public.estimate_team_members FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: estimates estimates_public_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimates_public_token_select ON public.estimates FOR SELECT USING (((customer_token IS NOT NULL) AND (customer_token = public.current_invoice_token()) AND (deleted_at IS NULL)));


--
-- Name: expense_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: expense_receipts expense_receipts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expense_receipts_delete ON public.expense_receipts FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: expense_receipts expense_receipts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expense_receipts_insert ON public.expense_receipts FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: expense_receipts expense_receipts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expense_receipts_select ON public.expense_receipts FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: expense_receipts expense_receipts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expense_receipts_update ON public.expense_receipts FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: financial_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_transactions financial_transactions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financial_transactions_select ON public.financial_transactions FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: invoice_change_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_change_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items invoice_items_public_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_public_token_select ON public.invoice_items FOR SELECT USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.customer_token IS NOT NULL) AND (i.customer_token = public.current_invoice_token()) AND (i.deleted_at IS NULL))))));


--
-- Name: invoice_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_payments invoice_payments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_payments_delete ON public.invoice_payments FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_payments.invoice_id) AND (i.company_id = public.current_company_id())))) AND (public.current_user_role() = ANY (ARRAY['admin'::text, 'office'::text, 'accountant'::text]))));


--
-- Name: invoice_payments invoice_payments_public_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_payments_public_token_select ON public.invoice_payments FOR SELECT USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_payments.invoice_id) AND (i.customer_token IS NOT NULL) AND (i.customer_token = public.current_invoice_token()) AND (i.deleted_at IS NULL))))));


--
-- Name: invoice_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_delete ON public.invoices FOR DELETE USING (((company_id = public.current_company_id()) AND (public.current_user_role() = ANY (ARRAY['admin'::text, 'office'::text, 'accountant'::text]))));


--
-- Name: invoices invoices_public_token_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_public_token_select ON public.invoices FOR SELECT USING (((customer_token IS NOT NULL) AND (customer_token = public.current_invoice_token()) AND (deleted_at IS NULL)));


--
-- Name: mileage_trips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mileage_trips ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own_profile ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: profiles profiles_update_own_row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own_row ON public.profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: project_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete ON public.projects FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: projects projects_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert ON public.projects FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: projects projects_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select ON public.projects FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: projects projects_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update ON public.projects FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: roofing_area_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roofing_area_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: roofing_area_templates roofing_area_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roofing_area_templates_delete ON public.roofing_area_templates FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: roofing_area_templates roofing_area_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roofing_area_templates_insert ON public.roofing_area_templates FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: roofing_area_templates roofing_area_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roofing_area_templates_select ON public.roofing_area_templates FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: roofing_area_templates roofing_area_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roofing_area_templates_update ON public.roofing_area_templates FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: subcontractor_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcontractor_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: subcontractor_payments subcontractor_payments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractor_payments_delete ON public.subcontractor_payments FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: subcontractor_payments subcontractor_payments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractor_payments_insert ON public.subcontractor_payments FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: subcontractor_payments subcontractor_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractor_payments_select ON public.subcontractor_payments FOR SELECT USING (((company_id = public.current_company_id()) AND ((public.current_user_role() <> 'subcontractor'::text) OR (estimate_subcontractor_id IN ( SELECT estimate_subcontractors.id
   FROM public.estimate_subcontractors
  WHERE (estimate_subcontractors.company_id = public.current_company_id()))))));


--
-- Name: subcontractor_payments subcontractor_payments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractor_payments_update ON public.subcontractor_payments FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: subcontractor_tax_info; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcontractor_tax_info ENABLE ROW LEVEL SECURITY;

--
-- Name: subcontractors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

--
-- Name: subcontractors subcontractors_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractors_delete ON public.subcontractors FOR DELETE USING ((company_id = public.current_company_id()));


--
-- Name: subcontractors subcontractors_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractors_insert ON public.subcontractors FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: subcontractors subcontractors_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractors_select ON public.subcontractors FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: subcontractors subcontractors_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontractors_update ON public.subcontractors FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: tax_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: company_tax_settings tax_settings_update_admin_accountant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_settings_update_admin_accountant ON public.company_tax_settings FOR UPDATE USING (((company_id = public.current_company_id()) AND (public.current_user_role() = ANY (ARRAY['admin'::text, 'accountant'::text]))));


--
-- PostgreSQL database dump complete
--

