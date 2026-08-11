/**
 * In-memory reference implementation of every service interface,
 * built for automated testing — not for production. This is what lets
 * "test complete financial workflows" actually run: every service
 * contract in lib/services/ can be exercised end-to-end without a
 * database, and (critically) `createFinancialEngine` — the ONE real
 * implementation this whole architecture depends on — runs completely
 * unmodified against these fakes. If a workflow test passes against
 * this in-memory store, the arithmetic is proven correct independent
 * of whatever the eventual Supabase-backed implementation looks like.
 *
 * Faithfulness requirements this file must honor (violating any of
 * these would make a passing test meaningless):
 *   - Every write that TRANSACTION_LEDGER.md's event map says produces
 *     a ledger row actually calls transactionService.append() with the
 *     documented type/referenceType.
 *   - Soft-deleted records are excluded from getProjectLedger/
 *     getCompanyLedger (never from getAuditTrail) — see
 *     transactionService.ts's doc comment on why this is how "deleted
 *     records must never affect calculations" is actually enforced.
 *   - Validation (ValidationService) and permission checks run before
 *     any write, same as a real implementation would.
 */
import { createFinancialEngine, type FinancialEngine } from "../financialEngine";
import { DEFAULT_ESTIMATE_TERMS_TEMPLATE, type EstimateTermsTemplateKey } from "../../estimateTerms";
import { createFilteringService, type FilteringService } from "../filteringService";
import { createValidationService, type ValidationService } from "../validationService";
import { createReconciliationService, type ReconciliationLogSink, type MutationTrigger } from "../reconciliationService";
import { withAutoReconciliation, resolveProjectIdViaInvoice } from "../autoReconciliation";
import type { ReconciliationReport } from "../types";
import { createGeneralLedgerService } from "../generalLedgerService";
import { createFinancialStatementsService } from "../financialStatementsService";
import { createAccountsReceivableService } from "../accountsReceivableService";
import { createAccountsPayableService } from "../accountsPayableService";
import { createBankReconciliationService } from "../bankReconciliationService";
import { createReportingService } from "../reportingService";
import { createInMemoryPayrollService, type Payee, type PayRun } from "../payrollService";
import { createInMemoryLocationService, type Location } from "../locationService";
import type { ProjectService, Project, CreateProjectInput } from "../projectService";
import type { EstimateService, Estimate, EstimateLineItem, ScopeLine } from "../estimateService";
import type { ChangeOrderService, ChangeOrder, ChangeOrderLineItem } from "../changeOrderService";
import type { InvoiceService, Invoice, InvoiceLineItem, InvoiceLifecycleStatus } from "../invoiceService";
import type { PaymentService, CustomerPayment } from "../paymentService";
import type {
  ExpenseService,
  Expense,
  ExpenseCategory,
  ExpenseType,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  ExpenseTotals,
  MileageTrip,
} from "../expenseService";
import { EXPENSE_TYPES } from "../expenseService";
import type { SubcontractorService, Subcontractor, SubcontractorAssignment, SubcontractorPayment } from "../subcontractorService";
import type { AgentCommissionService, Agent, AgentAssignment, AgentPayment } from "../agentCommissionService";
import type { TeamAssignmentService, TeamAssignment, TeamAssignmentWithName } from "../teamAssignmentService";
import type { ClientService, Client, CreateClientInput } from "../clientService";
import type { CompanyService, CompanySettings } from "../companyService";
import { DEFAULT_COMPANY_SETTINGS, mergeCompanyDefaults } from "../../company";
import type { BillScheduleService, BillSchedule, BillScheduleCreateInput } from "../billScheduleService";
import { advanceBillDate } from "../billScheduleService";
import type { TransactionService, AppendTransactionInput } from "../transactionService";
import type {
  UUID,
  QueryScope,
  PaymentStatus,
  Transaction,
  TransactionType,
  TransactionEffect,
  ReferenceType,
  TransactionAdjustmentInput,
  ProjectStatus,
  EstimateStatus,
  ValidationResult,
} from "../types";
import { TRANSACTION_TYPE_META } from "../types";
import {
  calculateLineItemTotal,
  calculateSubtotal,
  calculateDocumentTotal,
  validateDepositAmount,
  calculateChangeOrderRevenue,
  calculateInvoiceTotal,
  deriveInvoiceStatus,
  derivePaymentStatus,
  calculateRemainingBalance,
  calculateCommittedCostBalance,
  calculateExpenseTotals,
} from "../financialCalculations";

const now = () => new Date().toISOString();
// Web Crypto API's global `crypto.randomUUID()`, not `node:crypto`'s
// import — this file runs in the BROWSER too (every "use client" page
// that calls a still-in-memory service, e.g. TransactionService.append
// from a real Approve button click), and bundling `node:crypto` for
// the client resolves to `crypto-browserify`, which has no
// `randomUUID` at all ("is not a function", discovered live while
// approving a real change order). The global `crypto` object's
// `randomUUID` is native in every modern browser AND in Node 19+
// (this app's server runtime) — no import, no polyfill mismatch.
const id = () => crypto.randomUUID();

/** The full in-memory database this fake stack reads/writes. Exposed
 * so tests can inspect raw state directly when a service method alone
 * isn't enough to assert something (e.g. counting rows). */
export interface InMemoryStore {
  projects: Map<UUID, Project>;
  estimates: Map<UUID, Estimate & { lineItems: EstimateLineItem[] }>;
  changeOrders: Map<UUID, ChangeOrder & { lineItems: ChangeOrderLineItem[] }>;
  invoices: Map<UUID, Invoice & { lineItems: InvoiceLineItem[] }>;
  payments: Map<UUID, CustomerPayment>;
  expenses: Map<UUID, Expense>;
  /** ROOFING scope. Minimal on purpose — just what getScopeLines and
   * the total recalculation need (area identity + the two additive
   * cost sources). The rich inspection fields (defect, photos,
   * measurements) are real but financially inert, so the double does
   * not model them. */
  roofingAreas: Map<UUID, { id: UUID; estimateId: UUID; areaName: string; sequenceNumber: number; estimatedRepairCost: number; deletedAt: string | null }>;
  areaLineItems: Map<UUID, { id: UUID; areaId: UUID; category: "material" | "labor" | "other"; name: string; description: string | null; quantity: number; unitPrice: number; total: number; sequenceNumber: number; deletedAt: string | null }>;
  mileageTrips: Map<UUID, MileageTrip>;
  subcontractors: Map<UUID, Subcontractor>;
  subAssignments: Map<UUID, SubcontractorAssignment & { subcontractorName: string; trade: string | null }>;
  // Found missing during the end-to-end financial audit: subcontractor
  // payments had no dedicated map (only tracked via the ledger + a
  // side-table linking a payment id to its assignment), so there was
  // nowhere for a softDelete to mark a payment deleted. Added to close
  // that gap — same shape every other soft-deletable record already has.
  subcontractorPayments: Map<UUID, SubcontractorPayment>;
  agents: Map<UUID, Agent>;
  agentAssignments: Map<UUID, AgentAssignment & { agentName: string }>;
  agentPayments: Map<UUID, AgentPayment & { reimbursesExpenseId: UUID | null }>;
  ledger: Transaction[];
  /** Every reconciliation run, logged automatically after each
   * create/update/delete/restore — see ReconciliationLogSink and
   * autoReconciliation.ts. Exposed for tests/admin views to inspect
   * "was this checked, and what did it find" after the fact. */
  reconciliationLog: Array<{ report: ReconciliationReport; trigger: MutationTrigger | null }>;
  // Enterprise foundation additions — payroll and multi-location.
  payees: Map<UUID, Payee>;
  payRuns: Map<UUID, PayRun>;
  locations: Map<UUID, Location>;
  /** Prerequisite A (System Integrity Audit) — the four entities that
   * previously had NO in-memory double, meaning team labour, bills,
   * clients, and company settings were untestable at the service
   * level and financialEngine's `deps.teamAssignmentService` was
   * always undefined in every test built on this file, silently
   * resolving every team-labour figure to empty. */
  teamAssignments: Map<UUID, TeamAssignment & { memberName: string }>;
  clients: Map<UUID, Client>;
  /** Keyed by companyId, mirroring the real table's one-row-per-company
   * shape (company_settings.company_id, not unique-constrained but
   * treated as 0-or-1 by every real caller — see lib/company.ts). */
  companySettings: Map<UUID, Partial<CompanySettings>>;
  billSchedules: Map<UUID, BillSchedule>;
}

export function createInMemoryStore(): InMemoryStore {
  return {
    projects: new Map(),
    estimates: new Map(),
    changeOrders: new Map(),
    invoices: new Map(),
    payments: new Map(),
    expenses: new Map(),
    roofingAreas: new Map(),
    areaLineItems: new Map(),
    mileageTrips: new Map(),
    subcontractors: new Map(),
    subAssignments: new Map(),
    subcontractorPayments: new Map(),
    agents: new Map(),
    agentAssignments: new Map(),
    agentPayments: new Map(),
    ledger: [],
    reconciliationLog: [],
    payees: new Map(),
    payRuns: new Map(),
    locations: new Map(),
    teamAssignments: new Map(),
    clients: new Map(),
    companySettings: new Map(),
    billSchedules: new Map(),
  };
}

function referenceIsActive(store: InMemoryStore, referenceType: ReferenceType, referenceId: UUID): boolean {
  switch (referenceType) {
    case "invoice":
      return store.invoices.get(referenceId)?.deletedAt == null;
    case "invoice_payment":
      return store.payments.get(referenceId)?.deletedAt == null;
    case "estimate_expense":
      return store.expenses.get(referenceId)?.deletedAt == null;
    case "subcontractor_payment":
      // Was unconditionally `true` — subcontractor payments had no
      // dedicated map to check deletion against at all. Found during
      // the end-to-end financial audit ("Delete subcontractor
      // payments" had no service method AND, independently, the
      // ledger had no way to honor a deletion even if one existed).
      // Fixed alongside adding SubcontractorService.softDelete.
      return store.subcontractorPayments.get(referenceId)?.deletedAt == null;
    case "agent_payment":
      // Was `!= null` only — existence, not deletion status. An agent
      // payment's ledger row would have stayed active forever even
      // after AgentCommissionService.softDelete (added alongside this
      // fix) marked it deleted. Same audit finding as above.
      return store.agentPayments.get(referenceId)?.deletedAt == null;
    case "change_order":
      // Was unconditionally `true` regardless of deletion — found
      // while building the integration test suite's "Add/Delete Change
      // Orders" workflow: deleting an approved change order did
      // nothing to exclude its booked "change_order_approved" revenue
      // from active calculations, violating "deleted records must
      // never affect calculations" for this one reference type.
      return store.changeOrders.get(referenceId)?.deletedAt == null;
    case "adjustment":
      return true;
    case "payroll_run":
      // No softDelete/restore concept for a paid PayRun in this
      // foundation (see payrollService.ts) — always active, same as
      // "adjustment".
      return true;
  }
}

