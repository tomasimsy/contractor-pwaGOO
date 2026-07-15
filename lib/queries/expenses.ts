import { supabase } from "@/lib/supabase/client";
import type {
  AssignedAgent,
  AssignedSubcontractor,
  BudgetComparison,
  FinancialSummaryData,
  InvoiceRow,
  LedgerEntry,
  NewEntryInput,
  PayoutStatusValue,
  PaymentStatusValue,
  PaymentSummary,
  PendingPayout,
  ProjectBundle,
  SubcontractorPaymentRow,
} from "@/lib/types";

/**
 * Routes the add-expense form to the right table based on what the
 * user picked. Subcontractor payments have an extra step: they can
 * only be inserted against an estimate_subcontractors row, so if the
 * chosen subcontractor isn't assigned to this project yet, one is
 * created first (contracted amount 0 — it's just a link row for
 * payment purposes, not a real contract entry; if you want it to also
 * carry the contract value, prompt for that separately).
 */
export async function addEntry(input: NewEntryInput): Promise<void> {
  if (input.kind === "expense") {
    const { error } = await supabase.from("estimate_expenses").insert({
      estimate_id: input.estimateId,
      company_id: input.companyId,
      category: input.category,
      amount: input.amount,
      tax: input.tax,
      expense_date: input.expenseDate,
      payment_method: input.paymentMethod,
      vendor: input.vendor,
      paid_by: input.paidBy,
      notes: input.notes,
      change_order_id: input.changeOrderId,
    });
    if (error) throw error;
    return;
  }

  if (input.kind === "subcontractor_payment") {
    const { error } = await supabase.from("subcontractor_payments").insert({
      estimate_subcontractor_id: input.estimateSubcontractorId,
      estimate_id: input.estimateId,
      company_id: input.companyId,
      amount: input.amount,
      payment_date: input.paymentDate,
      payment_method: input.paymentMethod,
      notes: input.notes,
      change_order_id: input.changeOrderId,
    });
    if (error) throw error;
    return;
  }

  // agent_payment
  const { error } = await supabase.from("agent_payments").insert({
    estimate_id: input.estimateId,
    agent_id: input.agentId,
    estimate_agent_id: input.estimateAgentId ?? null,
    company_id: input.companyId,
    amount: input.amount,
    payment_date: input.paymentDate,
    payment_method: input.paymentMethod,
    notes: input.notes,
    change_order_id: input.changeOrderId,
  });
  if (error) throw error;
}

/** Assigns a subcontractor to a project with an expected payout amount
 * so a payment can then be logged against them. Amount/notes default to
 * 0/null for the pre-existing quick-add-from-AddExpenseSheet call site,
 * which doesn't collect a payout amount up front. Returns the new
 * estimate_subcontractors row for the picker to use immediately without
 * a refetch. */
export async function assignSubcontractorToProject(
  estimateId: string,
  companyId: string,
  subcontractorId: string,
  subcontractorName: string,
  subcontractorTrade: string | null,
  amount = 0,
  notes: string | null = null
): Promise<AssignedSubcontractor> {
  const { data, error } = await supabase
    .from("estimate_subcontractors")
    .insert({ estimate_id: estimateId, company_id: companyId, subcontractor_id: subcontractorId, amount, notes })
    .select("id")
    .single();
  if (error) throw error;

  return {
    estimateSubcontractorId: data.id,
    subcontractorId,
    name: subcontractorName,
    trade: subcontractorTrade,
    contractedAmount: amount,
    notes,
  };
}

/** Agent-side mirror of assignSubcontractorToProject, on the existing
 * (legacy) estimate_agents table — now wired into the payout workflow. */
export async function assignAgentToProject(
  estimateId: string,
  companyId: string,
  agentId: string,
  agentName: string,
  amount = 0,
  notes: string | null = null
): Promise<AssignedAgent> {
  const { data, error } = await supabase
    .from("estimate_agents")
    .insert({ estimate_id: estimateId, company_id: companyId, agent_id: agentId, amount, notes })
    .select("id")
    .single();
  if (error) throw error;

  return {
    estimateAgentId: data.id,
    agentId,
    name: agentName,
    assignedAmount: amount,
    notes,
  };
}

