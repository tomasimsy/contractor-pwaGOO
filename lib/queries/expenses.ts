import { supabase } from "@/lib/supabase/client";
import type {
  AssignedSubcontractor,
  FinancialSummaryData,
  InvoiceRow,
  LedgerEntry,
  NewEntryInput,
  PaymentStatusValue,
  PaymentSummary,
  ProjectBundle,
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
    });
    if (error) throw error;
    return;
  }

  // agent_payment
  const { error } = await supabase.from("agent_payments").insert({
    estimate_id: input.estimateId,
    agent_id: input.agentId,
    company_id: input.companyId,
    amount: input.amount,
    payment_date: input.paymentDate,
    payment_method: input.paymentMethod,
    notes: input.notes,
  });
  if (error) throw error;
}

/** Assigns a subcontractor to a project (amount defaults to 0 — see
 * note on addEntry) so a payment can then be logged against them.
 * Returns the new estimate_subcontractors row for the picker to use
 * immediately without a refetch. */
export async function assignSubcontractorToProject(
  estimateId: string,
  companyId: string,
  subcontractorId: string,
  subcontractorName: string,
  subcontractorTrade: string | null
): Promise<AssignedSubcontractor> {
  const { data, error } = await supabase
    .from("estimate_subcontractors")
    .insert({ estimate_id: estimateId, company_id: companyId, subcontractor_id: subcontractorId, amount: 0 })
    .select("id")
    .single();
  if (error) throw error;

  return {
    estimateSubcontractorId: data.id,
    subcontractorId,
    name: subcontractorName,
    trade: subcontractorTrade,
    contractedAmount: 0,
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
export function summarizeFinancials(
  estimateTotal: number,
  bundle: Pick<ProjectBundle, "expenses" | "subcontractorPayments" | "agentPayments">,
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

  const subcontractorCosts = bundle.subcontractorPayments.reduce((sum, p) => sum + p.amount, 0);
  const agentCommissions = bundle.agentPayments.reduce((sum, p) => sum + p.amount, 0);

  return {
    estimateTotal,
    materialCosts,
    laborCosts,
    subcontractorCosts,
    agentCommissions,
    otherExpenses,
    totalPaid: totalPaidByClient,
  };
}