function createTransactionService(store: InMemoryStore, filteringService: FilteringService): TransactionService {
  function activeLedgerRows(rows: Transaction[]): Transaction[] {
    return rows.filter((tx) => referenceIsActive(store, tx.referenceType, tx.referenceId));
  }

  async function getProjectLedger(projectId: UUID): Promise<Transaction[]> {
    return activeLedgerRows(store.ledger.filter((tx) => tx.projectId === projectId)).sort((a, b) =>
      b.transactionDate.localeCompare(a.transactionDate)
    );
  }

  async function getCompanyLedger(scope: QueryScope): Promise<Transaction[]> {
    const resolved = filteringService.resolveScope(scope);
    let rows = store.ledger.filter((tx) => tx.companyId === resolved.companyId);
    if (resolved.projectId) rows = rows.filter((tx) => tx.projectId === resolved.projectId);
    if (resolved.dateRange) {
      // Filtered by the event's own business date (transactionDate),
      // NOT createdAt (row-insert time) — see Transaction.transactionDate's
      // doc comment for the bug this fixes.
      rows = rows.filter((tx) => {
        const d = new Date(tx.transactionDate);
        return d >= resolved.dateRange!.start && d < resolved.dateRange!.end;
      });
    }
    return activeLedgerRows(rows);
  }

  // Signed amount for one row — every type's sign comes from
  // TRANSACTION_TYPE_META except "adjustment", whose sign is per-row
  // (adjustmentDirection), set by whoever called recordAdjustment.
  function signedAmount(tx: Transaction): number {
    const sign = tx.type === "adjustment" ? tx.adjustmentDirection ?? -1 : TRANSACTION_TYPE_META[tx.type].sign;
    return tx.amount * sign;
  }

  async function getTotalByType(scope: QueryScope, type: TransactionType): Promise<number> {
    const rows = await getCompanyLedger(scope);
    return rows.filter((tx) => tx.type === type).reduce((sum, tx) => sum + signedAmount(tx), 0);
  }

  async function getTotalByEffect(scope: QueryScope, effect: TransactionEffect): Promise<number> {
    const rows = await getCompanyLedger(scope);
    return rows.filter((tx) => TRANSACTION_TYPE_META[tx.type].effect === effect).reduce((sum, tx) => sum + signedAmount(tx), 0);
  }

  async function getAssignmentBalance(assignmentId: UUID) {
    const subAssignment = store.subAssignments.get(assignmentId);
    const agentAssignment = store.agentAssignments.get(assignmentId);
    const assigned = subAssignment?.contractedAmount ?? agentAssignment?.assignedAmount ?? 0;

    const paidRows = store.ledger.filter(
      (tx) =>
        (tx.type === "subcontractor_payment" || tx.type === "agent_commission") &&
        referenceIsActive(store, tx.referenceType, tx.referenceId)
    );
    // Payments reference the payment row, not the assignment directly —
    // resolve through the payment's own assignmentId, same join a real
    // SQL implementation would do.
    let paid = 0;
    for (const tx of paidRows) {
      if (tx.type === "subcontractor_payment") {
        // Subcontractor payments aren't stored in a dedicated map in
        // this fake; the assignment linkage was captured at append()
        // time via a side-table lookup instead — see recordPayment.
        if (subAssignmentPaymentLinks.get(tx.referenceId) === assignmentId) paid += tx.amount;
      } else if (tx.type === "agent_commission") {
        const payment = store.agentPayments.get(tx.referenceId);
        if (payment?.assignmentId === assignmentId) paid += tx.amount;
      }
    }

    const { committed, outstanding } = calculateCommittedCostBalance(assigned, paid);
    return { assigned, paid, committed, outstanding };
  }

  async function getReimbursementBalance(expenseId: UUID) {
    // Gated on the expense's OWN current active status — a real gap
    // found during the Expense/Subcontractor/Agent audit pass:
    // getAssignmentBalance already checks referenceIsActive for its
    // "paid" rows, but this function's "owed" side never checked
    // whether the underlying expense itself is still active. Deleting
    // an agent-paid expense (not the reimbursement payment — the
    // EXPENSE) left this function still reporting the full amount
    // owed forever, since `owedRows` was filtered only by type/id, not
    // by referenceIsActive. The company must not be shown as owing an
    // agent for an expense that's since been removed as invalid.
    const owedRows = referenceIsActive(store, "estimate_expense", expenseId)
      ? store.ledger.filter((tx) => tx.referenceType === "estimate_expense" && tx.referenceId === expenseId && tx.type === "agent_reimbursement_owed")
      : [];
    const owed = owedRows.reduce((s, tx) => s + tx.amount, 0);

    // "paid" rows reference the AGENT PAYMENT itself (referenceType:
    // "agent_payment"), not the expense — a reimbursement payment can
    // be individually deleted (AgentCommissionService.softDelete,
    // added during the financial-audit fix pass) independent of the
    // expense it settles, the same way a customer payment can be
    // deleted independent of its invoice. Found while adding that
    // method: without cross-referencing agentPayments here, deleting
    // a reimbursement payment had no effect on this balance at all —
    // referenceIsActive alone can't help, since the reference here is
    // the expense, which is a different (and still-active) record.
    const paid = store.ledger
      .filter((tx) => tx.type === "agent_reimbursement_paid" && referenceIsActive(store, tx.referenceType, tx.referenceId))
      .filter((tx) => store.agentPayments.get(tx.referenceId)?.reimbursesExpenseId === expenseId)
      .reduce((s, tx) => s + tx.amount, 0);

    // "owed" plays the role of "assigned" here — the liability booked
    // is the commitment, same shape as an assignment's contracted
    // amount, so the same committed-cost/outstanding formula applies.
    const { outstanding } = calculateCommittedCostBalance(owed, paid);
    return { owed, paid, outstanding };
  }

  async function getAuditTrail(referenceType: ReferenceType, referenceId: UUID): Promise<Transaction[]> {
    // Deliberately UNFILTERED by soft-delete — the audit trail must
    // show a deleted record's history too (see this file's header and
    // transactionService.ts's doc comment).
    return store.ledger
      .filter((tx) => tx.referenceType === referenceType && tx.referenceId === referenceId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async function append(input: AppendTransactionInput): Promise<Transaction> {
    const tx: Transaction = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId,
      type: input.type,
      amount: input.amount,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      createdBy: input.createdBy,
      createdAt: now(),
      transactionDate: input.transactionDate,
      notes: input.notes ?? null,
      adjustmentDirection: null, // only ever set by recordAdjustment, never by a normal append()
    };
    store.ledger.push(tx);
    return tx;
  }

  async function recordAdjustment(input: TransactionAdjustmentInput): Promise<Transaction> {
    const tx: Transaction = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId,
      type: "adjustment",
      amount: input.amount,
      referenceId: id(), // adjustments have no source; a synthetic id keeps referenceId non-null
      referenceType: "adjustment",
      transactionDate: input.transactionDate,
      createdBy: input.actorUserId,
      createdAt: now(),
      notes: input.reason,
      adjustmentDirection: input.direction,
    };
    store.ledger.push(tx);
    return tx;
  }

  return { getProjectLedger, getCompanyLedger, getTotalByType, getTotalByEffect, getAssignmentBalance, getReimbursementBalance, getAuditTrail, append, recordAdjustment };
}

// Side table: which assignment a subcontractor_payment ledger row
// belongs to. A real SQL implementation resolves this via
// subcontractor_payments.estimate_subcontractor_id directly; this fake
// has no dedicated subcontractor_payments map, so it tracks the link
// alongside the ledger row it produced.
const subAssignmentPaymentLinks = new Map<UUID, UUID>();

function createProjectService(store: InMemoryStore, validation: ValidationService): ProjectService {
  async function getById(projectId: UUID, includeDeleted = false) {
    const project = store.projects.get(projectId) ?? null;
    if (project && project.deletedAt && !includeDeleted) return null;
    return project;
  }
  async function list(scope: QueryScope) {
    return Array.from(store.projects.values()).filter(
      (p) => p.companyId === scope.companyId && (scope.includeDeleted || !p.deletedAt)
    );
  }
  async function create(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: id(),
      companyId: input.companyId,
      clientId: input.clientId,
      projectNumber: null,
      name: input.name,
      description: input.description ?? null,
      address: input.address ?? null,
      status: "draft",
      startDate: null,
      endDate: null,
      assignedUserId: input.assignedUserId ?? null,
      locationId: input.locationId ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.projects.set(project.id, project);
    return project;
  }
  async function update(projectId: UUID, changes: Partial<Project>) {
    const project = store.projects.get(projectId);
    if (!project) throw new Error("Project not found");
    const updated = { ...project, ...changes, updatedAt: now() };
    store.projects.set(projectId, updated);
    return updated;
  }
  async function changeStatus(projectId: UUID, toStatus: ProjectStatus): Promise<ValidationResult & { project?: Project }> {
    const project = store.projects.get(projectId);
    if (!project) throw new Error("Project not found");
    const result = validation.validateProjectStatusTransition(project.status, toStatus);
    if (!result.valid) return result;
    const updated = await update(projectId, { status: toStatus });
    return { ...result, project: updated };
  }
  async function softDelete(projectId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));

    // Same delete-protection discipline as the real Supabase service —
    // financial history is permanent, so a project with any active
    // estimate/invoice/expense must not be deletable.
    const hasEstimate = Array.from(store.estimates.values()).some((e) => e.projectId === projectId && !e.deletedAt);
    if (hasEstimate) throw new Error("Cannot delete this project: it has active estimates. Delete them first, or use Archive instead once the job is complete/cancelled.");
    const hasInvoice = Array.from(store.invoices.values()).some((i) => i.projectId === projectId && !i.deletedAt);
    if (hasInvoice) throw new Error("Cannot delete this project: it has active invoices (and possibly payments).");
    const hasExpense = Array.from(store.expenses.values()).some((e) => e.projectId === projectId && !e.deletedAt);
    if (hasExpense) throw new Error("Cannot delete this project: it has recorded expenses attached directly to it.");

    await update(projectId, { deletedAt: now(), deleteReason: reason });
  }
  async function restore(projectId: UUID) {
    await update(projectId, { deletedAt: null, deleteReason: null });
  }
  async function getProjectBundle(projectId: UUID) {
    const project = store.projects.get(projectId);
    if (!project) throw new Error("Project not found");
    return {
      project,
      estimateIds: Array.from(store.estimates.values()).filter((e) => e.projectId === projectId).map((e) => e.id),
      invoiceIds: Array.from(store.invoices.values()).filter((i) => i.projectId === projectId).map((i) => i.id),
      changeOrderIds: Array.from(store.changeOrders.values()).filter((c) => c.projectId === projectId).map((c) => c.id),
    };
  }
  return { getById, list, create, update, changeStatus, softDelete, restore, getProjectBundle };
}

