/**
 * Real Supabase-backed AgentCommissionService — the agent-side mirror
 * of supabase/subcontractorService.ts. Implements the interface from
 * lib/services/agentCommissionService.ts against the real `agents` +
 * `estimate_agents` (assignment) + `agent_payments` tables — all three
 * already exist live, already company-scoped by RLS, already wired
 * into the generic audit + soft-delete triggers, confirmed directly
 * against the live Supabase REST schema. No new tables.
 *
 * Unlike subcontractor_payments, `agent_payments` DOES have a real
 * `payment_type` column (default 'commission') and `expense_id` —
 * these map directly to `paymentType`/`reimbursesExpenseId`, no
 * derivation needed.
 *
 * getBalance() computes assigned/paid/committed/outstanding DIRECTLY
 * from `estimate_agents.amount` vs. the live sum of this assignment's
 * non-deleted, COMMISSION-type payments — never from
 * TransactionService's ledger (see subcontractorService.ts's file
 * header for why). recordPayment still appends to that ledger too,
 * purely for company-level cash-basis reporting parity with the
 * in-memory double's documented behavior.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCommittedCostBalance } from "../financialCalculations";
import type { Agent, AgentAssignment, AgentPayment, AgentCommissionService } from "../agentCommissionService";
import type { UUID, QueryScope } from "../types";
import type { ValidationService } from "../validationService";
import type { TransactionService } from "../transactionService";
import type { ExpenseService } from "../expenseService";

interface AgentRow {
  id: string;
  company_id: string;
  name: string;
  commission_rate: number | null;
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
  agent_id: string;
  amount: number;
  notes: string | null;
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
  estimate_agent_id: string | null;
  agent_id: string;
  amount: number;
  payment_type: string;
  payment_date: string;
  reimbursement_from_agent_id: string | null;
  expense_id: string | null;
  change_order_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  deleted_at: string | null;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    name: row.name,
    commissionRate: row.commission_rate,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

function rowToAssignment(row: AssignmentRow): AgentAssignment {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    projectId: (row.project_id ?? "") as UUID,
    estimateId: (row.estimate_id ?? null) as UUID | null,
    agentId: row.agent_id as UUID,
    assignedAmount: row.amount,
    notes: row.notes,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

function rowToPayment(row: PaymentRow): AgentPayment {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    assignmentId: row.estimate_agent_id as UUID | null,
    agentId: row.agent_id as UUID,
    amount: row.amount,
    paymentType: row.payment_type === "reimbursement" ? "reimbursement" : "commission",
    paymentDate: row.payment_date,
    reimbursementFromAgentId: row.reimbursement_from_agent_id as UUID | null,
    reimbursesExpenseId: row.expense_id as UUID | null,
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

export function createSupabaseAgentCommissionService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>,
  // Ledger booking only — see file header.
  transactionService: TransactionService,
  // Reimbursement settlement owns this field — see recordPayment.
  expenseService: ExpenseService
): AgentCommissionService {
  async function getRoster(companyId: UUID): Promise<Agent[]> {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) throw new Error(`Failed to load agent roster: ${error.message}`);
    return (data as AgentRow[]).map(rowToAgent);
  }

  async function createAgent(input: { companyId: UUID; name: string; commissionRate?: number | null }): Promise<Agent> {
    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("agents")
      .insert({ company_id: input.companyId, name: input.name, commission_rate: input.commissionRate ?? null, created_by: actorId })
      .select()
      .single();
    if (error) throw new Error(`Failed to create agent: ${error.message}`);
    return rowToAgent(data as AgentRow);
  }

  async function updateAgent(agentId: UUID, changes: Partial<{ name: string; commissionRate: number | null }>): Promise<Agent> {
    const payload: Record<string, unknown> = {};
    if (changes.name !== undefined) payload.name = changes.name;
    if (changes.commissionRate !== undefined) payload.commission_rate = changes.commissionRate;
    payload.updated_by = await currentUserId();

    const { data, error } = await supabase.from("agents").update(payload).eq("id", agentId).select().single();
    if (error) throw new Error(`Failed to update agent: ${error.message}`);
    return rowToAgent(data as AgentRow);
  }

  async function softDeleteAgent(agentId: UUID, reason: string): Promise<void> {
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("agents")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", agentId);
    if (error) throw new Error(`Failed to delete agent: ${error.message}`);
  }

  async function restoreAgent(agentId: UUID): Promise<void> {
    const { error } = await supabase.from("agents").update({ deleted_at: null, deleted_by: null, delete_reason: null }).eq("id", agentId);
    if (error) throw new Error(`Failed to restore agent: ${error.message}`);
  }

  async function listAssignments(scope: QueryScope): Promise<Array<AgentAssignment & { agentName: string }>> {
    let query = supabase.from("estimate_agents").select("*").eq("company_id", scope.companyId).is("deleted_at", null);
    if (scope.projectId) query = query.eq("project_id", scope.projectId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load agent assignments: ${error.message}`);
    const assignments = (data as AssignmentRow[]).map(rowToAssignment);
    if (assignments.length === 0) return [];

    const agentIds = Array.from(new Set(assignments.map((a) => a.agentId)));
    const { data: agents, error: agentsError } = await supabase.from("agents").select("id, name").in("id", agentIds);
    if (agentsError) throw new Error(`Failed to load agents for assignments: ${agentsError.message}`);
    const agentsById = new Map((agents as Array<{ id: string; name: string }>).map((a) => [a.id, a]));

    return assignments.map((a) => ({ ...a, agentName: agentsById.get(a.agentId)?.name ?? "Unknown" }));
  }

  async function assignToProject(input: { companyId: UUID; projectId: UUID; estimateId?: UUID | null; agentId: UUID; assignedAmount: number; notes?: string }): Promise<AgentAssignment> {
    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_agents")
      .insert({
        company_id: input.companyId,
        project_id: input.projectId,
        estimate_id: input.estimateId ?? null,
        agent_id: input.agentId,
        amount: input.assignedAmount,
        notes: input.notes ?? null,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to assign agent to project: ${error.message}`);
    return rowToAssignment(data as AssignmentRow);
  }

  async function updateAssignmentAmount(assignmentId: UUID, assignedAmount: number): Promise<AgentAssignment> {
    if (assignedAmount < 0) throw new Error("An assigned amount cannot be negative.");
    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("estimate_agents")
      .update({ amount: assignedAmount, updated_by: actorId })
      .eq("id", assignmentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update assignment amount: ${error.message}`);
    return rowToAssignment(data as AssignmentRow);
  }

  async function recordPayment(input: {
    companyId: UUID; agentId: UUID; assignmentId?: UUID | null; amount: number; paymentType: "commission" | "reimbursement";
    paymentDate: string; reimbursementFromAgentId?: UUID | null; reimbursesExpenseId?: UUID | null; changeOrderId?: UUID | null;
  }): Promise<AgentPayment> {
    if (input.paymentType === "reimbursement" && !input.reimbursesExpenseId) {
      throw new Error("reimbursesExpenseId is required for reimbursement payments");
    }

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("agent_payments")
      .insert({
        company_id: input.companyId,
        estimate_agent_id: input.assignmentId ?? null,
        agent_id: input.agentId,
        amount: input.amount,
        payment_type: input.paymentType,
        payment_date: input.paymentDate,
        reimbursement_from_agent_id: input.reimbursementFromAgentId ?? null,
        expense_id: input.reimbursesExpenseId ?? null,
        change_order_id: input.changeOrderId ?? null,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to record agent payment: ${error.message}`);
    const payment = rowToPayment(data as PaymentRow);

    if (input.paymentType === "commission") {
      let projectId: UUID | null = null;
      if (input.assignmentId) {
        const { data: assignment } = await supabase.from("estimate_agents").select("project_id").eq("id", input.assignmentId).maybeSingle();
        projectId = ((assignment as { project_id: string | null } | null)?.project_id ?? null) as UUID | null;
      }
      await transactionService.append({
        companyId: input.companyId,
        projectId,
        type: "agent_commission",
        amount: input.amount,
        referenceId: payment.id,
        referenceType: "agent_payment",
        createdBy: actorId,
        transactionDate: input.paymentDate,
      });
    } else {
      const expense = await expenseService.getById(input.reimbursesExpenseId!);
      await transactionService.append({
        companyId: input.companyId,
        projectId: expense?.projectId ?? null,
        type: "agent_reimbursement_paid",
        amount: input.amount,
        referenceId: payment.id,
        referenceType: "agent_payment",
        createdBy: actorId,
        transactionDate: input.paymentDate,
      });
      // The settlement path owns reimbursementStatus — see
      // ExpenseService.markReimbursed's own doc comment. Never written
      // directly here.
      await expenseService.markReimbursed(input.reimbursesExpenseId!);
    }

    return payment;
  }

  async function listPayments(scope: QueryScope): Promise<AgentPayment[]> {
    let query = supabase.from("agent_payments").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("payment_date", { ascending: false });
    if (error) throw new Error(`Failed to list agent payments: ${error.message}`);
    return (data as PaymentRow[]).map(rowToPayment);
  }

  async function softDelete(paymentId: UUID, reason: string): Promise<void> {
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("agent_payments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", paymentId);
    if (error) throw new Error(`Failed to delete agent payment: ${error.message}`);
  }

  async function restore(paymentId: UUID): Promise<void> {
    const { error } = await supabase
      .from("agent_payments")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", paymentId);
    if (error) throw new Error(`Failed to restore agent payment: ${error.message}`);
  }

  async function getBalance(assignmentId: UUID) {
    const { data: assignment, error: assignmentError } = await supabase
      .from("estimate_agents")
      .select("amount")
      .eq("id", assignmentId)
      .single();
    if (assignmentError) throw new Error(`Failed to load assignment: ${assignmentError.message}`);

    // Only commission-type payments count toward THIS assignment's
    // committed/outstanding balance — a reimbursement settles a
    // different liability (the expense's own reimbursementStatus), see
    // this file's header.
    const { data: payments, error } = await supabase
      .from("agent_payments")
      .select("amount")
      .eq("estimate_agent_id", assignmentId)
      .eq("payment_type", "commission")
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load payments for assignment: ${error.message}`);

    const assigned = (assignment as { amount: number }).amount;
    const paid = (payments as Array<{ amount: number }>).reduce((sum, p) => sum + p.amount, 0);
    const { committed, outstanding } = calculateCommittedCostBalance(assigned, paid);
    return { assigned, paid, committed, outstanding };
  }

  async function getCompensationSummary(agentId: UUID, taxYear: number) {
    const { data: payments, error } = await supabase
      .from("agent_payments")
      .select("amount, payment_type, payment_date")
      .eq("agent_id", agentId)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load agent payments: ${error.message}`);

    const rows = payments as Array<{ amount: number; payment_type: string; payment_date: string }>;
    const totalCommissions = rows.filter((p) => p.payment_type === "commission").reduce((sum, p) => sum + p.amount, 0);
    const totalReimbursements = rows.filter((p) => p.payment_type === "reimbursement").reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = totalCommissions + totalReimbursements;
    const ytdEarnings = rows
      .filter((p) => p.payment_type === "commission" && p.payment_date.startsWith(String(taxYear)))
      .reduce((sum, p) => sum + p.amount, 0);

    // Outstanding payable = sum of every assignment's own outstanding
    // commission balance (getBalance), same source getPayablesSummary
    // uses — not re-derived independently here.
    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from("estimate_agents")
      .select("id")
      .eq("agent_id", agentId)
      .is("deleted_at", null);
    if (assignmentsError) throw new Error(`Failed to load assignments for agent: ${assignmentsError.message}`);
    const balances = await Promise.all((assignmentRows as Array<{ id: string }>).map((a) => getBalance(a.id as UUID)));
    const outstandingPayable = balances.reduce((sum, b) => sum + b.outstanding, 0);

    return { totalCommissions, totalReimbursements, totalPaid, outstandingPayable, ytdEarnings };
  }

  return {
    getRoster,
    createAgent,
    updateAgent,
    softDeleteAgent,
    restoreAgent,
    listAssignments,
    assignToProject,
    updateAssignmentAmount,
    recordPayment,
    listPayments,
    softDelete,
    restore,
    getBalance,
    getCompensationSummary,
  };
}
