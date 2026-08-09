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
 * `revisedTotal = invoicesTotal + UNBILLED approvedChangeOrderTotal`.
 * This replaces contractor-pwa's `resolveProjectTotal(estimate.total,
 * invoice.total)`, which read a cached, app-cascaded field on the
 * estimate — exactly the "duplicated estimate field" this rebuild
 * removes. `originalEstimateTotal` is still returned, but ONLY as a
 * quoted-vs-billed comparison figure; it must never be summed into
 * revenue or profit.
 *
 * The word UNBILLED is load-bearing. Approving a change order now bills
 * it on the estimate's invoice as a line item (changeOrderInvoiceSync —
 * the customer must actually receive a bill for the extra work), so
 * that money is already inside `invoicesTotal`. Adding the same change
 * order again from ChangeOrderService would double-count it. Each
 * approved change order therefore contributes EXACTLY ONCE: as an
 * invoice line once billed, as a standalone revenue input until then
 * (or again, if the invoice carrying it is later voided).
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
  CostEntry,
  PayeeBalance,
  PayeeRole,
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
  calculateAgentCommissionSplit,
  calculateExpenseTotals,
  calculateJobProfit,
  type DocumentTotal,
  type DepositValidation,
  type LineItemLike,
  type CommittedCostBalance,
  type AgentCommissionSplit,
  type ChangeOrderRevenueLike,
} from "./financialCalculations";
import { billedChangeOrderIds } from "./changeOrderInvoiceSync";
import type { ProjectService } from "./projectService";
import type { EstimateService } from "./estimateService";
import type { ChangeOrderService } from "./changeOrderService";
import type { InvoiceService } from "./invoiceService";
import type { PaymentService } from "./paymentService";
import type { SubcontractorService } from "./subcontractorService";
import type { AgentCommissionService } from "./agentCommissionService";
import type { TransactionService } from "./transactionService";
import { EXPENSE_TYPE_LABEL, type Expense, type ExpenseService } from "./expenseService";
import type { FilteringService } from "./filteringService";
import type { TeamAssignmentService } from "./teamAssignmentService";

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

  /**
   * THE unified cost view — every expense, subcontractor payment and
   * agent payment that bears on this estimate, in one chronological
   * list, each row labeled with the domain model it came from and how
   * this engine treats it for cost (see CostEntry/CostEntryTreatment).
   *
   * A READ-SIDE PROJECTION, NOT A MERGE. The three domain models keep
   * their own services and tables — an expense is a cost incurred, an
   * assignment is a commitment with its own assigned/paid/outstanding
   * lifecycle — because collapsing them would destroy outstanding-balance
   * tracking and double-count every payment (an assignment's cost is
   * already counted at `max(assigned, paid)`; adding its payments again
   * counts the same money twice). Each returned `id` is the id of the
   * real row in its own table; nothing is copied or re-persisted.
   *
   * Callers render this list; they must NOT sum it for a cost total —
   * getEstimateFinancials/getProjectFinancials remain the only source of
   * that, which is exactly what `treatment` exists to make obvious.
   */
  getEstimateCostEntries(estimateId: UUID): Promise<CostEntry[]>;

  /** Project-scoped counterpart of getEstimateCostEntries — same
   * projection, same rules, every expense on the project rather than
   * one estimate's. */
  getProjectCostEntries(projectId: UUID): Promise<CostEntry[]>;

  /**
   * Per-payee money view for subcontractors or agents — what
   * /subcontractors, /agents and both assignment panels render.
   *
   * `contracted` comes from assignments; `paid` comes from EXPENSE ROWS
   * (one payment = one expense record), so a payee's page and project
   * profit read the same records and cannot disagree. Assignments
   * contribute no cost — only `paid` does.
   *
   * Scope-wide: pass `{ companyId }` for the roster pages, or
   * `{ companyId, projectId }` for a single project's panel.
   */
  /** Per-payee contracted/paid/outstanding.
   *
   * "team_member" is the same shape as the other two: assignments come
   * from estimate_team_members, `paid` from expense rows typed `labor`
   * and tagged with that person as PAYEE. It reuses the identical
   * calculateCommittedCostBalance — a third role, not a third formula.
   * Existing callers passing "subcontractor"/"agent" are unaffected. */
  getPayeeBalances(scope: QueryScope, role: PayeeRole): Promise<PayeeBalance[]>;

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

  /** Agent-commission allocation — an equal split of a percentage of
   * whatever profit remains on an ESTIMATE. `remainingProfit` is
   * EstimateFinancials.netProfit, which this engine already computes;
   * pass it straight through rather than re-deriving revenue−costs at
   * the call site. See financialCalculations.calculateAgentCommissionSplit. */
  calculateAgentCommissionSplit(remainingProfit: number, commissionPercent: number | null, agentCount: number): AgentCommissionSplit;
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
  /** OPTIONAL. Only getPayeeBalances(scope, "team_member") uses it, so
   * every existing construction of the engine keeps working untouched.
   * Without it that role simply returns no assignment-backed rows. */
  teamAssignmentService?: TeamAssignmentService;
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

  /** Sum of the expense rows that represent money actually paid to one
   * payee — the ONLY record of a subcontractor/agent payment now that
   * one payment is one expense record.
   *
   * `estimateId` narrows it to ONE JOB. An assignment names the estimate
   * it is for, and so does the payment that settles it, so matching on
   * the payee alone credits a payment made for one job against an
   * assignment on another. Pass the assignment's estimate and only
   * payments naming that same estimate count.
   *
   * Omit it to keep the payee-wide sum, which is still correct for
   * assignments that carry no estimate — there is no job on the record
   * to match against. */
  function sumPaidToPayee(
    expenses: Expense[],
    payeeType: "subcontractor" | "agent" | "employee",
    payeeId: UUID,
    estimateId?: UUID | null
  ): number {
    return expenses
      .filter(
        (e) =>
          e.payeeType === payeeType &&
          e.payeeId === payeeId &&
          (estimateId === undefined || e.estimateId === estimateId)
      )
      .reduce((sum, e) => sum + e.amount, 0);
  }

  /** Split one payee's payments into the part that names a job we have
   * an assignment for, and the part that does not.
   *
   * The two halves are disjoint by construction, which is what keeps a
   * single payment from being credited twice: an expense naming an
   * assigned estimate settles THAT assignment and is excluded from the
   * pool the estimate-less assignments share. */
  function partitionPaidByJob(
    expenses: Expense[],
    payeeType: "subcontractor" | "agent" | "employee",
    payeeId: UUID,
    assignedEstimateIds: Set<UUID>
  ): { perEstimate: Map<UUID, number>; unclaimed: number } {
    const perEstimate = new Map<UUID, number>();
    let unclaimed = 0;
    for (const e of expenses) {
      if (e.payeeType !== payeeType || e.payeeId !== payeeId) continue;
      if (e.estimateId && assignedEstimateIds.has(e.estimateId)) {
        perEstimate.set(e.estimateId, (perEstimate.get(e.estimateId) ?? 0) + e.amount);
      } else {
        unclaimed += e.amount;
      }
    }
    return { perEstimate, unclaimed };
  }

  /** Outstanding across a set of contracts: what was CONTRACTED via
   * assignments minus what has actually been PAID via expense rows,
   * floored at zero per payee by the shared calculateCommittedCostBalance.
   * Assignments contribute no cost here — only the commitment that
   * outstanding is measured against. */
  function sumOutstandingAgainstContracts(
    contracts: Array<{ payeeId: UUID; contracted: number }>,
    expenses: Expense[],
    payeeType: "subcontractor" | "agent" | "employee"
  ): number {
    const contractedByPayee = new Map<UUID, number>();
    for (const c of contracts) {
      contractedByPayee.set(c.payeeId, (contractedByPayee.get(c.payeeId) ?? 0) + c.contracted);
    }
    let outstanding = 0;
    for (const [payeeId, contracted] of contractedByPayee) {
      outstanding += calculateCommittedCostBalance(contracted, sumPaidToPayee(expenses, payeeType, payeeId)).outstanding;
    }
    return outstanding;
  }

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

    const [invoices, approvedChangeOrders, subAssignments, agentAssignments, expenses, mileageTrips, teamAssignments] = await Promise.all([
      invoiceService.listForProject(projectId),
      changeOrderService.listApprovedChangeOrders(projectId),
      subcontractorService.listAssignments(scope),
      agentCommissionService.listAssignments(scope),
      expenseService.listForProject(projectId),
      expenseService.listMileageForProject(projectId),
      deps.teamAssignmentService?.listAssignments(scope) ?? Promise.resolve([]),
    ]);

    // ---------- REVENUE (invoices + payments + approved change orders — never estimates.total) ----------
    // Void/cancelled invoices never count as revenue — see isRevenueInvoice.
    const invoicesTotal = invoices.filter(isRevenueInvoice).reduce((sum, inv) => sum + inv.total, 0);
    // sumApprovedChangeOrderRevenue's own status==="approved" filter is
    // a no-op here (listApprovedChangeOrders already returned only
    // approved rows) — called anyway so this is the SAME function
    // every page-level "approved change order revenue" figure calls,
    // not a second independent copy of totalAmount+tax.
    //
    // …but only for change orders NOT already billed on an invoice.
    // Approving a change order now folds it into the estimate's invoice
    // as a line item (changeOrderInvoiceSync — the customer has to
    // actually be billed for the extra work). Once that happens the
    // money is already inside `invoicesTotal`, so adding it here too
    // would count the same dollars twice. Each approved change order
    // contributes exactly once: as an invoice line once billed, as a
    // standalone revenue input until then.
    //
    // The line-item fetch is skipped entirely when there are no
    // approved change orders — the overwhelmingly common case — so
    // this costs nothing on the hot path. listForProject does not
    // return line items; only getById does.
    const billed = approvedChangeOrders.length > 0
      ? billedChangeOrderIds(
          (await Promise.all(invoices.filter(isRevenueInvoice).map((inv) => invoiceService.getById(inv.id))))
            .map((inv) => inv?.lineItems ?? [])
        )
      : new Set<UUID>();
    const unbilledApprovedChangeOrders = approvedChangeOrders.filter((co) => !billed.has(co.id));
    const approvedChangeOrderTotal = sumApprovedChangeOrderRevenue(unbilledApprovedChangeOrders);
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
    // BATCHED: getSummaryForInvoice costs two round-trips per invoice
    // (the invoice's own total, then its payments) and this ran it once
    // per invoice. getSummariesForInvoices takes the totals we already
    // hold and fetches every invoice's payments in ONE query — same
    // formulas, same figures. At a measured ~130ms round-trip floor,
    // that is the difference between 2N calls and 1.
    const revenueInvoices = invoices.filter(isRevenueInvoice);
    const invoicePaymentSummaries = Object.values(
      await paymentService.getSummariesForInvoices(revenueInvoices.map((inv) => ({ id: inv.id, total: inv.total })))
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
    // Same figure ExpenseService.getTotalsForProject returns (it is
    // calculateExpenseTotals over these same rows) — computed here so the
    // per-payee attribution above can use the rows themselves.
    const expenseTotals = calculateExpenseTotals(expenses);
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
    // ONE PAYMENT = ONE EXPENSE RECORD. Subcontractor and agent cost are
    // BUCKETS of the expense rows already counted in `expenseItems`
    // (calculateExpenseTotals' byType), never a second figure summed on
    // top — see calculateJobProfit's doc for the double-count that
    // assignment-committed costing produced here before.
    const subcontractorCosts = asCommittedCost(expenseTotals.byType.subcontractor ?? 0);
    const agentCommissionCosts = expenseTotals.byType.agent_commission ?? 0;
    const agentCosts = asCommittedCost(agentCommissionCosts);

    // Assignments no longer carry cost — they carry the CONTRACTED
    // amount, which is what outstanding is measured against:
    //   outstanding = contracted − actually paid (the expense rows).
    // Aggregated per payee rather than per assignment, because a payee
    // with two assignments on one project has one running balance.
    const outstandingSubcontractor = asCommittedCost(
      sumOutstandingAgainstContracts(subAssignments.map((a) => ({ payeeId: a.subcontractorId, contracted: a.contractedAmount })), expenses, "subcontractor")
    );
    // Agent outstanding also carries unpaid reimbursement liability —
    // money owed to an agent who fronted an expense — which is tracked
    // on the expense row's own reimbursementStatus, not an assignment.
    const outstandingAgent = asCommittedCost(
      sumOutstandingAgainstContracts(agentAssignments.map((a) => ({ payeeId: a.agentId, contracted: a.assignedAmount })), expenses, "agent") +
        outstandingReimbursements
    );

    /* Assigned team labour that has NOT been paid yet — the same
     * contracted-minus-paid measure the two above use, for the third
     * kind of person a job commits money to.
     *
     * NOT DOUBLE COUNTED, structurally: only the REMAINDER appears
     * here. Labour actually paid is an `estimate_expenses` row typed
     * `labor`, already inside `expenseItems`; this adds what is left of
     * the commitment on top, so the pair equals max(assigned, paid) and
     * never assigned + paid. The moment the labour is paid, the
     * expense rises and this falls by the same amount.
     *
     * Like the other two it is an OUTSTANDING figure, not a cost:
     * `totalExpenses` and `netProfit` are untouched, so no historical
     * profit number moves. */
    const outstandingTeamLabour = asCommittedCost(
      sumOutstandingAgainstContracts(
        (teamAssignments as Array<{ userId: UUID; amount: number }>).map((a) => ({
          payeeId: a.userId,
          contracted: a.amount,
        })),
        expenses,
        "employee"
      )
    );

    // ---------- COST + PROFIT ----------
    // THE shared definition — the identical call getEstimateFinancials
    // makes, so a project and its estimates can never disagree about
    // what "total cost" or "net profit" mean. See
    // financialCalculations.calculateJobProfit.
    const { totalExpenses, grossProfit, netProfit, profitMargin } = calculateJobProfit(revisedTotal, {
      expenseItems,
      mileageCosts,
      subcontractorCosts,
      agentCosts,
      // Same term the estimate adds, project-scoped — so a project and
      // its estimates cannot disagree about what the job costs.
      committedRemaining: outstandingTeamLabour,
    });

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
      outstandingTeamLabour,
      outstandingTotal: asCommittedCost(
        outstandingSubcontractor + outstandingAgent + outstandingTeamLabour
      ),
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

    /* Sub/agent assignments are still deliberately NOT fetched: they
     * belong to a PROJECT, not an estimate, so attributing one to a
     * single estimate would be a guess. Team assignments are the
     * exception — `estimate_team_members` carries the estimate id, so
     * the commitment is unambiguously this job's. */
    const estScope: QueryScope = { companyId: estimate.companyId, projectId: estimate.projectId };
    const [changeOrders, projectInvoices, expenses, mileageTrips, teamAssignments, subAssignments, agentAssignments] =
      await Promise.all([
        changeOrderService.listForEstimate(estimateId),
        invoiceService.listForProject(estimate.projectId),
        expenseService.listForEstimate(estimateId),
        expenseService.listMileageForProject(estimate.projectId),
        deps.teamAssignmentService?.listForEstimate(estimateId) ?? Promise.resolve([]),
        subcontractorService.listAssignments(estScope),
        agentCommissionService.listAssignments(estScope),
      ]);

    // Void/cancelled invoices never count as revenue — see isRevenueInvoice.
    const invoicesForEstimate = projectInvoices.filter((inv) => inv.estimateId === estimateId && isRevenueInvoice(inv));

    // Same function getProjectFinancials calls — sumApprovedChangeOrderRevenue
    // filters to approved internally, so passing every change order (not
    // just pre-filtered ones) is the same call shape used everywhere else.
    const approvedChangeOrderTotal = sumApprovedChangeOrderRevenue(changeOrders);
    const revisedTotal = calculateRevisedEstimateTotal(estimate.total, changeOrders);

    const invoicesTotal = invoicesForEstimate.reduce((sum, inv) => sum + inv.total, 0);

    // Batched for the same reason as getProjectFinancials above.
    const paymentSummaries = Object.values(
      await paymentService.getSummariesForInvoices(invoicesForEstimate.map((inv) => ({ id: inv.id, total: inv.total })))
    );
    const amountPaid = paymentSummaries.reduce((sum, p) => sum + p.totalPaid, 0);
    const remainingBalance = calculateRemainingBalance(invoicesTotal, amountPaid);
    const paymentStatus = derivePaymentStatus(invoicesTotal, amountPaid);

    // Same Layer 0 function getProjectFinancials' cost math calls,
    // applied to this estimate's own expense rows (already
    // deleted_at-filtered by ExpenseService.listForEstimate). Its
    // byType buckets ARE subcontractorCosts/agentCommissionCosts below —
    // one payment, one expense record, counted once.
    const expenseTotals = calculateExpenseTotals(expenses);
    const expenseItems = expenseTotals.total;
    // Mileage is project-scoped (ExpenseService owns `mileage_trips` per
    // project, not per estimate) — the same approximation already made
    // for subcontractor/agent assignments just below, and the reason
    // this method's own doc calls that scoping out.
    const mileageCosts = mileageTrips.reduce((sum, trip) => sum + trip.reimbursement, 0);

    // Buckets of the expense rows above — identical rule to
    // getProjectFinancials. Assignments are NOT read for cost here.
    const subcontractorCosts = expenseTotals.byType.subcontractor ?? 0;
    const agentCommissionCosts = expenseTotals.byType.agent_commission ?? 0;

    /* ASSIGNED TEAM LABOUR AS COST.
     *
     * Committing a member to this estimate at $600 is $600 this job
     * will cost, whether or not it has been paid yet — so it belongs in
     * the job's cost, not only in a payables list.
     *
     * Counted as a REMAINDER, per member: what was assigned, minus what
     * has actually been paid to them on this estimate (labour expense
     * rows, which are already inside `expenseItems`). Paying the labour
     * therefore shifts the same dollars from `teamLabourRemaining` into
     * `expenseItems` and `totalExpenses` does not move — which is
     * exactly the double count that got assignment-committed costing
     * removed from calculateJobProfit before. */
    const assignedByMember = new Map<UUID, number>();
    for (const a of teamAssignments as Array<{ userId: UUID; amount: number }>) {
      assignedByMember.set(a.userId, (assignedByMember.get(a.userId) ?? 0) + a.amount);
    }
    let teamLabourRemaining = 0;
    let teamLabourAssigned = 0;
    for (const [userId, assigned] of assignedByMember) {
      teamLabourAssigned += assigned;
      teamLabourRemaining += calculateCommittedCostBalance(
        assigned,
        sumPaidToPayee(expenses, "employee", userId)
      ).outstanding;
    }

    /* Subcontractor and agent commitments, treated exactly the same way.
     *
     * ONLY assignments that name THIS estimate count. Sub/agent
     * assignments belong to a project and most carry no estimate id;
     * spreading one of those across the project's estimates would
     * invent cost on jobs it was never promised to. An assignment that
     * does name the estimate is unambiguous, so it counts — and it is
     * the same remainder (assigned − paid on this estimate), so a
     * payment moves the money from this term into `expenseItems`
     * without changing the total. */
    const remainderFor = (
      assignments: Array<{ estimateId: UUID | null; payeeId: UUID; contracted: number }>,
      payeeType: "subcontractor" | "agent"
    ): { assigned: number; remaining: number } => {
      const byPayee = new Map<UUID, number>();
      for (const a of assignments) {
        if (a.estimateId !== estimateId) continue;
        byPayee.set(a.payeeId, (byPayee.get(a.payeeId) ?? 0) + a.contracted);
      }
      let assigned = 0;
      let remaining = 0;
      for (const [payeeId, amount] of byPayee) {
        assigned += amount;
        remaining += calculateCommittedCostBalance(amount, sumPaidToPayee(expenses, payeeType, payeeId)).outstanding;
      }
      return { assigned, remaining };
    };

    const sub = remainderFor(
      subAssignments.map((a) => ({ estimateId: a.estimateId, payeeId: a.subcontractorId, contracted: a.contractedAmount })),
      "subcontractor"
    );
    const agent = remainderFor(
      agentAssignments.map((a) => ({ estimateId: a.estimateId, payeeId: a.agentId, contracted: a.assignedAmount })),
      "agent"
    );

    // THE shared definition — identical call to the one
    // getProjectFinancials makes. This method previously summed ONLY
    // expense rows into `totalExpenses`, so an estimate's cost and
    // profit silently ignored mileage/subcontractor/agent cost and read
    // higher than its own project's. See calculateJobProfit.
    const { totalExpenses, grossProfit, netProfit, profitMargin } = calculateJobProfit(revisedTotal, {
      expenseItems,
      mileageCosts,
      subcontractorCosts,
      agentCosts: agentCommissionCosts,
      committedRemaining: teamLabourRemaining + sub.remaining + agent.remaining,
    });

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
      teamLabourAssigned,
      teamLabourRemaining,
      subcontractorAssigned: sub.assigned,
      subcontractorRemaining: sub.remaining,
      agentAssigned: agent.assigned,
      agentRemaining: agent.remaining,
      expenseItems,
      mileageCosts,
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
  /**
   * Shared body of getEstimateCostEntries/getProjectCostEntries — the
   * ONE place the three domain models are projected into a single
   * chronological list. See getEstimateCostEntries' interface doc for
   * why this is a read-side projection rather than a merge, and why
   * `treatment` (not a naive sum) is what keeps this list honest against
   * getProjectFinancials' committed-cost model.
   *
   * Subcontractor/agent rows are PROJECT-scoped even when the caller
   * asked for one estimate, because an assignment belongs to a project,
   * not an estimate — the exact same scoping getEstimateFinancials
   * already uses for its own subcontractorCosts/agentCommissionCosts, so
   * this list and those totals always describe the same set of records.
   */
  async function buildCostEntries(companyId: UUID, projectId: UUID | null, expenses: Expense[]): Promise<CostEntry[]> {
    void companyId;
    void projectId;
    // ONE PAYMENT = ONE EXPENSE RECORD, so every cost row is an expense
    // row. Subcontractor and agent payments are expenses too (typed
    // `subcontractor`/`agent_commission` and tagged with their payee) —
    // they are labeled by `source` below from that type, NOT fetched
    // from a separate payment table. Reading the legacy
    // subcontractor_payments/agent_payments tables here would show
    // phantom rows for money that is no longer counted as cost.
    return expenses
      .map((e): CostEntry => ({
        id: e.id,
        source:
          e.expenseType === "subcontractor" ? "subcontractor"
          : e.expenseType === "agent_commission" ? "agent"
          : "expense",
        // Every row is a real cost now — there is no "payment against a
        // commitment" or "settlement" row, because neither writes a
        // record of its own any more.
        treatment: "cost",
        date: e.expenseDate,
        label: e.vendor || EXPENSE_TYPE_LABEL[e.expenseType],
        category: EXPENSE_TYPE_LABEL[e.expenseType],
        description: e.description,
        amount: e.amount,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.source.localeCompare(b.source));
  }

  async function getEstimateCostEntries(estimateId: UUID): Promise<CostEntry[]> {
    // includeDeleted: true — same reasoning as getEstimateFinancials:
    // financial history is permanent, and this list must still render
    // for an estimate that was later deleted.
    const estimate = await estimateService.getById(estimateId, true);
    if (!estimate) throw new Error(`getEstimateCostEntries: no estimate found for id ${estimateId}`);
    const expenses = await expenseService.listForEstimate(estimateId);
    return buildCostEntries(estimate.companyId, estimate.projectId, expenses);
  }

  async function getProjectCostEntries(projectId: UUID): Promise<CostEntry[]> {
    const project = await projectService.getById(projectId, true);
    if (!project) throw new Error(`getProjectCostEntries: no project found for id ${projectId}`);
    const expenses = await expenseService.listForProject(projectId);
    return buildCostEntries(project.companyId, projectId, expenses);
  }

  async function getPayeeBalances(scope: QueryScope, role: PayeeRole): Promise<PayeeBalance[]> {
    const expenseType =
      role === "subcontractor" ? "subcontractor" : role === "agent" ? "agent_commission" : "labor";
    const [assignments, expenses] = await Promise.all([
      role === "subcontractor"
        ? subcontractorService.listAssignments(scope)
        : role === "agent"
        ? agentCommissionService.listAssignments(scope)
        : deps.teamAssignmentService?.listAssignments(scope) ?? Promise.resolve([]),
      scope.projectId
        ? expenseService.listForProject(scope.projectId)
        : expenseService.listForCompany(scope.companyId),
    ]);

    // Seeded from assignments (so a contracted-but-unpaid payee still
    // shows), then from expense rows (so a payee paid without a formal
    // assignment still shows). Neither source is a cost on its own —
    // only the expense rows are.
    const byPayee = new Map<UUID, PayeeBalance>();
    const ensure = (payeeId: UUID, payeeName: string): PayeeBalance => {
      let row = byPayee.get(payeeId);
      if (!row) {
        row = { payeeId, payeeName, role, contracted: 0, paid: 0, outstanding: 0, projectIds: [] };
        byPayee.set(payeeId, row);
      }
      if (payeeName && !row.payeeName) row.payeeName = payeeName;
      return row;
    };
    const addProject = (row: PayeeBalance, projectId: UUID | null) => {
      if (projectId && !row.projectIds.includes(projectId)) row.projectIds.push(projectId);
    };

    /** payee -> the jobs they are assigned to, so a payment naming one
     * of those jobs settles THAT job's assignments and no other. */
    const assignedJobsByPayee = new Map<UUID, Set<UUID>>();
    /** payee|estimate ("" for no estimate) -> contracted on that job. */
    const contractedByJob = new Map<string, number>();
    const jobKey = (payeeId: UUID, estimateId: UUID | null) => `${payeeId}|${estimateId ?? ""}`;

    for (const a of assignments) {
      const payeeId = role === "subcontractor"
        ? (a as { subcontractorId: UUID }).subcontractorId
        : role === "agent"
        ? (a as { agentId: UUID }).agentId
        : (a as { userId: UUID }).userId;
      const name = role === "subcontractor"
        ? (a as { subcontractorName: string }).subcontractorName
        : role === "agent"
        ? (a as { agentName: string }).agentName
        : (a as { memberName: string }).memberName;
      const contracted = role === "subcontractor"
        ? (a as { contractedAmount: number }).contractedAmount
        : role === "agent"
        ? (a as { assignedAmount: number }).assignedAmount
        : (a as { amount: number }).amount;
      const row = ensure(payeeId, name);
      row.contracted += contracted;
      addProject(row, a.projectId);

      const estimateId = (a as { estimateId: UUID | null }).estimateId ?? null;
      if (estimateId) {
        const jobs = assignedJobsByPayee.get(payeeId) ?? new Set<UUID>();
        jobs.add(estimateId);
        assignedJobsByPayee.set(payeeId, jobs);
      }
      const k = jobKey(payeeId, estimateId);
      contractedByJob.set(k, (contractedByJob.get(k) ?? 0) + contracted);
    }

    // A team member is recorded as payeeType "employee" — there is no
    // "team_member" payee type, and inventing one would mean a new enum
    // value plus a migration.
    const payeeTypeForRole = role === "team_member" ? "employee" : role;
    /** payee|estimate -> paid against that job. A payment naming a job
     * the payee is assigned to lands on that job; anything else falls
     * into the payee's estimate-less bucket, exactly as before. */
    const paidByJob = new Map<string, number>();
    for (const e of expenses) {
      if (e.expenseType !== expenseType || e.payeeType !== payeeTypeForRole || !e.payeeId) continue;
      const row = ensure(e.payeeId, e.vendor ?? "");
      row.paid += e.amount;
      addProject(row, e.projectId);

      const claimsJob = !!e.estimateId && (assignedJobsByPayee.get(e.payeeId)?.has(e.estimateId) ?? false);
      const k = jobKey(e.payeeId, claimsJob ? (e.estimateId as UUID) : null);
      paidByJob.set(k, (paidByJob.get(k) ?? 0) + e.amount);
    }

    /* OUTSTANDING IS SUMMED PER JOB, not per payee.
     *
     * `contracted` and `paid` stay payee-wide totals — they are what the
     * UI displays. But the balance is floored per JOB, so labour paid on
     * one estimate can no longer cancel an assignment on another. Same
     * calculateCommittedCostBalance as everywhere else; only the buckets
     * it is applied to are narrower.
     *
     * A payee with payments but no assignment has neither a job bucket
     * nor a contract, and correctly nets to zero outstanding. */
    for (const [payeeId, row] of byPayee) {
      const keys = new Set<string>([
        ...[...contractedByJob.keys()].filter((k) => k.startsWith(`${payeeId}|`)),
        ...[...paidByJob.keys()].filter((k) => k.startsWith(`${payeeId}|`)),
      ]);
      let outstanding = 0;
      for (const k of keys) {
        outstanding += calculateCommittedCostBalance(
          contractedByJob.get(k) ?? 0,
          paidByJob.get(k) ?? 0
        ).outstanding;
      }
      row.outstanding = outstanding;
    }
    return Array.from(byPayee.values()).sort((a, b) => a.payeeName.localeCompare(b.payeeName));
  }

  // ==================================================================
  // IN-FLIGHT COALESCING — concurrency dedupe, deliberately NOT a cache
  // ==================================================================
  // Shares the PROMISE of an already-running identical call. The entry
  // is deleted the moment it settles, so a later call always re-queries.
  // That distinction is the whole safety argument: a cache can serve
  // data that has since changed; this cannot, because it only ever
  // merges calls that overlap in time and would have returned the same
  // result anyway. No invalidation to get wrong, and no mutation path
  // needs to know it exists.
  const inFlight = new Map<string, Promise<unknown>>();

  function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = run().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  }

  async function getRealizedCashFlows(scope: QueryScope & { dateRange: DateRange }, filter?: Filter) {
    // ONE PAYMENT = ONE EXPENSE RECORD. Subcontractor payments and
    // agent commissions are expense ROWS, so `companyExpenses` already
    // carries every dollar paid out — reading subcontractor_payments /
    // agent_payments here would count that same cash a second time.
    // Keyed WITHOUT the dateRange, deliberately: none of these four
    // reads uses it. They fetch the company's whole history and the
    // range is applied in memory below.
    //
    // That matters because the Dashboard calls getCompanyFinancials
    // THIRTEEN times on every load — once for the selected range, then
    // once per month for the 12-month chart — and each call was
    // re-fetching every invoice, expense and payment in the company to
    // produce a differently-filtered view of identical data. Measured:
    // 138 requests from just 11 distinct URLs, a 12.5x amplification.
    // Since all thirteen run concurrently, coalescing collapses them to
    // one fetch each.
    const co = scope.companyId;
    const filterKey = filter ? JSON.stringify(filter) : "";
    const [invoicesAll, projectIds, companyExpenses, customerPaymentsAll] = await Promise.all([
      coalesce(`invoices:${co}:${scope.includeDeleted ?? false}`, () => invoiceService.listForCompany(scope)),
      coalesce(`projectIds:${co}:${filterKey}`, () => resolveProjectIds(scope, filter)),
      coalesce(`expenses:${co}`, () => expenseService.listForCompany(co)),
      coalesce(`payments:${co}:${scope.includeDeleted ?? false}`, () => paymentService.listForCompany(scope)),
    ]);

    const invoiceProjectId = new Map(invoicesAll.map((inv) => [inv.id, inv.projectId] as const));
    const inScope = (projectId: UUID | null | undefined) => !projectIds || (projectId != null && projectIds.has(projectId));

    const customerPayments = customerPaymentsAll.filter(
      (p) => withinRange(p.paymentDate, scope.dateRange) && inScope(invoiceProjectId.get(p.invoiceId))
    );

    return { invoicesAll, projectIds, companyExpenses, customerPayments };
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
      // Same reasoning as getRealizedCashFlows' reads below: the project
      // list is range-independent, so all thirteen dashboard calls want
      // the identical result.
      coalesce(`projects:${scope.companyId}`, () => projectService.list({ companyId: scope.companyId })),
      getRealizedCashFlows(scope, filter),
    ]);
    const { invoicesAll, projectIds, companyExpenses, customerPayments } = cashFlows;

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

    // Expenses from the source rows, same as getProjectFinancials — but
    // period-scoped and CASH-BASIS, which is the company-level model
    // (see the file header). Only expenses actually settled (isPaid) and
    // dated inside the range count: a period P&L must not book a vendor
    // bill that hasn't been paid yet. Soft-deleted rows never arrive
    // here at all, ExpenseService having already excluded them.
    const periodExpenses = companyExpenses.filter(
      (e) => e.isPaid && withinRange(e.expenseDate, scope.dateRange) && inScope(e.projectId)
    );
    const periodTotals = calculateExpenseTotals(periodExpenses);
    const expenseItems = periodTotals.total;
    const mileageCosts = await getMileageCostForProjects(scopedProjects.map((p) => p.id));

    // Cash paid to subcontractors / agents this period. These are
    // BUCKETS of `expenseItems` — a breakdown for reporting, never an
    // addend. Adding them to the total would charge the same payment
    // twice, which is exactly the double-count this model removed.
    const subcontractorPaid = asRealizedCost(periodTotals.byType.subcontractor ?? 0);
    const agentCommissionPaid = asRealizedCost(periodTotals.byType.agent_commission ?? 0);
    // Reimbursing an agent settles a debt for a purchase already in
    // `expenseItems`; it moves cash but creates no cost. It is included
    // in `agentPaid` (which answers "how much cash went to agents")
    // and excluded from the total for that reason.
    const agentReimbursementsSettled = asRealizedCost(
      periodExpenses
        .filter((e) => e.paidByType === "agent" && e.reimbursementStatus === "reimbursed")
        .reduce((sum, e) => sum + e.amount, 0)
    );
    const agentPaid = asRealizedCost(agentCommissionPaid + agentReimbursementsSettled);

    const totalExpenses = expenseItems + mileageCosts;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Void/cancelled invoices never count as revenue — see isRevenueInvoice.
    //
    // BOTH sides of `totalOutstanding` must span the same window, or the
    // figure is meaningless. `totalPaid` is period-scoped (cash actually
    // collected inside scope.dateRange), so the invoices it's subtracted
    // from must be period-scoped too — by ISSUE DATE, the date an
    // invoice becomes a receivable. Previously `totalInvoiced` summed
    // EVERY invoice ever issued (invoiceService.listForCompany applies
    // no date filter) while `totalPaid` counted only this period's
    // payments, so Dashboard's "Outstanding Invoices" showed all-time
    // billings minus one month's payments — a number that matched
    // nothing else in the app and grew forever. An invoice with no
    // issueDate falls back to createdAt so it is never silently dropped.
    const periodInvoices = invoices.filter(
      (inv) => isRevenueInvoice(inv) && withinRange((inv.issueDate ?? inv.createdAt).slice(0, 10), scope.dateRange)
    );
    const totalInvoiced = periodInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = totalRevenue; // same normalized source (real payments), not invoice.amount_paid
    const totalOutstanding = totalInvoiced - totalPaid;

    // Lifetime outstanding payables — not period-scoped, matches
    // getPayablesSummary computed without a dateRange. Same filter
    // passed through so payables reflect the same project subset as
    // every other number returned here.
    // Coalesced: note this is already called WITHOUT a dateRange, so
    // all thirteen dashboard calls request a byte-identical payables
    // summary. It internally fetches subcontractor + agent assignments
    // and the company's expenses — which is why those four tables were
    // still showing 13 requests each after the cash-flow reads were
    // deduped.
    const payables = await coalesce(
      `payables:${scope.companyId}:${filter ? JSON.stringify(filter) : ""}`,
      () => getPayablesSummary({ companyId: scope.companyId }, filter)
    );

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

  /** Spread the cash a payee has actually been paid (their expense
   * rows) across that payee's assignments, oldest contract first. A
   * payment expense names a PAYEE, not an assignment — under ONE
   * PAYMENT = ONE EXPENSE RECORD there is no per-assignment payment
   * record to read — so when one payee holds several contracts the
   * money fills them in order. Any overpayment lands on the last
   * contract, where it shows up rather than silently vanishing. */
  function allocatePaidAcrossContracts(contracted: number[], pool: number): number[] {
    let remaining = pool;
    return contracted.map((amount, i) => {
      const isLast = i === contracted.length - 1;
      const take = isLast ? remaining : Math.min(remaining, amount);
      remaining -= take;
      return take;
    });
  }

  async function getPayablesSummary(scope: QueryScope, filter?: Filter): Promise<PayablesSummary> {
    const [subAssignmentsAll, agentAssignmentsAll, teamAssignmentsAll, projectIds, expenses] = await Promise.all([
      subcontractorService.listAssignments(scope),
      agentCommissionService.listAssignments(scope),
      deps.teamAssignmentService?.listAssignments(scope) ?? Promise.resolve([]),
      resolveProjectIds(scope, filter),
      // Payments live here now — the same rows getProjectFinancials
      // reads, so "outstanding" on this view and on the project view
      // can never disagree.
      scope.projectId
        ? expenseService.listForProject(scope.projectId)
        : expenseService.listForCompany(scope.companyId),
    ]);
    // Same restriction pattern as getCompanyFinancials: a Filter
    // narrows to a project subset, applied identically to both roles
    // so "who do we owe" never mixes filtered and unfiltered payees.
    const subAssignments = projectIds ? subAssignmentsAll.filter((a) => projectIds.has(a.projectId)) : subAssignmentsAll;
    const agentAssignments = projectIds ? agentAssignmentsAll.filter((a) => projectIds.has(a.projectId)) : agentAssignmentsAll;
    const teamAssignments = projectIds
      ? teamAssignmentsAll.filter((a) => a.projectId && projectIds.has(a.projectId))
      : teamAssignmentsAll;

    /**
     * THE ASSIGNMENT'S ESTIMATE DECIDES WHICH PAYMENTS SETTLE IT.
     *
     * Assignments are grouped by payee AND job. A payment naming an
     * estimate settles only the assignments on that estimate — it can no
     * longer be spread onto a different job just because the same person
     * is owed there too.
     *
     * Within one job, a payee's several assignments still share that
     * job's payments through the existing allocatePaidAcrossContracts.
     * Assignments carrying NO estimate keep the old payee-wide pooling,
     * fed by exactly the payments no assigned job claimed — nothing here
     * is a new calculation, only a narrower input to the same ones.
     */
    function buildLines<A>(
      assignments: A[],
      role: "subcontractor" | "agent" | "team_member",
      /** How the payee is recorded on an expense row. A team member is
       * `employee` — there is no "team_member" payee type. */
      payeeType: "subcontractor" | "agent" | "employee",
      read: (a: A) => { assignmentId: UUID; payeeId: UUID; payeeName: string; contracted: number; estimateId: UUID | null }
    ): PayableLine[] {
      const byPayee = new Map<UUID, A[]>();
      for (const a of assignments) {
        const { payeeId } = read(a);
        (byPayee.get(payeeId) ?? byPayee.set(payeeId, []).get(payeeId)!).push(a);
      }

      const lines: PayableLine[] = [];
      const emit = (a: A, paid: number) => {
        const info = read(a);
        lines.push({
          role,
          assignmentId: info.assignmentId,
          payeeId: info.payeeId,
          payeeName: info.payeeName,
          assigned: asCommittedCost(info.contracted),
          paid: asCommittedCost(paid),
          outstanding: asCommittedCost(calculateCommittedCostBalance(info.contracted, paid).outstanding),
        });
      };

      for (const [payeeId, group] of byPayee) {
        const assignedEstimateIds = new Set(
          group.map((a) => read(a).estimateId).filter((id): id is UUID => !!id)
        );
        const { perEstimate, unclaimed } = partitionPaidByJob(expenses, payeeType, payeeId, assignedEstimateIds);

        // One job at a time.
        for (const estimateId of assignedEstimateIds) {
          const onJob = group.filter((a) => read(a).estimateId === estimateId);
          const allocated = allocatePaidAcrossContracts(
            onJob.map((a) => read(a).contracted),
            perEstimate.get(estimateId) ?? 0
          );
          onJob.forEach((a, i) => emit(a, allocated[i]));
        }

        // Assignments with no job on the record: unchanged behaviour.
        const jobless = group.filter((a) => !read(a).estimateId);
        if (jobless.length > 0) {
          const allocated = allocatePaidAcrossContracts(
            jobless.map((a) => read(a).contracted),
            unclaimed
          );
          jobless.forEach((a, i) => emit(a, allocated[i]));
        }
      }
      return lines;
    }

    const subLines = buildLines(subAssignments, "subcontractor", "subcontractor", (a) => ({
      assignmentId: a.id, payeeId: a.subcontractorId, payeeName: a.subcontractorName, contracted: a.contractedAmount,
      estimateId: a.estimateId,
    }));
    const agentLines = buildLines(agentAssignments, "agent", "agent", (a) => ({
      assignmentId: a.id, payeeId: a.agentId, payeeName: a.agentName, contracted: a.assignedAmount,
      estimateId: a.estimateId,
    }));

    /* Team labour, per assignment, through the SAME builder.
     *
     * Without these, /payments has to fall back to the payee's AGGREGATE
     * balance to decide what a team member is owed — which is why an
     * older assignment stayed hidden until a newer one lifted the
     * payee's total above what they had been paid. One line per
     * assignment lets each be judged on its own, exactly as a
     * subcontractor's or an agent's already is. */
    const teamLines = buildLines(teamAssignments, "team_member", "employee", (a) => ({
      assignmentId: a.id, payeeId: a.userId, payeeName: a.memberName, contracted: a.amount,
      estimateId: a.estimateId,
    }));

    const lines = [...subLines, ...agentLines];
    const totalOutstandingSubcontractor = asCommittedCost(subLines.reduce((sum, l) => sum + l.outstanding, 0));
    const totalOutstandingAgent = asCommittedCost(agentLines.reduce((sum, l) => sum + l.outstanding, 0));

    return {
      scope,
      lines,
      teamLines,
      totalOutstandingSubcontractor,
      totalOutstandingAgent,
      totalOutstanding: asCommittedCost(totalOutstandingSubcontractor + totalOutstandingAgent),
    };
  }

  async function getTaxSummary(scope: QueryScope & { dateRange: DateRange }, taxRate = 0.25, filter?: Filter): Promise<TaxSummary> {
    const { projectIds, companyExpenses, customerPayments } = await getRealizedCashFlows(scope, filter);

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
    const periodTotals = calculateExpenseTotals(
      companyExpenses.filter(
        (e) => e.isPaid && withinRange(e.expenseDate, scope.dateRange) && (!projectIds || (e.projectId !== null && projectIds.has(e.projectId)))
      )
    );
    const deductibleExpenses = periodTotals.total + (await getMileageCostForProjects(scopedProjectIds));

    // Approved costs = the subcontractor + agent-commission share of
    // the SAME rows already in `deductibleExpenses` — reported as a
    // breakdown for the tax view, deliberately NOT subtracted again
    // below. Under ONE PAYMENT = ONE EXPENSE RECORD these payments have
    // no separate existence to add.
    const approvedCosts = asCommittedCost(
      (periodTotals.byType.subcontractor ?? 0) + (periodTotals.byType.agent_commission ?? 0)
    );

    const netTaxableIncome = taxableRevenue - deductibleExpenses;

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
    // Read methods are coalesced. Every one is a pure read composed of
    // other services' reads — none of them writes, so sharing an
    // in-flight result is always equivalent to making the call twice.
    getProjectFinancials: (projectId) => coalesce(`projectFinancials:${projectId}`, () => getProjectFinancials(projectId)),
    getEstimateFinancials: (estimateId) => coalesce(`estimateFinancials:${estimateId}`, () => getEstimateFinancials(estimateId)),
    getEstimateCostEntries: (estimateId) => coalesce(`estimateCostEntries:${estimateId}`, () => getEstimateCostEntries(estimateId)),
    getProjectCostEntries: (projectId) => coalesce(`projectCostEntries:${projectId}`, () => getProjectCostEntries(projectId)),
    getPayeeBalances: (scope, role) => coalesce(`payeeBalances:${scope.companyId}:${scope.projectId ?? ""}:${role}`, () => getPayeeBalances(scope, role)),
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
    calculateAgentCommissionSplit,
  };
}
