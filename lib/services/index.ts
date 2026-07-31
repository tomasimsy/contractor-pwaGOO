/**
 * The ONLY module pages/components are allowed to import from this
 * directory. Nothing outside lib/services/ should ever write
 * `from "@/lib/services/financialEngine"` directly — importing the
 * barrel keeps the internal dependency graph (Layer 0 -> 1 -> 2 -> 3)
 * an implementation detail that can be refactored without touching
 * every call site, and gives one place to lint against ("no direct
 * Supabase import outside lib/services/**" is the rule this file
 * exists to make enforceable).
 *
 * Concrete implementations are wired up here once each service has a
 * real constructor (e.g. `createFinancialEngine(deps)`); until then
 * this barrel exports the types/interfaces so the rest of the app can
 * be written against the contract before the implementation lands.
 */

// Layer 0
export type { ValidationService } from "./validationService";
export { createValidationService } from "./validationService";
export type { AuditService, AuditLogRepository } from "./auditService";
export { createAuditService } from "./auditService";
export { SchemaRegistry } from "./schemaRegistry";
export type { EntitySchema, EntityColumn, EntityRelationship, ColumnType, RelationshipCardinality } from "./schemaRegistry";
export { hasPermission, assertPermission, ROLES } from "./permissions";
export type { Role, Resource, PermissionAction } from "./permissions";

// Layer 1
export type { FilteringService, SoftDeleteFilter } from "./filteringService";
export { createFilteringService } from "./filteringService";
export type { TransactionService, AppendTransactionInput } from "./transactionService";

// Layer 2 — entity services only; TaxService is Layer 3 (see below) since
// it's the one service whose call graph points at FinancialEngine.
export type { ProjectService, Project, CreateProjectInput } from "./projectService";
export type { EstimateService, Estimate, EstimateLineItem, EstimateLineItemUnit } from "./estimateService";
export type { EstimatePhotoService, EstimatePhoto } from "./estimatePhotoService";
export type { RoofingAreaService, RoofingArea, RoofingPhoto, RoofingAreaCreateInput, RoofingAreaUpdateInput, RoofingPhotoCreateInput } from "./roofingAreaService";
export type {
  EstimateAreaLineItemService,
  EstimateAreaLineItem,
  EstimateAreaLineItemCreateInput,
  EstimateAreaLineItemUpdateInput,
} from "./estimateAreaLineItemService";
export type { ChangeOrderService, ChangeOrder } from "./changeOrderService";
export type { InvoiceService, Invoice, InvoiceLineItem, InvoiceStatus } from "./invoiceService";
export type { PaymentService, CustomerPayment } from "./paymentService";
export type {
  ExpenseService,
  Expense,
  ExpenseCategory,
  ExpenseType,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  ExpenseTotals,
  // Aliased: PayrollService exports its own, unrelated `PayeeType`
  // (who gets a paycheck). This one is who an expense was paid TO.
  PayeeType as ExpensePayeeType,
  PaidByType,
  ReimbursementStatus,
  MileageTrip,
} from "./expenseService";
export { EXPENSE_TYPES, EXPENSE_TYPE_LABEL, PAYEE_TYPES, PAID_BY_TYPES, PAID_BY_LABEL } from "./expenseService";
export type { SubcontractorService, Subcontractor, SubcontractorAssignment, SubcontractorPayment } from "./subcontractorService";
export type { AgentCommissionService, Agent, AgentAssignment, AgentPayment } from "./agentCommissionService";
// "AgentService" is the name used in the brief for the agent-side
// service — kept as a type alias rather than a renamed file/property so
// existing call sites (useAgentAssignments.ts, AgentAssignmentPanel.tsx)
// didn't have to be rewritten for a name change alone ("do not rewrite
// working functionality"). Both names refer to the exact same interface.
export type { AgentCommissionService as AgentService } from "./agentCommissionService";

