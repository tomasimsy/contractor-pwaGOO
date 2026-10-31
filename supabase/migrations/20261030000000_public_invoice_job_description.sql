-- =====================================================================
-- The customer invoice page shows the job's scope as "Job description".
-- That text lives on the SOURCE ESTIMATE (estimates.description), which
-- the public page cannot read directly (anonymous, token-scoped access
-- only). This adds it to the one token-scoped payload.
--
-- Only change: invoice.job_description = the source estimate's
-- description, or null when the invoice has no estimate. Everything else
-- is the body of get_public_invoice as it stood in schema-snapshot.sql.
-- Deleted items/payments/change orders are filtered exactly as before.
--
-- Run in the Supabase SQL editor. Idempotent (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token text) RETURNS jsonb
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
      'job_description', (
        select e.description from public.estimates e
        where e.id = inv.estimate_id
      ),
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
