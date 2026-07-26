/**
 * Layer 3 — canned reports, KPI dashboards, and analytics. Pure
 * composition: every number here is FinancialEngine, GeneralLedgerService,
 * FinancialStatementsService, AccountsReceivableService/
 * AccountsPayableService, or ProjectService data, re-shaped for a
 * report/dashboard consumer — this file computes nothing on its own,
 * so it can never disagree with the engine everything else already
 * uses. Same "assembly, not a new calculation" discipline as
 * ReconciliationService and the Dashboard pages in contractor-pwa.
 */
import type { QueryScope, DateRange, ProjectStatus, ProjectFinancials, TransactionType, UUID } from "./types";
import type { FinancialEngine } from "./financialEngine";
import type { ProjectService } from "./projectService";
import type { TransactionService } from "./transactionService";
import type { GeneralLedgerService, TrialBalance } from "./generalLedgerService";
import type { FinancialStatementsService, ProfitAndLossStatement } from "./financialStatementsService";
import type { AccountsReceivableService, ARAgingReport } from "./accountsReceivableService";
import type { AccountsPayableService, APReport } from "./accountsPayableService";

export interface KPIDashboard {
  scope: QueryScope;
  range: DateRange;
  revenue: number;
  netProfit: number;
  netMargin: number;
  outstandingReceivable: number;
  outstandingPayables: number;
  activeProjectCount: number;
  completedProjectCount: number;
}

export interface RevenueTrendPoint {
  month: string; // YYYY-MM
  revenue: number;
}

/** The single-screen "how's the whole business doing right now" view —
 * every other report on this page, one call each.
 *
 * IMPORTANT — kpi.revenue and profitAndLoss.totalRevenue are DIFFERENT
 * accounting bases and will legitimately disagree, not a bug: kpi.revenue
 * is FinancialEngine.getCompanyFinancials' totalRevenue, which is
 * cash-basis (payments actually collected, matching this codebase's
 * existing RealizedCost convention). profitAndLoss.totalRevenue is
 * accrual-basis (booked when invoiced/change-order-approved, per
 * TRANSACTION_TYPE_META and standard GAAP P&L presentation) — the two
 * only converge once every invoice in the period has been fully
 * collected. A UI presenting both on one screen must label which is
 * which; this type deliberately keeps them as separate fields rather
 * than picking one, so that choice isn't made silently here. */
export interface ExecutiveDashboard {
  kpi: KPIDashboard;
  profitAndLoss: ProfitAndLossStatement;
  receivables: ARAgingReport;
  payables: APReport;
}

export interface ProjectPerformanceRow {
  projectId: UUID;
  projectName: string;
  status: ProjectStatus;
  financials: ProjectFinancials;
}

export interface SalesAnalytics {
  scope: QueryScope;
  revenueByClient: { clientId: UUID; clientName: string | null; totalInvoiced: number; totalPaid: number; outstandingReceivable: number }[];
  revenueTrend: RevenueTrendPoint[];
}

export interface ExpenseAnalyticsLine {
  type: TransactionType;
  total: number;
}

export interface ExpenseAnalytics {
  scope: QueryScope;
  byType: ExpenseAnalyticsLine[];
  total: number;
}

const COST_TYPES: TransactionType[] = ["material_expense", "labor_expense", "other_expense", "mileage_expense", "subcontractor_payment", "agent_commission"];

export interface ReportingService {
  /** The one-screen "how's the business doing" view — Dashboard's
   * source. Composes FinancialEngine.getCompanyFinancials +
   * getPayablesSummary + ProjectService.list, nothing computed here. */
  getKPIDashboard(scope: QueryScope & { dateRange: DateRange }): Promise<KPIDashboard>;

  /** Revenue booked per month over a range — grouped straight from
   * TransactionService's ledger (revenue-effect transactions:
   * invoice_issued + change_order_approved), not a separate query, so
   * this can't disagree with what getCompanyFinancials.totalRevenue
   * would show for the same range summed. Accrual-basis (when billed),
   * matching TRANSACTION_TYPE_META's documented booking point for
   * these two types — a cash-basis "money in the door" trend should
   * use customer_payment transactions instead, not this report. */
  getRevenueTrend(scope: QueryScope, months: number): Promise<RevenueTrendPoint[]>;

  /** The CPA-ready angle — passthrough to GeneralLedgerService so a
   * report consumer doesn't need to know the accounting layer exists
   * as a separate service to get a trial balance. */
  getTrialBalanceReport(scope: QueryScope): Promise<TrialBalance>;

  /** Executive Dashboard — KPIs + P&L + AR + AP in one call, so a
   * dashboard page makes one request instead of orchestrating four
   * services itself. */
  getExecutiveDashboard(scope: QueryScope & { dateRange: DateRange }): Promise<ExecutiveDashboard>;

  /** Project Performance — every company project's full financial
   * picture (FinancialEngine.getFinancialsForProjects, batched, not
   * once per row), for a sortable/filterable project-performance table. */
  getProjectPerformanceReport(scope: QueryScope): Promise<ProjectPerformanceRow[]>;

  /** Sales Analytics — revenue by client (FinancialEngine.getClientFinancials
   * per client) plus the same revenue trend getRevenueTrend returns,
   * so a sales dashboard doesn't need two different services for two
   * halves of the same page. */
  getSalesAnalytics(scope: QueryScope, trendMonths?: number): Promise<SalesAnalytics>;

  /** Expense Analytics — project-expense ledger transactions
   * (material/labor/other/mileage/subcontractor/agent commission)
   * grouped by type, straight from TransactionService.getTotalByType
   * (the same primitive FinancialEngine composes for totalExpenses).
   * Deliberately excludes payroll_expense — payroll has its own
   * Payroll Reports (PayrollService.getPayrollReport), so a paid
   * employee run isn't double-counted into this project-cost
   * breakdown. Reports positive spend magnitudes, not the ledger's
   * raw signed (negative) convention. */
  getExpenseAnalytics(scope: QueryScope): Promise<ExpenseAnalytics>;
}

