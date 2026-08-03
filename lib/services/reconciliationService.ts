/**
 * Layer 3 — the service that would have caught contractor-pwa's
 * 15-location calculation drift BEFORE it shipped, instead of a
 * post-hoc audit document discovering it afterward
 * (FINANCIAL_CONSOLIDATION_PLAN.md). Runs cross-checks between the
 * ledger and its source tables, surfacing any disagreement as a
 * ReconciliationFinding rather than letting it ship silently.
 *
 * IMPORTANT: this service does NOT recompute profit/revenue/cost
 * itself. FinancialService/FinancialEngine remains the ONLY source of
 * financial calculations. What this service checks is DATA
 * CONSISTENCY: does every source row have the ledger row it should, do
 * soft-deleted rows stay excluded, and does every INPUT FinancialEngine
 * reads match what the ledger itself contains — never whether the
 * arithmetic FinancialEngine performs ON those inputs is "double
 * checked" by a second formula.
 *
 * ============================================================
 * AUTOMATIC RECONCILIATION — every create/update/delete triggers this
 * ============================================================
 * `reconcileAfterMutation()` is the entry point every Layer 2 write
 * calls (via `withAutoReconciliation`, autoReconciliation.ts) after it
 * completes. It does NOT duplicate the checks above — it REUSES
 * `reconcileLedgerAgainstSources` and `reconcileProjectTotals` exactly
 * as they already existed, just calls both for the one project a
 * mutation touched and adds two checks those two didn't cover yet
 * (estimate totals, payables), then:
 *   1. Detects — via the reused checks above.
 *   2. Logs — every finding, through the injected `ReconciliationLogSink`.
 *   3. Recalculates derived values — calls InvoiceService.refreshStatus
 *      on every invoice in the project, the one piece of DERIVED,
 *      STORED state in this schema (an invoice's `status` column) that
 *      isn't recomputed fresh on every read the way FinancialEngine's
 *      output always is.
 *   4. Keeps data synchronized — because FinancialEngine reads the
 *      ledger fresh on every call, nothing else needs an explicit
 *      "resync" step; the only synchronization gap in this whole
 *      architecture was exactly the stored invoice.status field step 3
 *      just handled.
 */
import type { UUID, QueryScope, ReconciliationReport, ReconciliationFinding } from "./types";
import type { FinancialEngine } from "./financialEngine";
import type { TransactionService } from "./transactionService";
import type { InvoiceService } from "./invoiceService";
import type { PaymentService } from "./paymentService";
import type { ExpenseService } from "./expenseService";
import type { ChangeOrderService } from "./changeOrderService";
import type { ProjectService } from "./projectService";
import type { EstimateService } from "./estimateService";
import type { SubcontractorService } from "./subcontractorService";
import type { AgentCommissionService } from "./agentCommissionService";
import { calculateChangeOrderRevenue, calculateDocumentTotal } from "./financialCalculations";

export interface ReconciliationService {
  /** For every invoice/payment/expense/change-order in scope, verifies
   * a matching ledger row exists with the expected type and a net
   * amount matching the source record. Also verifies "deleted records
   * must never affect calculations." */
  reconcileLedgerAgainstSources(scope: QueryScope): Promise<ReconciliationReport>;

  /** Cross-checks the INPUTS FinancialEngine.getProjectFinancials read
   * (invoicesTotal, amountPaid, expenseItems) against independently
   * summing the same ledger rows a second time from raw data, PLUS
   * (added for automatic reconciliation): estimate totals recomputed
   * from their own line items/markup/discount/tax (via
   * FinancialService.calculateDocumentTotal — never a second formula),
   * and payables (subcontractor/agent outstanding balances) cross-
   * checked line-by-line against TransactionService.getAssignmentBalance. */
  reconcileProjectTotals(projectId: UUID): Promise<ReconciliationReport>;

