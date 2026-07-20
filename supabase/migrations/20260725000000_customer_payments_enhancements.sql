-- Enhance invoice_payments table with comprehensive payment tracking
-- Add missing fields for detailed payment records

alter table public.invoice_payments add column if not exists payment_date date default CURRENT_DATE;
alter table public.invoice_payments add column if not exists reference_number text;
alter table public.invoice_payments add column if not exists notes text;

-- Ensure method column exists and add a not null constraint with a default
-- Note: method column should already exist from earlier migrations
-- Just add a comment for clarity
comment on column public.invoice_payments.method is 'Payment method: cash, check, ach, credit_card, zelle, bank_transfer, other';

-- Create index for faster queries by invoice and date
create index if not exists idx_invoice_payments_invoice_id_date on public.invoice_payments(invoice_id, payment_date desc);
create index if not exists idx_invoice_payments_company_id on public.invoice_payments(company_id, payment_date desc);

-- Add trigger to automatically update invoice totals when payments change
-- This ensures amount_paid and remaining_balance are always in sync
create or replace function public.update_invoice_payment_totals()
returns trigger as $$
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
$$ language plpgsql;

-- Drop existing trigger if it exists and recreate it
drop trigger if exists trg_update_invoice_payment_totals on public.invoice_payments;
create trigger trg_update_invoice_payment_totals
  after insert or update or delete on public.invoice_payments
  for each row
  execute function public.update_invoice_payment_totals();
