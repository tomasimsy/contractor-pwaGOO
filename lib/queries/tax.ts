/**
 * Tax Module Queries
 *
 * CRITICAL: All financial calculations come from lib/queries/financialCalculations.ts
 * This module is a VIEW LAYER only - it queries data and passes it to the unified
 * calculation engine. NO formulas are created here.
 *
 * The Tax module is PROOF that the refactored financial system works.
 */

import { supabase } from "@/lib/supabase/client";
import { calculateCompanyFinancials } from "@/lib/queries/financialCalculations";
import type { CompanyFinancials } from "@/lib/queries/financialCalculations";

export interface TaxSettings {
  id: string;
  company_id: string;
  entity_type: "sole_proprietorship" | "single_member_llc" | "multi_member_llc" | "partnership" | "s_corp" | "c_corp";
  tax_year: number;
  fiscal_year_start_month: number;
  fiscal_year_end_month: number;
  accounting_method: "cash" | "accrual";
  state: string | null;
  ein: string | null;
  business_name: string | null;
  agent_classification: "employee" | "independent_contractor";
  subcontractor_1099_threshold: number;
  collect_sales_tax: boolean;
  sales_tax_rate: number;
}

export interface TaxReadiness {
  score: number; // 0-100
  checks: {
    revenue_reconciled: boolean;
    expenses_categorized: boolean;
    payments_matched: boolean;
    contractors_reviewed: boolean;
  };
  warnings: {
    missing_receipts: number;
    uncategorized_expenses: number;
    missing_w9_info: number;
    duplicate_transactions: number;
  };
}

export interface TaxDashboardData {
  financials: CompanyFinancials;
  readiness: TaxReadiness;
  taxSettings: TaxSettings | null;
}

/**
 * Get or create tax settings for a company
 */
