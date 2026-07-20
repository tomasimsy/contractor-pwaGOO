/**
 * UNIFIED FINANCIAL CALCULATION ENGINE
 *
 * Single source of truth for ALL financial calculations in the application.
 * Every page, report, dashboard, card, and export uses functions from this module.
 *
 * CRITICAL: Do not add calculation logic anywhere else in the codebase.
 * All financial math must go through these functions.
 *
 * This ensures:
 * - Numbers are identical across all pages
 * - Deleted data is handled consistently everywhere
 * - Bug fixes apply automatically to all features
 * - Tax calculations have a solid foundation
 */

import { supabase } from "@/lib/supabase/client";
import type { ProjectBundle } from "@/lib/types";

/**
 * Complete financial data for a single project/estimate
 * Used by: Expense page, invoice detail, estimate detail, all PDFs, reports
 */
export interface ProjectFinancials {
  // Revenue
  originalEstimateTotal: number;
  approvedChangeOrderTotal: number;
  changeOrderTax: number;
  revisedTotal: number;

  // Expenses (by type)
  subcontractorCosts: number;
  agentCosts: number;
  expenseItems: number;
  mileageCosts: number;
  totalExpenses: number;

  // Profit
  grossProfit: number;
  netProfit: number;
  profitMargin: number;

  // Invoicing
  invoicesTotal: number;
  amountPaid: number;
  remainingBalance: number;

  // Outstanding (what's still owed to vendors)
  outstandingSubcontractor: number;
  outstandingAgent: number;
  outstandingTotal: number;

  // Status
  paymentStatus: "unpaid" | "partial" | "paid" | "overpaid";
  isFullyPaid: boolean;
  isOverdue: boolean;
}

/**
 * Company-wide financial data for a date range
 * Used by: Dashboard, statement, accounting page, reports
 */
export interface CompanyFinancials {
  // Revenue
  totalRevenue: number;
  completedProjects: number;
  convertedProjects: number;

  // Expenses (by type)
  subcontractorPaid: number;
  agentPaid: number;
  expenseItems: number;
  mileageCosts: number;
  totalExpenses: number;

  // Profit
  netProfit: number;
  profitMargin: number;

  // Invoicing
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;

  // Outstanding (payables)
  outstandingSubcontractor: number;
  outstandingAgent: number;
  outstandingTotal: number;

  // Pending
  pendingInvoices: number;
}

/**
 * Agent-specific financial data
 * Used by: Agent reports, commission tracking, payables
 */
export interface AgentFinancials {
  totalCommissions: number;
  totalReimbursements: number;
  totalPaid: number;
  outstandingPayable: number;
  ytdEarnings: number;
  projectCount: number;
}

/**
 * Subcontractor-specific financial data
 * Used by: Subcontractor reports, 1099 tracking, payables
 */
export interface SubcontractorFinancials {
  totalPaid: number;
  outstandingPayable: number;
  projectCount: number;
  w9Status: "pending" | "received" | "not_required";
  needs1099: boolean;
}

/**
 * Client-specific financial data
 * Used by: Client reports, receivables tracking
 */
export interface ClientFinancials {
  totalEstimated: number;
  totalInvoiced: number;
  totalPaid: number;
  outstandingReceivable: number;
  projectCount: number;
  avgProjectValue: number;
}

// ============================================================================
// CORE CALCULATION FUNCTIONS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Calculate all financials for a single project/estimate
 *
 * SINGLE SOURCE OF TRUTH for project financial calculations.
 * Called by: Expense page, invoice detail, estimate detail, reports, PDFs
 *
 * @param bundle - Complete project data from getProjectBundle()
 * @returns Complete financial breakdown for the project
 */
