-- Web Push subscriptions — one row per browser/device a staff member
-- has enabled notifications on (a user can have several: phone,
-- laptop, etc.). Used first for "a customer signed an estimate" —
-- see lib/push/sendPush.ts — but is a general-purpose table any future
-- push notification can reuse; nothing about it is estimate-specific.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- The three fields a Web Push endpoint needs (PushSubscriptionJSON) —
  -- endpoint is unique per browser/device registration, so re-subscribing
  -- the same device (e.g. permission re-granted) updates in place rather
  -- than accumulating duplicate rows.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,

  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.push_subscriptions is
  'Web Push (VAPID) subscriptions for staff devices — company-scoped, one row per browser/device. Pruned automatically when a push send gets a 404/410 (see lib/push/sendPush.ts).';

create index if not exists push_subscriptions_company_id_idx on public.push_subscriptions(company_id) where deleted_at is null;
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id) where deleted_at is null;

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select using (company_id = public.current_company_id());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (company_id = public.current_company_id() and user_id = auth.uid());

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update using (company_id = public.current_company_id() and user_id = auth.uid());

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (company_id = public.current_company_id() and user_id = auth.uid());