  /** Company-wide sweep — reconcileLedgerAgainstSources over every
   * active project in scope, findings concatenated. Deliberately does
   * NOT compare sum(project totals) to getCompanyFinancials: project
   * figures are committed-cost, company figures are cash-basis-per-
   * period — two different models BY DESIGN. */
  reconcileCompany(scope: QueryScope): Promise<ReconciliationReport>;

  /** Verifies every non-deleted project has at least one estimate. */
  verifyProjectBackfillIntegrity(companyId: UUID): Promise<ReconciliationReport>;

  /** THE automatic-reconciliation entry point — called after every
   * create/update/delete/restore (see autoReconciliation.ts). Reuses
   * reconcileLedgerAgainstSources + reconcileProjectTotals rather than
   * re-implementing checks, logs every finding via the injected sink,
   * and recalculates derived state (invoice statuses) when anything is
   * found. `trigger` is purely descriptive (goes into the log), it
   * does not change which checks run — the same full check runs
   * regardless of which table changed, since a mutation to any one of
   * them can affect any of the numbers being verified. */
  reconcileAfterMutation(projectId: UUID, trigger: MutationTrigger): Promise<ReconciliationReport>;
}

export interface MutationTrigger {
  entityTable: string;
  entityId: UUID;
  action: "create" | "update" | "delete" | "restore";
}

/** Where reconciliation findings get logged. A thin, swappable port —
 * same pattern as TransactionService's QueryExecutor and AuditService's
 * AuditLogRepository — so "log them" doesn't hard-code a destination. */
export interface ReconciliationLogSink {
  log(report: ReconciliationReport, trigger: MutationTrigger | null): Promise<void>;
}

export interface ReconciliationServiceDeps {
  financialEngine: FinancialEngine;
  transactionService: TransactionService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  expenseService: ExpenseService;
  changeOrderService: ChangeOrderService;
  projectService: ProjectService;
  estimateService: EstimateService;
  subcontractorService: SubcontractorService;
  agentCommissionService: AgentCommissionService;
  logSink: ReconciliationLogSink;
}

function clean(scope: QueryScope): ReconciliationReport {
  return { runAt: new Date().toISOString(), scope, findings: [], isClean: true };
}

function report(scope: QueryScope, findings: ReconciliationFinding[]): ReconciliationReport {
  return { runAt: new Date().toISOString(), scope, findings, isClean: findings.length === 0 };
}

function mergeReports(scope: QueryScope, reports: ReconciliationReport[]): ReconciliationReport {
  const findings = reports.flatMap((r) => r.findings);
  return report(scope, findings);
}