/** Edits the expected payout amount/notes on an existing assignment —
 * the amount is never locked, per the payout workflow's "before payment"
 * step. `table` picks which assignment table to hit; both share the same
 * editable columns (amount, notes). */
export async function updateAssignment(
  table: "estimate_subcontractors" | "estimate_agents",
  id: string,
  companyId: string,
  fields: { amount?: number; notes?: string | null }
): Promise<void> {
  const { error } = await supabase.from(table).update(fields).eq("id", id).eq("company_id", companyId);
  if (error) throw error;
}

/** Removes an assignment (soft delete via the existing trigger, same as
 * every other table in this app) — payment history tied to it is kept,
 * not cascaded, since the FK on *_payments.estimate_*_id is ON DELETE
 * SET NULL / the row is soft-deleted rather than hard-deleted anyway. */
export async function removeAssignment(
  table: "estimate_subcontractors" | "estimate_agents",
  id: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id).eq("company_id", companyId);
  if (error) throw error;
}

/** Pending/partial/paid + amounts for one assignment — shared by the
 * payout queue, the assignment row UI, and the pay confirmation dialog
 * so the three can never disagree about what's owed. */
export function computePayoutStatus(
  assignedAmount: number,
  paidAmount: number
): { remainingAmount: number; status: PayoutStatusValue } {
  const remainingAmount = Math.max(assignedAmount - paidAmount, 0);
  const status: PayoutStatusValue = paidAmount <= 0 ? "pending" : remainingAmount <= 0.004 ? "paid" : "partial";
  return { remainingAmount, status };
}

/** Every subcontractor/agent assignment on this project with money
 * still owed (or already fully paid, if includeSettled is set) — the
 * single source of truth behind the pending-payout queue on the
 * Expense page. Paid-to-date is summed directly from the raw payment
 * rows (not any denormalized "paid so far" column), same reasoning as
 * the existing SubcontractorsPanel/AgentsPanel totals. */
export function computePendingPayouts(
  bundle: Pick<ProjectBundle, "assignedSubcontractors" | "assignedAgents" | "subcontractorPayments" | "agentPayments">,
  includeSettled = false
): PendingPayout[] {
  const paidBySubAssignment = new Map<string, number>();
  for (const p of bundle.subcontractorPayments) {
    if (!p.estimate_subcontractor_id) continue;
    paidBySubAssignment.set(
      p.estimate_subcontractor_id,
      (paidBySubAssignment.get(p.estimate_subcontractor_id) ?? 0) + p.amount
    );
  }
  // Agent payments are matched to an assignment by estimate_agent_id when
  // present, but that column was added after payments already existed —
  // and ProjectFinancialsModal.tsx's recordAgentPayment still doesn't set
  // it. Falling back to a plain agent_id match (every payment here already
  // belongs to this one project, since bundle.agentPayments is fetched
  // scoped to a single estimate_id) is exactly what ProjectFinancialsModal
  // itself does, so both surfaces now agree on what counts as "paid" —
  // one matching rule, not two payment-tracking systems.
  const paidByAgentAssignment = new Map<string, number>();
  for (const p of bundle.agentPayments) {
    const assignmentId =
      p.estimate_agent_id ?? bundle.assignedAgents.find((a) => a.agentId === p.agent_id)?.estimateAgentId;
    if (!assignmentId) continue;
    paidByAgentAssignment.set(assignmentId, (paidByAgentAssignment.get(assignmentId) ?? 0) + p.amount);
  }

  const subPayouts: PendingPayout[] = bundle.assignedSubcontractors.map((s) => {
    const paidAmount = paidBySubAssignment.get(s.estimateSubcontractorId) ?? 0;
    const { remainingAmount, status } = computePayoutStatus(s.contractedAmount, paidAmount);
    return {
      role: "subcontractor",
      assignmentId: s.estimateSubcontractorId,
      personId: s.subcontractorId,
      name: s.name,
      roleDetail: s.trade,
      assignedAmount: s.contractedAmount,
      paidAmount,
      remainingAmount,
      status,
      notes: s.notes,
    };
  });

  const agentPayouts: PendingPayout[] = bundle.assignedAgents.map((a) => {
    const paidAmount = paidByAgentAssignment.get(a.estimateAgentId) ?? 0;
    const { remainingAmount, status } = computePayoutStatus(a.assignedAmount, paidAmount);
    return {
      role: "agent",
      assignmentId: a.estimateAgentId,
      personId: a.agentId,
      name: a.name,
      roleDetail: null,
      assignedAmount: a.assignedAmount,
      paidAmount,
      remainingAmount,
      status,
      notes: a.notes,
    };
  });

  return [...subPayouts, ...agentPayouts].filter((p) => includeSettled || p.remainingAmount > 0.004);
}

