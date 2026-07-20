-- Tax Configuration Tables
-- Stores tax settings and tracking for compliance

-- Create enum for entity types
CREATE TYPE public.entity_type AS ENUM (
  'sole_proprietorship',
  'single_member_llc',
  'multi_member_llc',
  'partnership',
  's_corp',
  'c_corp'
);

-- Create enum for accounting methods
CREATE TYPE public.accounting_method AS ENUM (
  'cash',
  'accrual'
);

-- Create enum for agent classification
CREATE TYPE public.agent_classification AS ENUM (
  'employee',
  'independent_contractor'
);

-- Create enum for tax categories
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

-- Tax configuration table
CREATE TABLE IF NOT EXISTS public.company_tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Entity structure
  entity_type public.entity_type NOT NULL DEFAULT 'sole_proprietorship',
  tax_year INTEGER NOT NULL,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  fiscal_year_end_month INTEGER NOT NULL DEFAULT 12,
  accounting_method public.accounting_method NOT NULL DEFAULT 'cash',

  -- Location
  state VARCHAR(2),

  -- Tax identification
  ein VARCHAR(20),
  business_name VARCHAR(255),

  -- Agent settings
  agent_classification public.agent_classification NOT NULL DEFAULT 'independent_contractor',

  -- Subcontractor 1099 tracking
  subcontractor_1099_threshold DECIMAL(10, 2) NOT NULL DEFAULT 600,

  -- Sales tax
  collect_sales_tax BOOLEAN DEFAULT false,
  sales_tax_rate DECIMAL(5, 4) DEFAULT 0,

  -- Audit trail
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Expense tax category assignments
ALTER TABLE public.estimate_expenses ADD COLUMN IF NOT EXISTS tax_category public.tax_category;

-- Subcontractor W9 tracking
CREATE TABLE IF NOT EXISTS public.subcontractor_tax_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- W9 Information
  w9_received BOOLEAN DEFAULT false,
  w9_received_date DATE,
  w9_legal_name VARCHAR(255),
  w9_ein VARCHAR(20),

  -- 1099 Tracking
  requires_1099 BOOLEAN DEFAULT false,
  last_1099_filed_year INTEGER,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Agent tax tracking (supplements existing agent_payments)
CREATE TABLE IF NOT EXISTS public.agent_tax_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- W4 Information
  classification public.agent_classification NOT NULL,
  tax_withholding_percentage DECIMAL(5, 2) DEFAULT 0,

  -- Annual tracking
  ytd_commissions DECIMAL(12, 2) DEFAULT 0,
  ytd_reimbursements DECIMAL(12, 2) DEFAULT 0,
  ytd_tax_withheld DECIMAL(12, 2) DEFAULT 0,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Tax receipt tracking
CREATE TABLE IF NOT EXISTS public.expense_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.estimate_expenses(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Receipt information
  receipt_file_url TEXT,
  receipt_date DATE,
  receipt_amount DECIMAL(12, 2),
  receipt_vendor VARCHAR(255),

  -- Audit
  uploaded_at TIMESTAMP DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Tax audit log for tracking reconciliation
CREATE TABLE IF NOT EXISTS public.tax_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Audit details
  audit_type VARCHAR(100), -- 'missing_receipt', 'duplicate_transaction', etc
  severity VARCHAR(20), -- 'info', 'warning', 'error'
  entity_type VARCHAR(50), -- 'expense', 'invoice', 'payment', etc
  entity_id UUID,
  message TEXT,

  -- Status
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMP DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.company_tax_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tax settings for their company" ON public.company_tax_settings
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update tax settings for their company" ON public.company_tax_settings
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.subcontractor_tax_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view subcontractor tax info for their company" ON public.subcontractor_tax_info
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.agent_tax_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view agent tax info for their company" ON public.agent_tax_info
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view expense receipts for their company" ON public.expense_receipts
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.tax_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tax audit logs for their company" ON public.tax_audit_log
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_tax_settings_company_id ON public.company_tax_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_tax_info_company_id ON public.subcontractor_tax_info(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_tax_info_company_id ON public.agent_tax_info(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_company_id ON public.expense_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_audit_log_company_id ON public.tax_audit_log(company_id);
