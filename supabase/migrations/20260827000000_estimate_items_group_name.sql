-- Lets the estimate line-item editor group items into named "projects"
-- (e.g. "Roof Repair", "Gutter Replacement") for display only — a
-- project's total is always calculateSubtotal() over its own items,
-- never a separately stored number, so there is nothing here for that
-- total to drift from.
--
-- Nullable and additive: every existing estimate_items row has no
-- value here and needs none — null means "ungrouped", rendered flat
-- exactly as it always has been. No backfill, no rewrite of existing
-- estimates.
alter table if exists public.estimate_items
add column if not exists group_name text;

comment on column public.estimate_items.group_name is
  'Optional project/section label for grouping line items in the estimate form and PDF. Null = ungrouped (flat), the behavior every estimate had before this column existed.';