// Layer 3
export type { FinancialEngine, FinancialEngineDeps } from "./financialEngine";
export { createFinancialEngine } from "./financialEngine";
// The single canonical estimate-signing workflow — see estimateWorkflow.ts's
// header for why both staff and the customer portal must call this same
// function rather than each having their own signing logic.
export type { EstimateWorkflow, EstimateWorkflowDeps, EstimateWorkflowResult } from "./estimateWorkflow";
export { createEstimateWorkflow, signEstimate, unsignEstimate } from "./estimateWorkflow";
// "FinancialService" is the name used in the brief; FinancialEngine is
// the name already in use throughout this codebase and its docs
// (SERVICE_LAYER_DESIGN.md, TRANSACTION_LEDGER.md, FILTER_SYSTEM.md).
// Aliased rather than renamed for the same reason as AgentService
// above — this IS the one and only source of financial calculations
// required by the brief, just under two names.
export type { FinancialEngine as FinancialService } from "./financialEngine";
export { createFinancialEngine as createFinancialService } from "./financialEngine";
export type { ReconciliationService, ReconciliationServiceDeps, ReconciliationLogSink, MutationTrigger } from "./reconciliationService";
export { createReconciliationService } from "./reconciliationService";
export type { AutoReconciliationOptions } from "./autoReconciliation";
export { withAutoReconciliation, resolveProjectIdViaInvoice } from "./autoReconciliation";
export type { TaxService, TaxSettings, TaxReadiness } from "./taxService";

// Accounting foundation — chart of accounts (Layer 0/2, pure data) +
// general ledger (Layer 3, maps TransactionService's ledger through
// the chart of accounts into double-entry postings/trial balance).
export { ACCOUNTS, POSTING_RULES, getAccount } from "./chartOfAccountsService";
export type { Account, AccountType, NormalBalance } from "./chartOfAccountsService";
export type { GeneralLedgerService, LedgerPosting, TrialBalance, TrialBalanceLine } from "./generalLedgerService";
export { createGeneralLedgerService } from "./generalLedgerService";

// Multi-location, payroll, and reporting foundations.
export type { LocationService, Location, CreateLocationInput } from "./locationService";
export { createInMemoryLocationService } from "./locationService";
export type {
  PayrollService, Payee, PayeeType, PayFrequency, PayRun, PayRunLine, PayRunStatus,
  CreatePayeeInput, CreatePayRunInput, PayStub, PayrollReport,
} from "./payrollService";
export { createInMemoryPayrollService } from "./payrollService";
export type {
  ReportingService, ReportingServiceDeps, KPIDashboard, RevenueTrendPoint,
  ExecutiveDashboard, ProjectPerformanceRow, SalesAnalytics, ExpenseAnalytics, ExpenseAnalyticsLine,
} from "./reportingService";
export { createReportingService } from "./reportingService";

// Accounts receivable / payable — thin, re-shaped views over
// InvoiceService/PaymentService and FinancialEngine.getPayablesSummary.
export type { AccountsReceivableService, ARAgingLine, ARAgingReport } from "./accountsReceivableService";
export { createAccountsReceivableService } from "./accountsReceivableService";
export type { AccountsPayableService, APPayableLine, APReport } from "./accountsPayableService";
export { createAccountsPayableService } from "./accountsPayableService";

// CPA-ready financial statements — P&L, Balance Sheet, Cash Flow, all
// derived from GeneralLedgerService.
export type {
  FinancialStatementsService, ProfitAndLossStatement, BalanceSheetStatement,
  CashFlowStatement, CashFlowLine,
} from "./financialStatementsService";
export { createFinancialStatementsService } from "./financialStatementsService";

// Bank reconciliation — matches external bank statement lines against
// FinancialStatementsService's cash flow.
export type { BankReconciliationService, BankStatementLine, ReconciliationMatch, BankReconciliationReport } from "./bankReconciliationService";
export { createBankReconciliationService } from "./bankReconciliationService";

// Generic tabular export (CSV) — Layer 0, no I/O, no framework.
export type { ExportColumn } from "./exportService";
export { exportToCSV } from "./exportService";

export * from "./types";