/** Company-wide pending-payout total, for the Dashboard widget — same
 * assigned-minus-paid math as computePendingPayouts, just aggregated
 * across every project instead of one. Kept as a simple count + total
 * rather than a per-project breakdown, since Dashboard just needs the
 * headline number pointing back to the Expense page for detail. */
export async function getCompanyPendingPayoutsSummary(
  companyId: string
): Promise<{ count: number; totalRemaining: number }> {
  const [
    { data: subs, error: subsError },
    { data: agents, error: agentsError },
    { data: subPayments, error: subPaymentsError },
    { data: agentPayments, error: agentPaymentsError },
  ] = await Promise.all([
    supabase.from("estimate_subcontractors").select("id, amount").eq("company_id", companyId).is("deleted_at", null),
    supabase.from("estimate_agents").select("id, agent_id, amount, estimate_id").eq("company_id", companyId).is("deleted_at", null),
    supabase
      .from("subcontractor_payments")
      .select("estimate_subcontractor_id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("agent_payments")
      .select("estimate_agent_id, agent_id, estimate_id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
  ]);
  if (subsError) throw subsError;
  if (agentsError) throw agentsError;
  if (subPaymentsError) throw subPaymentsError;
  if (agentPaymentsError) throw agentPaymentsError;

  const paidBySub = new Map<string, number>();
  for (const p of subPayments ?? []) {
    if (!p.estimate_subcontractor_id) continue;
    paidBySub.set(p.estimate_subcontractor_id, (paidBySub.get(p.estimate_subcontractor_id) ?? 0) + p.amount);
  }

  // Same estimate_agent_id-with-agent_id-fallback matching as
  // computePendingPayouts — company-wide here, so the fallback also has
  // to match on estimate_id (an agent can be assigned to more than one
  // project across the company).
  const agentAssignmentKey = (agentId: string | null, estimateId: string | null) => `${agentId}::${estimateId}`;
  const assignmentIdByAgentEstimate = new Map<string, string>();
  for (const a of agents ?? []) {
    assignmentIdByAgentEstimate.set(agentAssignmentKey(a.agent_id, a.estimate_id), a.id);
  }
  const paidByAgent = new Map<string, number>();
  for (const p of agentPayments ?? []) {
    const assignmentId = p.estimate_agent_id ?? assignmentIdByAgentEstimate.get(agentAssignmentKey(p.agent_id, p.estimate_id));
    if (!assignmentId) continue;
    paidByAgent.set(assignmentId, (paidByAgent.get(assignmentId) ?? 0) + p.amount);
  }

  let count = 0;
  let totalRemaining = 0;
  for (const s of subs ?? []) {
    const remaining = Math.max((s.amount ?? 0) - (paidBySub.get(s.id) ?? 0), 0);
    if (remaining > 0.004) {
      count++;
      totalRemaining += remaining;
    }
  }
  for (const a of agents ?? []) {
    const remaining = Math.max((a.amount ?? 0) - (paidByAgent.get(a.id) ?? 0), 0);
    if (remaining > 0.004) {
      count++;
      totalRemaining += remaining;
    }
  }

  return { count, totalRemaining };
}

/**
 * Soft-delete helpers — one per table, shared by the Expense page and
 * ProjectFinancialsModal so both surfaces delete (and restore) the
 * same way instead of one hard-deleting and the other not. Deleted
 * rows stay in the database with `deleted_at` set; every read in this
 * file and in getProjectBundle() filters them out, so they disappear
 * from ledgers and totals without losing the audit trail or breaking
 * a payment's relationship to its subcontractor/agent/estimate.
 */
export async function softDeleteExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from("estimate_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteSubcontractorPayment(id: string): Promise<void> {
  const { error } = await supabase
    .from("subcontractor_payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteAgentPayment(id: string): Promise<void> {
  const { error } = await supabase
    .from("agent_payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreExpense(id: string): Promise<void> {
  const { error } = await supabase.from("estimate_expenses").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function restoreSubcontractorPayment(id: string): Promise<void> {
  const { error } = await supabase.from("subcontractor_payments").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function restoreAgentPayment(id: string): Promise<void> {
  const { error } = await supabase.from("agent_payments").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(entry: LedgerEntry): Promise<void> {
  if (entry.source === "expense") return softDeleteExpense(entry.id);
  if (entry.source === "subcontractor_payment") return softDeleteSubcontractorPayment(entry.id);
  return softDeleteAgentPayment(entry.id);
}

export async function restoreEntry(entry: LedgerEntry): Promise<void> {
  if (entry.source === "expense") return restoreExpense(entry.id);
  if (entry.source === "subcontractor_payment") return restoreSubcontractorPayment(entry.id);
  return restoreAgentPayment(entry.id);
}

const EXPENSE_CATEGORY_DISPLAY: Record<string, string> = {
  material: "Material",
  labor: "Labor",
  other: "Other",
};

/** Flattens the three source tables into one sorted, display-ready
 * ledger. Subcontractor payments look up the payee name from
 * `assignedSubcontractors` (already joined server-side); agent
 * payments look it up from `salesAgents`. */
export function buildLedger(bundle: ProjectBundle): LedgerEntry[] {
  const subcontractorNameByAssignmentId = new Map(
    bundle.assignedSubcontractors.map((s) => [s.estimateSubcontractorId, s.name])
  );
  const agentNameById = new Map(bundle.salesAgents.map((a) => [a.id, a.name]));
  const changeOrderNumberById = new Map(bundle.changeOrders.map((co) => [co.id, co.change_order_number]));
  const coFields = (changeOrderId: string | null) => ({
    changeOrderId,
    changeOrderLabel: changeOrderId ? changeOrderNumberById.get(changeOrderId) ?? null : null,
  });

  const expenseEntries: LedgerEntry[] = bundle.expenses.map((e) => ({
    id: e.id,
    source: "expense",
    categoryLabel: EXPENSE_CATEGORY_DISPLAY[e.category] ?? e.category,
    amount: e.amount + (e.tax ?? 0),
    date: e.expense_date ?? e.created_at ?? "",
    payeeLabel: e.vendor || EXPENSE_CATEGORY_DISPLAY[e.category] || e.category,
    paymentMethod: e.payment_method,
    notes: e.notes ?? e.description,
    hasReceiptFields: true,
    ...coFields(e.change_order_id),
  }));

  const subPaymentEntries: LedgerEntry[] = bundle.subcontractorPayments.map((p) => ({
    id: p.id,
    source: "subcontractor_payment",
    categoryLabel: "Subcontractor",
    amount: p.amount,
    date: p.payment_date ?? p.created_at ?? "",
    payeeLabel: (p.estimate_subcontractor_id && subcontractorNameByAssignmentId.get(p.estimate_subcontractor_id)) || "Subcontractor",
    paymentMethod: p.payment_method,
    notes: p.notes,
    hasReceiptFields: false,
    ...coFields(p.change_order_id),
  }));

  const agentPaymentEntries: LedgerEntry[] = bundle.agentPayments.map((p) => ({
    id: p.id,
    source: "agent_payment",
    categoryLabel: "Agent Commission",
    amount: p.amount,
    date: p.payment_date ?? p.created_at ?? "",
    payeeLabel: (p.agent_id && agentNameById.get(p.agent_id)) || "Agent",
    paymentMethod: p.payment_method,
    notes: p.notes,
    hasReceiptFields: false,
    ...coFields(p.change_order_id),
  }));

  return [...expenseEntries, ...subPaymentEntries, ...agentPaymentEntries].sort(
    (a, b) => (a.date < b.date ? 1 : -1)
  );
}

/**
 * Amount received from the client — summed across every non-deleted
 * invoice for the estimate (usually one row, but summed regardless of
 * cardinality in case an estimate ever has more than one). Replaces
 * the earlier deposit-only guess now that `invoices` is confirmed as
 * the real payment record: `amount_paid` already reflects cumulative
 * payment (deposit + final combined on one row), so no separate
 * deposit-field fallback is needed.
 */
export function totalAmountPaid(invoices: Pick<InvoiceRow, "amount_paid">[]): number {
  return invoices.reduce((sum, invoice) => sum + (invoice.amount_paid ?? 0), 0);
}

/**
 * Not Paid / Partial / Fully Paid — computed from amounts rather than
 * read from `estimates.payment_status`, per the spec's explicit
 * thresholds. `totalContractAmount` is `estimates.total` (the
 * post-markup/discount/tax contract value) — NOT total project cost,
 * which is a separate (expense-side) figure computed in
 * summarizeFinancials below.
 */
export function derivePaymentStatus(
  totalContractAmount: number,
  amountReceived: number
): PaymentSummary {
  const status: PaymentStatusValue =
    amountReceived <= 0 ? "not_paid" : amountReceived >= totalContractAmount ? "fully_paid" : "partial";

  return {
    status,
    totalContractAmount,
    amountReceived,
    remainingBalance: Math.max(totalContractAmount - amountReceived, 0),
    paymentPercentage:
      totalContractAmount > 0 ? Math.min(100, Math.max(0, (amountReceived / totalContractAmount) * 100)) : 0,
  };
}

/**
 * Reduces all three tables down to the shape FinancialSummaryCards
 * expects. Material/labor use their own categories; anything in
 * estimate_expenses that isn't 'material' or 'labor' is bucketed into
 * "other" (safe catch-all if a row has an unexpected category value).
 * Expense amounts include tax, since tax is a real cost.
 *
 * `totalPaidByClient` defaults to `totalAmountPaid()`'s definition
 * at the call site (see app/expense/page.tsx) — pass a different
 * number in if you wire up something more granular later.
 */
/**
 * Committed subcontractor cost, floored at what's actually been paid
 * per assignment. Needed because the older Add-Expense-sheet flow (and
 * anything else that logs a subcontractor_payment) can create/leave an
 * assignment at its default $0 "amount" while still recording real
 * payments against it — without this floor, profit would understate
 * cost for exactly the assignments where real money has demonstrably
 * gone out the door. Single source of truth for both summarizeFinancials
 * and getProjectFinancialSnapshot below.
 */
function getEffectiveSubcontractorCommitted(
  assignedSubcontractors: Pick<ProjectBundle["assignedSubcontractors"][number], "estimateSubcontractorId" | "contractedAmount">[],
  subcontractorPayments: Pick<SubcontractorPaymentRow, "estimate_subcontractor_id" | "amount">[]
): number {
  const paidByAssignment = new Map<string, number>();
  for (const p of subcontractorPayments) {
    if (!p.estimate_subcontractor_id) continue;
    paidByAssignment.set(p.estimate_subcontractor_id, (paidByAssignment.get(p.estimate_subcontractor_id) ?? 0) + p.amount);
  }
  return assignedSubcontractors.reduce(
    (sum, s) => sum + Math.max(s.contractedAmount, paidByAssignment.get(s.estimateSubcontractorId) ?? 0),
    0
  );
}

export function summarizeFinancials(
  estimateTotal: number,
  bundle: Pick<
    ProjectBundle,
    "expenses" | "subcontractorPayments" | "agentPayments" | "mileageTrips" | "changeOrders" | "assignedSubcontractors"
  >,
  totalPaidByClient = 0
): FinancialSummaryData {
  let materialCosts = 0;
  let laborCosts = 0;
  let otherExpenses = 0;

  for (const expense of bundle.expenses) {
    const total = expense.amount + (expense.tax ?? 0);
    if (expense.category === "material") materialCosts += total;
    else if (expense.category === "labor") laborCosts += total;
    else otherExpenses += total;
  }

  // Committed, not paid-to-date: an assigned subcontractor affects
  // profit the moment they're assigned, even at $0 paid so far — profit
  // is "what will this cost," not "what has actually left the bank."
  // Floored at paid-to-date per assignment (getEffectiveSubcontractorCommitted)
  // so a payment logged against a $0-committed assignment (e.g. via the
  // Add Expense sheet's older subcontractor-payment flow) still counts.
  // subcontractorPaidToDate is tracked separately for anything that
  // still needs the real cash-paid figure (payout status, receipts).
  const subcontractorCosts = getEffectiveSubcontractorCommitted(bundle.assignedSubcontractors, bundle.subcontractorPayments);
  const subcontractorPaidToDate = bundle.subcontractorPayments.reduce((sum, p) => sum + p.amount, 0);
  const agentCommissions = bundle.agentPayments.reduce((sum, p) => sum + p.amount, 0);
  const mileageCosts = bundle.mileageTrips.reduce((sum, t) => sum + (t.reimbursement || 0), 0);

  // Same "revised total = original + approved change orders" formula
  // already established in app/reports/expenses/[id]/page.tsx and the
  // estimate/invoice pages — relocated here so every card on the
  // Expense page gets it consistently instead of computing it ad hoc.
  const approvedChangeOrderTotal = bundle.changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + (co.total_amount || 0), 0);
  const revisedTotal = estimateTotal + approvedChangeOrderTotal;

  return {
    estimateTotal,
    materialCosts,
    laborCosts,
    subcontractorCosts,
    subcontractorPaidToDate,
    agentCommissions,
    otherExpenses,
    mileageCosts,
    totalPaid: totalPaidByClient,
    approvedChangeOrderTotal,
    revisedTotal,
  };
}

/**
 * Single source of truth for the "assign a payout" calculation
 * breakdown shown in AssignPayeeModal (and anywhere else that needs the
 * same numbers) — revenue minus committed subcontractor cost minus
 * other expenses = available profit, which agent commission is a
 * percentage of. Subcontractor commitments use the assigned amount
 * (not paid-to-date), same reasoning as summarizeFinancials above.
 */
export function getProjectFinancialSnapshot(
  bundle: Pick<
    ProjectBundle,
    "assignedSubcontractors" | "subcontractorPayments" | "expenses" | "mileageTrips" | "changeOrders" | "project"
  >
) {
  const approvedChangeOrderTotal = bundle.changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + (co.total_amount || 0), 0);
  const revenue = (bundle.project.total || 0) + approvedChangeOrderTotal;

  const subcontractorCommitted = getEffectiveSubcontractorCommitted(bundle.assignedSubcontractors, bundle.subcontractorPayments);

  const otherExpenses =
    bundle.expenses.reduce((sum, e) => sum + e.amount + (e.tax ?? 0), 0) +
    bundle.mileageTrips.reduce((sum, t) => sum + (t.reimbursement || 0), 0);

  const availableProfit = revenue - subcontractorCommitted - otherExpenses;

  return { revenue, subcontractorCommitted, otherExpenses, availableProfit };
}

/**
 * Budget (from estimate_items, the original line items) vs. actual
 * (from estimate_expenses) spend per category. Kept separate from
 * summarizeFinancials since it draws from a different source
 * (budgeted vs. spent) rather than duplicating its bucketing —
 * estimate_items.category is stored capitalized ("Material") while
 * estimate_expenses.category is lowercase, so both are normalized via
 * toLowerCase() before matching.
 */
export function getBudgetComparison(
  estimateItems: Pick<ProjectBundle["estimateItems"][number], "category" | "total">[],
  expenses: Pick<ProjectBundle["expenses"][number], "category" | "amount" | "tax">[]
): BudgetComparison {
  const result: BudgetComparison = {
    material: { budget: 0, actual: 0 },
    labor: { budget: 0, actual: 0 },
    other: { budget: 0, actual: 0 },
  };

  for (const item of estimateItems) {
    const key = item.category?.toLowerCase();
    const bucket = key === "material" || key === "labor" ? key : "other";
    result[bucket].budget += item.total || 0;
  }

  for (const expense of expenses) {
    const key = expense.category?.toLowerCase();
    const bucket = key === "material" || key === "labor" ? key : "other";
    result[bucket].actual += (expense.amount || 0) + (expense.tax ?? 0);
  }

  return result;
}

/**
 * Distinct vendor names from this company's past expenses, most
 * recent first, for the Add Expense form's autocomplete. Supabase-js
 * has no native DISTINCT, so this dedupes client-side over a
 * recency-capped fetch rather than scanning the whole table.
 */
export async function getRecentVendors(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("estimate_expenses")
    .select("vendor")
    .eq("company_id", companyId)
    .not("vendor", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const seen = new Set<string>();
  const vendors: string[] = [];
  for (const row of data ?? []) {
    const vendor = row.vendor?.trim();
    if (vendor && !seen.has(vendor)) {
      seen.add(vendor);
      vendors.push(vendor);
      if (vendors.length >= 20) break;
    }
  }
  return vendors;
}