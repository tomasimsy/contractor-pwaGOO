import { supabase } from "@/lib/supabase/client";
import type {
  AssignedAgent,
  AssignedSubcontractor,
  BudgetAlert,
  BudgetComparison,
  ExpenseAnalytics,
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
    // Insert the expense with paid_by_agent_id if provided
    const { data, error } = await supabase.from("estimate_expenses").insert({
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
      paid_by_agent_id: input.paidByAgentId ?? null,
    }).select("id").single();
    if (error) throw error;

    // If an agent paid for this expense, automatically create a reimbursement record
    if (input.paidByAgentId && data) {
      const totalAmount = input.amount + input.tax;
      // Look up the agent's assignment to link the reimbursement to the correct estimate_agent_id
      const { data: assignment, error: assignmentError } = await supabase
        .from("estimate_agents")
        .select("id")
        .eq("estimate_id", input.estimateId)
        .eq("agent_id", input.paidByAgentId)
        .eq("company_id", input.companyId)
        .is("deleted_at", null)
        .single();

      // Assignment lookup failing doesn't block expense creation, but log it
      if (assignmentError && assignmentError.code !== 'PGRST116') {
        console.error("Failed to look up agent assignment for reimbursement:", assignmentError);
      }

      const { error: reimburseError } = await supabase.from("agent_payments").insert({
        estimate_id: input.estimateId,
        agent_id: input.paidByAgentId,
        estimate_agent_id: assignment?.id ?? null,
        company_id: input.companyId,
        amount: totalAmount,
        payment_date: input.expenseDate,
        payment_method: input.paymentMethod,
        notes: input.notes,
        change_order_id: input.changeOrderId,
        reimbursement_from_agent_id: null,
      });
      // Reimbursement creation should not fail the entire operation, but log it
      if (reimburseError) {
        console.error("Failed to create reimbursement for agent expense:", reimburseError);
      }
    }
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
      reimbursement_from_agent_id: input.reimbursementFromAgentId ?? null,
    });
    if (error) throw error;

    // If agent needs to reimburse this subcontractor payment, create agent payment record
    if (input.reimbursementFromAgentId) {
      const { data: assignment, error: assignmentError } = await supabase
        .from("estimate_agents")
        .select("id")
        .eq("estimate_id", input.estimateId)
        .eq("agent_id", input.reimbursementFromAgentId)
        .eq("company_id", input.companyId)
        .is("deleted_at", null)
        .single();

      if (assignmentError && assignmentError.code !== 'PGRST116') {
        console.error("Failed to look up agent assignment:", assignmentError);
      }

      const { error: agentPaymentError } = await supabase.from("agent_payments").insert({
        estimate_id: input.estimateId,
        agent_id: input.reimbursementFromAgentId,
        estimate_agent_id: assignment?.id ?? null,
        company_id: input.companyId,
        amount: input.amount,
        payment_date: input.paymentDate,
        payment_method: input.paymentMethod,
        notes: input.notes,
        change_order_id: input.changeOrderId,
        reimbursement_from_agent_id: input.reimbursementFromAgentId,
      });

      if (agentPaymentError) {
        console.error("Failed to create agent payment for reimbursement:", agentPaymentError);
      }
    }
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
    reimbursement_from_agent_id: input.reimbursementFromAgentId ?? null,
  });
  if (error) throw error;

  // If agent needs to reimburse this commission, also track it as a payable
  if (input.reimbursementFromAgentId) {
    const { error: payableError } = await supabase.from("agent_payments").insert({
      estimate_id: input.estimateId,
      agent_id: input.reimbursementFromAgentId,
      estimate_agent_id: null,
      company_id: input.companyId,
      amount: input.amount,
      payment_date: input.paymentDate,
      payment_method: input.paymentMethod,
      notes: input.notes,
      change_order_id: input.changeOrderId,
      reimbursement_from_agent_id: input.reimbursementFromAgentId,
    });

    if (payableError) {
      console.error("Failed to create agent payable:", payableError);
    }
  }
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
  const paidCommissionByAssignment = new Map<string, number>();
  const reimbursementAmountByAssignment = new Map<string, number>();

  for (const p of bundle.agentPayments) {
    const assignmentId =
      p.estimate_agent_id ?? bundle.assignedAgents.find((a) => a.agentId === p.agent_id)?.estimateAgentId;
    if (!assignmentId) continue;

    // All agent payments are commissions (reimbursement_from_agent_id is just a reference, not a type distinction)
    paidCommissionByAssignment.set(assignmentId, (paidCommissionByAssignment.get(assignmentId) ?? 0) + p.amount);
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
    const commissionAmount = a.assignedAmount;
    const reimbursementAmount = reimbursementAmountByAssignment.get(a.estimateAgentId) ?? 0;
    const totalAssignedAmount = commissionAmount + reimbursementAmount;

    // Only count commission payments as paid — reimbursements are what we owe agent, not payments to them
    const paidCommission = paidCommissionByAssignment.get(a.estimateAgentId) ?? 0;
    const totalPaidAmount = paidCommission; // Only commission payments count

    const { remainingAmount, status } = computePayoutStatus(totalAssignedAmount, totalPaidAmount);
    return {
      role: "agent",
      assignmentId: a.estimateAgentId,
      personId: a.agentId,
      name: a.name,
      roleDetail: null,
      assignedAmount: totalAssignedAmount,
      paidAmount: totalPaidAmount,
      remainingAmount,
      status,
      notes: a.notes,
      commissionAmount,
      reimbursementAmount,
      paidCommission,
      paidReimbursement: 0, // Reimbursements are never "paid" — they're what's owed
    };
  });

  return [...subPayouts, ...agentPayouts].filter((p) => includeSettled || p.remainingAmount > 0.004);
}