export async function getTaxSettings(companyId: string): Promise<TaxSettings | null> {
  const { data } = await supabase
    .from("company_tax_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  return data as TaxSettings | null;
}

/**
 * Update tax settings
 */
export async function updateTaxSettings(companyId: string, updates: Partial<TaxSettings>) {
  return supabase
    .from("company_tax_settings")
    .update(updates)
    .eq("company_id", companyId)
    .select()
    .single();
}

/**
 * Create initial tax settings for a company
 */
export async function createTaxSettings(companyId: string, settings: Partial<TaxSettings>) {
  return supabase
    .from("company_tax_settings")
    .insert([{ company_id: companyId, ...settings }])
    .select()
    .single();
}

/**
 * Calculate tax readiness score
 *
 * Checks:
 * - Revenue reconciled: all estimates have been reviewed
 * - Expenses categorized: all expenses have tax categories
 * - Payments matched: all payments are linked to invoices
 * - Contractors reviewed: all 1099-eligible contractors have W9 status
 */
export async function calculateTaxReadiness(companyId: string): Promise<TaxReadiness> {
  // Get tax settings
  const settings = await getTaxSettings(companyId);
  const taxYear = settings?.tax_year || new Date().getFullYear();

  // Get fiscal year bounds
  const startMonth = settings?.fiscal_year_start_month || 1;
  const endMonth = settings?.fiscal_year_end_month || 12;

  const startDate = new Date(taxYear, startMonth - 1, 1);
  const endDate = new Date(taxYear, endMonth, 0);

  // Check 1: Revenue reconciled
  const { count: estimateCount } = await supabase
    .from("estimates")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  const revenue_reconciled = (estimateCount || 0) > 0;

  // Check 2: Expenses categorized
  const { count: uncategorized } = await supabase
    .from("estimate_expenses")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("tax_category", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  const expenses_categorized = (uncategorized || 0) === 0;

  // Check 3: Payments matched
  const { count: unmatchedPayments } = await supabase
    .from("invoice_payments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("invoice_id", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  const payments_matched = (unmatchedPayments || 0) === 0;

  // Check 4: Contractors reviewed (W9 status)
  const { data: subs } = await supabase
    .from("subcontractor_tax_info")
    .select("w9_received")
    .eq("company_id", companyId)
    .eq("requires_1099", true);

  const contractors_reviewed = (subs?.filter(s => s.w9_received).length || 0) === (subs?.length || 0);

  // Warnings
  const { count: missingReceipts } = await supabase
    .from("estimate_expenses")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .not("id", "in", `(SELECT expense_id FROM public.expense_receipts WHERE company_id = '${companyId}')`);

  const { data: missingW9 } = await supabase
    .from("subcontractor_tax_info")
    .select("id")
    .eq("company_id", companyId)
    .eq("requires_1099", true)
    .eq("w9_received", false);

  // Calculate score: each check is worth 25%
  const checksCount = [revenue_reconciled, expenses_categorized, payments_matched, contractors_reviewed].filter(Boolean).length;
  const score = Math.round((checksCount / 4) * 100);

  return {
    score,
    checks: {
      revenue_reconciled,
      expenses_categorized,
      payments_matched,
      contractors_reviewed,
    },
    warnings: {
      missing_receipts: missingReceipts || 0,
      uncategorized_expenses: uncategorized || 0,
      missing_w9_info: missingW9?.length || 0,
      duplicate_transactions: 0, // Placeholder
    },
  };
}

/**
 * Get complete tax dashboard data
 * Uses unified financial calculation engine as single source of truth
 */
export async function getTaxDashboard(companyId: string, startDate: Date, endDate: Date): Promise<TaxDashboardData> {
  // Get financial data from unified calculation engine
  const financials = await calculateCompanyFinancials(companyId, startDate, endDate);

  // Get readiness score
  const readiness = await calculateTaxReadiness(companyId);

  // Get tax settings
  const taxSettings = await getTaxSettings(companyId);

  return {
    financials,
    readiness,
    taxSettings,
  };
}

/**
 * Get subcontractor 1099 summary.
 *
 * NOTE: this runs its own queries rather than calling
 * calculateSubcontractorFinancials() (financialCalculations.ts) — that
 * function computes a lifetime total, not one scoped to a tax year, so
 * it isn't a drop-in replacement for a year-by-year 1099 report. Kept
 * as an intentionally separate, tax-year-scoped calculation.
 */
export async function getSubcontractor1099Summary(companyId: string, taxYear: number) {
  // Exclusive upper bound (start of next year) rather than an inclusive
  // "Dec 31 23:59:59" cutoff — the latter is only correct if payment_date
  // is a timestamp compared in the same timezone snapshot it was built
  // in; a `date` column, or a server/DB timezone offset, can silently
  // shift that instant across the year boundary. `< nextYearStart` is
  // correct either way.
  const startDate = new Date(taxYear, 0, 1).toISOString();
  const endDate = new Date(taxYear + 1, 0, 1).toISOString();

  // Get all subcontractors for company
  const { data: subcontractors } = await supabase
    .from("subcontractors")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_deleted", false);

  if (!subcontractors) return [];

  // Get tax info for each
  const summaries = await Promise.all(
    subcontractors.map(async (sub) => {
      const { data: taxInfo } = await supabase
        .from("subcontractor_tax_info")
        .select("*")
        .eq("subcontractor_id", sub.id)
        .single();

      // All of this subcontractor's assignments, regardless of when the
      // assignment itself was created — a 1099 is about when they were
      // PAID, not when the assignment row was made. Date-scoping this
      // query used to drop any payment made this tax year against an
      // assignment created in an earlier year.
      const { data: assignments } = await supabase
        .from("estimate_subcontractors")
        .select("*")
        .eq("subcontractor_id", sub.id)
        .eq("company_id", companyId)
        .is("deleted_at", null);

      // Payments scoped by payment_date (when they were actually paid),
      // not created_at (when the row happened to be entered).
      const { data: payments } = await supabase
        .from("subcontractor_payments")
        .select("amount")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("payment_date", startDate)
        .lt("payment_date", endDate)
        .in("estimate_subcontractor_id", assignments?.map(a => a.id) || []);

      const totalPaid = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const settings = await getTaxSettings(companyId);
      const requires1099 = totalPaid >= (settings?.subcontractor_1099_threshold || 600);

      return {
        subcontractor_id: sub.id,
        name: sub.name,
        total_paid: totalPaid,
        w9_received: taxInfo?.w9_received || false,
        requires_1099: requires1099,
        assignment_count: assignments?.length || 0,
      };
    })
  );

  return summaries.filter(s => s.total_paid > 0);
}

/**
 * Get agent compensation summary for tax year.
 *
 * NOTE: intentionally tax-year-scoped and separate from
 * calculateAgentFinancials() (financialCalculations.ts), which computes
 * a lifetime total — see the note on getSubcontractor1099Summary above.
 */
export async function getAgentCompensationSummary(companyId: string, taxYear: number) {
  // See the note in getSubcontractor1099Summary above on why this is an
  // exclusive upper bound rather than an inclusive "Dec 31 23:59:59" one.
  const startDate = new Date(taxYear, 0, 1).toISOString();
  const endDate = new Date(taxYear + 1, 0, 1).toISOString();

  // Get all agents for company
  const { data: agents } = await supabase
    .from("agents")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_deleted", false);

  if (!agents) return [];

  const summaries = await Promise.all(
    agents.map(async (agent) => {
      // Commissions scoped by payment_date (when actually paid) —
      // matches the date field calculateCompanyFinancials uses for this
      // same table, so this report and the dashboards can't attribute
      // the same payment to different tax years.
      const { data: commissions } = await supabase
        .from("agent_payments")
        .select("amount")
        .eq("agent_id", agent.id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("payment_date", startDate)
        .lt("payment_date", endDate);

      // Reimbursements scoped by expense_date (when the cost was
      // incurred), not created_at (when the row was entered).
      const { data: reimbursements } = await supabase
        .from("estimate_expenses")
        .select("amount")
        .eq("agent_id", agent.id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("expense_date", startDate)
        .lt("expense_date", endDate);

      const totalCommissions = commissions?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
      const totalReimbursements = reimbursements?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

      return {
        agent_id: agent.id,
        name: agent.name,
        total_commissions: totalCommissions,
        total_reimbursements: totalReimbursements,
        total_compensation: totalCommissions + totalReimbursements,
      };
    })
  );

  return summaries.filter(s => s.total_compensation > 0);
}

/**
 * Run tax audit to find inconsistencies
 * Returns all data quality issues that should be fixed before tax filing
 */
export async function runTaxAudit(companyId: string, taxYear: number): Promise<Array<{type: string; severity: "info" | "warning" | "error"; count: number; message: string}>> {
  const startDate = new Date(taxYear, 0, 1);
  const endDate = new Date(taxYear, 11, 31);
  const issues: Array<{type: string; severity: "info" | "warning" | "error"; count: number; message: string}> = [];

  // 1. Find expenses without tax categories
  const { data: uncategorized } = await supabase
    .from("estimate_expenses")
    .select("id, amount, estimate_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("tax_category", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  if (uncategorized && uncategorized.length > 0) {
    issues.push({
      type: "missing_tax_category",
      severity: "warning" as const,
      count: uncategorized.length,
      message: `${uncategorized.length} expenses are missing tax categories`,
    });
  }

  // 2. Find expenses without receipts
  const { count: missingReceipts } = await supabase
    .from("estimate_expenses")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .not("id", "in", `(SELECT expense_id FROM public.expense_receipts WHERE company_id = '${companyId}')`);

  if ((missingReceipts || 0) > 0) {
    issues.push({
      type: "missing_receipt",
      severity: "warning" as const,
      count: missingReceipts || 0,
      message: `${missingReceipts || 0} expenses are missing receipts`,
    });
  }

  // 3. Find 1099-eligible contractors without W9
  const { data: subContractors } = await supabase
    .from("subcontractor_tax_info")
    .select("id, subcontractor_id")
    .eq("company_id", companyId)
    .eq("requires_1099", true)
    .eq("w9_received", false);

  if (subContractors && subContractors.length > 0) {
    issues.push({
      type: "missing_w9",
      severity: "error" as const,
      count: subContractors.length,
      message: `${subContractors.length} contractors require W9 forms but haven't been received`,
    });
  }

  // 4. Find payments without matching invoices
  const { count: unmatchedPayments } = await supabase
    .from("invoice_payments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("invoice_id", null)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  if ((unmatchedPayments || 0) > 0) {
    issues.push({
      type: "unmatched_payment",
      severity: "warning" as const,
      count: unmatchedPayments || 0,
      message: `${unmatchedPayments || 0} payments are not linked to invoices`,
    });
  }

  return issues;
}