export interface ReportingServiceDeps {
  financialEngine: FinancialEngine;
  projectService: ProjectService;
  transactionService: TransactionService;
  generalLedgerService: GeneralLedgerService;
  financialStatementsService: FinancialStatementsService;
  accountsReceivableService: AccountsReceivableService;
  accountsPayableService: AccountsPayableService;
}

const ACTIVE_STATUSES: ProjectStatus[] = ["active", "in_progress"];

export function createReportingService(deps: ReportingServiceDeps): ReportingService {
  async function getKPIDashboard(scope: QueryScope & { dateRange: DateRange }): Promise<KPIDashboard> {
    const [companyFinancials, payables, projects] = await Promise.all([
      deps.financialEngine.getCompanyFinancials(scope),
      deps.financialEngine.getPayablesSummary(scope),
      deps.projectService.list(scope),
    ]);

    return {
      scope,
      range: scope.dateRange,
      revenue: companyFinancials.totalRevenue,
      netProfit: companyFinancials.netProfit,
      netMargin: companyFinancials.profitMargin,
      outstandingReceivable: companyFinancials.totalOutstanding,
      outstandingPayables: payables.totalOutstanding,
      activeProjectCount: projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
      completedProjectCount: projects.filter((p) => p.status === "completed").length,
    };
  }

  async function getRevenueTrend(scope: QueryScope, months: number): Promise<RevenueTrendPoint[]> {
    const transactions = await deps.transactionService.getCompanyLedger(scope);
    const byMonth = new Map<string, number>();
    for (const txn of transactions) {
      if (txn.type !== "invoice_issued" && txn.type !== "change_order_approved") continue;
      const month = txn.transactionDate.slice(0, 7); // YYYY-MM
      byMonth.set(month, (byMonth.get(month) ?? 0) + txn.amount);
    }

    const now = new Date();
    const points: RevenueTrendPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      points.push({ month, revenue: byMonth.get(month) ?? 0 });
    }
    return points;
  }

  async function getTrialBalanceReport(scope: QueryScope): Promise<TrialBalance> {
    return deps.generalLedgerService.getTrialBalance(scope);
  }

  async function getExecutiveDashboard(scope: QueryScope & { dateRange: DateRange }): Promise<ExecutiveDashboard> {
    const [kpi, profitAndLoss, receivables, payables] = await Promise.all([
      getKPIDashboard(scope),
      deps.financialStatementsService.getProfitAndLoss(scope),
      deps.accountsReceivableService.getAgingReport(scope),
      deps.accountsPayableService.getPayablesReport(scope),
    ]);
    return { kpi, profitAndLoss, receivables, payables };
  }

  async function getProjectPerformanceReport(scope: QueryScope): Promise<ProjectPerformanceRow[]> {
    let projects = await deps.projectService.list(scope);
    // Location-based filtering — the "financial reporting by branch"
    // deliverable. ProjectService.list doesn't filter by locationId
    // itself (see QueryScope.locationId's doc comment: not wired into
    // FilteringService yet), so it's applied here instead, on the one
    // report that needs it, rather than half-wiring every Layer 2
    // service's list() for a filter only this call uses today.
    if (scope.locationId) {
      projects = projects.filter((p) => p.locationId === scope.locationId);
    }
    const financialsByProject = await deps.financialEngine.getFinancialsForProjects(projects.map((p) => p.id));
    return projects
      .map((p) => ({ projectId: p.id, projectName: p.name, status: p.status, financials: financialsByProject.get(p.id)! }))
      .filter((row) => row.financials); // a project the batch call couldn't resolve is dropped, not shown with undefined financials
  }

  async function getSalesAnalytics(scope: QueryScope, trendMonths = 12): Promise<SalesAnalytics> {
    const projects = await deps.projectService.list(scope);
    const clientIds = Array.from(new Set(projects.map((p) => p.clientId).filter((id): id is UUID => !!id)));

    const revenueByClient = await Promise.all(
      clientIds.map(async (clientId) => {
        const client = await deps.financialEngine.getClientFinancials(clientId, scope.companyId);
        return {
          clientId,
          clientName: null, // FinancialEngine.getClientFinancials doesn't resolve a display name — see its own doc comment; caller joins against Client records for display.
          totalInvoiced: client.totalInvoiced,
          totalPaid: client.totalPaid,
          outstandingReceivable: client.outstandingReceivable,
        };
      })
    );

    const revenueTrend = await getRevenueTrend(scope, trendMonths);
    return { scope, revenueByClient, revenueTrend };
  }

  async function getExpenseAnalytics(scope: QueryScope): Promise<ExpenseAnalytics> {
    // getTotalByType returns a SIGNED total (negative for cost-effect
    // types, per TRANSACTION_TYPE_META) — correct for internal netting,
    // but an "Expense Analytics" report is meant to answer "how much
    // did we spend," which reads as a positive dollar figure. Math.abs
    // here, once, is the boundary between the ledger's signed
    // convention and this report's user-facing one.
    const byType = await Promise.all(
      COST_TYPES.map(async (type) => ({ type, total: Math.abs(await deps.transactionService.getTotalByType(scope, type)) }))
    );
    return { scope, byType, total: byType.reduce((sum, l) => sum + l.total, 0) };
  }

  return {
    getKPIDashboard,
    getRevenueTrend,
    getTrialBalanceReport,
    getExecutiveDashboard,
    getProjectPerformanceReport,
    getSalesAnalytics,
    getExpenseAnalytics,
  };
}
