/**
 * Real Supabase-backed SubcontractorService — implements the interface
 * from lib/services/subcontractorService.ts against the real
 * `subcontractors` + `estimate_subcontractors` (assignment, despite the
 * name) + `subcontractor_payments` tables. All three already exist live
 * (legacy contractor-pwa schema), already company-scoped by RLS,
 * already wired into the generic audit + soft-delete triggers —
 * confirmed directly against the live Supabase REST schema, not
 * guessed from migration files. No new tables.
 *
 * `subcontractor_payments` has no `payment_type` column at all on the
 * live table — `paymentType` is DERIVED from whether
 * `reimbursement_from_agent_id` is set (reimbursement) or null
 * (payment), rather than adding a column that would duplicate
 * information the FK already carries.
 *
 * getBalance() computes assigned/paid/committed/outstanding DIRECTLY
 * from these rows (contracted amount vs. the live sum of this
 * assignment's non-deleted payments) — NOT from TransactionService's
 * ledger, which has no real backing table and would report stale/zero
 * balances the moment a session restarts. recordPayment still appends
 * to that same ledger too, purely so company-level cash-basis reporting
 * (FinancialEngine.getCompanyFinancials/getTaxSummary) keeps behaving
 * exactly as it did before this service went real — the same pattern
 * ChangeOrderService (already real) already follows for its own ledger
 * bookings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCommittedCostBalance } from "../financialCalculations";
import type {
  Subcontractor,
  SubcontractorAssignment,
  SubcontractorPayment,
  SubcontractorService,
} from "../subcontractorService";
import type { UUID, QueryScope } from "../types";
import type { ValidationService } from "../validationService";
import type { TransactionService } from "../transactionService";

interface SubcontractorRow {
  id: string;
  company_id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  contact_person: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  deleted_at: string | null;
}

interface AssignmentRow {
  estimate_id: string | null;
  id: string;
  company_id: string;
  project_id: string | null;
  subcontractor_id: string;
  amount: number;
  notes: string | null;
  is_final: boolean;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  deleted_at: string | null;
}

interface PaymentRow {
  id: string;
  company_id: string;
  estimate_subcontractor_id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  reimbursement_from_agent_id: string | null;
  change_order_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  deleted_at: string | null;
}

function rowToSubcontractor(row: SubcontractorRow): Subcontractor {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    name: row.name,
    trade: row.trade,
    phone: row.phone,
    contactPerson: row.contact_person,
    isActive: row.is_active,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

function rowToAssignment(row: AssignmentRow): SubcontractorAssignment {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    projectId: (row.project_id ?? "") as UUID,
    estimateId: (row.estimate_id ?? null) as UUID | null,
    subcontractorId: row.subcontractor_id as UUID,
    contractedAmount: row.amount,
    notes: row.notes,
    isFinal: row.is_final,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

function rowToPayment(row: PaymentRow): SubcontractorPayment {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    assignmentId: row.estimate_subcontractor_id as UUID,
    amount: row.amount,
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date,
    // Derived, not stored — see file header.
    paymentType: row.reimbursement_from_agent_id ? "reimbursement" : "payment",
    reimbursementFromAgentId: row.reimbursement_from_agent_id as UUID | null,
    changeOrderId: row.change_order_id as UUID | null,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseSubcontractorService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>,
  // Ledger booking only — see file header. Not the source of truth for
  // any balance this service reports.
  transactionService: TransactionService
): SubcontractorService {
  async function getRoster(companyId: UUID, includeInactive = true): Promise<Subcontractor[]> {
    let query = supabase.from("subcontractors").select("*").eq("company_id", companyId).is("deleted_at", null);
    if (!includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query.order("name", { ascending: true });
    if (error) throw new Error(`Failed to load subcontractor roster: ${error.message}`);
    return (data as SubcontractorRow[]).map(rowToSubcontractor);
  }

  async function createSubcontractor(input: {
    companyId: UUID; name: string; trade?: string | null; phone?: string | null; contactPerson?: string | null; isActive?: boolean;
  }): Promise<Subcontractor> {
    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("subcontractors")
      .insert({
        company_id: input.companyId,
        name: input.name,
        trade: input.trade ?? null,
        phone: input.phone ?? null,
        contact_person: input.contactPerson ?? null,
        is_active: input.isActive ?? true,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create subcontractor: ${error.message}`);
    return rowToSubcontractor(data as SubcontractorRow);
  }

  async function updateSubcontractor(
    subcontractorId: UUID,
    changes: Partial<{ name: string; trade: string | null; phone: string | null; contactPerson: string | null; isActive: boolean }>
  ): Promise<Subcontractor> {
    const payload: Record<string, unknown> = {};
    if (changes.name !== undefined) payload.name = changes.name;
    if (changes.trade !== undefined) payload.trade = changes.trade;
    if (changes.phone !== undefined) payload.phone = changes.phone;
    if (changes.contactPerson !== undefined) payload.contact_person = changes.contactPerson;
    if (changes.isActive !== undefined) payload.is_active = changes.isActive;
    payload.updated_by = await currentUserId();

    const { data, error } = await supabase.from("subcontractors").update(payload).eq("id", subcontractorId).select().single();
    if (error) throw new Error(`Failed to update subcontractor: ${error.message}`);
    return rowToSubcontractor(data as SubcontractorRow);
  }

  async function softDeleteSubcontractor(subcontractorId: UUID, reason: string): Promise<void> {
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("subcontractors")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", subcontractorId);
    if (error) throw new Error(`Failed to delete subcontractor: ${error.message}`);
  }

  async function restoreSubcontractor(subcontractorId: UUID): Promise<void> {
    const { error } = await supabase
      .from("subcontractors")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", subcontractorId);
    if (error) throw new Error(`Failed to restore subcontractor: ${error.message}`);
  }

  async function listAssignments(scope: QueryScope): Promise<Array<SubcontractorAssignment & { subcontractorName: string; trade: string | null }>> {
    let query = supabase.from("estimate_subcontractors").select("*").eq("company_id", scope.companyId).is("deleted_at", null);
    if (scope.projectId) query = query.eq("project_id", scope.projectId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load subcontractor assignments: ${error.message}`);
    const assignments = (data as AssignmentRow[]).map(rowToAssignment);
    if (assignments.length === 0) return [];

    const subIds = Array.from(new Set(assignments.map((a) => a.subcontractorId)));
    const { data: subs, error: subsError } = await supabase.from("subcontractors").select("id, name, trade").in("id", subIds);
    if (subsError) throw new Error(`Failed to load subcontractors for assignments: ${subsError.message}`);
    const subsById = new Map((subs as Array<{ id: string; name: string; trade: string | null }>).map((s) => [s.id, s]));

    return assignments.map((a) => ({
      ...a,
      subcontractorName: subsById.get(a.subcontractorId)?.name ?? "Unknown",
      trade: subsById.get(a.subcontractorId)?.trade ?? null,
    }));
  }

  async function assignToProject(input: {
    companyId: UUID; projectId: UUID; estimateId?: UUID | null; subcontractorId: UUID; contractedAmount: number; notes?: string;
  }): Promise<SubcontractorAssignment> {
    /* ONE ASSIGNMENT PER (SUBCONTRACTOR, ESTIMATE).
     *
     * Enforced here rather than with a DB constraint: several duplicate
     * pairs already exist live from before this rule, and a unique
     * index would fail to create — or would need to silently merge or
     * discard someone's existing data, which is not this function's
     * call to make. Checked at the application layer instead, the same
     * place TeamAssignmentService's message is worded, so a second
     * assign attempt fails the same way for all three payee kinds.
     *
     * Only applies when an estimate is named. A project-level
     * assignment (no estimateId) can still recur — that scope predates
     * this rule and multiple contracts on one project with no estimate
     * attached is a legitimate, unrelated case this does not touch. */
    if (input.estimateId) {
      const { data: existing, error: dupErr } = await supabase
        .from("estimate_subcontractors")
        .select("id")
        .eq("subcontractor_id", input.subcontractorId)
        .eq("estimate_id", input.estimateId)
        .is("deleted_at", null)
        .limit(1);
      if (dupErr) throw new Error(`Failed to check existing assignment: ${dupErr.message}`);
      if (existing && existing.length > 0) {
        throw new Error("This subcontractor is already assigned to this estimate.");
      }
    }

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_subcontractors")
      .insert({
        company_id: input.companyId,
        project_id: input.projectId,
        estimate_id: input.estimateId ?? null,
        subcontractor_id: input.subcontractorId,
        amount: input.contractedAmount,
        notes: input.notes ?? null,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to assign subcontractor to project: ${error.message}`);
    return rowToAssignment(data as AssignmentRow);
  }

  async function getAssignmentRow(assignmentId: UUID): Promise<AssignmentRow> {
    const { data, error } = await supabase.from("estimate_subcontractors").select("*").eq("id", assignmentId).single();
    if (error) throw new Error(`Failed to load assignment: ${error.message}`);
    return data as AssignmentRow;
  }

  async function updateAssignmentAmount(assignmentId: UUID, amount: number): Promise<SubcontractorAssignment> {
    const current = await getAssignmentRow(assignmentId);
    const check = validationService.validateAssignmentAmount({ amount, isFinal: current.is_final, priorAmount: current.amount });
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_subcontractors")
      .update({ amount, updated_by: actorId })
      .eq("id", assignmentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update assignment amount: ${error.message}`);
    return rowToAssignment(data as AssignmentRow);
  }

  async function markAssignmentFinal(assignmentId: UUID): Promise<SubcontractorAssignment> {
    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_subcontractors")
      .update({ is_final: true, updated_by: actorId })
      .eq("id", assignmentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to mark assignment final: ${error.message}`);
    return rowToAssignment(data as AssignmentRow);
  }

  /** Money already paid against THIS assignment's own job — estimate-
   * aware, mirroring FinancialEngine's `sumPaidToPayee`. `estimate_id`
   * is matched exactly, including the null case, so a project-level
   * assignment (no estimate) is only guarded by project-level, equally
   * estimate-less payments — never by a payment that named some other
   * job. */
  async function paidAgainstAssignment(a: AssignmentRow): Promise<number> {
    let query = supabase
      .from("estimate_expenses")
      .select("amount")
      .eq("expense_type", "subcontractor")
      .eq("payee_type", "subcontractor")
      .eq("payee_id", a.subcontractor_id)
      .eq("is_paid", true)
      .is("deleted_at", null);
    query = a.estimate_id ? query.eq("estimate_id", a.estimate_id) : query.is("estimate_id", null);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to check existing payments: ${error.message}`);
    return (data ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount ?? 0), 0);
  }

  async function removeAssignment(assignmentId: UUID, reason: string): Promise<void> {
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));

    const row = await getAssignmentRow(assignmentId);
    const paid = await paidAgainstAssignment(row);
    if (paid > 0) {
      throw new Error(
        `This assignment has already been paid (${paid.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })}). Reverse that payment first if it was recorded in error.`
      );
    }

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("estimate_subcontractors")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", assignmentId);
    if (error) throw new Error(`Failed to remove assignment: ${error.message}`);
  }

  async function recordPayment(input: {
    companyId: UUID; assignmentId: UUID; amount: number; paymentMethod?: string; paymentDate: string;
    paymentType?: "payment" | "reimbursement"; reimbursementFromAgentId?: UUID | null; changeOrderId?: UUID | null;
  }): Promise<SubcontractorPayment> {
    const assignment = await getAssignmentRow(input.assignmentId);
    const actorId = await currentUserId();

    const { data, error } = await supabase
      .from("subcontractor_payments")
      .insert({
        company_id: input.companyId,
        estimate_subcontractor_id: input.assignmentId,
        amount: input.amount,
        payment_method: input.paymentMethod ?? "cash",
        payment_date: input.paymentDate,
        reimbursement_from_agent_id: input.reimbursementFromAgentId ?? null,
        change_order_id: input.changeOrderId ?? null,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to record subcontractor payment: ${error.message}`);
    const payment = rowToPayment(data as PaymentRow);

    // Ledger booking — see file header. Never read back for this
    // service's own balance math (getBalance below).
    await transactionService.append({
      companyId: input.companyId,
      projectId: (assignment.project_id ?? null) as UUID | null,
      type: "subcontractor_payment",
      amount: input.amount,
      referenceId: payment.id,
      referenceType: "subcontractor_payment",
      createdBy: actorId,
      transactionDate: input.paymentDate,
    });

    return payment;
  }

  async function listPayments(scope: QueryScope): Promise<SubcontractorPayment[]> {
    let query = supabase.from("subcontractor_payments").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("payment_date", { ascending: false });
    if (error) throw new Error(`Failed to list subcontractor payments: ${error.message}`);
    return (data as PaymentRow[]).map(rowToPayment);
  }

  async function softDelete(paymentId: UUID, reason: string): Promise<void> {
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("subcontractor_payments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", paymentId);
    if (error) throw new Error(`Failed to delete subcontractor payment: ${error.message}`);
  }

  async function restore(paymentId: UUID): Promise<void> {
    const { error } = await supabase
      .from("subcontractor_payments")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", paymentId);
    if (error) throw new Error(`Failed to restore subcontractor payment: ${error.message}`);
  }

  async function getBalance(assignmentId: UUID) {
    const assignment = await getAssignmentRow(assignmentId);
    const { data: payments, error } = await supabase
      .from("subcontractor_payments")
      .select("amount")
      .eq("estimate_subcontractor_id", assignmentId)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load payments for assignment: ${error.message}`);

    const assigned = assignment.amount;
    const paid = (payments as Array<{ amount: number }>).reduce((sum, p) => sum + p.amount, 0);
    const { committed, outstanding } = calculateCommittedCostBalance(assigned, paid);
    return { assigned, paid, committed, outstanding };
  }

  async function getTotalPaidForYear(subcontractorId: UUID, taxYear: number): Promise<number> {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("estimate_subcontractors")
      .select("id")
      .eq("subcontractor_id", subcontractorId);
    if (assignmentsError) throw new Error(`Failed to load assignments for subcontractor: ${assignmentsError.message}`);
    const assignmentIds = (assignments as Array<{ id: string }>).map((a) => a.id);
    if (assignmentIds.length === 0) return 0;

    const { data: payments, error } = await supabase
      .from("subcontractor_payments")
      .select("amount, payment_date")
      .in("estimate_subcontractor_id", assignmentIds)
      .is("deleted_at", null)
      .gte("payment_date", `${taxYear}-01-01`)
      .lte("payment_date", `${taxYear}-12-31`);
    if (error) throw new Error(`Failed to load payments for tax year: ${error.message}`);

    return (payments as Array<{ amount: number }>).reduce((sum, p) => sum + p.amount, 0);
  }

  return {
    getRoster,
    createSubcontractor,
    updateSubcontractor,
    softDeleteSubcontractor,
    restoreSubcontractor,
    listAssignments,
    assignToProject,
    updateAssignmentAmount,
    markAssignmentFinal,
    removeAssignment,
    recordPayment,
    listPayments,
    softDelete,
    restore,
    getBalance,
    getTotalPaidForYear,
  };
}
