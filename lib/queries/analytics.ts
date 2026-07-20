import { supabase } from "@/lib/supabase/client";
import { calculateCompanyFinancials, calculateProjectFinancials } from "@/lib/queries/financialCalculations";
import { getProjectBundle } from "@/lib/queries/projects";

/**
 * UNIFIED ANALYTICS SYSTEM
 * All calculations derive from the shared financial calculation engine.
 * NO duplicate formulas. Single source of truth.
 */

export interface CompanyFinancialAnalytics {
  totalRevenue: number;
  paymentsReceived: number;
  accountsReceivable: number;
  totalExpenses: number;
  subcontractorCosts: number;
  agentCosts: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;

  completedProjects: number;
  convertedProjects: number;
  draftProjects: number;

  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
}

export interface ProjectAnalytics {
  estimateId: string;
  estimateNumber: string | null;
  title: string | null;
  clientId: string | null;
  clientName: string | null;
  status: string | null;

  contractAmount: number;
  approvedChangeOrders: number;
  revisedTotal: number;
  amountCollected: number;
  remainingBalance: number;

  expenses: number;
  subcontractorCosts: number;
  agentCosts: number;
  mileageCosts: number;
  totalCosts: number;

  profit: number;
  profitMargin: number;
}

export interface ClientAnalytics {
  clientId: string;
  clientName: string;
  projectCount: number;
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
  totalExpenses: number;
  totalProfit: number;
  profitMargin: number;
}

/**
 * Get comprehensive company-level financial analytics.
 * Uses unified calculation engine for all numbers.
 */
export async function getCompanyAnalytics(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<CompanyFinancialAnalytics> {
  const financials = await calculateCompanyFinancials(companyId, startDate, endDate);

  // Get invoice counts
  const [invoicesRes, paidRes, overdueRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_deleted", false),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_deleted", false)
      .eq("status", "paid"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_deleted", false)
      .lt("due_date", new Date().toISOString().split("T")[0])
      .neq("status", "paid"),
  ]);

  const totalInvoices = invoicesRes.count || 0;
  const paidInvoices = paidRes.count || 0;
  const pendingInvoices = (invoicesRes.count || 0) - (paidRes.count || 0);
  const overdueInvoices = overdueRes.count || 0;

  return {
    totalRevenue: financials.totalRevenue,
    paymentsReceived: financials.totalRevenue - financials.totalOutstanding,
    accountsReceivable: financials.totalOutstanding,
    totalExpenses: financials.totalExpenses,
    subcontractorCosts: financials.subcontractorPaid,
    agentCosts: financials.agentPaid,
    grossProfit: financials.netProfit,
    netProfit: financials.netProfit,
    profitMargin: financials.profitMargin,
    completedProjects: financials.completedProjects,
    convertedProjects: financials.convertedProjects,
    draftProjects: 0,
    totalInvoices,
    paidInvoices,
    pendingInvoices,
    overdueInvoices,
  };
}

/**
 * Get per-project profitability analytics for all projects.
 * Uses unified calculation engine for all numbers.
 */
export async function getProjectAnalytics(companyId: string): Promise<ProjectAnalytics[]> {
  // Get all signed estimates for the company
  const { data: estimates } = await supabase
    .from("estimates")
    .select("id, estimate_number, title, client_id, total, status")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .not("signature", "is", null);

  if (!estimates || estimates.length === 0) return [];

  // Get client names
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("company_id", companyId);

  const clientById = new Map(clients?.map(c => [c.id, c.name]) || []);

  // Calculate financials for each project
  const projects: ProjectAnalytics[] = [];
  for (const est of estimates) {
    try {
      const bundle = await getProjectBundle(est.id);
      const projectFinancials = calculateProjectFinancials(bundle);

      projects.push({
        estimateId: est.id,
        estimateNumber: est.estimate_number,
        title: est.title,
        clientId: est.client_id,
        clientName: est.client_id ? clientById.get(est.client_id) || null : null,
        status: est.status,

        contractAmount: projectFinancials.originalEstimateTotal,
        approvedChangeOrders: projectFinancials.approvedChangeOrderTotal,
        revisedTotal: projectFinancials.revisedTotal,
        amountCollected: projectFinancials.amountPaid,
        remainingBalance: projectFinancials.remainingBalance,

        expenses: projectFinancials.expenseItems,
        subcontractorCosts: projectFinancials.subcontractorCosts,
        agentCosts: projectFinancials.agentCosts,
        mileageCosts: projectFinancials.mileageCosts,
        totalCosts: projectFinancials.totalExpenses,

        profit: projectFinancials.netProfit,
        profitMargin: projectFinancials.profitMargin,
      });
    } catch (err) {
      console.error(`Failed to calculate financials for estimate ${est.id}:`, err);
      continue;
    }
  }

  return projects.sort((a, b) => b.profit - a.profit);
}

/**
 * Get client-level financial analytics.
 * Aggregates project-level data from unified calculation engine.
 */
export async function getClientAnalytics(companyId: string): Promise<ClientAnalytics[]> {
  const projects = await getProjectAnalytics(companyId);

  // Group by client
  const clientMap = new Map<string, ProjectAnalytics[]>();
  for (const proj of projects) {
    const key = proj.clientId || "unknown";
    if (!clientMap.has(key)) {
      clientMap.set(key, []);
    }
    clientMap.get(key)!.push(proj);
  }

  // Aggregate metrics
  const analytics: ClientAnalytics[] = Array.from(clientMap.entries()).map(([clientId, clientProjects]) => {
    const clientName = clientProjects[0]?.clientName || "Unknown";
    const totalRevenue = clientProjects.reduce((sum, p) => sum + p.revisedTotal, 0);
    const totalCollected = clientProjects.reduce((sum, p) => sum + p.amountCollected, 0);
    const totalOutstanding = clientProjects.reduce((sum, p) => sum + p.remainingBalance, 0);
    const totalExpenses = clientProjects.reduce((sum, p) => sum + p.totalCosts, 0);
    const totalProfit = clientProjects.reduce((sum, p) => sum + p.profit, 0);
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      clientId,
      clientName,
      projectCount: clientProjects.length,
      totalRevenue,
      totalCollected,
      totalOutstanding,
      totalExpenses,
      totalProfit,
      profitMargin,
    };
  });

  return analytics.sort((a, b) => b.totalProfit - a.totalProfit);
}