export function calculateProjectFinancials(bundle: ProjectBundle): ProjectFinancials {
  // ========== REVENUE ==========
  const originalEstimateTotal = bundle.estimateItems
    .reduce((sum, item) => sum + (item.total || 0), 0);

  const approvedChangeOrders = bundle.changeOrders.filter(
    (co) => co.status === "approved"
  );

  const approvedChangeOrderTotal = approvedChangeOrders.reduce(
    (sum, co) => sum + (co.total_amount || 0),
    0
  );

  const changeOrderTax = approvedChangeOrders.reduce(
    (sum, co) => sum + (co.tax || 0),
    0
  );

  const revisedTotal = originalEstimateTotal + approvedChangeOrderTotal;

  // ========== EXPENSES ==========
  // Subcontractor costs: max(assigned, paid) per assignment
  const subcontractorAssignmentMap = new Map<string, number>();
  const subcontractorPaymentMap = new Map<string, number>();

  bundle.assignedSubcontractors.forEach((sub) => {
    subcontractorAssignmentMap.set(
      sub.estimateSubcontractorId,
      sub.contractedAmount || 0
    );
  });

  bundle.subcontractorPayments.forEach((payment) => {
    const estSubId = payment.estimate_subcontractor_id;
    if (estSubId) {
      subcontractorPaymentMap.set(
        estSubId,
        (subcontractorPaymentMap.get(estSubId) || 0) + (payment.amount || 0)
      );
    }
  });

  const subcontractorCosts = Array.from(subcontractorAssignmentMap.entries())
    .reduce((sum, [subId, assigned]) => {
      const paid = subcontractorPaymentMap.get(subId) || 0;
      return sum + Math.max(assigned, paid);
    }, 0);

  const outstandingSubcontractor = Array.from(
    subcontractorAssignmentMap.entries()
  ).reduce((sum, [subId, assigned]) => {
    const paid = subcontractorPaymentMap.get(subId) || 0;
    return sum + (assigned - paid);
  }, 0);

  // Agent costs: max(assigned, paid) per assignment
  const agentAssignmentMap = new Map<string, number>();
  const agentPaymentMap = new Map<string, number>();

  bundle.assignedAgents.forEach((agent) => {
    agentAssignmentMap.set(agent.estimateAgentId, agent.assignedAmount || 0);
  });

  bundle.agentPayments.forEach((payment) => {
    const estAgentId = payment.estimate_agent_id;
    if (estAgentId) {
      agentPaymentMap.set(
        estAgentId,
        (agentPaymentMap.get(estAgentId) || 0) + (payment.amount || 0)
      );
    }
  });

  const agentCosts = Array.from(agentAssignmentMap.entries())
    .reduce((sum, [agentId, assigned]) => {
      const paid = agentPaymentMap.get(agentId) || 0;
      return sum + Math.max(assigned, paid);
    }, 0);

  const outstandingAgent = Array.from(agentAssignmentMap.entries()).reduce(
    (sum, [agentId, assigned]) => {
      const paid = agentPaymentMap.get(agentId) || 0;
      return sum + (assigned - paid);
    },
    0
  );

  // Expense items (materials, labor, other)
  const expenseItems = bundle.expenses.reduce(
    (sum, expense) => sum + (expense.amount || 0),
    0
  );

  // Mileage reimbursements
  const mileageCosts = bundle.mileageTrips.reduce(
    (sum, trip) => sum + (trip.reimbursement || 0),
    0
  );

  const totalExpenses =
    subcontractorCosts + agentCosts + expenseItems + mileageCosts;

  // ========== PROFIT ==========
  const grossProfit = revisedTotal - (subcontractorCosts + agentCosts);
  const netProfit = revisedTotal - totalExpenses;
  const profitMargin = revisedTotal > 0 ? (netProfit / revisedTotal) * 100 : 0;

  // ========== INVOICING ==========
  const invoicesTotal = bundle.invoices.reduce(
    (sum, inv) => sum + (inv.total || 0),
    0
  );

  const amountPaid = bundle.invoices.reduce(
    (sum, inv) => sum + (inv.amount_paid || 0),
    0
  );

  const remainingBalance = invoicesTotal - amountPaid;

  // ========== PAYMENT STATUS ==========
  const paymentStatus = derivePaymentStatus(invoicesTotal, amountPaid);
  const isFullyPaid = amountPaid >= invoicesTotal && invoicesTotal > 0;
  const isOverdue = false; // TODO: Wire to actual due_date tracking if available

  // ========== COMPILE RESULTS ==========
  return {
    originalEstimateTotal,
    approvedChangeOrderTotal,
    changeOrderTax,
    revisedTotal,
    subcontractorCosts,
    agentCosts,
    expenseItems,
    mileageCosts,
    totalExpenses,
    grossProfit,
    netProfit,
    profitMargin,
    invoicesTotal,
    amountPaid,
    remainingBalance,
    outstandingSubcontractor,
    outstandingAgent,
    outstandingTotal: outstandingSubcontractor + outstandingAgent,
    paymentStatus,
    isFullyPaid,
    isOverdue: isOverdue || false,
  };
}

/**
 * Derive payment status from totals
 * SINGLE SOURCE OF TRUTH for payment status determination
 * Called by: derivePaymentStatus() callers throughout the app
 */
export function derivePaymentStatus(
  totalAmount: number,
  amountPaid: number
): "unpaid" | "partial" | "paid" | "overpaid" {
  if (amountPaid >= totalAmount && totalAmount > 0) {
    return "paid";
  }
  if (amountPaid > 0) {
    return "partial";
  }
  return "unpaid";
}

