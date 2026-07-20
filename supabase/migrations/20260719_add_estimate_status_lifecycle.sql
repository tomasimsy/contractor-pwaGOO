-- Add estimate status lifecycle management
-- Prevents deletion of estimates with financial history
-- Replaces delete/remove with status-based workflow

-- Create enum for estimate statuses
CREATE TYPE public.estimate_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'approved',
  'converted_to_invoice',
  'project_in_progress',
  'completed',
  'archived',
  'cancelled'
);

-- Rename old status column to old_status for backwards compatibility
ALTER TABLE public.estimates RENAME COLUMN status TO old_status;

-- Add new status column with enum type
ALTER TABLE public.estimates ADD COLUMN status public.estimate_status DEFAULT 'draft';

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_company_status ON public.estimates(company_id, status);

-- RLS policy: allow viewing all non-deleted estimates regardless of status
-- (existing policies already handle company_id filtering)

-- Trigger: prevent hard deletion of estimates with financial history
CREATE OR REPLACE FUNCTION prevent_delete_estimates_with_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Check for related invoices
  IF EXISTS (SELECT 1 FROM invoices WHERE estimate_id = OLD.id AND is_deleted = false) THEN
    RAISE EXCEPTION 'Cannot delete estimate with related invoices. Archive instead.';
  END IF;

  -- Check for related expenses
  IF EXISTS (SELECT 1 FROM estimate_expenses WHERE estimate_id = OLD.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cannot delete estimate with related expenses. Archive instead.';
  END IF;

  -- Check for related subcontractor assignments
  IF EXISTS (SELECT 1 FROM estimate_subcontractors WHERE estimate_id = OLD.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cannot delete estimate with subcontractor assignments. Archive instead.';
  END IF;

  -- Check for related agent assignments
  IF EXISTS (SELECT 1 FROM estimate_agents WHERE estimate_id = OLD.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cannot delete estimate with agent assignments. Archive instead.';
  END IF;

  -- Check for related mileage
  IF EXISTS (SELECT 1 FROM mileage_trips WHERE estimate_id = OLD.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cannot delete estimate with mileage records. Archive instead.';
  END IF;

  -- Check for related change orders
  IF EXISTS (SELECT 1 FROM change_orders WHERE estimate_id = OLD.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cannot delete estimate with change orders. Archive instead.';
  END IF;

  -- Only allow deletion if estimate is empty draft with no history
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS prevent_delete_estimates_with_history_trigger ON public.estimates;
CREATE TRIGGER prevent_delete_estimates_with_history_trigger
BEFORE DELETE ON public.estimates
FOR EACH ROW
EXECUTE FUNCTION prevent_delete_estimates_with_history();

-- Backfill status for existing estimates based on their current state
UPDATE public.estimates
SET status = CASE
  -- If has invoices, mark as converted
  WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.estimate_id = estimates.id AND i.is_deleted = false)
    THEN 'converted_to_invoice'::estimate_status
  -- If signature exists and not completed, mark as approved
  WHEN signature IS NOT NULL AND is_completed = false
    THEN 'approved'::estimate_status
  -- If is_completed, mark as completed
  WHEN is_completed = true
    THEN 'completed'::estimate_status
  -- If is_deleted, mark as archived
  WHEN is_deleted = true
    THEN 'archived'::estimate_status
  -- Otherwise draft
  ELSE 'draft'::estimate_status
END
WHERE status = 'draft'; -- Only update if still in default state
