import { supabase } from "@/lib/supabase/client";

export interface ProjectProfitability {
  estimateId: string;
  estimateNumber: string | null;
  projectTitle: string | null;
  clientId: string | null;
  clientName: string | null;
  revenue: number;
  expenses: number;
  profit: number;
  marginPercent: number;
  completedAt: string | null;
  status: string | null;
}

export interface ClientProfitability {
  clientId: string;
  clientName: string;
  projectCount: number;
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  avgMarginPercent: number;
}

export interface ProfitabilityMetrics {
  totalProjects: number;
  completedProjects: number;
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  avgMarginPercent: number;
  mostProfitableProject?: ProjectProfitability;
  leastProfitableProject?: ProjectProfitability;
  topClientByRevenue?: ClientProfitability;
}

/** Get profitability data for all projects in a company
 * CRITICAL: Uses same calculation logic as Expense page to ensure consistency.
 * Revenue = original estimate total + approved change orders
 * Expenses = material + labor + other + subcontractor committed + agent commissions + agent reimbursements + mileage
 * Subcontractor/Agent costs use committed amounts (max of assigned and paid), matching Expense page behavior
 */
export async function getCompanyProfitability(companyId: string): Promise<ProjectProfitability[]> {
  const { data: estimates, error: estimatesError } = await supabase
    .from("estimates")
    .select("id, estimate_number, title, client_id, total, completed_at, is_deleted, status, signature")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .not("signature", "is", null);

  if (estimatesError) throw estimatesError;

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("company_id", companyId);

  // Fetch all cost data in parallel
  const [
    { data: expenses },
    { data: subAssignments },
    { data: subPayments },
    { data: agentAssignments },
    { data: agentPayments },
    { data: mileageTrips },
    { data: changeOrders },
  ] = await Promise.all([
    supabase
      .from("estimate_expenses")
      .select("estimate_id, amount, tax")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("estimate_subcontractors")
      .select("estimate_id, id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("subcontractor_payments")
      .select("estimate_id, estimate_subcontractor_id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("estimate_agents")
      .select("estimate_id, id, agent_id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("agent_payments")
      .select("estimate_id, estimate_agent_id, agent_id, amount, payment_type")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("mileage_trips")
      .select("estimate_id, reimbursement")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .is("deleted_at", null),
    supabase
      .from("change_orders")
      .select("estimate_id, total_amount")
      .eq("company_id", companyId)
      .eq("status", "approved")
      .is("deleted_at", null),
  ]);

  // Build lookup maps - mimic Expense page calculations exactly
  const clientById = new Map(clients?.map(c => [c.id, c.name]) || []);
  const expensesByProject = new Map<string, number>();
  const subCostsByProject = new Map<string, number>();
  const agentCommissionsByProject = new Map<string, number>();
  const agentReimbursementsByProject = new Map<string, number>();
  const mileageCostsByProject = new Map<string, number>();
  const changeOrderTotalByProject = new Map<string, number>();

  // Aggregate expenses (material, labor, other)
  if (expenses) {
    for (const exp of expenses) {
      if (!exp.estimate_id) continue;
      const current = expensesByProject.get(exp.estimate_id) || 0;
      expensesByProject.set(exp.estimate_id, current + (exp.amount || 0) + (exp.tax || 0));
    }
  }

  // Aggregate subcontractor costs using max(assigned, paid) - matches Expense page
  if (subAssignments && subPayments) {
    const paidByAssignment = new Map<string, number>();
    for (const p of subPayments) {
      if (!p.estimate_subcontractor_id) continue;
      const current = paidByAssignment.get(p.estimate_subcontractor_id) || 0;
      paidByAssignment.set(p.estimate_subcontractor_id, current + p.amount);
    }

    for (const sub of subAssignments) {
      if (!sub.estimate_id) continue;
      // Use max of assigned and paid - committed cost
      const effectiveCost = Math.max(sub.amount || 0, paidByAssignment.get(sub.id) || 0);
      const current = subCostsByProject.get(sub.estimate_id) || 0;
      subCostsByProject.set(sub.estimate_id, current + effectiveCost);
    }
  }

  // Aggregate agent costs - only count commissions (not reimbursements) - matches Expense page
  if (agentAssignments && agentPayments) {
    const paidByAssignment = new Map<string, number>();
    for (const p of agentPayments) {
      if (p.payment_type === 'reimbursement') continue; // Exclude reimbursements from commissions
      const assignmentId = p.estimate_agent_id ?? agentAssignments.find((a) => a.agent_id === p.agent_id)?.id;
      if (!assignmentId) continue;
      const current = paidByAssignment.get(assignmentId) || 0;
      paidByAssignment.set(assignmentId, current + p.amount);
    }

    for (const agent of agentAssignments) {
      if (!agent.estimate_id) continue;
      const paidAmount = paidByAssignment.get(agent.id) || 0;
      // Commission: use assigned amount or paid amount, whichever was paid
      const current = agentCommissionsByProject.get(agent.estimate_id) || 0;
      agentCommissionsByProject.set(agent.estimate_id, current + paidAmount);
    }

    // Also aggregate reimbursements separately
    for (const p of agentPayments) {
      if (p.payment_type !== 'reimbursement') continue;
      if (!p.estimate_id) continue;
      const current = agentReimbursementsByProject.get(p.estimate_id) || 0;
      agentReimbursementsByProject.set(p.estimate_id, current + p.amount);
    }
  }

  // Aggregate mileage costs
  if (mileageTrips) {
    for (const trip of mileageTrips) {
      if (!trip.estimate_id) continue;
      const current = mileageCostsByProject.get(trip.estimate_id) || 0;
      mileageCostsByProject.set(trip.estimate_id, current + (trip.reimbursement || 0));
    }
  }

  // Aggregate approved change orders
  if (changeOrders) {
    for (const co of changeOrders) {
      if (!co.estimate_id) continue;
      const current = changeOrderTotalByProject.get(co.estimate_id) || 0;
      changeOrderTotalByProject.set(co.estimate_id, current + (co.total_amount || 0));
    }
  }

  // Build profitability data - use revised total (original + approved COs)
  const profitability: ProjectProfitability[] = (estimates || []).map(est => {
    const approvedCOTotal = changeOrderTotalByProject.get(est.id) || 0;
    const revenue = (est.total || 0) + approvedCOTotal; // Revised total

    const projectExpenses = (expensesByProject.get(est.id) || 0) +
                           (subCostsByProject.get(est.id) || 0) +
                           (agentCommissionsByProject.get(est.id) || 0) +
                           (agentReimbursementsByProject.get(est.id) || 0) +
                           (mileageCostsByProject.get(est.id) || 0);

    const profit = revenue - projectExpenses;
    const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      estimateId: est.id,
      estimateNumber: est.estimate_number,
      projectTitle: est.title,
      clientId: est.client_id,
      clientName: est.client_id ? clientById.get(est.client_id) : null,
      revenue,
      expenses: projectExpenses,
      profit,
      marginPercent,
      completedAt: est.completed_at,
      status: est.status,
    };
  });

  return profitability.sort((a, b) => b.profit - a.profit);
}

/** Get client-level profitability summary */
export async function getClientProfitability(companyId: string): Promise<ClientProfitability[]> {
  const projects = await getCompanyProfitability(companyId);

  // Group by client
  const clientMap = new Map<string, { name: string; projects: ProjectProfitability[] }>();

  for (const proj of projects) {
    const key = proj.clientId || "unknown";
    const name = proj.clientName || "Unknown Client";

    if (!clientMap.has(key)) {
      clientMap.set(key, { name, projects: [] });
    }
    clientMap.get(key)!.projects.push(proj);
  }

  // Calculate aggregates
  const summary: ClientProfitability[] = Array.from(clientMap.values()).map(({ name, projects }) => {
    const totalRevenue = projects.reduce((sum, p) => sum + p.revenue, 0);
    const totalExpenses = projects.reduce((sum, p) => sum + p.expenses, 0);
    const totalProfit = projects.reduce((sum, p) => sum + p.profit, 0);
    const avgMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      clientId: projects[0]?.clientName === name ? projects[0]?.estimateId : "unknown", // Use estimate ID as proxy
      clientName: name,
      projectCount: projects.length,
      totalRevenue,
      totalExpenses,
      totalProfit,
      avgMarginPercent,
    };
  });

  return summary.sort((a, b) => b.totalProfit - a.totalProfit);
}

/** Get company-wide profitability metrics */
export async function getProfitabilityMetrics(companyId: string): Promise<ProfitabilityMetrics> {
  const projects = await getCompanyProfitability(companyId);

  const totalRevenue = projects.reduce((sum, p) => sum + p.revenue, 0);
  const totalExpenses = projects.reduce((sum, p) => sum + p.expenses, 0);
  const totalProfit = projects.reduce((sum, p) => sum + p.profit, 0);
  const avgMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const completedProjects = projects.filter(p => p.completedAt).length;
  const mostProfitable = projects[0];
  const leastProfitable = projects[projects.length - 1];

  // Get top client
  const clients = await getClientProfitability(companyId);
  const topClient = clients[0];

  return {
    totalProjects: projects.length,
    completedProjects,
    totalRevenue,
    totalExpenses,
    totalProfit,
    avgMarginPercent,
    mostProfitableProject: mostProfitable,
    leastProfitableProject: leastProfitable,
    topClientByRevenue: topClient,
  };
}