function createEstimateService(store: InMemoryStore, validation: ValidationService): EstimateService {
  // subtotal/markup/discount/tax math delegated entirely to
  // financialCalculations.ts (FinancialService's Layer 0 core) — this
  // service no longer implements its own version of that formula.
  function computeTotals(lineItems: EstimateLineItem[], markup: number, discount: number, taxRate: number) {
    const subtotal = calculateSubtotal(lineItems);
    const { total } = calculateDocumentTotal(subtotal, markup, discount, taxRate);
    return { subtotal, total };
  }

  async function getById(estimateId: UUID, includeDeleted = false) {
    const estimate = store.estimates.get(estimateId) ?? null;
    if (estimate && estimate.deletedAt && !includeDeleted) return null;
    return estimate;
  }
  async function listForProject(projectId: UUID, includeDeleted = false) {
    return Array.from(store.estimates.values()).filter((e) => e.projectId === projectId && (includeDeleted || !e.deletedAt));
  }
  async function list(scope: QueryScope) {
    return Array.from(store.estimates.values()).filter((e) => e.companyId === scope.companyId && (scope.includeDeleted || !e.deletedAt));
  }
  async function create(input: {
    companyId: UUID; projectId: UUID; clientId: UUID | null; title?: string; description?: string;
    lineItems: Omit<EstimateLineItem, "id" | "total">[]; markup: number; discount: number; taxRate: number; depositAmount?: number;
    estimateType?: "standard" | "roofing";
    termsTemplate?: EstimateTermsTemplateKey;
  }): Promise<Estimate> {
    for (const li of input.lineItems) {
      const check = validation.validateLineItem(li);
      if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    }
    const lineItems: EstimateLineItem[] = input.lineItems.map((li) => ({ id: id(), ...li, total: calculateLineItemTotal(li) }));
    const { subtotal, total } = computeTotals(lineItems, input.markup, input.discount, input.taxRate);

    const depositCheck = validateDepositAmount(input.depositAmount ?? 0, total);
    if (!depositCheck.valid) throw new Error(depositCheck.message);

    const estimate: Estimate & { lineItems: EstimateLineItem[] } = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId,
      clientId: input.clientId,
      estimateNumber: `EST-${store.estimates.size + 1}`,
      title: input.title ?? null,
      description: input.description ?? null,
      status: "draft",
      subtotal,
      markup: input.markup,
      discount: input.discount,
      taxRate: input.taxRate,
      total,
      depositAmount: input.depositAmount ?? 0,
      estimateType: input.estimateType ?? "standard",
      termsTemplate: input.termsTemplate ?? DEFAULT_ESTIMATE_TERMS_TEMPLATE,
      signature: null,
      customerToken: null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
      lineItems,
    };
    store.estimates.set(estimate.id, estimate);
    return estimate;
  }
  async function updateLineItems(estimateId: UUID, lineItems: Omit<EstimateLineItem, "id" | "total">[]) {
    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");
    // Same refusal as production — a roofing estimate's scope is its
    // roof areas, and items written here would count toward nothing.
    if (estimate.estimateType === "roofing") {
      throw new Error(
        "This is a roofing estimate — its scope lives in roof areas, not line items. Edit it through the roof area editor (RoofingAreaService / EstimateAreaLineItemService)."
      );
    }
    const newLineItems = lineItems.map((li) => ({ id: id(), ...li, total: calculateLineItemTotal(li) }));
    const updated = { ...estimate, lineItems: newLineItems, updatedAt: now() };
    store.estimates.set(estimateId, updated);
    return recalculateTotal(estimateId);
  }
  async function recalculateTotal(estimateId: UUID) {
    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");
    // From getScopeLines, exactly as the Supabase implementation does —
    // otherwise this double would report $0 for every roofing estimate.
    const { subtotal, total } = computeTotals(
      (await getScopeLines(estimateId)) as unknown as EstimateLineItem[],
      estimate.markup, estimate.discount, estimate.taxRate
    );
    const updated = { ...estimate, subtotal, total, updatedAt: now() };
    store.estimates.set(estimateId, updated);
    return updated;
  }
  async function update(
    estimateId: UUID,
    changes: Partial<{ title: string | null; description: string | null; projectId: UUID; clientId: UUID | null; markup: number; discount: number; taxRate: number; depositAmount: number; estimateType: "standard" | "roofing"; termsTemplate: EstimateTermsTemplateKey }>
  ) {
    // Defense-in-depth, matching the real Supabase-backed
    // implementation's guard — subtotal/total are derived and must
    // only ever be set via recalculateTotal().
    for (const forbidden of ["subtotal", "total", "revisedTotal"]) {
      if (forbidden in changes) {
        throw new Error(`EstimateService.update() cannot set "${forbidden}" — it is a derived value. Call recalculateTotal() instead.`);
      }
    }

    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");

    // Same lock as production: an estimate's KIND is immutable once it
    // has scope, because switching moves its total between two
    // different tables and strands the old source.
    if (changes.estimateType !== undefined && changes.estimateType !== estimate.estimateType) {
      const existingScope = await getScopeLines(estimateId);
      if (existingScope.length > 0) {
        throw new Error(
          `This estimate already has scope recorded, so its type cannot be changed from "${estimate.estimateType}" to "${changes.estimateType}". Its total is derived from ${estimate.estimateType === "roofing" ? "roof areas" : "line items"}; switching would strand that scope. Create a new estimate instead.`
        );
      }
    }
    const updated = {
      ...estimate,
      title: changes.title !== undefined ? changes.title : estimate.title,
      description: changes.description !== undefined ? changes.description : estimate.description,
      projectId: changes.projectId !== undefined ? changes.projectId : estimate.projectId,
      clientId: changes.clientId !== undefined ? changes.clientId : estimate.clientId,
      markup: changes.markup !== undefined ? changes.markup : estimate.markup,
      discount: changes.discount !== undefined ? changes.discount : estimate.discount,
      taxRate: changes.taxRate !== undefined ? changes.taxRate : estimate.taxRate,
      depositAmount: changes.depositAmount !== undefined ? changes.depositAmount : estimate.depositAmount,
      estimateType: changes.estimateType !== undefined ? changes.estimateType : estimate.estimateType,
      termsTemplate: changes.termsTemplate !== undefined ? changes.termsTemplate : estimate.termsTemplate,
      updatedAt: now(),
    };
    store.estimates.set(estimateId, updated);
    if (changes.markup !== undefined || changes.discount !== undefined || changes.taxRate !== undefined) {
      return recalculateTotal(estimateId);
    }
    return updated;
  }
  async function changeStatus(estimateId: UUID, toStatus: EstimateStatus): Promise<ValidationResult & { estimate?: Estimate }> {
    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");
    const result = validation.validateEstimateStatusTransition(estimate.status, toStatus);
    if (!result.valid) return result;
    const updated = { ...estimate, status: toStatus, updatedAt: now() };
    store.estimates.set(estimateId, updated);
    return { ...result, estimate: updated };
  }
  async function recordSignature(estimateId: UUID, signature: Estimate["signature"]) {
    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");
    const updated = { ...estimate, signature, updatedAt: now() };
    store.estimates.set(estimateId, updated);
    return updated;
  }
  async function softDelete(estimateId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");

    // Same delete-protection discipline as the real Supabase service.
    const hasInvoice = Array.from(store.invoices.values()).some((i) => i.estimateId === estimateId && !i.deletedAt);
    if (hasInvoice) throw new Error("Cannot delete this estimate: it has an active invoice (and possibly payments). Delete the invoice first if it was created in error.");
    const hasChangeOrder = Array.from(store.changeOrders.values()).some((c) => c.estimateId === estimateId && !c.deletedAt);
    if (hasChangeOrder) throw new Error("Cannot delete this estimate: it has an active change order.");
    const hasExpense = Array.from(store.expenses.values()).some((e) => e.estimateId === estimateId && !e.deletedAt);
    if (hasExpense) throw new Error("Cannot delete this estimate: it has recorded expenses attached to it.");

    store.estimates.set(estimateId, { ...estimate, deletedAt: now(), deleteReason: reason });
  }

  async function restore(estimateId: UUID) {
    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");
    store.estimates.set(estimateId, { ...estimate, deletedAt: null, deleteReason: null });
  }

  /** Mirrors the Supabase implementation's rules exactly — roofing =
   * area line items PLUS each area's estimatedRepairCost; standard =
   * estimate_items. If these two drift, the tests stop proving
   * anything about production. */
  async function getScopeLines(estimateId: UUID): Promise<ScopeLine[]> {
    const estimate = store.estimates.get(estimateId);
    if (!estimate) return [];

    if (estimate.estimateType !== "roofing") {
      return estimate.lineItems.map((li) => ({
        id: li.id, category: li.category, name: li.name, description: li.description,
        quantity: li.quantity, unitPrice: li.unitPrice, unit: li.unit ?? null, total: li.total,
        source: "estimate_item" as const, areaId: null, areaName: null,
      }));
    }

    const areas = Array.from(store.roofingAreas.values())
      .filter((a) => a.estimateId === estimateId && !a.deletedAt)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const areaIds = new Set(areas.map((a) => a.id));
    const lines: ScopeLine[] = [];

    for (const li of Array.from(store.areaLineItems.values())
      .filter((l) => areaIds.has(l.areaId) && !l.deletedAt)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
      const area = store.roofingAreas.get(li.areaId);
      lines.push({
        id: li.id, category: li.category, name: li.name, description: li.description,
        quantity: li.quantity, unitPrice: li.unitPrice, unit: null, total: li.total,
        source: "area_line_item", areaId: li.areaId, areaName: area?.areaName ?? null,
      });
    }
    for (const area of areas) {
      if (area.estimatedRepairCost === 0) continue;
      lines.push({
        id: area.id, category: "other",
        name: `${area.areaName} - Estimated Repair Cost`,
        description: "Materials + labor + tax carried from approved estimate",
        quantity: 1, unitPrice: area.estimatedRepairCost, unit: null,
        total: area.estimatedRepairCost,
        source: "area_repair_cost", areaId: area.id, areaName: area.areaName,
      });
    }
    return lines;
  }

  return { getById, listForProject, list, create, getScopeLines, updateLineItems, update, recalculateTotal, changeStatus, recordSignature, softDelete, restore };
}

/** Extracted from EstimateService during the service-layer completion
 * pass — see changeOrderService.ts's header for why. Logic is
 * unchanged from what used to live in createEstimateService, only
 * relocated. */
function sumChangeOrderLineItems(lineItems: Omit<ChangeOrderLineItem, "id" | "total">[]): number {
  return lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + (item.type === "addition" ? lineTotal : -lineTotal);
  }, 0);
}

function createChangeOrderService(store: InMemoryStore, validation: ValidationService, transactionService: TransactionService, estimateService: EstimateService): ChangeOrderService {
  async function getById(changeOrderId: UUID) {
    return store.changeOrders.get(changeOrderId) ?? null;
  }
  async function listForProject(projectId: UUID) {
    // Was missing the `!c.deletedAt` filter every other service's
    // listForProject already has — found alongside the referenceIsActive
    // gap above. Without it, a deleted change order stayed visible in
    // ChangeOrdersPanel and (worse) listApprovedChangeOrders below,
    // which FinancialEngine reads DIRECTLY (not through the ledger) for
    // revenue — the ledger-level fix alone would not have caught this.
    return Array.from(store.changeOrders.values()).filter((c) => c.projectId === projectId && !c.deletedAt);
  }
  async function listForEstimate(estimateId: UUID) {
    return Array.from(store.changeOrders.values()).filter((c) => c.estimateId === estimateId && !c.deletedAt);
  }
  async function createChangeOrder(input: {
    companyId: UUID; projectId: UUID; estimateId: UUID; changeOrderNumber: string; title: string; description?: string | null;
    lineItems?: Omit<ChangeOrderLineItem, "id" | "total">[]; totalAmount: number; tax: number;
  }): Promise<ChangeOrder> {
    for (const li of input.lineItems ?? []) {
      const check = validation.validateLineItem({ name: li.description, quantity: li.quantity, unitPrice: li.unitPrice });
      if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    }
    const lineItems: ChangeOrderLineItem[] = (input.lineItems ?? []).map((li) => ({ id: id(), ...li, total: li.quantity * li.unitPrice }));
    const totalAmount = input.lineItems ? sumChangeOrderLineItems(input.lineItems) : input.totalAmount;

    const co: ChangeOrder & { lineItems: ChangeOrderLineItem[] } = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId,
      estimateId: input.estimateId,
      changeOrderNumber: input.changeOrderNumber,
      title: input.title,
      description: input.description ?? null,
      status: "pending",
      totalAmount,
      tax: input.tax,
      approvedAt: null,
      signature: null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
      lineItems,
    };
    store.changeOrders.set(co.id, co);
    await estimateService.recalculateTotal(input.estimateId);
    return co;
  }
  async function update(
    changeOrderId: UUID,
    changes: Partial<{ title: string; description: string | null; tax: number; totalAmount: number; lineItems: Omit<ChangeOrderLineItem, "id" | "total">[] }>
  ): Promise<ChangeOrder> {
    const co = store.changeOrders.get(changeOrderId);
    if (!co) throw new Error("Change order not found");
    if (co.status !== "pending" && co.status !== "rejected") throw new Error(`Cannot edit a change order that is already "${co.status}".`);

    let lineItems = co.lineItems;
    let totalAmount = changes.totalAmount ?? co.totalAmount;
    if (changes.lineItems) {
      for (const li of changes.lineItems) {
        const check = validation.validateLineItem({ name: li.description, quantity: li.quantity, unitPrice: li.unitPrice });
        if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
      }
      lineItems = changes.lineItems.map((li) => ({ id: id(), ...li, total: li.quantity * li.unitPrice }));
      totalAmount = sumChangeOrderLineItems(changes.lineItems);
    }

    const updated = {
      ...co,
      title: changes.title !== undefined ? changes.title : co.title,
      description: changes.description !== undefined ? changes.description : co.description,
      tax: changes.tax !== undefined ? changes.tax : co.tax,
      totalAmount,
      lineItems,
      status: co.status === "rejected" ? ("pending" as const) : co.status,
      updatedAt: now(),
    };
    store.changeOrders.set(changeOrderId, updated);
    await estimateService.recalculateTotal(co.estimateId);
    return updated;
  }
  async function changeStatus(changeOrderId: UUID, toStatus: ChangeOrder["status"]): Promise<ValidationResult & { changeOrder?: ChangeOrder }> {
    const co = store.changeOrders.get(changeOrderId);
    if (!co) throw new Error("Change order not found");
    const result = validation.validateChangeOrderStatusTransition(co.status, toStatus);
    if (!result.valid) return result;
    const updated = { ...co, status: toStatus, updatedAt: now() };
    store.changeOrders.set(changeOrderId, updated);
    await estimateService.recalculateTotal(co.estimateId);
    return { ...result, changeOrder: updated };
  }
  async function approveChangeOrder(changeOrderId: UUID, signature?: ChangeOrder["signature"]): Promise<ChangeOrder> {
    const co = store.changeOrders.get(changeOrderId);
    if (!co) throw new Error("Change order not found");
    const updated = {
      ...co,
      status: "approved" as const,
      approvedAt: now(),
      signature: signature !== undefined ? signature : co.signature,
      updatedAt: now(),
    };
    store.changeOrders.set(changeOrderId, updated);
    await transactionService.append({
      companyId: co.companyId,
      projectId: co.projectId,
      type: "change_order_approved",
      amount: calculateChangeOrderRevenue(co.totalAmount, co.tax),
      referenceId: co.id,
      referenceType: "change_order",
      createdBy: null,
      transactionDate: now().slice(0, 10), // ChangeOrder has no date field of its own — approval moment is the event
    });
    return updated;
  }
  async function listApprovedChangeOrders(projectId: UUID) {
    return Array.from(store.changeOrders.values()).filter((c) => c.projectId === projectId && c.status === "approved" && !c.deletedAt);
  }
  async function softDelete(changeOrderId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const co = store.changeOrders.get(changeOrderId);
    if (!co) throw new Error("Change order not found");
    // Same delete-protection discipline as the real Supabase service —
    // "approved" stays deletable (its revenue effect is meant to be
    // reversible), only "invoiced" (already transferred onto an
    // invoice's own total) is blocked.
    if (co.status === "invoiced") {
      throw new Error("Cannot delete this change order: it has already been invoiced, and its amount is now part of that invoice's own total.");
    }
    store.changeOrders.set(changeOrderId, { ...co, deletedAt: now(), deleteReason: reason });
    await estimateService.recalculateTotal(co.estimateId);
  }
  async function restore(changeOrderId: UUID) {
    const co = store.changeOrders.get(changeOrderId);
    if (!co) throw new Error("Change order not found");
    store.changeOrders.set(changeOrderId, { ...co, deletedAt: null, deletedBy: null, deleteReason: null });
    await estimateService.recalculateTotal(co.estimateId);
  }

  return { getById, listForProject, listForEstimate, createChangeOrder, update, changeStatus, approveChangeOrder, listApprovedChangeOrders, softDelete, restore };
}