/**
 * Calculate company-wide financials for a time period
 * SINGLE SOURCE OF TRUTH for company financial calculations
 * Called by: Dashboard, statement, accounting page, reports
 */
export async function calculateCompanyFinancials(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<CompanyFinancials> {
  const startDateStr = startDate.toISOString();
  const endDateStr = endDate.toISOString();

  // Fetch estimates first to get the date range
  const estimatesRes = await supabase
    .from("estimates")
    .select("id, total, status, created_at")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .in("status", ["completed", "converted"])
    .gte("created_at", startDateStr)
    .lte("created_at", endDateStr);

  const estimates = estimatesRes.data || [];
  const estimateIds = estimates.map((e) => e.id);

  // Fetch all data in parallel, filtering by estimate IDs for assignments
  const [
    subPaymentsRes,
    estSubsRes,
    agentPaymentsRes,
    estAgentsRes,
    expensesRes,
    mileageRes,
    invoicesRes,
  ] = await Promise.all([
    supabase
      .from("subcontractor_payments")
      .select("amount, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("created_at", startDateStr)
      .lte("created_at", endDateStr),

    // CRITICAL FIX: Only fetch assignments for estimates in the date range
    estimateIds.length > 0
      ? supabase
          .from("estimate_subcontractors")
          .select("id, amount")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("estimate_id", estimateIds)
      : Promise.resolve({ data: [] }),

    supabase
      .from("agent_payments")
      .select("amount, payment_date")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("payment_date", startDateStr)
      .lte("payment_date", endDateStr),

    // CRITICAL FIX: Only fetch assignments for estimates in the date range
    estimateIds.length > 0
      ? supabase
          .from("estimate_agents")
          .select("id, amount")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("estimate_id", estimateIds)
      : Promise.resolve({ data: [] }),

    supabase
      .from("estimate_expenses")
      .select("amount")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("expense_date", startDateStr)
      .lte("expense_date", endDateStr),

    supabase
      .from("mileage_trips")
      .select("reimbursement")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("trip_date", startDateStr)
      .lte("trip_date", endDateStr),

    supabase
      .from("invoices")
      .select("total, amount_paid, status")
      .eq("company_id", companyId)
      .eq("is_deleted", false),
  ]);

  // Extract data
  const subPayments = subPaymentsRes.data || [];
  const estSubs = estSubsRes.data || [];
  const agentPayments = agentPaymentsRes.data || [];
  const estAgents = estAgentsRes.data || [];
  const expenses = expensesRes.data || [];
  const mileage = mileageRes.data || [];
  const invoices = invoicesRes.data || [];

  // Calculate totals
  const totalRevenue = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
  const completedProjects = estimates.filter(
    (e) => e.status === "completed"
  ).length;
  const convertedProjects = estimates.filter(
    (e) => e.status === "converted"
  ).length;

  const subcontractorPaid = subPayments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );

  // CRITICAL: Use committed costs (max of assigned vs paid) to match project-level logic
  const subcontractorAssigned = estSubs.reduce(
    (sum, s) => sum + (s.amount || 0),
    0
  );
  const subcontractorCommitted = Math.max(subcontractorAssigned, subcontractorPaid);
  const outstandingSubcontractor = Math.max(
    0,
    subcontractorAssigned - subcontractorPaid
  );

  const agentPaid = agentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const agentAssigned = estAgents.reduce((sum, a) => sum + (a.amount || 0), 0);
  const agentCommitted = Math.max(agentAssigned, agentPaid);
  const outstandingAgent = Math.max(0, agentAssigned - agentPaid);

  const expenseItems = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const mileageCosts = mileage.reduce((sum, m) => sum + (m.reimbursement || 0), 0);

  // Use committed costs, not just paid - CRITICAL for consistency with project-level calculations
  const totalExpenses =
    expenseItems + mileageCosts + subcontractorCommitted + agentCommitted;

  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
  const totalPaid = invoices.reduce(
    (sum, i) => sum + (i.amount_paid || 0),
    0
  );
  const totalOutstanding = totalInvoiced - totalPaid;
  const pendingInvoices = invoices.filter(
    (i) => i.status === "pending" || i.status === "partial"
  ).length;

  return {
    totalRevenue,
    completedProjects,
    convertedProjects,
    subcontractorPaid,
    agentPaid,
    expenseItems,
    mileageCosts,
    totalExpenses,
    netProfit,
    profitMargin,
    totalInvoiced,
    totalPaid,
    totalOutstanding,
    outstandingSubcontractor,
    outstandingAgent,
    outstandingTotal: outstandingSubcontractor + outstandingAgent,
    pendingInvoices,
  };
}

/**
 * Calculate financials for a specific agent
 * SINGLE SOURCE OF TRUTH for agent financial calculations
 * Called by: Agent reports, commission tracking, payables
 */
export async function calculateAgentFinancials(
  agentId: string,
  companyId: string
): Promise<AgentFinancials> {
  const [commissionsRes, reimbursementsRes, paymentsRes] = await Promise.all(
    [
      // Total commissions assigned
      supabase
        .from("estimate_agents")
        .select("amount")
        .eq("agent_id", agentId)
        .eq("company_id", companyId)
        .is("deleted_at", null),

      // Reimbursements
      supabase
        .from("agent_payments")
        .select("amount")
        .eq("agent_id", agentId)
        .eq("company_id", companyId)
        .eq("payment_type", "reimbursement")
        .is("deleted_at", null),

      // Paid commissions
      supabase
        .from("agent_payments")
        .select("amount, payment_date")
        .eq("agent_id", agentId)
        .eq("company_id", companyId)
        .eq("payment_type", "commission")
        .is("deleted_at", null),
    ]
  );

  const commissions = commissionsRes.data || [];
  const reimbursements = reimbursementsRes.data || [];
  const payments = paymentsRes.data || [];

  const totalCommissions = commissions.reduce(
    (sum, c) => sum + (c.amount || 0),
    0
  );
  const totalReimbursements = reimbursements.reduce(
    (sum, r) => sum + (r.amount || 0),
    0
  );
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const outstandingPayable = totalCommissions - totalPaid;

  // YTD earnings (current year)
  const currentYear = new Date().getFullYear();
  const ytdStart = new Date(currentYear, 0, 1).toISOString();
  const ytdEarnings = payments
    .filter((p) => p.payment_date >= ytdStart)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return {
    totalCommissions,
    totalReimbursements,
    totalPaid,
    outstandingPayable,
    ytdEarnings,
    projectCount: commissions.length,
  };
}

/**
 * Calculate financials for a specific subcontractor
 * SINGLE SOURCE OF TRUTH for subcontractor financial calculations
 * Called by: Subcontractor reports, 1099 tracking, payables
 */
export async function calculateSubcontractorFinancials(
  subcontractorId: string,
  companyId: string
): Promise<SubcontractorFinancials> {
  const [assignmentsRes, paymentsRes] = await Promise.all([
    supabase
      .from("estimate_subcontractors")
      .select("amount")
      .eq("subcontractor_id", subcontractorId)
      .eq("company_id", companyId)
      .is("deleted_at", null),

    supabase
      .from("subcontractor_payments")
      .select("amount")
      .eq("subcontractor_id", subcontractorId)
      .eq("company_id", companyId)
      .is("deleted_at", null),
  ]);

  const assignments = assignmentsRes.data || [];
  const payments = paymentsRes.data || [];

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalAssigned = assignments.reduce(
    (sum, a) => sum + (a.amount || 0),
    0
  );
  const outstandingPayable = totalAssigned - totalPaid;

  return {
    totalPaid,
    outstandingPayable,
    projectCount: assignments.length,
    w9Status: "pending", // TODO: Wire to actual W9 tracking
    needs1099: totalPaid > 600, // IRS threshold
  };
}

/**
 * Calculate financials for a specific client
 * SINGLE SOURCE OF TRUTH for client financial calculations
 * Called by: Client reports, receivables tracking
 */
export async function calculateClientFinancials(
  clientId: string,
  companyId: string
): Promise<ClientFinancials> {
  const [estimatesRes, invoicesRes] = await Promise.all([
    supabase
      .from("estimates")
      .select("total")
      .eq("client_id", clientId)
      .eq("company_id", companyId)
      .eq("is_deleted", false),

    supabase
      .from("invoices")
      .select("total, amount_paid")
      .eq("client_id", clientId)
      .eq("company_id", companyId)
      .eq("is_deleted", false),
  ]);

  const estimates = estimatesRes.data || [];
  const invoices = invoicesRes.data || [];

  const totalEstimated = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
  const totalPaid = invoices.reduce(
    (sum, i) => sum + (i.amount_paid || 0),
    0
  );
  const outstandingReceivable = totalInvoiced - totalPaid;

  return {
    totalEstimated,
    totalInvoiced,
    totalPaid,
    outstandingReceivable,
    projectCount: estimates.length,
    avgProjectValue:
      estimates.length > 0 ? totalEstimated / estimates.length : 0,
  };
}