/**
 * Company-wide pending payouts, one row per subcontractor/agent
 * assignment still owed money, with the owning project/client attached
 * — the single source of truth behind both the standalone Pending
 * Payouts page and the Dashboard alert's count/total, so the two can
 * never disagree (previously the Dashboard summary re-derived this
 * same assigned-minus-paid math independently; see
 * getCompanyPendingPayoutsSummary below, now just a thin wrapper over
 * this). Same estimate_agent_id-with-agent_id-fallback matching as
 * computePendingPayouts, extended to also key on estimate_id since an
 * agent can be assigned to more than one project across the company.
 */
export type DetailedPendingPayout = PendingPayout & {
  estimateId: string;
  projectTitle: string;
  estimateNumber: string | null;
  clientName: string | null;
};

export async function getCompanyPendingPayoutsDetailed(companyId: string): Promise<DetailedPendingPayout[]> {
  const [
    { data: subs, error: subsError },
    { data: agents, error: agentsError },
    { data: subPayments, error: subPaymentsError },
    { data: agentPayments, error: agentPaymentsError },
  ] = await Promise.all([
    supabase
      .from("estimate_subcontractors")
      .select("id, estimate_id, subcontractor_id, amount, notes, subcontractors(name, trade)")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("estimate_agents")
      .select("id, estimate_id, agent_id, amount, notes, agents(name)")
      .eq("company_id", companyId)
      .is("deleted_at", null),
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

  const estimateIds = Array.from(
    new Set([...(subs ?? []).map((s) => s.estimate_id), ...(agents ?? []).map((a) => a.estimate_id)])
  );
  let estimates: { id: string; title: string | null; estimate_number: string | null; clients: { name: string } | null }[] = [];
  if (estimateIds.length > 0) {
    const { data, error } = await supabase
      .from("estimates")
      .select("id, title, estimate_number, clients(name)")
      .in("id", estimateIds)
      .eq("is_deleted", false);
    if (error) throw error;
    estimates = (data ?? []) as any;
  }
  const estimateById = new Map(estimates.map((e) => [e.id, e]));

  const paidBySub = new Map<string, number>();
  for (const p of subPayments ?? []) {
    if (!p.estimate_subcontractor_id) continue;
    paidBySub.set(p.estimate_subcontractor_id, (paidBySub.get(p.estimate_subcontractor_id) ?? 0) + p.amount);
  }

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

  const subPayouts: DetailedPendingPayout[] = (subs ?? []).map((s: any) => {
    const paidAmount = paidBySub.get(s.id) ?? 0;
    const { remainingAmount, status } = computePayoutStatus(s.amount ?? 0, paidAmount);
    const est = estimateById.get(s.estimate_id);
    return {
      role: "subcontractor",
      assignmentId: s.id,
      personId: s.subcontractor_id,
      name: s.subcontractors?.name ?? "Subcontractor",
      roleDetail: s.subcontractors?.trade ?? null,
      assignedAmount: s.amount ?? 0,
      paidAmount,
      remainingAmount,
      status,
      notes: s.notes ?? null,
      estimateId: s.estimate_id,
      projectTitle: est?.title || "Untitled Estimate",
      estimateNumber: est?.estimate_number ?? null,
      clientName: est?.clients?.name ?? null,
    };
  });

  const agentPayouts: DetailedPendingPayout[] = (agents ?? []).map((a: any) => {
    const paidAmount = paidByAgent.get(a.id) ?? 0;
    const { remainingAmount, status } = computePayoutStatus(a.amount ?? 0, paidAmount);
    const est = estimateById.get(a.estimate_id);
    return {
      role: "agent",
      assignmentId: a.id,
      personId: a.agent_id,
      name: a.agents?.name ?? "Agent",
      roleDetail: null,
      assignedAmount: a.amount ?? 0,
      paidAmount,
      remainingAmount,
      status,
      notes: a.notes ?? null,
      estimateId: a.estimate_id,
      projectTitle: est?.title || "Untitled Estimate",
      estimateNumber: est?.estimate_number ?? null,
      clientName: est?.clients?.name ?? null,
    };
  });

  return [...subPayouts, ...agentPayouts].filter((p) => p.remainingAmount > 0.004);
}

/** Company-wide pending-payout count + total, for the Dashboard widget
 * — now a thin aggregate over getCompanyPendingPayoutsDetailed so the
 * headline number can never drift from the detailed list it links to. */
export async function getCompanyPendingPayoutsSummary(
  companyId: string
): Promise<{ count: number; totalRemaining: number }> {
  const payouts = await getCompanyPendingPayoutsDetailed(companyId);
  return {
    count: payouts.length,
    totalRemaining: payouts.reduce((sum, p) => sum + p.remainingAmount, 0),
  };
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
  const now = new Date().toISOString();
  // Delete the expense itself
  const { error: expenseError } = await supabase
    .from("estimate_expenses")
    .update({ deleted_at: now })
    .eq("id", id);
  if (expenseError) throw expenseError;

  // Also cascade-delete any associated reimbursement payment (if expense was paid by agent)
  const { error: reimbError } = await supabase
    .from("agent_payments")
    .update({ deleted_at: now })
    .eq("expense_id", id)
    .eq("payment_type", "reimbursement");
  if (reimbError) throw reimbError;
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
  // Restore the expense itself
  const { error: expenseError } = await supabase
    .from("estimate_expenses")
    .update({ deleted_at: null })
    .eq("id", id);
  if (expenseError) throw expenseError;

  // Also restore any associated reimbursement payment (if expense was paid by agent)
  const { error: reimbError } = await supabase
    .from("agent_payments")
    .update({ deleted_at: null })
    .eq("expense_id", id)
    .eq("payment_type", "reimbursement");
  if (reimbError) throw reimbError;
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

  const activeSubcontractorIds = new Set(bundle.assignedSubcontractors.map((s) => s.estimateSubcontractorId));
  const subPaymentEntries: LedgerEntry[] = bundle.subcontractorPayments
    .filter((p) => {
      const assignmentId = p.estimate_subcontractor_id;
      return assignmentId && activeSubcontractorIds.has(assignmentId);
    })
    .map((p) => ({
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

  const activeAgentIds = new Set(bundle.assignedAgents.map((a) => a.estimateAgentId));
  const agentPaymentEntries: LedgerEntry[] = bundle.agentPayments
    .filter((p) => {
      const assignmentId = p.estimate_agent_id ?? bundle.assignedAgents.find((a) => a.agentId === p.agent_id)?.estimateAgentId;
      return assignmentId && activeAgentIds.has(assignmentId);
    })
    .map((p) => ({
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

/**
 * Agent commissions actually paid, restricted to agents currently
 * assigned to the project — mirrors getEffectiveSubcontractorCommitted's
 * "only count currently-assigned rows" scoping. Without this, removing
 * an agent's assignment (the only way to delete their commission entry
 * from the Agent Commissions list) orphaned their payment rows: the row
 * disappeared from the UI with no way to view/manage it, yet its amount
 * stayed stuck in this total forever since a plain sum over all
 * agent_payments doesn't know the assignment was removed. Matches
 * estimate_agent_id, falling back to agent_id — same rule
 * computePendingPayouts already uses.
 */
function getEffectiveAgentPaid(
  assignedAgents: Pick<ProjectBundle["assignedAgents"][number], "estimateAgentId" | "agentId">[],
  agentPayments: Pick<ProjectBundle["agentPayments"][number], "estimate_agent_id" | "agent_id" | "amount">[]
): number {
  const paidByAssignment = new Map<string, number>();
  for (const p of agentPayments) {
    const assignmentId = p.estimate_agent_id ?? assignedAgents.find((a) => a.agentId === p.agent_id)?.estimateAgentId;
    if (!assignmentId) continue;
    paidByAssignment.set(assignmentId, (paidByAssignment.get(assignmentId) ?? 0) + p.amount);
  }
  return assignedAgents.reduce((sum, a) => sum + (paidByAssignment.get(a.estimateAgentId) ?? 0), 0);
}


export function summarizeFinancials(
  estimateTotal: number,
  bundle: Pick<
    ProjectBundle,
    | "expenses"
    | "subcontractorPayments"
    | "agentPayments"
    | "mileageTrips"
    | "changeOrders"
    | "assignedSubcontractors"
    | "assignedAgents"
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
  const agentCommissions = getEffectiveAgentPaid(bundle.assignedAgents, bundle.agentPayments);
  const mileageCosts = bundle.mileageTrips.reduce((sum, t) => sum + (t.reimbursement || 0), 0);

  // Same "revised total = original + approved change orders" formula
  // already established in app/reports/expenses/[id]/page.tsx and the
  // estimate/invoice pages — relocated here so every card on the
  // Expense page gets it consistently instead of computing it ad hoc.
  const approvedChangeOrderTotal = bundle.changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + (co.total_amount || 0), 0);
  const revisedTotal = estimateTotal + approvedChangeOrderTotal;

  // Single source of truth for profit: revenue minus all committed costs
  // Subcontractor and agent costs use committed amounts (not paid-to-date)
  // so profit reflects what will actually leave the bank, not just what
  // has already been spent.
  const totalCosts = materialCosts + laborCosts + subcontractorCosts + agentCommissions + otherExpenses + mileageCosts;
  const profit = revisedTotal - totalCosts;
  const marginPercent = revisedTotal > 0 ? (profit / revisedTotal) * 100 : 0;

  return {
    estimateTotal,
    materialCosts,
    laborCosts,
    subcontractorCosts,
    subcontractorPaidToDate,
    agentCommissions,
    agentReimbursements: 0,
    otherExpenses,
    mileageCosts,
    totalPaid: totalPaidByClient,
    approvedChangeOrderTotal,
    revisedTotal,
    profit,
    marginPercent,
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

/** Identifies budget categories that are approaching or exceeding their limits.
 * Returns alerts for categories that are over 75% of budget. */
export function getBudgetAlerts(comparison: BudgetComparison): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];

  const categories = ['material', 'labor', 'other'] as const;
  for (const category of categories) {
    const data = comparison[category];
    if (data.budget <= 0) continue; // Skip if no budget allocated

    const overageAmount = Math.max(0, data.actual - data.budget);
    const overagePercent = (data.actual / data.budget) * 100;

    // Alert if over 75% of budget
    if (overagePercent >= 75) {
      alerts.push({
        category,
        budget: data.budget,
        actual: data.actual,
        overageAmount,
        overagePercent,
        isCritical: overagePercent > 100, // Critical if over 100%
      });
    }
  }

  return alerts.sort((a, b) => b.overagePercent - a.overagePercent); // Sort by severity
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

/**
 * Per-project financial glance for the Estimates/Invoices list pages —
 * one batched fetch instead of an N+1 getProjectBundle() per row.
 *
 * Each metric has exactly one source, and none is derived from another:
 *   - revenue: estimateTotal + approved change orders (same as
 *     summarizeFinancials()'s revisedTotal). Never touched by anything
 *     below.
 *   - expenses: the full cost basis — materials + labor + other
 *     (estimate_expenses) + subcontractor committed cost
 *     (getEffectiveSubcontractorCommitted, reused as-is) + agent paid
 *     cost (getEffectiveAgentPaid, reused as-is). This is exactly
 *     summarizeFinancials()'s totalProjectCost, just kept per-project
 *     instead of only for the currently-open one.
 *   - profit: revenue - expenses. Nothing else.
 *   - paidOut: read directly from subcontractor_payments/agent_payments
 *     rows — a pure payment-status figure, restricted to assignments
 *     that still exist (removing an assignment shouldn't leave its old
 *     payments permanently inflating this number with no way to see or
 *     reconcile them — same reasoning getEffectiveAgentPaid already
 *     applies to the Expense page's Agent Commissions total). It does
 *     NOT feed into profit — profit only cares what was committed
 *     (expenses), not what's been paid yet.
 *   - remainingPayouts: max(assigned - paid, 0) per current assignment,
 *     the same floor computePayoutStatus() already applies.
 * `hasX` flags distinguish "genuinely zero" from "nothing recorded yet"
 * so the UI can show a placeholder instead of a misleading $0.00.
 */
export type ProjectFinancialSummary = {
  revenue: number;
  expenses: number;
  hasCostData: boolean;
  paidOut: number;
  hasPayouts: boolean;
  remainingPayouts: number;
  hasAssignments: boolean;
  profit: number;
  marginPercent: number;
};

export async function getCompanyProjectFinancialSummaries(
  companyId: string
): Promise<Map<string, ProjectFinancialSummary>> {
  const [estimatesRes, changeOrdersRes, expensesRes, subPaymentsRes, agentPaymentsRes, assignedSubsRes, assignedAgentsRes] =
    await Promise.all([
      supabase.from("estimates").select("id, total").eq("company_id", companyId).eq("is_deleted", false),
      supabase.from("change_orders").select("estimate_id, status, total_amount").eq("company_id", companyId).is("deleted_at", null),
      supabase.from("estimate_expenses").select("estimate_id, amount, tax").eq("company_id", companyId).is("deleted_at", null),
      supabase
        .from("subcontractor_payments")
        .select("estimate_id, estimate_subcontractor_id, amount")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("agent_payments")
        .select("estimate_id, estimate_agent_id, agent_id, amount, payment_type")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase.from("estimate_subcontractors").select("id, estimate_id, amount").eq("company_id", companyId).is("deleted_at", null),
      supabase.from("estimate_agents").select("id, estimate_id, agent_id, amount").eq("company_id", companyId).is("deleted_at", null),
    ]);
  if (estimatesRes.error) throw estimatesRes.error;
  if (changeOrdersRes.error) throw changeOrdersRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (subPaymentsRes.error) throw subPaymentsRes.error;
  if (agentPaymentsRes.error) throw agentPaymentsRes.error;
  if (assignedSubsRes.error) throw assignedSubsRes.error;
  if (assignedAgentsRes.error) throw assignedAgentsRes.error;

  const groupBy = <T extends { estimate_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.estimate_id) ?? [];
      list.push(row);
      map.set(row.estimate_id, list);
    }
    return map;
  };

  const changeOrdersByEst = groupBy((changeOrdersRes.data ?? []) as any);
  const expensesByEst = groupBy((expensesRes.data ?? []) as any);
  const subPaymentsByEst = groupBy((subPaymentsRes.data ?? []) as any);
  const agentPaymentsByEst = groupBy((agentPaymentsRes.data ?? []) as any);
  const assignedSubsByEst = groupBy((assignedSubsRes.data ?? []) as any);
  const assignedAgentsByEst = groupBy((assignedAgentsRes.data ?? []) as any);

  const summaries = new Map<string, ProjectFinancialSummary>();
  for (const est of estimatesRes.data ?? []) {
    const approvedChangeOrderTotal = (changeOrdersByEst.get(est.id) ?? [])
      .filter((co: any) => co.status === "approved")
      .reduce((sum: number, co: any) => sum + (co.total_amount || 0), 0);
    const revenue = (est.total || 0) + approvedChangeOrderTotal;

    const expenseRows = expensesByEst.get(est.id) ?? [];
    const otherExpenses = expenseRows.reduce((sum: number, e: any) => sum + (e.amount || 0) + (e.tax || 0), 0);

    const assignedSubRows = (assignedSubsByEst.get(est.id) ?? []) as any[];
    const assignedAgentRows = (assignedAgentsByEst.get(est.id) ?? []) as any[];
    const subPaymentRows = (subPaymentsByEst.get(est.id) ?? []) as any[];
    const agentPaymentRows = (agentPaymentsByEst.get(est.id) ?? []) as any[];

    const assignedSubs = assignedSubRows.map((s: any) => ({ estimateSubcontractorId: s.id, contractedAmount: s.amount || 0 }));
    const assignedAgents = assignedAgentRows.map((a: any) => ({ estimateAgentId: a.id, agentId: a.agent_id }));
    const subPaymentsForFn = subPaymentRows.map((p: any) => ({ estimate_subcontractor_id: p.estimate_subcontractor_id, amount: p.amount }));
    const agentPaymentsForFn = agentPaymentRows.map((p: any) => ({
      estimate_agent_id: p.estimate_agent_id,
      agent_id: p.agent_id,
      amount: p.amount,
      payment_type: p.payment_type ?? 'commission',
    }));

    // Same two functions summarizeFinancials() uses for the Expense
    // page's cost total — not reimplemented here.
    const subcontractorCosts = getEffectiveSubcontractorCommitted(assignedSubs, subPaymentsForFn);
    const agentCosts = getEffectiveAgentPaid(assignedAgents, agentPaymentsForFn);
    const expenses = otherExpenses + subcontractorCosts + agentCosts;
    const profit = revenue - expenses;
    const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Paid Out and Remaining are independent of the above — read straight
    // from payment rows, restricted to assignments that still exist.
    const subAssignmentIds = new Set(assignedSubRows.map((s: any) => s.id));
    const subPaidByAssignment = new Map<string, number>();
    for (const p of subPaymentRows) {
      if (!subAssignmentIds.has(p.estimate_subcontractor_id)) continue;
      subPaidByAssignment.set(p.estimate_subcontractor_id, (subPaidByAssignment.get(p.estimate_subcontractor_id) ?? 0) + p.amount);
    }
    const subPaidOut = [...subPaidByAssignment.values()].reduce((sum, v) => sum + v, 0);
    const subRemaining = assignedSubRows.reduce(
      (sum: number, s: any) => sum + computePayoutStatus(s.amount || 0, subPaidByAssignment.get(s.id) ?? 0).remainingAmount,
      0
    );

    // Restricted to CURRENT agent assignments only — matching
    // estimate_agent_id (falling back to agent_id) is not enough on its
    // own, since a payment can carry a real estimate_agent_id pointing
    // at an assignment that's since been removed. Without checking that
    // id is still in agentAssignmentIds, an orphaned payment silently
    // counted toward Paid Out even though it's invisible/unmanageable
    // from the UI — the same class of bug getEffectiveAgentPaid already
    // guards against for the Expenses total, just missed here.
    const agentAssignmentIds = new Set(assignedAgentRows.map((a: any) => a.id));
    const agentAssignmentIdByAgent = new Map<string, string>(assignedAgentRows.map((a: any) => [a.agent_id, a.id]));
    const agentCommissionPaidByAssignment = new Map<string, number>();
    const agentReimbursementByAssignment = new Map<string, number>();
    for (const p of agentPaymentRows) {
      const assignmentId = p.estimate_agent_id ?? agentAssignmentIdByAgent.get(p.agent_id);
      if (!assignmentId || !agentAssignmentIds.has(assignmentId)) continue;
      // Only count commission as paid — reimbursements are what agent is owed, not payments to them
      if (p.payment_type === 'commission') {
        agentCommissionPaidByAssignment.set(assignmentId, (agentCommissionPaidByAssignment.get(assignmentId) ?? 0) + p.amount);
      } else {
        agentReimbursementByAssignment.set(assignmentId, (agentReimbursementByAssignment.get(assignmentId) ?? 0) + p.amount);
      }
    }
    const agentPaidOut = [...agentCommissionPaidByAssignment.values()].reduce((sum, v) => sum + v, 0);
    const agentRemaining = assignedAgentRows.reduce(
      (sum: number, a: any) => {
        const commission = a.amount || 0;
        const reimbursement = agentReimbursementByAssignment.get(a.id) ?? 0;
        const totalOwed = commission + reimbursement;
        const paidCommission = agentCommissionPaidByAssignment.get(a.id) ?? 0;
        return sum + computePayoutStatus(totalOwed, paidCommission).remainingAmount;
      },
      0
    );

    summaries.set(est.id, {
      revenue,
      expenses,
      hasCostData: expenseRows.length > 0 || assignedSubRows.length > 0 || assignedAgentRows.length > 0,
      paidOut: subPaidOut + agentPaidOut,
      hasPayouts: subPaidByAssignment.size > 0 || agentCommissionPaidByAssignment.size > 0,
      remainingPayouts: subRemaining + agentRemaining,
      hasAssignments: assignedSubRows.length > 0 || assignedAgentRows.length > 0,
      profit,
      marginPercent,
    });
  }

  return summaries;
}

export type DateRange = "month" | "year" | "all_time";

/** Company-wide expense analytics with optional date filtering.
 * Groups expenses by vendor and category, aggregates assignments/payouts
 * across all projects. Used by the Expense Analytics card to show
 * spending patterns and pending payment totals. */
export async function getCompanyExpenseAnalytics(
  companyId: string,
  dateRange: DateRange = "all_time"
): Promise<ExpenseAnalytics> {
  const now = new Date();
  let dateFilter: string | null = null;

  if (dateRange === "month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    dateFilter = startOfMonth.toISOString();
  } else if (dateRange === "year") {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    dateFilter = startOfYear.toISOString();
  }

  const [
    { data: expenses, error: expensesError },
    { data: subAssignments, error: subError },
    { data: agentAssignments, error: agentError },
    { data: subPayments, error: subPayError },
    { data: agentPayments, error: agentPayError },
    { data: estimates, error: estimatesError },
  ] = await Promise.all([
    dateFilter
      ? supabase
          .from("estimate_expenses")
          .select("vendor, category, amount, tax")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("created_at", dateFilter)
      : supabase
          .from("estimate_expenses")
          .select("vendor, category, amount, tax")
          .eq("company_id", companyId)
          .is("deleted_at", null),
    supabase
      .from("estimate_subcontractors")
      .select("id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("estimate_agents")
      .select("id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("subcontractor_payments")
      .select("estimate_subcontractor_id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("agent_payments")
      .select("estimate_agent_id, agent_id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("estimates")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_deleted", false),
  ]);

  if (expensesError) throw expensesError;
  if (subError) throw subError;
  if (agentError) throw agentError;
  if (subPayError) throw subPayError;
  if (agentPayError) throw agentPayError;
  if (estimatesError) throw estimatesError;

  // Group expenses by vendor
  const vendorMap = new Map<string, { amount: number; count: number }>();
  for (const exp of expenses ?? []) {
    const vendor = exp.vendor || "Uncategorized";
    const total = (exp.amount || 0) + (exp.tax || 0);
    const existing = vendorMap.get(vendor);
    vendorMap.set(vendor, {
      amount: (existing?.amount ?? 0) + total,
      count: (existing?.count ?? 0) + 1,
    });
  }

  // Group expenses by category
  const categoryMap = new Map<string, { amount: number; count: number }>();
  for (const exp of expenses ?? []) {
    const category = exp.category || "other";
    const total = (exp.amount || 0) + (exp.tax || 0);
    const existing = categoryMap.get(category);
    categoryMap.set(category, {
      amount: (existing?.amount ?? 0) + total,
      count: (existing?.count ?? 0) + 1,
    });
  }

  // Aggregate subcontractor assignments and payments
  const subPaidByAssignment = new Map<string, number>();
  for (const p of subPayments ?? []) {
    if (!p.estimate_subcontractor_id) continue;
    subPaidByAssignment.set(
      p.estimate_subcontractor_id,
      (subPaidByAssignment.get(p.estimate_subcontractor_id) ?? 0) + p.amount
    );
  }
  let totalSubAssigned = 0;
  for (const sub of subAssignments ?? []) {
    totalSubAssigned += sub.amount || 0;
  }

  // Aggregate agent assignments and payments
  const agentAssignmentIds = new Set((agentAssignments ?? []).map((a: any) => a.id));
  const agentAssignmentIdByAgentId = new Map<string, string>(
    (agentAssignments ?? []).map((a: any) => [a.agent_id, a.id])
  );
  const agentPaidByAssignment = new Map<string, number>();
  for (const p of agentPayments ?? []) {
    const assignmentId = p.estimate_agent_id ?? agentAssignmentIdByAgentId.get(p.agent_id);
    if (!assignmentId || !agentAssignmentIds.has(assignmentId)) continue;
    agentPaidByAssignment.set(assignmentId, (agentPaidByAssignment.get(assignmentId) ?? 0) + p.amount);
  }
  let totalAgentAssigned = 0;
  for (const agent of agentAssignments ?? []) {
    totalAgentAssigned += agent.amount || 0;
  }

  // Calculate total pending payouts across assignments
  let totalPending = 0;
  for (const sub of subAssignments ?? []) {
    const paid = subPaidByAssignment.get(sub.id) ?? 0;
    const remaining = Math.max((sub.amount || 0) - paid, 0);
    totalPending += remaining;
  }
  for (const agent of agentAssignments ?? []) {
    const paid = agentPaidByAssignment.get(agent.id) ?? 0;
    const remaining = Math.max((agent.amount || 0) - paid, 0);
    totalPending += remaining;
  }

  const topVendors = Array.from(vendorMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const topCategories = Array.from(categoryMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const totalExpenses = Array.from(vendorMap.values()).reduce((sum, v) => sum + v.amount, 0);

  return {
    topVendors,
    topCategories,
    totalExpenses,
    totalSubcontractorAssigned: totalSubAssigned,
    totalAgentAssigned: totalAgentAssigned,
    totalPendingPayouts: totalPending,
    projectCount: estimates?.length ?? 0,
  };
}