function createInvoiceService(store: InMemoryStore, transactionService: TransactionService, validation: ValidationService): InvoiceService {
  /** Status is DERIVED on read, never stored — see Invoice.status's doc
   * comment. Every method that returns an invoice runs it through here
   * so no caller can ever observe a stale/contradictory status. */
  function withDerivedStatus<T extends Invoice>(invoice: T): T {
    const amountPaid = Array.from(store.payments.values())
      .filter((p) => p.invoiceId === invoice.id && !p.deletedAt)
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      ...invoice,
      status: deriveInvoiceStatus({
        lifecycleStatus: invoice.lifecycleStatus,
        total: invoice.total,
        amountPaid,
        dueDate: invoice.dueDate,
        today: now().slice(0, 10),
      }),
    };
  }

  async function getById(invoiceId: UUID) {
    const invoice = store.invoices.get(invoiceId);
    return invoice ? withDerivedStatus(invoice) : null;
  }
  async function listForProject(projectId: UUID) {
    return Array.from(store.invoices.values()).filter((i) => i.projectId === projectId && !i.deletedAt).map(withDerivedStatus);
  }
  async function listForCompany(scope: QueryScope) {
    return Array.from(store.invoices.values()).filter((i) => i.companyId === scope.companyId && !i.deletedAt).map(withDerivedStatus);
  }
  async function issueInvoice(
    companyId: UUID,
    projectId: UUID,
    estimateId: UUID | null,
    clientId: UUID | null,
    lineItems: InvoiceLineItem[],
    issueDate: string,
    dueDate: string,
    totalOverride?: { subtotal: number; tax: number; total: number }
  ): Promise<Invoice> {
    // When generated from an estimate, the invoice's total must equal
    // the estimate's total (subtotal + markup - discount + tax) exactly
    // — found by the reconciliation test's "estimate matches invoice"
    // check: summing raw line items here (ignoring the estimate's own
    // markup/discount/taxRate) silently produced a smaller invoice
    // total than what was actually quoted and approved. Standalone
    // invoices (no source estimate) have no markup/discount concept,
    // so they keep the simple line-item sum.
    const subtotal = totalOverride?.subtotal ?? calculateSubtotal(lineItems);
    const tax = totalOverride?.tax ?? 0;
    // calculateInvoiceTotal(subtotal, tax), not calculateDocumentTotal
    // (which takes a tax RATE, not a flat amount, and would silently
    // ignore `tax` here if `total` were ever omitted from an override
    // that DID set a nonzero `tax` — a latent bug found during the
    // post-Estimate-audit pass over Invoices: no current caller
    // happens to hit that combination, but nothing prevented one from
    // doing so and getting a total that quietly excluded its own tax).
    const total = totalOverride?.total ?? calculateInvoiceTotal(subtotal, tax);
    const invoice: Invoice & { lineItems: InvoiceLineItem[] } = {
      id: id(),
      companyId,
      projectId,
      estimateId,
      clientId,
      invoiceNumber: `INV-${store.invoices.size + 1}`,
      lifecycleStatus: "draft",
      status: "draft",
      subtotal,
      tax,
      total,
      issueDate,
      dueDate,
      isLocked: false,
      customerToken: null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
      lineItems,
    };
    store.invoices.set(invoice.id, invoice);
    await transactionService.append({
      companyId,
      projectId,
      type: "invoice_issued",
      amount: total,
      referenceId: invoice.id,
      referenceType: "invoice",
      createdBy: null,
      transactionDate: issueDate,
    });
    return invoice;
  }
  async function createFromEstimate(estimateId: UUID, input: { issueDate: string; dueDate: string }) {
    const estimate = store.estimates.get(estimateId);
    if (!estimate) throw new Error("Estimate not found");
    const lineItems: InvoiceLineItem[] = estimate.lineItems.map((li) => ({ id: id(), name: li.name, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.total }));
    // Reuses calculateDocumentTotal's own `taxedBase`/`tax` output
    // directly, rather than back-deriving the flat tax dollar amount
    // by subtracting from estimate.total (found during the post-
    // Estimate-audit pass: that subtraction independently reconstructs
    // a number calculateDocumentTotal already computed and discarded,
    // a duplicate-calculation risk in its own right — two formulas
    // for the same figure that could drift if either ever changes).
    const { taxedBase, tax, total } = calculateDocumentTotal(estimate.subtotal, estimate.markup, estimate.discount, estimate.taxRate);
    return issueInvoice(estimate.companyId, estimate.projectId, estimateId, estimate.clientId, lineItems, input.issueDate, input.dueDate, {
      subtotal: taxedBase,
      tax,
      total,
    });
  }
  async function createStandalone(input: { companyId: UUID; projectId: UUID; clientId: UUID | null; lineItems: Omit<InvoiceLineItem, "id" | "total">[]; issueDate: string; dueDate: string }) {
    const lineItems: InvoiceLineItem[] = input.lineItems.map((li) => ({ id: id(), ...li, total: calculateLineItemTotal(li) }));
    return issueInvoice(input.companyId, input.projectId, null, input.clientId, lineItems, input.issueDate, input.dueDate);
  }
  async function updateLineItems(invoiceId: UUID, lineItems: Omit<InvoiceLineItem, "id" | "total">[]): Promise<ValidationResult & { invoice?: Invoice }> {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.isLocked) {
      return { valid: false, issues: [{ field: "invoice", code: "locked", message: "This invoice is locked and cannot be edited." }] };
    }
    const newLineItems = lineItems.map((li) => ({ id: id(), ...li, total: calculateLineItemTotal(li) }));
    const subtotal = calculateSubtotal(newLineItems);
    const updated = { ...invoice, lineItems: newLineItems, subtotal, total: calculateInvoiceTotal(subtotal, invoice.tax), updatedAt: now() };
    store.invoices.set(invoiceId, updated);
    return { valid: true, issues: [], invoice: updated };
  }
  async function lock(invoiceId: UUID) {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    const updated = { ...invoice, isLocked: true, updatedAt: now() };
    store.invoices.set(invoiceId, updated);
    return updated;
  }
  async function recordSignature(invoiceId: UUID, signature: { type: "draw" | "type"; value: string; date: string }) {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    // Signing marks the document issued and locks its financials; it
    // is NOT a payment, so the derived status still reflects money.
    const updated = { ...invoice, lifecycleStatus: "sent" as const, isLocked: true, updatedAt: now() };
    store.invoices.set(invoiceId, updated);
    return withDerivedStatus(updated);
  }
  /** Kept for interface compatibility, but status is no longer STORED
   * — it's derived on every read by withDerivedStatus. This now just
   * returns the current derived view; there is nothing to "refresh"
   * into the record, which is the point: a stored status is what
   * allowed live invoices to claim "paid" with zero payments. */
  async function refreshStatus(invoiceId: UUID) {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    return withDerivedStatus(invoice);
  }

  async function changeStatus(invoiceId: UUID, toStatus: InvoiceLifecycleStatus): Promise<ValidationResult & { invoice?: Invoice }> {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    const result = validation.validateInvoiceStatusTransition(invoice.lifecycleStatus, toStatus);
    if (!result.valid) return result;
    // Issuing locks the financials — a document a customer has seen
    // must not have its line items rewritten underneath them.
    const locksOnIssue = toStatus === "sent" || toStatus === "viewed";
    const updated = { ...invoice, lifecycleStatus: toStatus, isLocked: invoice.isLocked || locksOnIssue, updatedAt: now() };
    store.invoices.set(invoiceId, updated);
    return { ...result, invoice: withDerivedStatus(updated) };
  }
  async function softDelete(invoiceId: UUID, reason: string) {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    // Same delete-protection discipline as the real Supabase service —
    // active payments are real cash already collected; deleting the
    // invoice must not silently drop them out of every calculation that
    // resolves them through it.
    const hasActivePayment = Array.from(store.payments.values()).some((p) => p.invoiceId === invoiceId && !p.deletedAt);
    if (hasActivePayment) {
      throw new Error("Cannot delete this invoice: it has active payments recorded against it. Void it instead, or delete the payments first if they were recorded in error.");
    }
    store.invoices.set(invoiceId, { ...invoice, deletedAt: now(), deleteReason: reason });
  }
  async function restore(invoiceId: UUID) {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    store.invoices.set(invoiceId, { ...invoice, deletedAt: null, deleteReason: null });
  }

  return { getById, listForProject, listForCompany, createFromEstimate, createStandalone, updateLineItems, lock, recordSignature, refreshStatus, changeStatus, softDelete, restore };
}

