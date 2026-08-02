/**
 * Layer 3 — THE single source of truth for every calculated financial
 * number in the application. This is the direct successor to
 * contractor-pwa's lib/queries/financialCalculations.ts, with one
 * structural change: it's no longer just a module other code is
 * SUPPOSED to import — pages have no other way to get a financial
 * number at all, because no page is allowed to import Layer 1/2
 * services' raw data for the purpose of computing profit/revenue/
 * outstanding balances itself.
 *
 * Example of the rule this file exists to enforce:
 *   WRONG:   dashboard fetches estimates+invoices+expenses, reduces() them
 *   CORRECT: dashboard calls financialEngine.getProjectFinancials(projectId)
 *
 * ============================================================
 * WHERE REVENUE COMES FROM — AND WHERE IT DOES NOT
 * ============================================================
 * This engine calculates PRIMARILY AT THE PROJECT LEVEL, not the
 * estimate level, and it never reads `estimates.total` as revenue.
 * An estimate is a proposal; a project is the complete financial
 * lifecycle. Concretely, project revenue is assembled from three
 * normalized sources, each owned by its own Layer 2 service:
 *
 *   - Invoices        (InvoiceService.listForProject)        -> what was BILLED
 *   - Payments         (PaymentService.getSummaryForInvoice)   -> what was COLLECTED
 *   - Approved change orders (ChangeOrderService.listApprovedChangeOrders) -> contract growth
 *
 * `revisedTotal = invoicesTotal + approvedChangeOrderTotal`. This
 * replaces contractor-pwa's `resolveProjectTotal(estimate.total,
 * invoice.total)`, which read a cached, app-cascaded field on the
 * estimate — exactly the "duplicated estimate field" this rebuild
 * removes. `originalEstimateTotal` is still returned, but ONLY as a
 * quoted-vs-billed comparison figure; it must never be summed into
 * revenue or profit.
 *
 * Costs are assembled from four normalized sources, matching the
 * brief exactly:
 *   - Expenses               (materials/labor/other + mileage, from ExpenseService's own persisted rows)
 *   - Subcontractor payments (committed: max(assigned, paid) per assignment)
 *   - Agent commissions      (committed: max(assigned, paid) per assignment)
 *   - Reimbursements         (agent + subcontractor reimbursement-type payments,
 *                             cash-actual — there is no "assigned" figure for a
 *                             reimbursement, so it is not floored/committed)
 *
 * Two DIFFERENT cost models are preserved on purpose (this was correct
 * in contractor-pwa and stays correct here — see each method's doc):
 *  - Project-level: committed cost = max(assigned, paid) per assignment.
 *    An assignment is a real cost the moment it's made, not when paid.
 *  - Company-level/period: cash-basis — actual money paid within the
 *    date range, by the transaction's own date. A period P&L must not
 *    count a cost that hasn't been paid yet just because it's "assigned."
 * Collapsing these into one model would itself reintroduce a bug — which
 * is why they're not just two code paths that happen to differ, but two
 * distinct branded types (CommittedCost, RealizedCost — see types.ts).
 * ProjectFinancials' cost fields are CommittedCost; CompanyFinancials'
 * are RealizedCost. A caller cannot accidentally add a project's
 * committed subcontractor cost into a company period's cash-basis
 * total, even though both are plain numbers at runtime.
 *
 * Consumers: Dashboard, Tax, Reports, Analytics, Project Financials —
 * every one of them calls this file and only this file for a computed
 * number. None of them may re-derive revenue/cost/profit themselves.
 *
 * ============================================================
 * FILTERING FLOW: Database -> Filter Service -> Financial Engine -> Dashboard/Tax/Reports
 * ============================================================
 * Every company-scoped method here accepts an optional `Filter`
 * (types.ts) alongside its QueryScope. It never interprets that filter
 * itself — it hands it straight to FilteringService.execute("projects",
 * scope, filter), which validates it against SchemaRegistry and
 * resolves it to the matching project ids. This engine then computes
 * financials only for those projects. Dashboard/Tax/Reports build a
 * Filter (company, user, project, customer, status, date range, amount
 * range, or any relationship the schema knows about) and pass it in —
 * none of them write their own filtering logic, exactly as none of
 * them write their own profit formula.
 */
import type {
  UUID,
  QueryScope,
  DateRange,
  ProjectFinancials,
  EstimateFinancials,
  CompanyFinancials,
  ProfitSummary,
  PayablesSummary,
  PayableLine,
  TaxSummary,
  PaymentStatus,
  Filter,
} from "./types";
import { asCommittedCost, asRealizedCost } from "./types";
import {
  calculateLineItemTotal,
  calculateSubtotal,
  calculateDocumentTotal,
  validateDepositAmount,
  calculateDepositInvoiceAmount,
  calculateChangeOrderRevenue,
  sumApprovedChangeOrderRevenue,
  calculateRevisedEstimateTotal,
  derivePaymentStatus,
  calculateRemainingBalance,
  calculateCommittedCostBalance,
  calculateExpenseTotals,
  type DocumentTotal,
  type DepositValidation,
  type LineItemLike,
  type CommittedCostBalance,
  type ChangeOrderRevenueLike,
} from "./financialCalculations";
import type { ProjectService } from "./projectService";
import type { EstimateService } from "./estimateService";
import type { ChangeOrderService } from "./changeOrderService";
import type { InvoiceService } from "./invoiceService";
import type { PaymentService } from "./paymentService";
import type { SubcontractorService } from "./subcontractorService";
import type { AgentCommissionService } from "./agentCommissionService";
import type { TransactionService } from "./transactionService";
import type { ExpenseService } from "./expenseService";
import type { FilteringService } from "./filteringService";

