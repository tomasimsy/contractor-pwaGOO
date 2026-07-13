import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import type { ProjectBundle, ProjectSummary } from "@/lib/types";

const SEARCH_LIMIT = 15;

/**
 * Searches Projects/Estimates by estimate number, title, or client
 * name in one query. (No address field exists on `estimates` —
 * confirmed — so address search was dropped rather than guessed at.)
 * Client name lives on the joined `clients` row, so it's matched with
 * a separate call — Supabase can't OR across a join and a base table
 * in a single filter string.
 *
 * Called on every keystroke from the combobox (debounced there, see
 * lib/hooks/useProjectSearch.ts) — kept to indexed queries capped at
 * SEARCH_LIMIT so it stays fast while typing. Soft-deleted estimates
 * (`is_deleted`) are excluded throughout.
 */
export async function searchProjects(query: string): Promise<ProjectSummary[]> {
  const q = query.trim();

  if (!q) {
    const { data, error } = await supabase
      .from("estimates")
      .select("id, estimate_number, title, status, clients(name)")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(SEARCH_LIMIT);

    if (error) throw error;
    return (data ?? []).map(toProjectSummary);
  }

  const { data: byProjectFields, error: e1 } = await supabase
    .from("estimates")
    .select("id, estimate_number, title, status, clients(name)")
    .eq("is_deleted", false)
    .or(`estimate_number.ilike.%${q}%,title.ilike.%${q}%`)
    .limit(SEARCH_LIMIT);
  if (e1) throw e1;

  const { data: byClientName, error: e2 } = await supabase
    .from("estimates")
    .select("id, estimate_number, title, status, clients!inner(name)")
    .eq("is_deleted", false)
    .ilike("clients.name", `%${q}%`)
    .limit(SEARCH_LIMIT);
  if (e2) throw e2;

  const merged = new Map<string, ProjectSummary>();
  for (const row of [...(byProjectFields ?? []), ...(byClientName ?? [])]) {
    const summary = toProjectSummary(row);
    merged.set(summary.id, summary);
  }
  return Array.from(merged.values()).slice(0, SEARCH_LIMIT);
}

/** Batch-fetches project summaries for a known list of ids, in the
 * order given — used to render the recent-projects row from the ids
 * stored in localStorage. */
export async function getProjectSummaries(ids: string[]): Promise<ProjectSummary[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("estimates")
    .select("id, estimate_number, title, status, clients(name)")
    .in("id", ids);

  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [row.id, toProjectSummary(row)]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProjectSummary => Boolean(p));
}

/**
 * Loads everything the detail view needs in one batch: the estimate,
 * its client, its company, every expense/payment row across all three
 * tables, the subcontractors already assigned to THIS project (via
 * estimate_subcontractors — subcontractor_payments can only be logged
 * against an assignment row, not a subcontractor directly), the full
 * subcontractor list (for assigning a new one on the fly), and the
 * agent list (agent_payments references agents directly, no
 * assignment step needed there).
 */
export async function getProjectBundle(projectId: string): Promise<ProjectBundle> {
  const companyId = await getCompanyId();

  // Scoped by id AND company_id — belt-and-suspenders alongside RLS, so a
  // guessed/leaked estimate id from another company can't load a bundle here.
  const { data: project, error: projectError } = await supabase
    .from("estimates")
    .select("*, clients(*), companies(*)")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();
  if (projectError) throw projectError;

  const [
    { data: expenses, error: expensesError },
    { data: subcontractorPayments, error: subPaymentsError },
    { data: agentPayments, error: agentPaymentsError },
    { data: invoices, error: invoicesError },
    { data: estimateSubcontractors, error: estSubError },
    { data: allSubcontractors, error: allSubError },
    { data: salesAgents, error: agentError },
  ] = await Promise.all([
    supabase
      .from("estimate_expenses")
      .select("*")
      .eq("estimate_id", projectId)
      .eq("company_id", companyId)
      .order("expense_date", { ascending: false }),
    supabase
      .from("subcontractor_payments")
      .select("*")
      .eq("estimate_id", projectId)
      .eq("company_id", companyId)
      .order("payment_date", { ascending: false }),
    supabase
      .from("agent_payments")
      .select("*")
      .eq("estimate_id", projectId)
      .eq("company_id", companyId)
      .order("payment_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("*")
      .eq("estimate_id", projectId)
      .eq("company_id", companyId)
      .eq("is_deleted", false)
      .order("issue_date", { ascending: false }),
    supabase
      .from("estimate_subcontractors")
      .select("id, subcontractor_id, amount, subcontractors(id, name, trade)")
      .eq("estimate_id", projectId)
      .eq("company_id", companyId),
    supabase
      .from("subcontractors")
      .select("id, name, trade")
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("agents")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name"),
  ]);

  if (expensesError) throw expensesError;
  if (subPaymentsError) throw subPaymentsError;
  if (agentPaymentsError) throw agentPaymentsError;
  if (invoicesError) throw invoicesError;
  if (estSubError) throw estSubError;
  if (allSubError) throw allSubError;
  if (agentError) throw agentError;

  const { clients, companies, ...projectFields } = project as any;

  return {
    project: projectFields,
    client: clients,
    company: companies,
    expenses: expenses ?? [],
    subcontractorPayments: subcontractorPayments ?? [],
    agentPayments: agentPayments ?? [],
    invoices: invoices ?? [],
    assignedSubcontractors: (estimateSubcontractors ?? []).map((row: any) => ({
      estimateSubcontractorId: row.id,
      subcontractorId: row.subcontractor_id,
      name: row.subcontractors?.name ?? "Unknown",
      trade: row.subcontractors?.trade ?? null,
      contractedAmount: row.amount ?? 0,
    })),
    allSubcontractors: allSubcontractors ?? [],
    salesAgents: salesAgents ?? [],
  };
}

function toProjectSummary(row: any): ProjectSummary {
  return {
    id: row.id,
    estimateNumber: row.estimate_number ?? "—",
    projectName: row.title || "Untitled Estimate",
    clientName: row.clients?.name ?? "—",
    status: row.status,
  };
}