function createPaymentService(store: InMemoryStore, validation: ValidationService, transactionService: TransactionService): PaymentService {
  async function getSummaryForInvoice(invoiceId: UUID) {
    const invoice = store.invoices.get(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    const totalPaid = Array.from(store.payments.values())
      .filter((p) => p.invoiceId === invoiceId && !p.deletedAt)
      .reduce((s, p) => s + p.amount, 0);
    const remainingBalance = calculateRemainingBalance(invoice.total, totalPaid);
    const status = derivePaymentStatus(invoice.total, totalPaid);
    return { totalPaid, remainingBalance, status };
  }
  async function listForInvoice(invoiceId: UUID) {
    // Excludes soft-deleted payments — matching the real Supabase
    // implementation, which filters `deleted_at IS NULL`. Without this
    // the two implementations disagreed: a deleted payment stayed
    // visible in payment history here while correctly vanishing in
    // production. getSummaryForInvoice already filtered correctly, so
    // the list and the totals it sat next to could contradict.
    return Array.from(store.payments.values()).filter((p) => p.invoiceId === invoiceId && !p.deletedAt);
  }
  async function listForCompany(scope: QueryScope) {
    return Array.from(store.payments.values()).filter((p) => p.companyId === scope.companyId && (scope.includeDeleted || !p.deletedAt));
  }
  async function record(input: { companyId: UUID; invoiceId: UUID; amount: number; method: string; paymentDate: string; referenceNumber?: string; notes?: string; allowOverpayment?: boolean }) {
    const summary = await getSummaryForInvoice(input.invoiceId);
    const check = validation.validatePaymentAmount({ amount: input.amount, remainingBalance: summary.remainingBalance, allowOverpayment: input.allowOverpayment ?? false });
    if (!check.valid) return check;

    const invoice = store.invoices.get(input.invoiceId)!;
    const payment: CustomerPayment = {
      id: id(),
      companyId: input.companyId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      method: input.method,
      paymentDate: input.paymentDate,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.payments.set(payment.id, payment);
    await transactionService.append({
      companyId: input.companyId,
      projectId: invoice.projectId,
      type: "customer_payment",
      amount: input.amount,
      referenceId: payment.id,
      referenceType: "invoice_payment",
      createdBy: null,
      transactionDate: input.paymentDate,
    });
    return { valid: true, issues: [], payment };
  }
  async function update(paymentId: UUID, changes: Partial<CustomerPayment>) {
    const payment = store.payments.get(paymentId);
    if (!payment) throw new Error("Payment not found");
    const updated = { ...payment, ...changes, updatedAt: now() };
    store.payments.set(paymentId, updated);

    // Found by the automated test suite: without this, the source row's
    // amount changes but the ledger row appended at record()-time keeps
    // its ORIGINAL amount forever, so FinancialEngine (which sums the
    // ledger, never the source table directly) silently disagrees with
    // what the payment record itself now says. The ledger stays
    // immutable (no row is edited) — a same-type delta row is appended
    // instead, so the sum is correct and the full history (original +
    // correction) is still visible via getAuditTrail.
    if (changes.amount !== undefined && changes.amount !== payment.amount) {
      await transactionService.append({
        companyId: updated.companyId,
        projectId: store.invoices.get(updated.invoiceId)?.projectId ?? null,
        type: "customer_payment",
        amount: changes.amount - payment.amount,
        referenceId: paymentId,
        referenceType: "invoice_payment",
        createdBy: null,
        transactionDate: updated.paymentDate,
        notes: "Correction from update()",
      });
    }
    return updated;
  }
  async function softDelete(paymentId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    // Same delete-protection discipline as the real Supabase service —
    // ordinary corrections (bounced cheque, refund, duplicate) stay
    // allowed; only a payment against an already-voided invoice is
    // blocked, since that invoice's record is meant to stay frozen.
    const payment = store.payments.get(paymentId);
    if (payment && store.invoices.get(payment.invoiceId)?.lifecycleStatus === "void") {
      throw new Error("Cannot delete this payment: its invoice has been voided, and that invoice's record is meant to stay frozen as-is.");
    }
    await update(paymentId, { deletedAt: now(), deleteReason: reason });
  }
  async function restore(paymentId: UUID) {
    await update(paymentId, { deletedAt: null, deleteReason: null });
  }

  /** Batched list — mirrors the Supabase implementation's filter and
   * ordering exactly. */
  async function listForInvoices(invoiceIds: UUID[]): Promise<Record<UUID, CustomerPayment[]>> {
    const result: Record<UUID, CustomerPayment[]> = {};
    for (const id of invoiceIds) result[id] = [];
    for (const p of Array.from(store.payments.values())) {
      if (p.deletedAt || !(p.invoiceId in result)) continue;
      result[p.invoiceId].push(p);
    }
    for (const id of invoiceIds) {
      result[id].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    }
    return result;
  }

  /** Batched form — mirrors the Supabase implementation: one pass over
   * the payments, same per-invoice formulas. */
  async function getSummariesForInvoices(invoices: Array<{ id: UUID; total: number }>) {
    const result: Record<UUID, { totalPaid: number; remainingBalance: number; status: PaymentStatus }> = {};
    for (const inv of invoices) {
      const totalPaid = Array.from(store.payments.values())
        .filter((p) => p.invoiceId === inv.id && !p.deletedAt)
        .reduce((sum, p) => sum + p.amount, 0);
      result[inv.id] = {
        totalPaid,
        remainingBalance: calculateRemainingBalance(inv.total, totalPaid),
        status: derivePaymentStatus(inv.total, totalPaid),
      };
    }
    return result;
  }

  return { listForInvoice, listForInvoices, listForCompany, record, update, softDelete, restore, getSummaryForInvoice, getSummariesForInvoices };
}

function createExpenseService(store: InMemoryStore, validation: ValidationService, transactionService: TransactionService): ExpenseService {
  /** expenseType -> the ledger's coarse cost type. The ledger keeps its
   * three-way split (it is a historical audit record whose shape must
   * not churn); the finer eight-way classification lives on the expense
   * row, which is what FinancialEngine now costs from. */
  const typeToLedgerType: Record<ExpenseType, TransactionType> = {
    materials: "material_expense",
    labor: "labor_expense",
    subcontractor: "other_expense",
    agent_commission: "other_expense",
    permit: "other_expense",
    equipment: "other_expense",
    reimbursement: "other_expense",
    miscellaneous: "other_expense",
  };

  /** Mirrors the database trigger sync_expense_legacy_category so the
   * in-memory double reports the same `category` the real table would. */
  const legacyCategory = (t: ExpenseType): ExpenseCategory =>
    t === "materials" ? "material" : t === "labor" ? "labor" : "other";

  const active = () => Array.from(store.expenses.values()).filter((e) => !e.deletedAt);

  async function listForProject(projectId: UUID) {
    const estimateIds = new Set(
      Array.from(store.estimates.values()).filter((e) => e.projectId === projectId).map((e) => e.id)
    );
    return active().filter((e) => e.projectId === projectId || (e.estimateId !== null && estimateIds.has(e.estimateId)));
  }
  async function listForEstimate(estimateId: UUID) {
    return active().filter((e) => e.estimateId === estimateId);
  }
  async function listForCompany(companyId: UUID) {
    return active().filter((e) => e.companyId === companyId);
  }
  async function getById(expenseId: UUID) {
    return store.expenses.get(expenseId) ?? null;
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

  async function create(input: ExpenseCreateInput) {
    const paidByType = input.paidByType ?? "company";
    const reimbursable = input.reimbursable ?? paidByType !== "company";
    const expense: Expense = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId,
      estimateId: input.estimateId ?? null,
      changeOrderId: input.changeOrderId ?? null,
      expenseType: input.expenseType,
      category: legacyCategory(input.expenseType),
      description: input.description ?? null,
      amount: input.amount,
      expenseDate: input.expenseDate,
      notes: input.notes ?? null,
      vendor: input.vendor ?? null,
      payeeType: input.payeeType ?? null,
      payeeId: input.payeeId ?? null,
      paidByType,
      paidById: input.paidById ?? null,
      paidByAgentId: paidByType === "agent" ? input.paidById ?? null : null,
      paymentMethod: input.paymentMethod ?? null,
      isPaid: input.isPaid ?? true,
      reimbursable,
      reimbursementStatus: reimbursable ? "pending" : "not_applicable",
      receiptUrl: input.receiptUrl ?? null,
      dueDate: input.dueDate ?? null,
      billNumber: input.billNumber ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.expenses.set(expense.id, expense);

    await transactionService.append({
      companyId: input.companyId,
      projectId: input.projectId,
      type: typeToLedgerType[input.expenseType],
      amount: input.amount,
      referenceId: expense.id,
      referenceType: "estimate_expense",
      createdBy: null,
      transactionDate: input.expenseDate,
    });

    if (expense.paidByAgentId) {
      await transactionService.append({
        companyId: input.companyId,
        projectId: input.projectId,
        type: "agent_reimbursement_owed",
        amount: input.amount,
        referenceId: expense.id,
        referenceType: "estimate_expense",
        createdBy: null,
        transactionDate: input.expenseDate,
      });
    }
    return expense;
  }

  /** Internal — applies a patch to the stored row. Separate from the
   * public update() so softDelete/restore/markReimbursed can set fields
   * that are not part of ExpenseUpdateInput. */
  function patch(expenseId: UUID, changes: Partial<Expense>): Expense {
    const expense = store.expenses.get(expenseId);
    if (!expense) throw new Error("Expense not found");
    const updated = { ...expense, ...changes, updatedAt: now() };
    store.expenses.set(expenseId, updated);
    return updated;
  }

  async function update(expenseId: UUID, changes: ExpenseUpdateInput) {
    const expense = store.expenses.get(expenseId);
    if (!expense) throw new Error("Expense not found");

    const next: Partial<Expense> = { ...changes } as Partial<Expense>;
    if (changes.expenseType) next.category = legacyCategory(changes.expenseType);
    if (changes.paidByType !== undefined) {
      const paidByType = changes.paidByType ?? "company";
      next.paidByType = paidByType;
      const paidById = changes.paidById !== undefined ? changes.paidById : expense.paidById;
      next.paidByAgentId = paidByType === "agent" ? paidById ?? null : null;
      if (changes.reimbursable === undefined) {
        const reimbursable = paidByType !== "company";
        next.reimbursable = reimbursable;
        // Never silently un-settle something already reimbursed.
        if (!reimbursable) next.reimbursementStatus = "not_applicable";
        else if (expense.reimbursementStatus === "not_applicable") next.reimbursementStatus = "pending";
      }
    }

    const updated = patch(expenseId, next);

    // Correction row, never an edited one — same pattern as
    // PaymentService.update. The ledger is history; history is appended.
    if (changes.amount !== undefined && changes.amount !== expense.amount) {
      await transactionService.append({
        companyId: updated.companyId,
        projectId: updated.projectId,
        type: typeToLedgerType[updated.expenseType],
        amount: changes.amount - expense.amount,
        referenceId: expenseId,
        referenceType: "estimate_expense",
        createdBy: null,
        transactionDate: updated.expenseDate,
        notes: "Correction from update()",
      });
    }
    return updated;
  }

  async function softDelete(expenseId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    // Same delete-protection discipline as the real Supabase service —
    // a still-pending reimbursement stays deletable (a normal
    // correction before anyone's been paid back); only a SETTLED
    // reimbursement (real cash already paid out) is blocked.
    const expense = store.expenses.get(expenseId);
    if (expense?.reimbursementStatus === "reimbursed") {
      throw new Error("Cannot delete this expense: its reimbursement has already been paid out. That payout is a real, settled financial fact.");
    }
    patch(expenseId, { deletedAt: now(), deleteReason: reason });
  }
  async function restore(expenseId: UUID) {
    patch(expenseId, { deletedAt: null, deleteReason: null });
  }

  async function markReimbursed(expenseId: UUID) {
    const expense = store.expenses.get(expenseId);
    if (!expense) throw new Error("Expense not found");
    if (!expense.reimbursable) throw new Error("This expense is not reimbursable.");
    return patch(expenseId, { reimbursementStatus: "reimbursed" });
  }

  async function listPendingReimbursements(companyId: UUID, payeeId?: UUID) {
    return active().filter(
      (e) =>
        e.companyId === companyId &&
        e.reimbursable &&
        e.reimbursementStatus === "pending" &&
        (!payeeId || e.paidById === payeeId)
    );
  }

  async function listKnownVendors(companyId: UUID) {
    const names = active()
      .filter((e) => e.companyId === companyId && e.vendor)
      .map((e) => e.vendor as string);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }

  async function listMileageForProject(projectId: UUID) {
    return Array.from(store.mileageTrips.values()).filter((m) => m.projectId === projectId);
  }
  async function recordMileageTrip(input: { companyId: UUID; projectId: UUID | null; distanceMiles: number; reimbursement: number }) {
    const trip: MileageTrip = { id: id(), projectId: input.projectId, distanceMiles: input.distanceMiles, reimbursement: input.reimbursement };
    store.mileageTrips.set(trip.id, trip);
    if (input.projectId) {
      await transactionService.append({
        companyId: input.companyId,
        projectId: input.projectId,
        type: "mileage_expense",
        amount: input.reimbursement,
        referenceId: trip.id,
        referenceType: "estimate_expense",
        createdBy: null,
        transactionDate: now().slice(0, 10),
      });
    }
    return trip;
  }
  async function getBudgetComparison(projectId: UUID) {
    // `!e.deletedAt` matches what listForProject already does for the
    // ACTUAL side — without it, a deleted estimate's line items kept
    // forming the BUDGET baseline forever (measured during the
    // Expense/Subcontractor/Agent audit: deleting the only estimate
    // left budget at $900 instead of $0), so budget-vs-actual compared
    // live spending against a quote that no longer exists.
    const estimates = Array.from(store.estimates.values()).filter((e) => e.projectId === projectId && !e.deletedAt);
    const expenses = await listForProject(projectId);
    const budgetFor = (cat: ExpenseCategory) =>
      estimates.flatMap((e) => e.lineItems).filter((li) => li.category === cat).reduce((s, li) => s + li.total, 0);
    const actualFor = (cat: ExpenseCategory) => expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0);
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
    async listBills(companyId: UUID) {
      // Same rule as the Supabase impl: a bill is an expense with a due
      // date. Unpaid first, then soonest due.
      return [...store.expenses.values()]
        .filter((e) => e.companyId === companyId && e.dueDate && !e.deletedAt)
        .sort(
          (a, b) =>
            Number(a.isPaid) - Number(b.isPaid) ||
            (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
        );
    },
    listKnownVendors,
    listMileageForProject,
    recordMileageTrip,
    getBudgetComparison,
  };
}

function createSubcontractorService(store: InMemoryStore, validation: ValidationService, transactionService: TransactionService): SubcontractorService {
  async function getRoster(companyId: UUID, includeInactive = true) {
    return Array.from(store.subcontractors.values()).filter((s) => s.companyId === companyId && (includeInactive || s.isActive) && !s.deletedAt);
  }
  async function createSubcontractor(input: { companyId: UUID; name: string; trade?: string | null; phone?: string | null; contactPerson?: string | null; isActive?: boolean }) {
    const sub: Subcontractor = {
      id: id(),
      companyId: input.companyId,
      name: input.name,
      trade: input.trade ?? null,
      phone: input.phone ?? null,
      contactPerson: input.contactPerson ?? null,
      isActive: input.isActive ?? true,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.subcontractors.set(sub.id, sub);
    return sub;
  }
  async function updateSubcontractor(subcontractorId: UUID, changes: Partial<{ name: string; trade: string | null; phone: string | null; contactPerson: string | null; isActive: boolean }>) {
    const sub = store.subcontractors.get(subcontractorId);
    if (!sub) throw new Error("Subcontractor not found");
    const updated = { ...sub, ...changes, updatedAt: now() };
    store.subcontractors.set(subcontractorId, updated);
    return updated;
  }
  async function softDeleteSubcontractor(subcontractorId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const sub = store.subcontractors.get(subcontractorId);
    if (!sub) throw new Error("Subcontractor not found");
    store.subcontractors.set(subcontractorId, { ...sub, deletedAt: now(), deleteReason: reason });
  }
  async function restoreSubcontractor(subcontractorId: UUID) {
    const sub = store.subcontractors.get(subcontractorId);
    if (!sub) throw new Error("Subcontractor not found");
    store.subcontractors.set(subcontractorId, { ...sub, deletedAt: null, deleteReason: null });
  }
  async function listAssignments(scope: QueryScope) {
    // `!a.deletedAt` is load-bearing, not cosmetic: FinancialEngine
    // reads THIS list directly (getProjectFinancials/
    // getCompanyFinancials) and sums each assignment's committed cost
    // into subcontractorCosts -> totalExpenses -> netProfit. Without
    // the filter, soft-deleting an assignment left its full contracted
    // amount in project costs forever — measured during the Expense/
    // Subcontractor/Agent audit: deleting a $5,000 assignment left
    // subcontractorCosts at $5,000 and netProfit at -$5,800 instead of
    // returning to $0. Every other list* method in this file already
    // filtered deletedAt; these two were the outliers.
    return Array.from(store.subAssignments.values()).filter(
      (a) => a.companyId === scope.companyId && !a.deletedAt && (!scope.projectId || a.projectId === scope.projectId)
    );
  }
  async function assignToProject(input: { companyId: UUID; projectId: UUID; subcontractorId: UUID; contractedAmount: number; notes?: string }) {
    const sub = store.subcontractors.get(input.subcontractorId);
    const assignment: SubcontractorAssignment & { subcontractorName: string; trade: string | null } = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId,
      subcontractorId: input.subcontractorId,
      // Passthrough field on the real service; the in-memory
      // double assigns to a project only, so there is no estimate.
      estimateId: null,
      contractedAmount: input.contractedAmount,
      notes: input.notes ?? null,
      isFinal: false,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
      subcontractorName: sub?.name ?? "Unknown",
      trade: sub?.trade ?? null,
    };
    store.subAssignments.set(assignment.id, assignment);
    return assignment;
  }
  async function updateAssignmentAmount(assignmentId: UUID, amount: number) {
    const assignment = store.subAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    const check = validation.validateAssignmentAmount({ amount, isFinal: assignment.isFinal, priorAmount: assignment.contractedAmount });
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const updated = { ...assignment, contractedAmount: amount, updatedAt: now() };
    store.subAssignments.set(assignmentId, updated);
    return updated;
  }
  async function markAssignmentFinal(assignmentId: UUID) {
    const assignment = store.subAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    const updated = { ...assignment, isFinal: true, updatedAt: now() };
    store.subAssignments.set(assignmentId, updated);
    return updated;
  }
  /** Mirrors the real service's removeAssignment: same paid-guard
   * (via this double's own balance source), same soft-delete shape. */
  async function removeAssignment(assignmentId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const assignment = store.subAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    const balance = await transactionService.getAssignmentBalance(assignmentId);
    if (balance.paid > 0) {
      throw new Error(
        `This assignment has already been paid (${balance.paid.toLocaleString("en-US", { style: "currency", currency: "USD" })}). Reverse that payment first if it was recorded in error.`
      );
    }
    store.subAssignments.set(assignmentId, { ...assignment, deletedAt: now(), deleteReason: reason });
  }
  async function recordPayment(input: { companyId: UUID; assignmentId: UUID; amount: number; paymentMethod?: string; paymentDate: string; paymentType?: "payment" | "reimbursement"; reimbursementFromAgentId?: UUID | null; changeOrderId?: UUID | null }) {
    const assignment = store.subAssignments.get(input.assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    const paymentId = id();
    subAssignmentPaymentLinks.set(paymentId, input.assignmentId);
    await transactionService.append({
      companyId: input.companyId,
      projectId: assignment.projectId,
      type: "subcontractor_payment",
      amount: input.amount,
      referenceId: paymentId,
      referenceType: "subcontractor_payment",
      createdBy: null,
      transactionDate: input.paymentDate,
    });
    // Now actually stored (previously only returned, never retrievable
    // — found during the end-to-end financial audit, which is also
    // why deletion had nowhere to record itself against).
    const payment: SubcontractorPayment = {
      id: paymentId,
      companyId: input.companyId,
      assignmentId: input.assignmentId,
      amount: input.amount,
      paymentMethod: input.paymentMethod ?? null,
      paymentDate: input.paymentDate,
      paymentType: input.paymentType ?? "payment",
      reimbursementFromAgentId: input.reimbursementFromAgentId ?? null,
      changeOrderId: input.changeOrderId ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.subcontractorPayments.set(paymentId, payment);
    return payment;
  }
  async function listPayments(scope: QueryScope) {
    return Array.from(store.subcontractorPayments.values()).filter(
      (p) => p.companyId === scope.companyId && (scope.includeDeleted || !p.deletedAt)
    );
  }
  async function softDelete(paymentId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const payment = store.subcontractorPayments.get(paymentId);
    if (!payment) throw new Error("Subcontractor payment not found");
    store.subcontractorPayments.set(paymentId, { ...payment, deletedAt: now(), deleteReason: reason });
  }
  async function restore(paymentId: UUID) {
    const payment = store.subcontractorPayments.get(paymentId);
    if (!payment) throw new Error("Subcontractor payment not found");
    store.subcontractorPayments.set(paymentId, { ...payment, deletedAt: null, deleteReason: null });
  }
  async function getBalance(assignmentId: UUID) {
    const b = await transactionService.getAssignmentBalance(assignmentId);
    return { assigned: b.assigned, paid: b.paid, committed: b.committed, outstanding: b.outstanding };
  }
  async function getTotalPaidForYear(subcontractorId: UUID, taxYear: number) {
    const assignments = Array.from(store.subAssignments.values()).filter((a) => a.subcontractorId === subcontractorId);
    let total = 0;
    for (const a of assignments) {
      const b = await transactionService.getAssignmentBalance(a.id);
      total += b.paid; // simplified: not actually filtered by taxYear in this fake
    }
    void taxYear;
    return total;
  }

  return {
    getRoster, createSubcontractor, updateSubcontractor, softDeleteSubcontractor, restoreSubcontractor,
    listAssignments, assignToProject, updateAssignmentAmount, markAssignmentFinal, removeAssignment, recordPayment, listPayments, softDelete, restore, getBalance, getTotalPaidForYear,
  };
}

function createAgentCommissionService(store: InMemoryStore, validation: ValidationService, transactionService: TransactionService): AgentCommissionService {
  async function getRoster(companyId: UUID) {
    return Array.from(store.agents.values()).filter((a) => a.companyId === companyId && !a.deletedAt);
  }
  async function createAgent(input: { companyId: UUID; name: string; commissionRate?: number | null }) {
    const agent: Agent = {
      id: id(),
      companyId: input.companyId,
      name: input.name,
      commissionRate: input.commissionRate ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.agents.set(agent.id, agent);
    return agent;
  }
  async function updateAgent(agentId: UUID, changes: Partial<{ name: string; commissionRate: number | null }>) {
    const agent = store.agents.get(agentId);
    if (!agent) throw new Error("Agent not found");
    const updated = { ...agent, ...changes, updatedAt: now() };
    store.agents.set(agentId, updated);
    return updated;
  }
  async function softDeleteAgent(agentId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const agent = store.agents.get(agentId);
    if (!agent) throw new Error("Agent not found");
    store.agents.set(agentId, { ...agent, deletedAt: now(), deleteReason: reason });
  }
  async function restoreAgent(agentId: UUID) {
    const agent = store.agents.get(agentId);
    if (!agent) throw new Error("Agent not found");
    store.agents.set(agentId, { ...agent, deletedAt: null, deleteReason: null });
  }
  async function listAssignments(scope: QueryScope) {
    // See SubcontractorService.listAssignments' comment — same
    // load-bearing deletedAt filter, same reason: FinancialEngine sums
    // this list into agentCosts -> totalExpenses -> netProfit, so a
    // soft-deleted assignment left uncounted here would otherwise keep
    // inflating project costs and understating profit forever.
    return Array.from(store.agentAssignments.values()).filter(
      (a) => a.companyId === scope.companyId && !a.deletedAt && (!scope.projectId || a.projectId === scope.projectId)
    );
  }
  async function assignToProject(input: { companyId: UUID; projectId: UUID; agentId: UUID; assignedAmount: number; notes?: string }) {
    const agent = store.agents.get(input.agentId);
    const assignment: AgentAssignment & { agentName: string } = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId,
      agentId: input.agentId,
      estimateId: null,
      assignedAmount: input.assignedAmount,
      notes: input.notes ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
      agentName: agent?.name ?? "Unknown",
    };
    store.agentAssignments.set(assignment.id, assignment);
    return assignment;
  }

  async function updateAgentAssignmentAmount(assignmentId: UUID, assignedAmount: number) {
    const assignment = store.agentAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    if (assignedAmount < 0) throw new Error("An assigned amount cannot be negative.");
    const updated = { ...assignment, assignedAmount, updatedAt: now() };
    store.agentAssignments.set(assignmentId, updated);
    return updated;
  }
  /** Mirrors the real service's removeAssignment: same paid-guard
   * (via this double's own balance source), same soft-delete shape. */
  async function removeAssignment(assignmentId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const assignment = store.agentAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    const balance = await transactionService.getAssignmentBalance(assignmentId);
    if (balance.paid > 0) {
      throw new Error(
        `This assignment has already been paid (${balance.paid.toLocaleString("en-US", { style: "currency", currency: "USD" })}). Reverse that payment first if it was recorded in error.`
      );
    }
    store.agentAssignments.set(assignmentId, { ...assignment, deletedAt: now(), deleteReason: reason });
  }

  async function recordPayment(input: { companyId: UUID; agentId: UUID; assignmentId?: UUID | null; amount: number; paymentType: "commission" | "reimbursement"; paymentDate: string; reimbursementFromAgentId?: UUID | null; reimbursesExpenseId?: UUID | null; changeOrderId?: UUID | null }): Promise<AgentPayment> {
    const payment: AgentPayment & { reimbursesExpenseId: UUID | null } = {
      id: id(),
      companyId: input.companyId,
      assignmentId: input.assignmentId ?? null,
      agentId: input.agentId,
      amount: input.amount,
      paymentType: input.paymentType,
      paymentDate: input.paymentDate,
      reimbursementFromAgentId: input.reimbursementFromAgentId ?? null,
      reimbursesExpenseId: input.reimbursesExpenseId ?? null,
      changeOrderId: input.changeOrderId ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.agentPayments.set(payment.id, payment);

    if (input.paymentType === "commission") {
      const assignment = input.assignmentId ? store.agentAssignments.get(input.assignmentId) : undefined;
      await transactionService.append({
        companyId: input.companyId,
        projectId: assignment?.projectId ?? null,
        type: "agent_commission",
        amount: input.amount,
        referenceId: payment.id,
        referenceType: "agent_payment",
        createdBy: null,
        transactionDate: input.paymentDate,
      });
    } else {
      if (!input.reimbursesExpenseId) throw new Error("reimbursesExpenseId is required for reimbursement payments");
      const expense = store.expenses.get(input.reimbursesExpenseId);
      await transactionService.append({
        companyId: input.companyId,
        projectId: expense?.projectId ?? null,
        type: "agent_reimbursement_paid",
        amount: input.amount,
        // References the PAYMENT, not the expense — so this specific
        // payment can be individually deleted (softDelete, below)
        // independent of the expense it settles, the same way a
        // customer payment can be deleted independent of its invoice.
        // getReimbursementBalance cross-references
        // agentPayments[referenceId].reimbursesExpenseId to still find
        // "how much of THIS expense's liability is paid."
        referenceId: payment.id,
        referenceType: "agent_payment",
        createdBy: null,
        transactionDate: input.paymentDate,
      });
      syncExpenseReimbursement(input.reimbursesExpenseId);
    }
    return payment;
  }
  /** Writes the settlement outcome back onto the EXPENSE, which is the
   * one place the rest of the app asks "is this still owed?".
   *
   * Without this, settlement had two independent sources of truth — the
   * ledger's reimbursement balance and estimate_expenses.
   * reimbursement_status — and they disagreed the moment a
   * reimbursement was paid: the ledger said settled, the expense still
   * said pending, so the same debt appeared both closed and open
   * depending on which service you asked. The settlement path owns the
   * field; nothing else writes it.
   *
   * This is the seam the Agent module (Prompt 42) plugs into: record the
   * payout, then reflect it on the expense — never a second
   * reimbursement calculation of its own. */
  function syncExpenseReimbursement(expenseId: UUID | null | undefined) {
    if (!expenseId) return;
    const expense = store.expenses.get(expenseId);
    if (!expense || !expense.reimbursable) return;

    const paid = Array.from(store.agentPayments.values())
      .filter((p) => p.reimbursesExpenseId === expenseId && !p.deletedAt)
      .reduce((sum, p) => sum + p.amount, 0);

    store.expenses.set(expenseId, {
      ...expense,
      reimbursementStatus: paid >= expense.amount ? "reimbursed" : "pending",
      updatedAt: now(),
    });
  }

  async function listPayments(scope: QueryScope) {
    return Array.from(store.agentPayments.values()).filter(
      (p) => p.companyId === scope.companyId && (scope.includeDeleted || !p.deletedAt)
    );
  }
  async function softDelete(paymentId: UUID, reason: string) {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const payment = store.agentPayments.get(paymentId);
    if (!payment) throw new Error("Agent payment not found");
    store.agentPayments.set(paymentId, { ...payment, deletedAt: now(), deleteReason: reason });
    syncExpenseReimbursement(payment.reimbursesExpenseId);
  }
  async function restore(paymentId: UUID) {
    const payment = store.agentPayments.get(paymentId);
    if (!payment) throw new Error("Agent payment not found");
    store.agentPayments.set(paymentId, { ...payment, deletedAt: null, deleteReason: null });
    syncExpenseReimbursement(payment.reimbursesExpenseId);
  }
  async function getBalance(assignmentId: UUID) {
    const b = await transactionService.getAssignmentBalance(assignmentId);
    return { assigned: b.assigned, paid: b.paid, committed: b.committed, outstanding: b.outstanding };
  }
  async function getCompensationSummary(agentId: UUID, taxYear: number) {
    const assignments = Array.from(store.agentAssignments.values()).filter((a) => a.agentId === agentId);
    const totalCommissions = assignments.reduce((s, a) => s + a.assignedAmount, 0);
    const payments = Array.from(store.agentPayments.values()).filter((p) => p.agentId === agentId && !p.deletedAt);
    const totalReimbursements = payments.filter((p) => p.paymentType === "reimbursement").reduce((s, p) => s + p.amount, 0);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    let outstandingPayable = 0;
    for (const a of assignments) outstandingPayable += (await transactionService.getAssignmentBalance(a.id)).outstanding;
    void taxYear;
    return { totalCommissions, totalReimbursements, totalPaid, outstandingPayable, ytdEarnings: totalPaid };
  }

  return {
    getRoster, createAgent, updateAgent, softDeleteAgent, restoreAgent,
    listAssignments, assignToProject, updateAssignmentAmount: updateAgentAssignmentAmount, removeAssignment,
    recordPayment, listPayments, softDelete, restore, getBalance, getCompensationSummary,
  };
}

// ======================================================================
// PREREQUISITE A (System Integrity Audit) — the four services that
// previously had no in-memory double: TeamAssignmentService,
// ClientService, CompanyService, BillScheduleService. Same patterns as
// the services above (soft delete with a required reason, deleted rows
// excluded from every list/query, paid-guard mirrored from the real
// Supabase implementations where one exists).
// ======================================================================

/** Mirrors SubcontractorService/AgentCommissionService's in-memory
 * shape. `listForEstimate`/`listAssignments` both exclude soft-deleted
 * rows — the same load-bearing filter those two services' own comments
 * document (FinancialEngine sums these directly into committed cost). */
function createTeamAssignmentService(store: InMemoryStore, validation: ValidationService): TeamAssignmentService {
  // No roster table for team members — they ARE company users
  // (profiles), which this in-memory store has no map for either.
  // "memberName" is therefore just a stable placeholder per userId, the
  // same way agent/subcontractor names are real but a team member's
  // display name would come from `list_company_members` in production.
  const nameFor = (userId: UUID) => `Member ${userId.slice(0, 8)}`;

  async function listForEstimate(estimateId: UUID): Promise<TeamAssignmentWithName[]> {
    return Array.from(store.teamAssignments.values())
      .filter((a) => a.estimateId === estimateId && !a.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function listAssignments(scope: QueryScope): Promise<TeamAssignmentWithName[]> {
    return Array.from(store.teamAssignments.values()).filter(
      (a) => a.companyId === scope.companyId && !a.deletedAt && (!scope.projectId || a.projectId === scope.projectId)
    );
  }

  async function assign(input: {
    companyId: UUID; estimateId: UUID; projectId: UUID | null; userId: UUID; amount: number; notes?: string | null;
  }): Promise<TeamAssignment> {
    // Same partial-unique-index rule the real migration enforces: one
    // LIVE assignment per (estimate, user).
    const clash = Array.from(store.teamAssignments.values()).some(
      (a) => a.estimateId === input.estimateId && a.userId === input.userId && !a.deletedAt
    );
    if (clash) throw new Error("That team member is already assigned to this estimate.");

    const assignment: TeamAssignment & { memberName: string } = {
      id: id(),
      companyId: input.companyId,
      estimateId: input.estimateId,
      projectId: input.projectId,
      userId: input.userId,
      amount: input.amount,
      notes: input.notes ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
      memberName: nameFor(input.userId),
    };
    store.teamAssignments.set(assignment.id, assignment);
    return assignment;
  }

  async function update(assignmentId: UUID, changes: Partial<{ amount: number; notes: string | null }>): Promise<TeamAssignment> {
    const assignment = store.teamAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    if (changes.amount !== undefined && changes.amount < 0) throw new Error("Assigned labor cannot be negative.");
    const updated = {
      ...assignment,
      amount: changes.amount !== undefined ? changes.amount : assignment.amount,
      notes: changes.notes !== undefined ? changes.notes : assignment.notes,
      updatedAt: now(),
    };
    store.teamAssignments.set(assignmentId, updated);
    return updated;
  }

  /** Mirrors the real Supabase implementation's paid-guard exactly
   * (added this session): refuses to remove an assignment that labour
   * has already been paid against, matched the SAME estimate-aware way
   * FinancialEngine matches payments — `expense_type='labor'`,
   * `payee_type='employee'`, `payee_id=userId`, `is_paid`, same
   * `estimate_id` (or both null). */
  async function softDelete(assignmentId: UUID, reason: string): Promise<void> {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const assignment = store.teamAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const paid = Array.from(store.expenses.values())
      .filter(
        (e) =>
          !e.deletedAt &&
          e.expenseType === "labor" &&
          e.payeeType === "employee" &&
          e.payeeId === assignment.userId &&
          e.isPaid &&
          e.estimateId === assignment.estimateId
      )
      .reduce((sum, e) => sum + e.amount, 0);
    if (paid > 0) {
      throw new Error(
        `This assignment has already been paid (${paid.toLocaleString("en-US", { style: "currency", currency: "USD" })} in labour). Delete or reverse that payment first if it was recorded in error.`
      );
    }
    store.teamAssignments.set(assignmentId, { ...assignment, deletedAt: now(), deletedBy: null, deleteReason: reason });
  }

  async function restore(assignmentId: UUID): Promise<void> {
    const assignment = store.teamAssignments.get(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    store.teamAssignments.set(assignmentId, { ...assignment, deletedAt: null, deletedBy: null, deleteReason: null });
  }

  return { listForEstimate, listAssignments, assign, update, softDelete, restore };
}

/** Mirrors ProjectService's shape exactly (same soft-delete/restore/
 * includeDeleted contract) — ClientService's real Supabase
 * implementation follows that identical pattern. */
function createClientService(store: InMemoryStore, validation: ValidationService): ClientService {
  async function getById(clientId: UUID, includeDeleted = false): Promise<Client | null> {
    const client = store.clients.get(clientId);
    if (!client) return null;
    if (client.deletedAt && !includeDeleted) return null;
    return client;
  }

  async function list(scope: QueryScope): Promise<Client[]> {
    return Array.from(store.clients.values()).filter((c) => c.companyId === scope.companyId && !c.deletedAt);
  }

  async function create(input: CreateClientInput): Promise<Client> {
    const client: Client = {
      id: id(),
      companyId: input.companyId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.clients.set(client.id, client);
    return client;
  }

  async function update(clientId: UUID, changes: Partial<Pick<Client, "name" | "email" | "phone" | "address">>): Promise<Client> {
    const client = store.clients.get(clientId);
    if (!client) throw new Error("Client not found");
    const updated = { ...client, ...changes, updatedAt: now() };
    store.clients.set(clientId, updated);
    return updated;
  }

  async function softDelete(clientId: UUID, reason: string): Promise<void> {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const client = store.clients.get(clientId);
    if (!client) throw new Error("Client not found");
    store.clients.set(clientId, { ...client, deletedAt: now(), deleteReason: reason });
  }

  async function restore(clientId: UUID): Promise<void> {
    const client = store.clients.get(clientId);
    if (!client) throw new Error("Client not found");
    store.clients.set(clientId, { ...client, deletedAt: null, deleteReason: null });
  }

  return { getById, list, create, update, softDelete, restore };
}

/** Mirrors lib/company.ts's own contract exactly — `getByCompanyId`
 * always returns a fully-merged CompanySettings (DEFAULT_COMPANY_SETTINGS
 * filling any gap), never null, so a company with no row yet still
 * gets sane values; `update` upserts. Reuses the REAL
 * mergeCompanyDefaults/DEFAULT_COMPANY_SETTINGS from lib/company.ts —
 * not a re-typed copy of the defaults — so this double cannot silently
 * drift from what the real Settings page and PDF/portal routes see. */
function createCompanyService(store: InMemoryStore): CompanyService {
  async function getByCompanyId(companyId: UUID): Promise<CompanySettings> {
    return mergeCompanyDefaults(store.companySettings.get(companyId) ?? null);
  }

  async function update(companyId: UUID, changes: Partial<CompanySettings>): Promise<CompanySettings> {
    const existing = store.companySettings.get(companyId) ?? {};
    const merged = { ...existing, ...changes };
    store.companySettings.set(companyId, merged);
    return mergeCompanyDefaults(merged);
  }

  return { getByCompanyId, update };
}

/** Mirrors billScheduleService.ts's own contract, including its
 * central invariant: `generateDue` writes ORDINARY expense rows
 * through the real ExpenseService (never touches store.expenses
 * directly) — "a schedule is not a cost," so this double must produce
 * the exact same downstream shape a real generated bill would, or a
 * test built on it would prove nothing about double-counting. Reuses
 * the REAL `advanceBillDate` from billScheduleService.ts, not a
 * reimplementation, so date-stepping can't drift between the fake and
 * the genuine article. */
function createBillScheduleService(
  store: InMemoryStore,
  expenseService: ExpenseService,
  validation: ValidationService
): BillScheduleService {
  async function listForCompany(companyId: UUID): Promise<BillSchedule[]> {
    return Array.from(store.billSchedules.values()).filter((b) => b.companyId === companyId && !b.deletedAt);
  }

  async function create(input: BillScheduleCreateInput): Promise<BillSchedule> {
    const schedule: BillSchedule = {
      id: id(),
      companyId: input.companyId,
      projectId: input.projectId ?? null,
      vendor: input.vendor ?? null,
      amount: input.amount,
      expenseType: input.expenseType ?? "miscellaneous",
      notes: input.notes ?? null,
      frequency: input.frequency,
      intervalCount: input.intervalCount ?? 1,
      startDate: input.startDate,
      nextDueDate: input.startDate,
      endDate: input.endDate ?? null,
      maxOccurrences: input.maxOccurrences ?? null,
      occurrencesGenerated: 0,
      isActive: true,
      createdBy: null,
      createdAt: now(),
      updatedBy: null,
      updatedAt: now(),
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.billSchedules.set(schedule.id, schedule);
    return schedule;
  }

  async function update(
    scheduleId: UUID,
    changes: Partial<{ amount: number; vendor: string | null; notes: string | null; isActive: boolean; endDate: string | null }>
  ): Promise<BillSchedule> {
    const schedule = store.billSchedules.get(scheduleId);
    if (!schedule) throw new Error("Bill schedule not found");
    const updated = { ...schedule, ...changes, updatedAt: now() };
    store.billSchedules.set(scheduleId, updated);
    return updated;
  }

  async function softDelete(scheduleId: UUID, reason: string): Promise<void> {
    const check = validation.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    const schedule = store.billSchedules.get(scheduleId);
    if (!schedule) throw new Error("Bill schedule not found");
    store.billSchedules.set(scheduleId, { ...schedule, deletedAt: now(), deleteReason: reason });
  }

  async function generateDue(companyId: UUID, asOf?: string): Promise<number> {
    const cutoff = asOf ?? now().slice(0, 10);
    const due = Array.from(store.billSchedules.values()).filter(
      (b) => b.companyId === companyId && !b.deletedAt && b.isActive && b.nextDueDate <= cutoff
    );
    let written = 0;
    for (const schedule of due) {
      let cursor = schedule;
      // Materialise every occurrence up to `cutoff`, not just one — the
      // same "catch up" behaviour the real implementation documents via
      // idempotent advancement.
      while (
        cursor.nextDueDate <= cutoff &&
        (cursor.maxOccurrences == null || cursor.occurrencesGenerated < cursor.maxOccurrences) &&
        (cursor.endDate == null || cursor.nextDueDate <= cursor.endDate)
      ) {
        // ONE ORDINARY EXPENSE ROW — through ExpenseService, exactly
        // like the real implementation. This is the line that makes
        // "a schedule is not a cost, generation is" testable at all.
        await expenseService.create({
          companyId: cursor.companyId,
          projectId: cursor.projectId,
          expenseType: cursor.expenseType,
          amount: cursor.amount,
          expenseDate: cursor.nextDueDate,
          dueDate: cursor.nextDueDate,
          vendor: cursor.vendor,
          notes: cursor.notes,
          isPaid: false,
        });
        written += 1;
        const nextDate = advanceBillDate(cursor.nextDueDate, cursor.frequency, cursor.intervalCount);
        cursor = { ...cursor, nextDueDate: nextDate, occurrencesGenerated: cursor.occurrencesGenerated + 1, updatedAt: now() };
        store.billSchedules.set(cursor.id, cursor);
      }
    }
    return written;
  }

  return { listForCompany, create, update, softDelete, generateDue };
}

/**
 * The one thing tests actually import: builds a fully-wired stack —
 * FilteringService (real implementation, with a "projects" executor
 * registered so FinancialEngine's project-filtering path works) and
 * FinancialEngine (real implementation) both running unmodified,
 * everything else backed by the in-memory store above.
 */
export function createInMemoryServices(store: InMemoryStore = createInMemoryStore()) {
  const validationService = createValidationService();
  const filteringService = createFilteringService();
  const transactionService = createTransactionService(store, filteringService);
  const projectService = createProjectService(store, validationService);
  const estimateService = createEstimateService(store, validationService);
  const changeOrderService = createChangeOrderService(store, validationService, transactionService, estimateService);
  const invoiceService = createInvoiceService(store, transactionService, validationService);
  const paymentService = createPaymentService(store, validationService, transactionService);
  const expenseService = createExpenseService(store, validationService, transactionService);
  const subcontractorService = createSubcontractorService(store, validationService, transactionService);
  const agentCommissionService = createAgentCommissionService(store, validationService, transactionService);
  // Prerequisite A additions — see each factory's own doc comment.
  const teamAssignmentService = createTeamAssignmentService(store, validationService);
  const clientService = createClientService(store, validationService);
  const companyService = createCompanyService(store);
  const billScheduleService = createBillScheduleService(store, expenseService, validationService);

  // Minimal generic executor: supports direct-column conditions only
  // (no cross-relationship joins) — sufficient for
  // FinancialEngine.resolveProjectIds' "filter projects by status/
  // assignedUserId" use case. A real SchemaRegistry-driven executor
  // would resolve full relationship paths; documented as a known
  // limitation of this test fake, not of the architecture.
  filteringService.registerExecutor<Project>({
    entity: "projects",
    query: async (scope) => {
      const all = await projectService.list(scope);
      return scope.projectId ? all.filter((p) => p.id === scope.projectId) : all;
    },
  });

  const financialEngine: FinancialEngine = createFinancialEngine({
    projectService,
    estimateService,
    changeOrderService,
    invoiceService,
    paymentService,
    subcontractorService,
    agentCommissionService,
    transactionService,
    expenseService,
    filteringService,
    // Previously omitted here — every one of the 27 pre-existing test
    // files therefore exercised `deps.teamAssignmentService?.` as
    // permanently undefined, silently resolving every team-labour
    // committed-cost/payable figure to empty via financialEngine.ts's
    // own `?? Promise.resolve([])` fallbacks. Adding it is what makes
    // team labour testable at all — see the System Integrity Audit.
    teamAssignmentService,
  });

  // Default log sink: appends to the store, readable via
  // `store.reconciliationLog`. A real deployment would swap this for
  // one that writes to a table/observability system — the interface
  // (ReconciliationLogSink) is what makes that a one-line change.
  const logSink: ReconciliationLogSink = {
    async log(report, trigger) {
      store.reconciliationLog.push({ report, trigger });
    },
  };

  // Built from the RAW (unwrapped) services below, never the
  // auto-reconciling wrapped ones — reconcileAfterMutation calls
  // invoiceService.refreshStatus internally (see reconciliationService.ts's
  // "recalculate derived values" step), and if that were the WRAPPED
  // invoiceService, refreshStatus would itself be treated as a mutation
  // and re-trigger reconcileAfterMutation, recursing forever.
  const reconciliationService = createReconciliationService({
    financialEngine,
    transactionService,
    invoiceService,
    paymentService,
    expenseService,
    changeOrderService,
    projectService,
    estimateService,
    subcontractorService,
    agentCommissionService,
    logSink,
  });

  // Enterprise foundation: accounting, payroll, multi-location,
  // reporting — all built on top of the exact same transactionService/
  // financialEngine/projectService instances above, per "no duplicate
  // business logic."
  const generalLedgerService = createGeneralLedgerService({ transactionService });
  const financialStatementsService = createFinancialStatementsService({ generalLedgerService });
  const accountsReceivableService = createAccountsReceivableService({ invoiceService, paymentService });
  const accountsPayableService = createAccountsPayableService({ financialEngine });
  const bankReconciliationService = createBankReconciliationService({ financialStatementsService });
  const reportingService = createReportingService({
    financialEngine,
    projectService,
    transactionService,
    generalLedgerService,
    financialStatementsService,
    accountsReceivableService,
    accountsPayableService,
  });
  const payrollService = createInMemoryPayrollService(store, transactionService);
  const locationService = createInMemoryLocationService(store);

  // ============================================================
  // Auto-reconciling wrappers — "every create, update, or delete must
  // trigger validation." Each resolveProjectId closes over `store` to
  // find the project a mutation affected, since different services'
  // methods carry that information in different shapes (see
  // autoReconciliation.ts's header for why this is the one piece of
  // per-service configuration).
  // ============================================================
  const autoProjectService = withAutoReconciliation(projectService, reconciliationService, {
    entityTable: "projects",
    resolveProjectId: async (methodName, args, result) =>
      methodName === "create" ? (result as { id: string }).id : (args[0] as string),
  });

  const autoEstimateService = withAutoReconciliation(estimateService, reconciliationService, {
    entityTable: "estimates",
    resolveProjectId: async (methodName, args, result) => {
      if (methodName === "create") return (result as { projectId: string }).projectId;
      // includeDeleted: true — this must still resolve a project to
      // reconcile after softDelete (the estimate is deleted by the
      // time this runs) or restore, not just for still-active
      // estimates. Reconciliation itself must keep running regardless
      // of the mutation's own deleted state.
      const estimate = await estimateService.getById(args[0] as string, true);
      return estimate?.projectId ?? null;
    },
  });

  const autoChangeOrderService = withAutoReconciliation(changeOrderService, reconciliationService, {
    entityTable: "change_orders",
    resolveProjectId: async (methodName, args, result) => {
      if (methodName === "createChangeOrder") return (result as { projectId: string }).projectId;
      const co = await changeOrderService.getById(args[0] as string);
      return co?.projectId ?? null;
    },
  });

  const autoInvoiceService = withAutoReconciliation(invoiceService, reconciliationService, {
    entityTable: "invoices",
    resolveProjectId: async (methodName, args, result) => {
      if (methodName === "createFromEstimate" || methodName === "createStandalone") return (result as { projectId: string }).projectId;
      if (methodName === "updateLineItems") return (result as { invoice?: { projectId: string } }).invoice?.projectId ?? null;
      const invoice = await invoiceService.getById(args[0] as string);
      return invoice?.projectId ?? null;
    },
  });

  // Reuses resolveProjectIdViaInvoice (autoReconciliation.ts) instead
  // of re-deriving the same invoiceId -> projectId lookup inline —
  // found unused/duplicated during the optimization pass ("remove
  // duplicate code" / "remove dead code"): the helper was exported
  // from autoReconciliation.ts but nothing actually called it, while
  // this resolver had its own copy of the same two-line lookup twice
  // (once for "record", once for update/softDelete/restore).
  const projectIdForInvoice = resolveProjectIdViaInvoice(invoiceService);
  const autoPaymentService = withAutoReconciliation(paymentService, reconciliationService, {
    entityTable: "invoice_payments",
    resolveProjectId: async (methodName, args, result) => {
      if (methodName === "record") {
        const payment = (result as { payment?: { invoiceId: string } }).payment;
        return projectIdForInvoice(payment?.invoiceId);
      }
      // update/softDelete/restore all take paymentId as their first
      // arg — PaymentService has no getById, so resolve via the store
      // directly (see this closure's access to `store` above).
      const payment = store.payments.get(args[0] as string);
      return projectIdForInvoice(payment?.invoiceId);
    },
  });

  const autoExpenseService = withAutoReconciliation(expenseService, reconciliationService, {
    entityTable: "estimate_expenses",
    resolveProjectId: async (methodName, args, result) => {
      if (methodName === "create") return (result as { projectId: string }).projectId;
      return store.expenses.get(args[0] as string)?.projectId ?? null;
    },
  });

  const autoSubcontractorService = withAutoReconciliation(subcontractorService, reconciliationService, {
    entityTable: "estimate_subcontractors",
    resolveProjectId: async (methodName, args, result) => {
      if (methodName === "assignToProject") return (result as { projectId: string }).projectId;
      if (methodName === "recordPayment") {
        const input = args[0] as { assignmentId: string };
        return store.subAssignments.get(input.assignmentId)?.projectId ?? null;
      }
      // softDelete/restore take a PAYMENT id as their first arg, not an
      // assignment id — resolve through the payment's own assignmentId.
      // Added alongside SubcontractorService.softDelete/restore.
      if (methodName === "softDelete" || methodName === "restore") {
        const payment = store.subcontractorPayments.get(args[0] as string);
        return payment ? (store.subAssignments.get(payment.assignmentId)?.projectId ?? null) : null;
      }
      return store.subAssignments.get(args[0] as string)?.projectId ?? null;
    },
  });

  const autoAgentCommissionService = withAutoReconciliation(agentCommissionService, reconciliationService, {
    entityTable: "estimate_agents",
    resolveProjectId: async (methodName, args) => {
      if (methodName === "assignToProject") {
        const input = args[0] as { projectId: string };
        return input.projectId;
      }
      if (methodName === "recordPayment") {
        const input = args[0] as { assignmentId?: string | null; reimbursesExpenseId?: string | null };
        if (input.assignmentId) return store.agentAssignments.get(input.assignmentId)?.projectId ?? null;
        if (input.reimbursesExpenseId) return store.expenses.get(input.reimbursesExpenseId)?.projectId ?? null;
      }
      // softDelete/restore take a PAYMENT id — resolve through
      // whichever the payment settles (its assignment for a
      // commission, or its reimbursesExpenseId for a reimbursement).
      // Added alongside AgentCommissionService.softDelete/restore.
      if (methodName === "softDelete" || methodName === "restore") {
        const payment = store.agentPayments.get(args[0] as string);
        if (!payment) return null;
        if (payment.assignmentId) return store.agentAssignments.get(payment.assignmentId)?.projectId ?? null;
        if (payment.reimbursesExpenseId) return store.expenses.get(payment.reimbursesExpenseId)?.projectId ?? null;
      }
      return null;
    },
  });

  return {
    store,
    validationService,
    filteringService,
    transactionService,
    projectService: autoProjectService,
    estimateService: autoEstimateService,
    changeOrderService: autoChangeOrderService,
    invoiceService: autoInvoiceService,
    paymentService: autoPaymentService,
    expenseService: autoExpenseService,
    subcontractorService: autoSubcontractorService,
    agentCommissionService: autoAgentCommissionService,
    financialEngine,
    reconciliationService,
    generalLedgerService,
    financialStatementsService,
    accountsReceivableService,
    accountsPayableService,
    bankReconciliationService,
    reportingService,
    payrollService,
    locationService,
    teamAssignmentService,
    clientService,
    companyService,
    billScheduleService,
  };
}

export type InMemoryServices = ReturnType<typeof createInMemoryServices>;