export interface FinancialEngine {
  /** Composes ChangeOrderService (approved change orders), InvoiceService
   * (billed total), PaymentService (payments received), ExpenseService
   * (cost + mileage), SubcontractorService, and AgentCommissionService
   * (committed cost via their own getBalance, computed directly from
   * persisted rows) into one number set. The
   * ONLY function allowed to assemble a project's profit — every page,
   * PDF export, and report calls this, never its own arithmetic. */
  getProjectFinancials(projectId: UUID): Promise<ProjectFinancials>;

  /** Same job-costing formulas as getProjectFinancials, scoped to ONE
   * estimate instead of the whole project — the number the Estimate
   * Detail page needs, since a project can carry several estimates and
   * getProjectFinancials would otherwise mix them all together. See
   * EstimateFinancials' doc comment (types.ts) for exactly which real
   * data sources back subcontractor/agent costs here. */
  getEstimateFinancials(estimateId: UUID): Promise<EstimateFinancials>;

  /** Composes TransactionService.getCompanyLedger (cash-basis revenue/
   * expense within range) with lifetime (not period-scoped) outstanding
   * payable balances from SubcontractorService/AgentCommissionService —
   * mirrors contractor-pwa's calculateCompanyFinancials exactly, since
   * that function's period-vs-lifetime split was correct, just
   * duplicated elsewhere. `filter`, if given, is resolved via
   * FilteringService against the "projects" entity first — the ledger
   * is then restricted to that project set, so "company financials for
   * active projects assigned to user X" is the same call with a
   * different Filter, not a different code path. */
  getCompanyFinancials(scope: QueryScope & { dateRange: DateRange }, filter?: Filter): Promise<CompanyFinancials>;

  /** Batch form of getProjectFinancials for list/report pages — same
   * per-project logic, computed once instead of once per row-render as
   * contractor-pwa's reports pages did. */
  getFinancialsForProjects(projectIds: UUID[]): Promise<Map<UUID, ProjectFinancials>>;

  /** Client-level rollup (total estimated/invoiced/paid, outstanding
   * receivable, avg project value) — contractor-pwa's
   * calculateClientFinancials, relocated here since "financials for a
   * set of projects grouped by client" is still the engine's job, not
   * a new client-specific calculation. */
  getClientFinancials(clientId: UUID, companyId: UUID): Promise<{
    totalEstimated: number;
    totalInvoiced: number;
    totalPaid: number;
    outstandingReceivable: number;
    projectCount: number;
    avgProjectValue: number;
  }>;

  /** The narrow profit-only view — Dashboard cards and Analytics tiles
   * call this instead of pulling the full ProjectFinancials/
   * CompanyFinancials shape and discarding most of it. Always derived
   * from getProjectFinancials/getCompanyFinancials underneath; never a
   * separate calculation. Pass either a projectId or a companyId+range. */
  getProfitSummary(
    scope: { projectId: UUID } | (QueryScope & { dateRange: DateRange }),
    filter?: Filter
  ): Promise<ProfitSummary>;

  /** Everyone the company (or one project) currently owes money to —
   * subcontractors and agents, committed-cost model, broken out by
   * line so an AP-style view can render who, not just how much.
   * `filter` narrows which projects' assignments are included, same
   * mechanism as getCompanyFinancials. */
  getPayablesSummary(scope: QueryScope, filter?: Filter): Promise<PayablesSummary>;

  /** Cash-basis taxable revenue (payments received), deductible
   * expenses, and approved (committed) costs for a period — the number
   * set TaxService builds its readiness scoring and reports on top of.
   * See TaxSummary's doc comment in types.ts for the exact formula. */
  getTaxSummary(scope: QueryScope & { dateRange: DateRange }, taxRate?: number, filter?: Filter): Promise<TaxSummary>;

  // ==========================================================
  // Calculation passthroughs — "all pages must use FinancialService"
  // means every formula needs a method here to call, not just an
  // internal implementation detail. These are the exact same pure
  // functions from financialCalculations.ts (Layer 0) that
  // EstimateService/InvoiceService/PaymentService/ChangeOrderService
  // call directly (Layer 2 -> Layer 0 is always allowed); exposing
  // them here too means a page never needs to import
  // financialCalculations.ts itself, only FinancialService.
  // ==========================================================

  /** Line item total (quantity * unit price) — Discounts/Taxes/
   * everything downstream builds on this. */
  calculateLineItemTotal(item: LineItemLike): number;

  /** Sum of line item totals — the subtotal before markup/discount/tax. */
  calculateSubtotal(lineItems: Array<{ total: number }>): number;

  /** THE subtotal -> markup -> discount -> tax -> total formula —
   * covers "Discounts" and "Taxes" from the brief in one call. Used
   * identically for an estimate's own total and for an invoice
   * generated from one. */
  calculateDocumentTotal(subtotal: number, markup: number, discount: number, taxRate: number): DocumentTotal;

  /** "Deposits" — validates a requested deposit against a document
   * total, and computes the amount actually invoiced for it. */
  validateDepositAmount(depositAmount: number, documentTotal: number): DepositValidation;
  calculateDepositInvoiceAmount(depositAmount: number): number;

  /** "Change Orders" revenue contribution once approved. */
  calculateChangeOrderRevenue(totalAmount: number, tax: number): number;

  /** An ESTIMATE's revised total — its own total plus every approved
   * change order against it (draft/pending/rejected contribute
   * nothing). The one shared formula every page showing this figure
   * (Estimate Detail, Project Detail, Change Order Detail, the
   * estimate PDF route) calls, so it can never independently drift. */
  calculateRevisedEstimateTotal(estimateTotal: number, changeOrders: ChangeOrderRevenueLike[]): number;