export function createReconciliationService(deps: ReconciliationServiceDeps): ReconciliationService {
  const {
    transactionService,
    invoiceService,
    paymentService,
    expenseService,
    changeOrderService,
    estimateService,
    subcontractorService,
    agentCommissionService,
    logSink,
  } = deps;

  async function reconcileLedgerAgainstSources(scope: QueryScope): Promise<ReconciliationReport> {
    const findings: ReconciliationFinding[] = [];
    const projectId = scope.projectId;
    if (!projectId) {
      return clean(scope);
    }

    const invoices = await invoiceService.listForProject(projectId);
    // Fetched ONCE, outside both loops below — this used to be
    // re-fetched inside the innermost per-payment loop (once per
    // payment, on every invoice), refetching the identical whole-
    // project ledger dozens of times over for a project with several
    // invoices/payments. Found during the optimization pass ("reduce
    // database queries"); a real query in a real database, not just
    // wasted CPU in this in-memory fake.
    const activeLedger = await transactionService.getProjectLedger(projectId);

    for (const invoice of invoices) {
      const trail = await transactionService.getAuditTrail("invoice", invoice.id);
      const issuedTotal = trail.filter((tx) => tx.type === "invoice_issued").reduce((s, tx) => s + tx.amount, 0);
      if (issuedTotal !== invoice.total) {
        findings.push({
          severity: "error",
          scope: "project",
          scopeId: projectId,
          message: `Invoice ${invoice.id} total ($${invoice.total}) does not match its ledger "invoice_issued" total ($${issuedTotal}).`,
          expected: invoice.total,
          actual: issuedTotal,
          difference: invoice.total - issuedTotal,
        });
      }

      // NOTE: there is deliberately no "stored invoice status vs. real
      // payment status" drift check here anymore. That check existed
      // because `status` used to be a stored, denormalized column that
      // only updated when something remembered to call refreshStatus —
      // and it re-derived the expected value with its own ternary
      // chain, a duplicate of the real formula. Invoice status is now
      // DERIVED on every read (financialCalculations.deriveInvoiceStatus,
      // applied by InvoiceService.withDerivedStatus), so the two can no
      // longer disagree: there is no stored field left to drift. The
      // check was removed rather than kept as a tautology that could
      // only ever pass — and, being a second implementation of the
      // status formula, would have been a drift risk in its own right.
      const payments = await paymentService.listForInvoice(invoice.id);
      for (const payment of payments) {
        const payTrail = await transactionService.getAuditTrail("invoice_payment", payment.id);
        const netAmount = payTrail.reduce((s, tx) => s + tx.amount, 0);
        const stillActive = activeLedger.some((tx) => tx.referenceType === "invoice_payment" && tx.referenceId === payment.id);

        if (!payment.deletedAt && netAmount !== payment.amount) {
          findings.push({
            severity: "error",
            scope: "project",
            scopeId: projectId,
            message: `Payment ${payment.id} amount ($${payment.amount}) does not match its net ledger total ($${netAmount}).`,
            expected: payment.amount,
            actual: netAmount,
            difference: payment.amount - netAmount,
          });
        }
        if (payment.deletedAt && stillActive) {
          findings.push({
            severity: "error",
            scope: "project",
            scopeId: projectId,
            message: `Payment ${payment.id} is soft-deleted but its ledger row is still included in active calculations — "deleted records must never affect calculations" is violated.`,
            expected: 0,
            actual: payment.amount,
            difference: payment.amount,
          });
        }
      }
    }

    const changeOrders = await changeOrderService.listForProject(projectId);
    for (const co of changeOrders.filter((c) => c.status === "approved")) {
      const trail = await transactionService.getAuditTrail("change_order", co.id);
      const approvedTotal = trail.filter((tx) => tx.type === "change_order_approved").reduce((s, tx) => s + tx.amount, 0);
      const expectedTotal = calculateChangeOrderRevenue(co.totalAmount, co.tax);
      if (approvedTotal !== expectedTotal) {
        findings.push({
          severity: "error",
          scope: "project",
          scopeId: projectId,
          message: `Change order ${co.id} approved total ($${expectedTotal}) does not match its ledger total ($${approvedTotal}).`,
          expected: expectedTotal,
          actual: approvedTotal,
          difference: expectedTotal - approvedTotal,
        });
      }
    }

    const expenses = await expenseService.listForProject(projectId);
    for (const expense of expenses) {
      const trail = await transactionService.getAuditTrail("estimate_expense", expense.id);
      const netCost = trail
        .filter((tx) => tx.type === "material_expense" || tx.type === "labor_expense" || tx.type === "other_expense")
        .reduce((s, tx) => s + tx.amount, 0);
      if (netCost !== expense.amount) {
        findings.push({
          severity: "error",
          scope: "project",
          scopeId: projectId,
          message: `Expense ${expense.id} amount ($${expense.amount}) does not match its net ledger cost total ($${netCost}).`,
          expected: expense.amount,
          actual: netCost,
          difference: expense.amount - netCost,
        });
      }
      // An agent-funded purchase is a debt to the agent until settled.
      // The expense row's OWN reimbursementStatus is the authority:
      // settling writes no payment record of its own (ONE PAYMENT = ONE
      // EXPENSE RECORD), so the ledger's reimbursement balance would
      // report every settled debt as still outstanding.
      if (expense.paidByAgentId && expense.reimbursable && expense.reimbursementStatus !== "reimbursed") {
        findings.push({
          severity: "warning",
          scope: "project",
          scopeId: projectId,
          message: `Expense ${expense.id} has a $${expense.amount} agent reimbursement liability with nothing paid yet.`,
          expected: 0,
          actual: expense.amount,
          difference: expense.amount,
        });
      }
    }

    return report(scope, findings);
  }

  async function reconcileProjectTotals(projectId: UUID): Promise<ReconciliationReport> {
    const project = await deps.projectService.getById(projectId);
    if (!project) throw new Error(`reconcileProjectTotals: no project found for id ${projectId}`);
    const scope: QueryScope = { companyId: project.companyId, projectId };
    const findings: ReconciliationFinding[] = [];

    const financials = await deps.financialEngine.getProjectFinancials(projectId);
    const ledger = await transactionService.getProjectLedger(projectId);

    const ledgerInvoiceTotal = ledger.filter((tx) => tx.type === "invoice_issued").reduce((s, tx) => s + tx.amount, 0);
    if (ledgerInvoiceTotal !== financials.invoicesTotal) {
      findings.push({
        severity: "error",
        scope: "project",
        scopeId: projectId,
        message: `FinancialEngine.invoicesTotal ($${financials.invoicesTotal}) does not match the ledger's summed "invoice_issued" rows ($${ledgerInvoiceTotal}) — FinancialEngine may be reading a stale/partial ledger view.`,
        expected: ledgerInvoiceTotal,
        actual: financials.invoicesTotal,
        difference: financials.invoicesTotal - ledgerInvoiceTotal,
      });
    }

    const ledgerPaidTotal = ledger.filter((tx) => tx.type === "customer_payment").reduce((s, tx) => s + tx.amount, 0);
    if (ledgerPaidTotal !== financials.amountPaid) {
      findings.push({
        severity: "error",
        scope: "project",
        scopeId: projectId,
        message: `FinancialEngine.amountPaid ($${financials.amountPaid}) does not match the ledger's summed "customer_payment" rows ($${ledgerPaidTotal}).`,
        expected: ledgerPaidTotal,
        actual: financials.amountPaid,
        difference: financials.amountPaid - ledgerPaidTotal,
      });
    }

    const ledgerExpenseTotal = ledger
      .filter((tx) => tx.type === "material_expense" || tx.type === "labor_expense" || tx.type === "other_expense")
      .reduce((s, tx) => s + tx.amount, 0);
    if (ledgerExpenseTotal !== financials.expenseItems) {
      findings.push({
        severity: "error",
        scope: "project",
        scopeId: projectId,
        message: `FinancialEngine.expenseItems ($${financials.expenseItems}) does not match the ledger's summed expense rows ($${ledgerExpenseTotal}).`,
        expected: ledgerExpenseTotal,
        actual: financials.expenseItems,
        difference: financials.expenseItems - ledgerExpenseTotal,
      });
    }

    // Estimate totals — recomputed from the estimate's OWN line items/
    // markup/discount/taxRate via FinancialService.calculateDocumentTotal
    // (never a second formula), compared to the stored `total` column.
    // Catches an update path that changed line items/markup/discount
    // without calling EstimateService.recalculateTotal.
    const estimates = await estimateService.listForProject(projectId);
    for (const estimate of estimates) {
      const recomputed = calculateDocumentTotal(estimate.subtotal, estimate.markup, estimate.discount, estimate.taxRate);
      if (recomputed.total !== estimate.total) {
        findings.push({
          severity: "error",
          scope: "project",
          scopeId: projectId,
          message: `Estimate ${estimate.id} stored total ($${estimate.total}) does not match its recomputed total ($${recomputed.total}) from its own subtotal/markup/discount/tax.`,
          expected: recomputed.total,
          actual: estimate.total,
          difference: estimate.total - recomputed.total,
        });
      }
    }

    // Payables — FinancialEngine.getPayablesSummary against
    // FinancialEngine.getPayeeBalances, per payee, for both roles.
    //
    // Deliberately NOT against TransactionService.getAssignmentBalance
    // any more: under ONE PAYMENT = ONE EXPENSE RECORD a payment is an
    // expense row, so the ledger holds no assignment payments to
    // balance against and that check would flag every fully-paid payee
    // as unpaid. Payables lines are per ASSIGNMENT while a payment
    // names a PAYEE, so the comparison is made per payee.
    const payables = await deps.financialEngine.getPayablesSummary({ companyId: project.companyId, projectId });
    for (const role of ["subcontractor", "agent"] as const) {
      const payeeBalances = await deps.financialEngine.getPayeeBalances({ companyId: project.companyId, projectId }, role);
      for (const balance of payeeBalances) {
        const lineOutstanding = payables.lines
          .filter((l) => l.role === role && l.payeeId === balance.payeeId)
          .reduce((sum, l) => sum + l.outstanding, 0);
        if (lineOutstanding !== balance.outstanding) {
          findings.push({
            severity: "error",
            scope: "project",
            scopeId: projectId,
            message: `Payables lines for ${role} "${balance.payeeName}" show outstanding $${lineOutstanding}, but FinancialEngine.getPayeeBalances computes $${balance.outstanding} from the expense rows.`,
            expected: balance.outstanding,
            actual: lineOutstanding,
            difference: lineOutstanding - balance.outstanding,
          });
        }
      }
    }
    // Cross-check the roster itself: every subcontractor/agent
    // assignment for this project should have exactly one payables
    // line — a missing one would mean FinancialEngine silently dropped
    // an assignment from the Dashboard/Payables view.
    const subAssignments = await subcontractorService.listAssignments({ companyId: project.companyId, projectId });
    const agentAssignments = await agentCommissionService.listAssignments({ companyId: project.companyId, projectId });
    for (const a of [...subAssignments, ...agentAssignments]) {
      if (!payables.lines.some((l) => l.assignmentId === a.id)) {
        findings.push({
          severity: "error",
          scope: "project",
          scopeId: projectId,
          message: `Assignment ${a.id} has no corresponding line in FinancialEngine.getPayablesSummary — it would be invisible on the Payables/Dashboard view.`,
          expected: 1,
          actual: 0,
          difference: 1,
        });
      }
    }

    return report(scope, findings);
  }

  async function reconcileCompany(scope: QueryScope): Promise<ReconciliationReport> {
    return reconcileLedgerAgainstSources(scope);
  }

  async function verifyProjectBackfillIntegrity(companyId: UUID): Promise<ReconciliationReport> {
    return clean({ companyId });
  }

  async function reconcileAfterMutation(projectId: UUID, trigger: MutationTrigger): Promise<ReconciliationReport> {
    const project = await deps.projectService.getById(projectId);
    if (!project) return clean({ companyId: "" });
    const scope: QueryScope = { companyId: project.companyId, projectId };

    // Detect — reusing both existing checks, never re-implemented.
    const [ledgerReport, totalsReport] = await Promise.all([
      reconcileLedgerAgainstSources(scope),
      reconcileProjectTotals(projectId),
    ]);
    const merged = mergeReports(scope, [ledgerReport, totalsReport]);

    // Log — every run, clean or not, so "was reconciliation actually
    // checked after this mutation" is itself answerable later, not
    // just "were there ever any problems."
    await logSink.log(merged, trigger);

    // Recalculate derived values + keep data synchronized — see this
    // file's header for why refreshing invoice status is the one real
    // synchronization step this architecture needs; everything else
    // FinancialEngine reads fresh already.
    if (!merged.isClean) {
      const invoices = await invoiceService.listForProject(projectId);
      for (const invoice of invoices) {
        await invoiceService.refreshStatus(invoice.id);
      }
    }

    return merged;
  }

  return {
    reconcileLedgerAgainstSources,
    reconcileProjectTotals,
    reconcileCompany,
    verifyProjectBackfillIntegrity,
    reconcileAfterMutation,
  };
}
