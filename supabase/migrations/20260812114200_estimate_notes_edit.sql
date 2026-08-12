-- =====================================================================
-- estimate_notes — add edit tracking. ADDITIVE ONLY.
--
-- Notes were add/delete-only at first; this adds the ability to edit
-- a note's text in place, recording when and by whom (never a second
-- copy of the note — one row, updated).
-- =====================================================================

alter table public.estimate_notes
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id);

comment on column public.estimate_notes.updated_at is
  'Set only when the note body has been edited after creation. Null means never edited.';

-- ---------------------------------------------------------------------
-- VERIFY — before AND after, these must be identical (additive-only):
--   select count(*) from public.estimate_notes;
-- ---------------------------------------------------------------------