  /** "Customer Payments" / outstanding balance status. */
  derivePaymentStatus(totalAmount: number, amountPaid: number): PaymentStatus;
  calculateRemainingBalance(totalAmount: number, amountPaid: number): number;

  /** "Subcontractor Costs" / "Agent Commissions" — the committed-cost
   * (assigned-vs-paid) formula, and the outstanding balance derived
   * from it. */
  calculateCommittedCostBalance(assigned: number, paid: number): CommittedCostBalance;
}

export interface FinancialEngineDeps {
  projectService: ProjectService;
  estimateService: EstimateService;
  changeOrderService: ChangeOrderService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  subcontractorService: SubcontractorService;
  agentCommissionService: AgentCommissionService;
  transactionService: TransactionService;
  expenseService: ExpenseService;
  filteringService: FilteringService;
}

/** Inclusive date-range test on a plain YYYY-MM-DD string. Expense dates
 * are stored as dates, not timestamps, so lexicographic comparison is
 * exact here — no timezone shifting, which is what made the equivalent
 * check wrong when it went through `new Date()`. */
function withinRange(date: string, range: DateRange): boolean {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return date >= day(range.start) && date <= day(range.end);
}

/** THE one place "does this invoice count as revenue" is decided —
 * every revenue sum in this engine (project, estimate, company level)
 * filters through this before adding an invoice's total. `void` and
 * `cancelled` are both terminal, non-billed-in-effect states (see
 * validationService.ts's INVOICE_LIFECYCLE_TRANSITIONS doc comment:
 * void is the escape hatch for an invoice already out in the world,
 * cancelled is for one never sent) — neither represents money actually
 * owed or collected, so neither may contribute to revenue. This is
 * deliberately NOT applied inside InvoiceService.listForProject/
 * listForCompany, which must keep returning void/cancelled rows for the
 * UI to display (a voided invoice still needs to be visible, just not
 * counted) — the exclusion belongs here, in the one place revenue is
 * assembled, not duplicated into every page that lists invoices. */
export function isRevenueInvoice(invoice: { lifecycleStatus: string }): boolean {
  return invoice.lifecycleStatus !== "void" && invoice.lifecycleStatus !== "cancelled";
}

/**
 * Concrete implementation. Depends only on Layer 1/2 service
 * interfaces (injected), never on Supabase directly — this file has no
 * data-access code of its own, which is what keeps it a pure
 * composition layer rather than a second place raw queries happen.
 */
