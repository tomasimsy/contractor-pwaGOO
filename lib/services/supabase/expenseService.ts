/**
 * Real Supabase-backed ExpenseService — implements the EXISTING
 * ExpenseService interface (lib/services/expenseService.ts) against the
 * live `estimate_expenses` table (shared Supabase project with
 * contractor-pwa; 37 real rows, 11 of them soft-deleted, as of the
 * 2026-08-02 audit).
 *
 * Follows the pattern of supabase/estimateService.ts and
 * supabase/paymentService.ts: no new table, no parallel schema, no
 * arithmetic of its own — every total comes from
 * financialCalculations.calculateExpenseTotals.
 *
 * ============================================================
 * WHY THIS IS THE COST SOURCE OF TRUTH
 * ============================================================
 * FinancialEngine used to sum expense costs out of the append-only
 * transaction ledger. A ledger row cannot be un-appended, so a
 * soft-deleted expense went on costing the project money forever. This
 * service reads the source rows with `deleted_at is null`, so exclusion
 * is one predicate in one place. The ledger is still written for
 * traceability (TRANSACTION_LEDGER.md) — it is just no longer the input
 * to a cost calculation.
 *
 * ============================================================
 * TWO LIVE-DATA HAZARDS THIS HANDLES
 * ============================================================
 *  1. `category` is free text with no constraint and has already drifted
 *     to six spellings of four ideas ('material', 'materials', 'labor',
 *     'travel', 'rental', 'other'). `expense_type` is the constrained
 *     column added by 20260802000000_expenses_module.sql; `category` is
 *     now derived from it by trigger for the original app's benefit.
 *     This service NEVER writes `category`.
 *
 *  2. `project_id` is nullable and IS null on a live row whose
 *     `estimate_id` is set. listForProject resolves both paths, because
 *     dropping those rows would silently understate project cost.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Expense,
  ExpenseCategory,
  ExpenseCreateInput,
  ExpenseService,
  ExpenseTotals,
  ExpenseType,
  ExpenseUpdateInput,
  MileageTrip,
  PaidByType,
  PayeeType,
} from "../expenseService";
import { EXPENSE_TYPES } from "../expenseService";
import type { UUID } from "../types";
import type { ValidationService } from "../validationService";
import type { EstimateService } from "../estimateService";
import { calculateExpenseTotals } from "../financialCalculations";

interface ExpenseRow {
  id: string;
  company_id: string;
  project_id: string | null;
  estimate_id: string | null;
  change_order_id: string | null;
  expense_type: string | null;
  category: string | null;
  description: string | null;
  amount: number | null;
  expense_date: string | null;
  notes: string | null;
  vendor: string | null;
  payee_type: string | null;
  payee_id: string | null;
  paid_by: string | null;
  paid_by_id: string | null;
  paid_by_agent_id: string | null;
  payment_method: string | null;
  is_paid: boolean | null;
  reimbursable: boolean | null;
  reimbursement_status: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

const SELECT = "*";

/** Tolerant of any legacy free-text value — an unrecognised one becomes
 * "miscellaneous" rather than throwing, because this table's history
 * predates the constraint and a report must not crash on old data. */
function toExpenseType(raw: string | null): ExpenseType {
  return (EXPENSE_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as ExpenseType)
    : "miscellaneous";
}

function toCategory(raw: string | null): ExpenseCategory {
  return raw === "material" || raw === "labor" ? raw : "other";
}

function toPaidByType(raw: string | null): PaidByType {
  switch (raw) {
    case "agent":
    case "subcontractor":
    case "employee":
    case "customer":
      return raw;
    default:
      return "company";
  }
}

function toPayeeType(raw: string | null): PayeeType | null {
  switch (raw) {
    case "vendor":
    case "subcontractor":
    case "agent":
    case "employee":
    case "other":
      return raw;
    default:
      return null;
  }
}

