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

/** Get profitability data for all projects in a company */
export async function getCompanyProfitability(companyId: string): Promise<ProjectProfitability[]> {
  const { data: estimates, error: estimatesError } = await supabase
    .from("estimates")
    .select("id, estimate_number, title, client_id, total, completed_at, is_deleted, status")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .eq("status", "approved");

  if (estimatesError) throw estimatesError;

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("company_id", companyId);

  const { data: expenses } = await supabase
    .from("estimate_expenses")
    .select("estimate_id, amount, tax")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  const { data: subAssignments } = await supabase
    .from("estimate_subcontractors")
    .select("estimate_id, amount")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  const { data: agentAssignments } = await supabase
    .from("estimate_agents")
    .select("estimate_id, amount")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  // Build lookup maps
  const clientById = new Map(clients?.map(c => [c.id, c.name]) || []);
  const expensesByProject = new Map<string, number>();
  const subCostsByProject = new Map<string, number>();
  const agentCostsByProject = new Map<string, number>();

  // Aggregate expenses
  if (expenses) {
    for (const exp of expenses) {
      if (!exp.estimate_id) continue;
      const current = expensesByProject.get(exp.estimate_id) || 0;
      expensesByProject.set(exp.estimate_id, current + (exp.amount || 0) + (exp.tax || 0));
    }
  }

  // Aggregate subcontractor costs
  if (subAssignments) {
    for (const sub of subAssignments) {
      if (!sub.estimate_id) continue;
      const current = subCostsByProject.get(sub.estimate_id) || 0;
      subCostsByProject.set(sub.estimate_id, current + (sub.amount || 0));
    }
  }

  // Aggregate agent costs
  if (agentAssignments) {
    for (const agent of agentAssignments) {
      if (!agent.estimate_id) continue;
      const current = agentCostsByProject.get(agent.estimate_id) || 0;
      agentCostsByProject.set(agent.estimate_id, current + (agent.amount || 0));
    }
  }

  // Build profitability data
  const profitability: ProjectProfitability[] = (estimates || []).map(est => {
    const revenue = est.total || 0;
    const projectExpenses = (expensesByProject.get(est.id) || 0) +
                           (subCostsByProject.get(est.id) || 0) +
                           (agentCostsByProject.get(est.id) || 0);
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