export function createFinancialEngine(deps: FinancialEngineDeps): FinancialEngine {
  // transactionService is accepted on FinancialEngineDeps for API
  // compatibility with existing construction call sites
  // (ServicesProvider.tsx, lib/services/testing/inMemoryServices.ts)
  // but is deliberately UNUSED here — every real cash-flow figure now
  // reads from PaymentService/SubcontractorService/AgentCommissionService/
  // ExpenseService's own persisted rows instead (see
  // getRealizedCashFlows/getMileageCostForProjects and
  // DASHBOARD_AUDIT_REPORT.md for why the ledger was removed as a
  // production financial-calculation input).
  const { projectService, estimateService, changeOrderService, invoiceService, paymentService, subcontractorService, agentCommissionService, expenseService, filteringService } = deps;

  /** THE one place a Filter enters this engine's arithmetic: resolves
   * it (if given) against the "projects" entity via FilteringService,
   * returning the set of project ids everything else gets restricted
   * to. Absent filter => every non-deleted project in scope, i.e. no
   * additional narrowing beyond company/date scope — matches Filter's
   * documented "absent means no additional filtering" contract. */
  async function resolveProjectIds(scope: QueryScope, filter?: Filter): Promise<Set<UUID> | null> {
    if (!filter) return null;
    const projects = await filteringService.execute<{ id: UUID }>("projects", scope, filter);
    return new Set(projects.map((p) => p.id));
  }

  async function getProjectFinancials(projectId: UUID): Promise<ProjectFinancials> {
    // includeDeleted: true — financial history is permanent. A deleted
    // (or archived) project must still have its revenue/costs
    // computable; only the UI decides whether to surface a deleted
    // project's page, never FinancialEngine.
    const project = await projectService.getById(projectId, true);
    if (!project) throw new Error(`getProjectFinancials: no project found for id ${projectId}`);
    const scope: QueryScope = { companyId: project.companyId, projectId };

    const [invoices, approvedChangeOrders, subAssignments, agentAssignments, expenseTotals, mileageTrips] = await Promise.all([
      invoiceService.listForProject(projectId),
      changeOrderService.listApprovedChangeOrders(projectId),
      subcontractorService.listAssignments(scope),
      agentCommissionService.listAssignments(scope),
      expenseService.getTotalsForProject(projectId),
      expenseService.listMileageForProject(projectId),
    ]);

    // ---------- REVENUE (invoices + payments + approved change orders — never estimates.total) ----------
    // Void/cancelled invoices never count as revenue — see isRevenueInvoice.
    const invoicesTotal = invoices.filter(isRevenueInvoice).reduce((sum, inv) => sum + inv.total, 0);
    // sumApprovedChangeOrderRevenue's own status==="approved" filter is
    // a no-op here (listApprovedChangeOrders already returned only
    // approved rows) — called anyway so this is the SAME function
    // every page-level "approved change order revenue" figure calls,
    // not a second independent copy of totalAmount+tax.
    const approvedChangeOrderTotal = sumApprovedChangeOrderRevenue(approvedChangeOrders);
    const revisedTotal = invoicesTotal + approvedChangeOrderTotal;

    // originalEstimateTotal is informational only (quoted vs. billed) —
    // never folded into revisedTotal/grossProfit/netProfit below.
    // includeDeleted: true — financial history is permanent. A quoted
    // amount doesn't stop having been quoted just because the estimate
    // record was later deleted; this must stay consistent with every
    // other "historical totals" lookup in this file.
    const estimates = await estimateService.listForProject(projectId, true);
    const originalEstimateTotal = estimates.reduce((sum, e) => sum + e.total, 0);

    // Real, persisted payment data — the SAME PaymentService.
    // getSummaryForInvoice call getEstimateFinancials already uses, so
    // a project's collected cash and its own estimates' collected cash
    // can never disagree about where the number comes from. Previously
    // sourced from transactionService.getProjectLedger, which no real
    // payment ever wrote to in production (see DASHBOARD_AUDIT_REPORT.md).
    const invoicePaymentSummaries = await Promise.all(
      invoices.filter(isRevenueInvoice).map((inv) => paymentService.getSummaryForInvoice(inv.id))
    );
    const amountPaid = asRealizedCost(invoicePaymentSummaries.reduce((sum, s) => sum + s.totalPaid, 0));
    const remainingBalance = calculateRemainingBalance(invoicesTotal, amountPaid);

    // ---------- COSTS ----------
    // Expenses come from ExpenseService — the SOURCE ROWS — not from the
    // ledger. The ledger is append-only, so it structurally cannot
    // represent a soft delete: before this change a deleted expense kept
    // costing the project money forever, because there was no way to
    // retract the row that recorded it. Reading the rows means
    // `deleted_at is null` is the single exclusion rule, applied once
    // inside ExpenseService.
    //
    // getTotalsForProject also resolves expenses attached to the
    // project's ESTIMATES but with a null project_id (real legacy rows
    // are shaped that way), which a ledger sum keyed on project_id
    // silently dropped.
    const expenseItems = expenseTotals.total;
    // Real, persisted mileage rows (ExpenseService owns `mileage_trips`)
    // — not the ledger, which no real mileage-recording code path ever
    // wrote to in production. Currently 0 for every project because
    // mileage tracking has no live table wired yet
    // (ExpenseService.listMileageForProject returns [] until it is —
    // see that method's own doc comment); this will start reflecting
    // real data the moment that table exists, with no further change
    // needed here.
    const mileageCosts = mileageTrips.reduce((sum, trip) => sum + trip.reimbursement, 0);
    // An agent-paid expense books TWO ledger rows for one real-world
    // event (see TRANSACTION_LEDGER.md): the expense itself
    // (material/labor/other_expense — already summed into expenseItems
    // above) AND `agent_reimbursement_owed`, which is a LIABILITY
    // ("the company now owes an agent $X"), not a second cost.
    // TRANSACTION_TYPE_META classifies it exactly that way:
    // `{ effect: "liability" }`, deliberately distinct from the
    // `{ effect: "cost" }` types.
    //
    // This value therefore feeds OUTSTANDING (what's still owed to
    // agents) and never `agentCosts`. Adding it to costs double-counted
    // the same spending — measured during the Expense/Subcontractor/
    // Agent audit: an identical $300 purchase produced $300 of project
    // cost when the company paid it, but $600 when an agent paid it,
    // understating profit by exactly the reimbursement amount on every
    // agent-funded expense.
    // Same reasoning, same source: what's still owed to whoever fronted
    // company money is the expenses' own pending-reimbursement figure,
    // not a ledger liability row that a delete could never retract.
    // NOTE this is still a LIABILITY, never a cost — an agent-funded
    // $300 purchase costs the project $300 once. Adding the
    // reimbursement on top double-counted it (measured during the
    // Expense/Subcontractor/Agent audit: the identical purchase produced
    // $300 of cost company-paid but $600 agent-paid).
    const outstandingReimbursements = expenseTotals.outstandingReimbursements;

    // Real assigned-vs-paid balance, computed by the owning service
    // directly from its own persisted rows (SubcontractorService.
    // getBalance / AgentCommissionService.getBalance) — NOT
    // transactionService.getAssignmentBalance. The shared transaction
    // ledger has no real backing table, so it would report a stale/
    // zero balance for a real, persisted assignment the moment a
    // session restarts. See both services' getBalance doc comments.
    const subBalances = await Promise.all(subAssignments.map((a) => subcontractorService.getBalance(a.id)));
    const subcontractorCosts = asCommittedCost(subBalances.reduce((sum, b) => sum + b.committed, 0));
    const outstandingSubcontractor = asCommittedCost(subBalances.reduce((sum, b) => sum + b.outstanding, 0));

    const agentBalances = await Promise.all(agentAssignments.map((a) => agentCommissionService.getBalance(a.id)));
    const agentCommissionCosts = agentBalances.reduce((sum, b) => sum + b.committed, 0);
    const agentCosts = asCommittedCost(agentCommissionCosts);
    // Outstanding agent = unpaid commission (per assignment) + unpaid
    // reimbursement liability (owed minus paid, company-wide reimbursement
    // rows aren't assignment-scoped so they can't run through
    // getAssignmentBalance — sourced from ExpenseService's own
    // reimbursementStatus instead, via outstandingReimbursements above).
    const outstandingAgent = asCommittedCost(
      agentBalances.reduce((sum, b) => sum + b.outstanding, 0) + outstandingReimbursements
    );

    const totalExpenses = expenseItems + mileageCosts + subcontractorCosts + agentCosts;

    // ---------- PROFIT ----------
    const grossProfit = revisedTotal - (subcontractorCosts + agentCosts);
    const netProfit = revisedTotal - totalExpenses;
    const profitMargin = revisedTotal > 0 ? (netProfit / revisedTotal) * 100 : 0;

    const paymentStatus = derivePaymentStatus(invoicesTotal, amountPaid);

    return {
      projectId,
      originalEstimateTotal,
      approvedChangeOrderTotal,
      revisedTotal,
      subcontractorCosts,
      agentCosts,
      expenseItems,
      mileageCosts,
      totalExpenses,
      grossProfit,
      netProfit,
      profitMargin,
      invoicesTotal,
      amountPaid,
      remainingBalance,
      outstandingSubcontractor,
      outstandingAgent,
      outstandingTotal: asCommittedCost(outstandingSubcontractor + outstandingAgent),
      paymentStatus,
      isFullyPaid: amountPaid >= invoicesTotal && invoicesTotal > 0,
    };
  }

  /**
   * Estimate-scoped counterpart to getProjectFinancials — same
   * formulas, same Layer 0 functions, narrower input set. No new
   * arithmetic: revisedTotal/remainingBalance/expense totals are the
   * exact same calculateRevisedEstimateTotal/calculateRemainingBalance/
   * calculateExpenseTotals calls getProjectFinancials makes, just fed
   * this estimate's own rows instead of the whole project's.
   *
   * Invoices: InvoiceService has no listForEstimate — filtered here
   * from listForProject(projectId) by invoice.estimateId rather than
   * adding a new service method for a filter this engine can already
   * apply itself.
   *
   * Subcontractor/agent costs: sourced from the SAME real
   * assignment-based services getProjectFinancials uses
   * (SubcontractorService/AgentCommissionService), scoped to this
   * estimate's PROJECT (an assignment is a project-level fact — see
   * both services' listAssignments doc comments) — no separate
   * Expense-type-based cost path anymore. This was previously sourced
   * from expenseType "subcontractor"/"agent_commission" rows because
   * the formal Assignment-based services were still in-memory/
   * non-functional; now that they're real, unifying avoids the two
   * code paths silently disagreeing about the same kind of cost
   * depending on whether you're viewing the project or one of its
   * estimates. An expense row still typed "subcontractor"/
   * "agent_commission" for OTHER reasons (e.g. a one-off cost with no
   * formal assignment) is not double-counted here: this estimate's own
   * `expenses` (used for totalExpenses/mileage/etc. below) still
   * includes those rows in `expenseTotals.total`, exactly as
   * getProjectFinancials' `expenseItems` does — only the dedicated
   * subcontractorCosts/agentCommissionCosts figures now come from
   * assignments instead of being re-derived from the same expense rows
   * a second, different way.
   */
  async function getEstimateFinancials(estimateId: UUID): Promise<EstimateFinancials> {
    // includeDeleted: true — same reasoning as getProjectFinancials.
    const estimate = await estimateService.getById(estimateId, true);
    if (!estimate) throw new Error(`getEstimateFinancials: no estimate found for id ${estimateId}`);

    const scope: QueryScope = { companyId: estimate.companyId, projectId: estimate.projectId };
    const [changeOrders, projectInvoices, expenses, subAssignments, agentAssignments] = await Promise.all([
      changeOrderService.listForEstimate(estimateId),
      invoiceService.listForProject(estimate.projectId),
      expenseService.listForEstimate(estimateId),
      subcontractorService.listAssignments(scope),
      agentCommissionService.listAssignments(scope),
    ]);

    // Void/cancelled invoices never count as revenue — see isRevenueInvoice.
    const invoicesForEstimate = projectInvoices.filter((inv) => inv.estimateId === estimateId && isRevenueInvoice(inv));

    // Same function getProjectFinancials calls — sumApprovedChangeOrderRevenue
    // filters to approved internally, so passing every change order (not
    // just pre-filtered ones) is the same call shape used everywhere else.
    const approvedChangeOrderTotal = sumApprovedChangeOrderRevenue(changeOrders);
    const revisedTotal = calculateRevisedEstimateTotal(estimate.total, changeOrders);

    const invoicesTotal = invoicesForEstimate.reduce((sum, inv) => sum + inv.total, 0);

    const paymentSummaries = await Promise.all(
      invoicesForEstimate.map((inv) => paymentService.getSummaryForInvoice(inv.id))
    );
    const amountPaid = paymentSummaries.reduce((sum, p) => sum + p.totalPaid, 0);
    const remainingBalance = calculateRemainingBalance(invoicesTotal, amountPaid);
    const paymentStatus = derivePaymentStatus(invoicesTotal, amountPaid);

    // Same Layer 0 function ExpenseService.getTotalsForProject and
    // getProjectFinancials' cost math both call — applied directly to
    // this estimate's own expense rows (already deleted_at-filtered by
    // ExpenseService.listForEstimate). Still the source for
    // totalExpenses (every expense row, of every type, on this
    // estimate) — only subcontractorCosts/agentCommissionCosts below
    // no longer come from this same breakdown.
    const expenseTotals = calculateExpenseTotals(expenses);
    const totalExpenses = expenseTotals.total;

    // Assignment-based, same formula getProjectFinancials uses —
    // committed cost (max(assigned, paid)) per assignment, summed.
    const subBalances = await Promise.all(subAssignments.map((a) => subcontractorService.getBalance(a.id)));
    const subcontractorCosts = subBalances.reduce((sum, b) => sum + b.committed, 0);
    const agentBalances = await Promise.all(agentAssignments.map((a) => agentCommissionService.getBalance(a.id)));
    const agentCommissionCosts = agentBalances.reduce((sum, b) => sum + b.committed, 0);

    const grossProfit = revisedTotal - (subcontractorCosts + agentCommissionCosts);
    const netProfit = revisedTotal - totalExpenses;
    const profitMargin = revisedTotal > 0 ? (netProfit / revisedTotal) * 100 : 0;

    return {
      estimateId,
      projectId: estimate.projectId,
      estimateTotal: estimate.total,
      approvedChangeOrderTotal,
      revisedTotal,
      invoicesTotal,
      amountPaid,
      remainingBalance,
      paymentStatus,
      isFullyPaid: amountPaid >= invoicesTotal && invoicesTotal > 0,
      subcontractorCosts,
      agentCommissionCosts,
      totalExpenses,
      grossProfit,
      netProfit,
      profitMargin,
    };
  }

  /** THE one place company-wide, period-scoped, real cash flow is
   * assembled — shared by getCompanyFinancials and getTaxSummary so
   * "how much cash actually moved this period, attributed to which
   * project" is computed exactly once, not twice. Every figure is
   * sourced from the OWNING service's real, persisted rows —
   * PaymentService/SubcontractorService/AgentCommissionService — never
   * transactionService's ledger, which no real payment/subcontractor/
   * agent-payment write ever reached reliably in production (the
   * ledger is only a same-session, in-memory double outside tests; see
   * DASHBOARD_AUDIT_REPORT.md for the audit that found Revenue/Payments
   * Received permanently reading as ~$0 because of it). Project
   * attribution for each payment type is resolved here by joining
   * through the already-fetched invoices/assignments/expenses — a
   * lookup, not a new calculation. */
  async function getRealizedCashFlows(scope: QueryScope & { dateRange: DateRange }, filter?: Filter) {
    const [invoicesAll, projectIds, companyExpenses, customerPaymentsAll, subAssignmentsAll, subPaymentsAll, agentAssignmentsAll, agentPaymentsAll] = await Promise.all([
      invoiceService.listForCompany(scope),
      resolveProjectIds(scope, filter),
      expenseService.listForCompany(scope.companyId),
      paymentService.listForCompany(scope),
      subcontractorService.listAssignments({ companyId: scope.companyId }),
      subcontractorService.listPayments(scope),
      agentCommissionService.listAssignments({ companyId: scope.companyId }),
      agentCommissionService.listPayments(scope),
    ]);

    const invoiceProjectId = new Map(invoicesAll.map((inv) => [inv.id, inv.projectId] as const));
    const subAssignmentProjectId = new Map(subAssignmentsAll.map((a) => [a.id, a.projectId] as const));
    const agentAssignmentProjectId = new Map(agentAssignmentsAll.map((a) => [a.id, a.projectId] as const));
    const expenseProjectId = new Map(companyExpenses.map((e) => [e.id, e.projectId] as const));
    const inScope = (projectId: UUID | null | undefined) => !projectIds || (projectId != null && projectIds.has(projectId));

    const customerPayments = customerPaymentsAll.filter(
      (p) => withinRange(p.paymentDate, scope.dateRange) && inScope(invoiceProjectId.get(p.invoiceId))
    );
    const subPayments = subPaymentsAll.filter(
      (p) => withinRange(p.paymentDate, scope.dateRange) && inScope(subAssignmentProjectId.get(p.assignmentId))
    );
    // A reimbursement payment is attributed to a project via the
    // expense it settles (reimbursesExpenseId) when it has no
    // assignmentId of its own.
    const agentPayments = agentPaymentsAll.filter((p) => {
      if (!withinRange(p.paymentDate, scope.dateRange)) return false;
      const paymentProjectId = p.assignmentId
        ? agentAssignmentProjectId.get(p.assignmentId)
        : p.reimbursesExpenseId
          ? expenseProjectId.get(p.reimbursesExpenseId)
          : null;
      return inScope(paymentProjectId);
    });

    return { invoicesAll, projectIds, companyExpenses, customerPayments, subPayments, agentPayments };
  }

  /** Real, persisted mileage cost for a scoped set of projects —
   * ExpenseService owns `mileage_trips`; there is no company-wide
   * listing method (nor is one needed while
   * ExpenseService.listMileageForProject always returns [] — see that
   * method's own doc comment), so this sums per scoped project. Shared
   * by getCompanyFinancials and getTaxSummary so mileage is computed
   * the same way in both. */
  async function getMileageCostForProjects(projectIds: UUID[]): Promise<number> {
    const trips = await Promise.all(projectIds.map((id) => expenseService.listMileageForProject(id)));
    return trips.reduce((sum, t) => sum + t.reduce((s, trip) => s + trip.reimbursement, 0), 0);
  }

  async function getCompanyFinancials(scope: QueryScope & { dateRange: DateRange }, filter?: Filter): Promise<CompanyFinancials> {
    const [projects, cashFlows] = await Promise.all([
      projectService.list({ companyId: scope.companyId }),
      getRealizedCashFlows(scope, filter),
    ]);
    const { invoicesAll, projectIds, companyExpenses, customerPayments, subPayments, agentPayments } = cashFlows;

    // A Filter narrows to a project subset — already applied identically
    // to every cash-flow source inside getRealizedCashFlows, so no
    // number in the returned CompanyFinancials reflects a different
    // filtered set than any other.
    const invoices = projectIds ? invoicesAll.filter((inv) => projectIds.has(inv.projectId)) : invoicesAll;
    const scopedProjects = projectIds ? projects.filter((p) => projectIds.has(p.id)) : projects;
    const inScope = (projectId: UUID | null | undefined) => !projectIds || (projectId != null && projectIds.has(projectId));

    // Cash-basis, period-scoped — see file header for why this is a
    // DIFFERENT model than getProjectFinancials' committed-cost figures.
    const totalRevenue = asRealizedCost(customerPayments.reduce((sum, p) => sum + p.amount, 0));
    const subcontractorPaid = asRealizedCost(subPayments.reduce((sum, p) => sum + p.amount, 0));

    // Cash actually paid out to agents this period. `agentPaid` is
    // reported as-is (it answers "how much cash went to agents,"
    // which legitimately includes reimbursements), but see
    // `agentCostContribution` below for why only the COMMISSION half
    // of it may enter totalExpenses.
    const agentReimbursementsSettled = asRealizedCost(
      agentPayments.filter((p) => p.paymentType === "reimbursement").reduce((sum, p) => sum + p.amount, 0)
    );
    const agentCommissionPaid = asRealizedCost(
      agentPayments.filter((p) => p.paymentType === "commission").reduce((sum, p) => sum + p.amount, 0)
    );
    const agentPaid = asRealizedCost(agentCommissionPaid + agentReimbursementsSettled);
    // Expenses from the source rows, same as getProjectFinancials — but
    // period-scoped and CASH-BASIS, which is the company-level model
    // (see the file header). Only expenses actually settled (isPaid) and
    // dated inside the range count: a period P&L must not book a vendor
    // bill that hasn't been paid yet. Soft-deleted rows never arrive
    // here at all, ExpenseService having already excluded them.
    const periodExpenses = companyExpenses.filter(
      (e) => e.isPaid && withinRange(e.expenseDate, scope.dateRange) && inScope(e.projectId)
    );
    const expenseItems = calculateExpenseTotals(periodExpenses).total;
    const mileageCosts = await getMileageCostForProjects(scopedProjects.map((p) => p.id));
    // Reimbursing an agent is NOT an additional cost — it's settling a
    // liability for a purchase already counted in `expenseItems` (an
    // agent-paid expense books both an expense row and a reimbursement
    // row; see TRANSACTION_LEDGER.md, and TRANSACTION_TYPE_META which
    // types the reimbursement pair as liability/cash_out, never
    // "cost"). Counting both double-charged the same spending —
    // measured during the Expense/Subcontractor/Agent audit: a single
    // $300 agent-funded purchase showed totalExpenses of $300 before
    // settlement and $600 after, so merely repaying an agent appeared
    // to destroy $300 of profit. Only the commission half is a real
    // additional cost. (getProjectFinancials was fixed for the same
    // double-count on its committed-cost side.)
    const totalExpenses = expenseItems + mileageCosts + subcontractorPaid + agentCommissionPaid;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Void/cancelled invoices never count as revenue — see isRevenueInvoice.
    const totalInvoiced = invoices.filter(isRevenueInvoice).reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = totalRevenue; // same normalized source (real payments), not invoice.amount_paid
    const totalOutstanding = totalInvoiced - totalPaid;

    // Lifetime outstanding payables — not period-scoped, matches
    // getPayablesSummary computed without a dateRange. Same filter
    // passed through so payables reflect the same project subset as
    // every other number returned here.
    const payables = await getPayablesSummary({ companyId: scope.companyId }, filter);

    return {
      companyId: scope.companyId,
      range: scope.dateRange,
      totalRevenue,
      subcontractorPaid,
      agentPaid,
      agentCommissionPaid,
      expenseItems,
      mileageCosts,
      totalExpenses,
      netProfit,
      profitMargin,
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      outstandingSubcontractor: payables.totalOutstandingSubcontractor,
      outstandingAgent: payables.totalOutstandingAgent,
      outstandingTotal: payables.totalOutstanding,
      completedProjects: scopedProjects.filter((p) => p.status === "completed").length,
      activeProjects: scopedProjects.filter((p) => p.status === "active" || p.status === "in_progress").length,
    };
  }

  async function getFinancialsForProjects(projectIds: UUID[]): Promise<Map<UUID, ProjectFinancials>> {
    const entries = await Promise.all(projectIds.map(async (id) => [id, await getProjectFinancials(id)] as const));
    return new Map(entries);
  }

  async function getClientFinancials(clientId: UUID, companyId: UUID) {
    const projects = (await projectService.list({ companyId })).filter((p) => p.clientId === clientId);
    const financials = await getFinancialsForProjects(projects.map((p) => p.id));
    const all = Array.from(financials.values());

    const totalEstimated = all.reduce((sum, f) => sum + f.originalEstimateTotal, 0);
    const totalInvoiced = all.reduce((sum, f) => sum + f.invoicesTotal, 0);
    const totalPaid = all.reduce((sum, f) => sum + f.amountPaid, 0);

    return {
      totalEstimated,
      totalInvoiced,
      totalPaid,
      outstandingReceivable: totalInvoiced - totalPaid,
      projectCount: projects.length,
      avgProjectValue: projects.length > 0 ? totalInvoiced / projects.length : 0,
    };
  }

  async function getProfitSummary(
    scope: { projectId: UUID } | (QueryScope & { dateRange: DateRange }),
    filter?: Filter
  ): Promise<ProfitSummary> {
    if (!("dateRange" in scope)) {
      // Discriminated on `dateRange`, not `projectId` — QueryScope also
      // carries an optional `projectId`, so `"projectId" in scope`
      // doesn't actually narrow away the QueryScope branch and left
      // `scope.projectId` typed as possibly-undefined below.
      const projectId = scope.projectId;
      const project = await projectService.getById(projectId, true);
      if (!project) throw new Error(`getProfitSummary: no project found for id ${projectId}`);
      const f = await getProjectFinancials(projectId);
      return {
        scope: { companyId: project.companyId, projectId },
        revenue: f.revisedTotal,
        totalCosts: f.totalExpenses,
        grossProfit: f.grossProfit,
        netProfit: f.netProfit,
        profitMargin: f.profitMargin,
      };
    }
    const f = await getCompanyFinancials(scope, filter);
    return {
      scope,
      revenue: f.totalRevenue,
      totalCosts: f.totalExpenses,
      // agentCommissionPaid, not agentPaid — reimbursement settlements
      // repay an already-counted expense and are not a cost (see
      // getCompanyFinancials' comment on the double-count).
      grossProfit: f.totalRevenue - (f.subcontractorPaid + f.agentCommissionPaid),
      netProfit: f.netProfit,
      profitMargin: f.profitMargin,
    };
  }

  async function getPayablesSummary(scope: QueryScope, filter?: Filter): Promise<PayablesSummary> {
    const [subAssignmentsAll, agentAssignmentsAll, projectIds] = await Promise.all([
      subcontractorService.listAssignments(scope),
      agentCommissionService.listAssignments(scope),
      resolveProjectIds(scope, filter),
    ]);
    // Same restriction pattern as getCompanyFinancials: a Filter
    // narrows to a project subset, applied identically to both roles
    // so "who do we owe" never mixes filtered and unfiltered payees.
    const subAssignments = projectIds ? subAssignmentsAll.filter((a) => projectIds.has(a.projectId)) : subAssignmentsAll;
    const agentAssignments = projectIds ? agentAssignmentsAll.filter((a) => projectIds.has(a.projectId)) : agentAssignmentsAll;

    const subLines: PayableLine[] = await Promise.all(
      subAssignments.map(async (a): Promise<PayableLine> => {
        // See getProjectFinancials' comment: real, persisted balance
        // from the owning service, not the fictional-backing ledger.
        const balance = await subcontractorService.getBalance(a.id);
        return {
          role: "subcontractor",
          assignmentId: a.id,
          payeeId: a.subcontractorId,
          payeeName: a.subcontractorName,
          assigned: asCommittedCost(balance.assigned),
          paid: asCommittedCost(balance.paid),
          outstanding: asCommittedCost(balance.outstanding),
        };
      })
    );

    const agentLines: PayableLine[] = await Promise.all(
      agentAssignments.map(async (a): Promise<PayableLine> => {
        const balance = await agentCommissionService.getBalance(a.id);
        return {
          role: "agent",
          assignmentId: a.id,
          payeeId: a.agentId,
          payeeName: a.agentName,
          assigned: asCommittedCost(balance.assigned),
          paid: asCommittedCost(balance.paid),
          outstanding: asCommittedCost(balance.outstanding),
        };
      })
    );

    const lines = [...subLines, ...agentLines];
    const totalOutstandingSubcontractor = asCommittedCost(subLines.reduce((sum, l) => sum + l.outstanding, 0));
    const totalOutstandingAgent = asCommittedCost(agentLines.reduce((sum, l) => sum + l.outstanding, 0));

    return {
      scope,
      lines,
      totalOutstandingSubcontractor,
      totalOutstandingAgent,
      totalOutstanding: asCommittedCost(totalOutstandingSubcontractor + totalOutstandingAgent),
    };
  }

  async function getTaxSummary(scope: QueryScope & { dateRange: DateRange }, taxRate = 0.25, filter?: Filter): Promise<TaxSummary> {
    const { projectIds, companyExpenses, customerPayments, subPayments, agentPayments } = await getRealizedCashFlows(scope, filter);

    // Taxable revenue = payments actually RECEIVED, cash-basis — an
    // unpaid invoice is not taxable income, so this deliberately does
    // NOT use invoicesTotal (billed) the way revisedTotal does at the
    // project level.
    const taxableRevenue = asRealizedCost(customerPayments.reduce((sum, p) => sum + p.amount, 0));

    // Same cash-basis, period-scoped expense set getCompanyFinancials
    // uses — one rule, so "deductible expenses" on the tax report and
    // "total expenses" on the dashboard can never disagree for the same
    // range. Mileage is real, persisted data (ExpenseService owns
    // `mileage_trips`) — same source getCompanyFinancials uses, not the
    // ledger, which had its own now-removed dependency here.
    const scopedProjectIds = projectIds ? Array.from(projectIds) : (await projectService.list({ companyId: scope.companyId })).map((p) => p.id);
    const deductibleExpenses =
      calculateExpenseTotals(
        companyExpenses.filter(
          (e) => e.isPaid && withinRange(e.expenseDate, scope.dateRange) && (!projectIds || (e.projectId !== null && projectIds.has(e.projectId)))
        )
      ).total + (await getMileageCostForProjects(scopedProjectIds));

    // Approved costs = subcontractor payments + agent commission +
    // agent reimbursement ACTUALLY PAID this period — same reasoning as
    // getCompanyFinancials.agentPaid above: a tax period counts cash
    // that moved ("_paid"), not a liability merely booked ("_owed").
    // Deductibility of an unpaid liability is between the company and
    // its CPA, not something this engine should presume.
    const approvedCosts = asCommittedCost(
      subPayments.reduce((sum, p) => sum + p.amount, 0) + agentPayments.reduce((sum, p) => sum + p.amount, 0)
    );

    const netTaxableIncome = taxableRevenue - deductibleExpenses - approvedCosts;

    return {
      scope,
      taxableRevenue,
      deductibleExpenses,
      approvedCosts,
      netTaxableIncome,
      estimatedTaxLiability: netTaxableIncome > 0 ? netTaxableIncome * taxRate : 0,
    };
  }

  return {
    getProjectFinancials,
    getEstimateFinancials,
    getCompanyFinancials,
    getFinancialsForProjects,
    getClientFinancials,
    getProfitSummary,
    getPayablesSummary,
    getTaxSummary,
    // Passthroughs to financialCalculations.ts — see the interface
    // doc comment above for why these exist as methods here too.
    calculateLineItemTotal,
    calculateSubtotal,
    calculateDocumentTotal,
    validateDepositAmount,
    calculateDepositInvoiceAmount,
    calculateChangeOrderRevenue,
    calculateRevisedEstimateTotal,
    derivePaymentStatus,
    calculateRemainingBalance,
    calculateCommittedCostBalance,
  };
}