function rowToExpense(row: ExpenseRow): Expense {
  const reimbursable = row.reimbursable ?? false;
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    estimateId: row.estimate_id,
    changeOrderId: row.change_order_id,
    expenseType: toExpenseType(row.expense_type),
    category: toCategory(row.category),
    description: row.description,
    amount: row.amount ?? 0,
    expenseDate: row.expense_date ?? (row.created_at ?? "").slice(0, 10),
    notes: row.notes,
    vendor: row.vendor,
    payeeType: toPayeeType(row.payee_type),
    payeeId: row.payee_id,
    paidByType: toPaidByType(row.paid_by),
    paidById: row.paid_by_id ?? row.paid_by_agent_id,
    paidByAgentId: row.paid_by_agent_id,
    paymentMethod: row.payment_method,
    isPaid: row.is_paid ?? true,
    reimbursable,
    reimbursementStatus:
      row.reimbursement_status === "pending" || row.reimbursement_status === "reimbursed"
        ? row.reimbursement_status
        : "not_applicable",
    receiptUrl: row.receipt_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseExpenseService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  // No AuditService dependency: `audit_logs` is trigger-driven for this
  // table and rejects direct inserts, so there is nothing for this
  // service to log that the database is not already logging.
  currentUserId: () => Promise<UUID | null>,
  estimateService: EstimateService
): ExpenseService {
  async function listForProject(projectId: UUID): Promise<Expense[]> {
    // Both attachment paths. A live row exists with project_id null and
    // estimate_id set; querying project_id alone would lose its cost.
    //
    // includeDeleted: true is load-bearing, not optional — financial
    // history is permanent (see this file's header discipline and the
    // business rule this fixes): an expense attached only via
    // estimate_id must stay counted even after its parent estimate is
    // soft-deleted. Excluding deleted estimates here silently dropped
    // real, non-deleted expense rows from every cost total
    // (getTotalsForProject -> FinancialEngine.getProjectFinancials ->
    // Dashboard/Reports) the moment their parent estimate was deleted —
    // found during the deletion-safety audit, confirmed by reading
    // this exact call site.
    const estimates = await estimateService.listForProject(projectId, true);
    const estimateIds = estimates.map((e) => e.id);

    const orClause = estimateIds.length
      ? `project_id.eq.${projectId},estimate_id.in.(${estimateIds.join(",")})`
      : `project_id.eq.${projectId}`;

    const { data, error } = await supabase
      .from("estimate_expenses")
      .select(SELECT)
      .or(orClause)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false });
    if (error) throw new Error(`Failed to load expenses: ${error.message}`);

    // De-duplicate: a row with BOTH project_id and a matching
    // estimate_id satisfies each side of the OR.
    const seen = new Map<string, Expense>();
    for (const row of (data ?? []) as ExpenseRow[]) seen.set(row.id, rowToExpense(row));
    return Array.from(seen.values());
  }

  async function listForEstimate(estimateId: UUID): Promise<Expense[]> {
    const { data, error } = await supabase
      .from("estimate_expenses")
      .select(SELECT)
      .eq("estimate_id", estimateId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false });
    if (error) throw new Error(`Failed to load expenses: ${error.message}`);
    return ((data ?? []) as ExpenseRow[]).map(rowToExpense);
  }

  async function listForCompany(companyId: UUID): Promise<Expense[]> {
    const { data, error } = await supabase
      .from("estimate_expenses")
      .select(SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false });
    if (error) throw new Error(`Failed to load expenses: ${error.message}`);
    return ((data ?? []) as ExpenseRow[]).map(rowToExpense);
  }

  async function getById(expenseId: UUID): Promise<Expense | null> {
    const { data, error } = await supabase.from("estimate_expenses").select(SELECT).eq("id", expenseId).maybeSingle();
    if (error) throw new Error(`Failed to load expense: ${error.message}`);
    return data ? rowToExpense(data as ExpenseRow) : null;
  }

  async function getTotalsForProject(projectId: UUID): Promise<ExpenseTotals> {
    const breakdown = calculateExpenseTotals(await listForProject(projectId));
    return {
      total: breakdown.total,
      byType: Object.fromEntries(EXPENSE_TYPES.map((t) => [t, breakdown.byType[t] ?? 0])) as Record<ExpenseType, number>,
      companyPaid: breakdown.companyPaid,
      outstandingReimbursements: breakdown.outstandingReimbursements,
      unpaid: breakdown.unpaid,
    };
  }

  /** The write payload shared by create and update. `category` is
   * absent on purpose — the database trigger derives it from
   * expense_type, so writing it here would be a second, competing
   * source for the same fact. */
  function toWritePayload(input: ExpenseUpdateInput, existing?: Expense): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const set = <K extends keyof ExpenseUpdateInput>(key: K, column: string) => {
      if (input[key] !== undefined) payload[column] = input[key];
    };

    set("projectId", "project_id");
    set("estimateId", "estimate_id");
    set("changeOrderId", "change_order_id");
    set("expenseType", "expense_type");
    set("amount", "amount");
    set("expenseDate", "expense_date");
    set("description", "description");
    set("notes", "notes");
    set("vendor", "vendor");
    set("payeeType", "payee_type");
    set("payeeId", "payee_id");
    set("paymentMethod", "payment_method");
    set("isPaid", "is_paid");
    set("receiptUrl", "receipt_url");

    if (input.paidByType !== undefined || input.paidById !== undefined) {
      const paidByType = input.paidByType ?? existing?.paidByType ?? "company";
      const paidById = input.paidById !== undefined ? input.paidById : existing?.paidById ?? null;
      payload.paid_by = paidByType;
      payload.paid_by_id = paidById;
      // Legacy mirror — the original app only understands this column.
      // Cleared when the payer is no longer an agent, otherwise a former
      // agent-paid expense keeps showing up in that app's reimbursement
      // views after being reassigned to the company.
      payload.paid_by_agent_id = paidByType === "agent" ? paidById : null;

      if (input.reimbursable === undefined) {
        const reimbursable = paidByType !== "company";
        payload.reimbursable = reimbursable;
        if (!reimbursable) payload.reimbursement_status = "not_applicable";
        // Never silently un-settle something already marked reimbursed.
        else if ((existing?.reimbursementStatus ?? "not_applicable") === "not_applicable") {
          payload.reimbursement_status = "pending";
        }
      }
    }

    if (input.reimbursable !== undefined) {
      payload.reimbursable = input.reimbursable;
      if (!input.reimbursable) payload.reimbursement_status = "not_applicable";
      else if ((existing?.reimbursementStatus ?? "not_applicable") === "not_applicable") {
        payload.reimbursement_status = "pending";
      }
    }

    return payload;
  }

  async function create(input: ExpenseCreateInput): Promise<Expense> {
    if (input.amount <= 0) throw new Error("An expense amount must be greater than zero.");

    const actorId = await currentUserId();
    const payload = {
      ...toWritePayload({ ...input, paidByType: input.paidByType ?? "company" }),
      company_id: input.companyId,
      project_id: input.projectId,
      created_by: actorId,
      updated_by: actorId,
    };

    const { data, error } = await supabase.from("estimate_expenses").insert(payload).select(SELECT).single();
    if (error) throw new Error(`Failed to create expense: ${error.message}`);

    // NO explicit audit call here, on purpose.
    //
    // `audit_logs` is trigger-driven and rejects direct inserts, so a
    // service-level write can only ever fail — it logged a console error
    // on every single expense created. And it was pointless: the trigger
    // already records estimate_expenses create/update/delete with the
    // correct actor_user_id (verified live on this table). An expense's
    // creation is also not a status change, which is the only thing
    // AuditService exposes; it was being forced through the wrong verb
    // to produce a row the database was already writing.
    return rowToExpense(data as ExpenseRow);
  }

  async function update(expenseId: UUID, changes: ExpenseUpdateInput): Promise<Expense> {
    if (changes.amount !== undefined && changes.amount <= 0) {
      throw new Error("An expense amount must be greater than zero.");
    }
    const existing = await getById(expenseId);
    if (!existing) throw new Error("Expense not found");

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_expenses")
      .update({ ...toWritePayload(changes, existing), updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", expenseId)
      .select(SELECT)
      .single();
    if (error) throw new Error(`Failed to update expense: ${error.message}`);

    return rowToExpense(data as ExpenseRow);
  }

  /** Same delete-protection discipline as Project/Estimate/Invoice —
   * blocks only once the reimbursement debt this expense created has
   * actually been SETTLED (reimbursement_status === "reimbursed"), i.e.
   * real cash has already moved to pay someone back for fronting it.
   * A still-pending reimbursement is deliberately NOT blocked — deleting
   * a wrongly-recorded expense before anyone's been paid back is a
   * normal correction (see "deleting a reimbursable expense removes the
   * debt too" in expenses-module.test.ts) and must keep working. */
  async function assertNoFinancialActivity(expenseId: UUID): Promise<void> {
    const existing = await getById(expenseId);
    if (existing?.reimbursementStatus === "reimbursed") {
      throw new Error("Cannot delete this expense: its reimbursement has already been paid out. That payout is a real, settled financial fact.");
    }
  }

  async function softDelete(expenseId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "A delete reason is required.");
    await assertNoFinancialActivity(expenseId);

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("estimate_expenses")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", expenseId);
    if (error) throw new Error(`Failed to delete expense: ${error.message}`);
  }

  async function restore(expenseId: UUID): Promise<void> {
    const { error } = await supabase
      .from("estimate_expenses")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", expenseId);
    if (error) throw new Error(`Failed to restore expense: ${error.message}`);
  }

  async function markReimbursed(expenseId: UUID): Promise<Expense> {
    const existing = await getById(expenseId);
    if (!existing) throw new Error("Expense not found");
    if (!existing.reimbursable) throw new Error("This expense is not reimbursable.");

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_expenses")
      .update({ reimbursement_status: "reimbursed", updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", expenseId)
      .select(SELECT)
      .single();
    if (error) throw new Error(`Failed to mark expense reimbursed: ${error.message}`);
    return rowToExpense(data as ExpenseRow);
  }

  async function listPendingReimbursements(companyId: UUID, payeeId?: UUID): Promise<Expense[]> {
    let query = supabase
      .from("estimate_expenses")
      .select(SELECT)
      .eq("company_id", companyId)
      .eq("reimbursable", true)
      .eq("reimbursement_status", "pending")
      .is("deleted_at", null);
    if (payeeId) query = query.eq("paid_by_id", payeeId);

    const { data, error } = await query.order("expense_date", { ascending: false });
    if (error) throw new Error(`Failed to load pending reimbursements: ${error.message}`);
    return ((data ?? []) as ExpenseRow[]).map(rowToExpense);
  }

  async function listKnownVendors(companyId: UUID): Promise<string[]> {
    const { data, error } = await supabase
      .from("estimate_expenses")
      .select("vendor")
      .eq("company_id", companyId)
      .not("vendor", "is", null)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load vendors: ${error.message}`);

    const names = ((data ?? []) as { vendor: string | null }[])
      .map((r) => r.vendor?.trim())
      .filter((v): v is string => !!v);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }

  // ------------------------------------------------------------
  // Mileage — `mileage_trips` is not part of this module's scope and
  // has no live rows in this Supabase project. Returning empty rather
  // than throwing keeps callers (getBudgetComparison, FinancialEngine)
  // working; the methods stay on the interface so wiring the table
  // later needs no contract change.
  // ------------------------------------------------------------
  async function listMileageForProject(): Promise<MileageTrip[]> {
    return [];
  }

  async function recordMileageTrip(input: {
    companyId: UUID;
    projectId: UUID | null;
    distanceMiles: number;
    reimbursement: number;
  }): Promise<MileageTrip> {
    throw new Error("Mileage tracking is not wired to the database yet.");
    void input;
  }

  async function getBudgetComparison(projectId: UUID) {
    const [estimateStubs, expenses] = await Promise.all([
      estimateService.listForProject(projectId),
      listForProject(projectId),
    ]);
    // listForProject returns estimates WITHOUT line items; the budget
    // side needs them, so they're fetched per estimate.
    const estimates = (await Promise.all(estimateStubs.map((e) => estimateService.getById(e.id)))).filter(
      (e): e is NonNullable<typeof e> => e !== null
    );
    const budgetFor = (cat: ExpenseCategory) =>
      estimates.flatMap((e) => e.lineItems).filter((li) => li.category === cat).reduce((s, li) => s + li.total, 0);
    const actualFor = (cat: ExpenseCategory) =>
      expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0);
    return {
      material: { budget: budgetFor("material"), actual: actualFor("material") },
      labor: { budget: budgetFor("labor"), actual: actualFor("labor") },
      other: { budget: budgetFor("other"), actual: actualFor("other") },
    };
  }

  return {
    listForProject,
    listForEstimate,
    listForCompany,
    getById,
    getTotalsForProject,
    create,
    update,
    softDelete,
    restore,
    markReimbursed,
    listPendingReimbursements,
    listKnownVendors,
    listMileageForProject,
    recordMileageTrip,
    getBudgetComparison,
  };
}
