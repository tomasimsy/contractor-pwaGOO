-- =====================================================================
-- Roof Area "repair item" fields (Estimate Roof V2 enhancement).
--
-- Adds a second, simpler per-area cost model alongside the existing
-- estimate_area_line_items table: a defect-driven repair line with its
-- own quantity/unit, descriptive fields, and a material/labor/tax
-- breakdown that rolls up into `estimated_repair_cost`. This is
-- additive only — existing areas and their line items are completely
-- unaffected; `estimated_repair_cost` defaults to 0 so pre-existing
-- rows contribute nothing extra to the estimate subtotal until a user
-- fills in these new fields.
--
-- No new "Title" column: the existing `area_name` column already is
-- the area's title (see 20260802000100_roofing_estimate_support.sql) —
-- reusing it instead of adding a duplicate column.
--
-- `quantity_unit` intentionally has its OWN check constraint, separate
-- from estimate_area_line_items.unit / estimate_items.unit (EA, SF,
-- SQFT, SQ, LF, FT, HR, DAY, LS) — the requested unit list for this
-- field (EA, SF, LF, SQ, Bundle, Sheet, Roll, Piece, Hour, Day, Other)
-- is a different set, so reusing the line-item CHECK constraint would
-- either reject valid values here or admit invalid ones there.
-- =====================================================================

alter table if exists public.estimate_areas
add column if not exists quantity numeric not null default 1,
add column if not exists quantity_unit text
  check (quantity_unit is null or quantity_unit in ('EA','SF','LF','SQ','Bundle','Sheet','Roll','Piece','Hour','Day','Other')),
add column if not exists defect text,
add column if not exists location text,
add column if not exists corrective_action text,
add column if not exists materials_included text,
add column if not exists material_cost numeric not null default 0,
add column if not exists labor_cost numeric not null default 0,
add column if not exists tax numeric not null default 0,
add column if not exists estimated_repair_cost numeric not null default 0;

comment on column public.estimate_areas.quantity is 'Repair item quantity (Estimate Roof V2).';
comment on column public.estimate_areas.quantity_unit is 'Unit for quantity: EA, SF, LF, SQ, Bundle, Sheet, Roll, Piece, Hour, Day, Other.';
comment on column public.estimate_areas.defect is 'Defect description (multi-line).';
comment on column public.estimate_areas.location is 'Where on the roof/property this defect is located.';
comment on column public.estimate_areas.corrective_action is 'Planned corrective action (multi-line).';
comment on column public.estimate_areas.materials_included is 'Materials included in the repair (multi-line).';
comment on column public.estimate_areas.material_cost is 'Material cost for this repair item.';
comment on column public.estimate_areas.labor_cost is 'Labor cost for this repair item.';
comment on column public.estimate_areas.tax is 'Tax amount for this repair item.';
comment on column public.estimate_areas.estimated_repair_cost is 'Auto-calculated: material_cost + labor_cost + tax. Always written by RoofingAreaService, never caller-supplied directly — see calculateAreaRepairCost() in lib/services/financialCalculations.ts.';
