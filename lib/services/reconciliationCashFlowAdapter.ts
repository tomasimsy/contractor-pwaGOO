/**
 * Feeds BankReconciliationService with REAL cash-flow data, without
 * touching its matching logic (bankReconciliationService.ts is
 * untouched) or the abandoned ledger stack it was originally written
 * against.
 *
 * BankReconciliationService depends on `FinancialStatementsService.
 * getCashFlow`, which is normally backed by GeneralLedgerService ->
 * TransactionService. But TransactionService only has an in-memory
 * implementation in this codebase (see ServicesProvider.tsx's header:
 * "no real ledger table exists yet") — reconciling against it would
 * compare bank lines against empty/fake data, not real payments and
 * expenses.
 *
 * This adapter uses the SAME fix the /accounting page already applied
 * for the identical problem: read the real SOURCE rows —
 * PaymentService.listForCompany (cash in) and ExpenseService.
 * listForCompany (cash out) — instead of the ledger. Both are already
 * soft-delete-filtered by their own services, so a deleted payment or
 * expense correctly never appears here either.
 *
 * Only `getCashFlow` is implemented — it's the only method
 * BankReconciliationService.reconcile() actually calls. The other two
 * FinancialStatementsService methods (P&L, Balance Sheet) are outside
 * this feature's scope and throw if ever called, rather than silently
 * returning wrong statements.
 */
import type { QueryScope } from "./types";
import type { PaymentService } from "./paymentService";
import type { ExpenseService } from "./expenseService";
import type {
  FinancialStatementsService,
  CashFlowStatement,
  CashFlowLine,
  ProfitAndLossStatement,
  BalanceSheetStatement,
} from "./financialStatementsService";

function withinRange(dateStr: string, scope: QueryScope): boolean {
  if (!scope.dateRange) return true;
  const time = new Date(dateStr).getTime();
  return time >= scope.dateRange.start.getTime() && time <= scope.dateRange.end.getTime();
}

export function createReconciliationCashFlowAdapter(deps: {
  paymentService: PaymentService;
  expenseService: ExpenseService;
}): FinancialStatementsService {
  async function getCashFlow(scope: QueryScope): Promise<CashFlowStatement> {
    // Neither service's listForCompany filters by date range itself
    // (confirmed against both Supabase implementations) — filtered
    // here instead, scoped to the statement period the caller passes.
    const [payments, expenses] = await Promise.all([
      deps.paymentService.listForCompany(scope),
      deps.expenseService.listForCompany(scope.companyId),
    ]);

    const lines: CashFlowLine[] = [
      ...payments
        .filter((p) => withinRange(p.paymentDate, scope))
        .map((p) => ({
          transactionId: p.id,
          date: p.paymentDate,
          description: p.referenceNumber ? `Payment received — ${p.referenceNumber}` : "Payment received",
          amount: p.amount,
        })),
      ...expenses
        .filter((e) => withinRange(e.expenseDate, scope))
        .map((e) => ({
          transactionId: e.id,
          date: e.expenseDate,
          description: e.vendor || e.description || "Expense",
          amount: -e.amount,
        })),
    ];

    return { scope, lines, netCashChange: lines.reduce((sum, l) => sum + l.amount, 0) };
  }

  function notImplemented(name: string): Promise<never> {
    return Promise.reject(
      new Error(`${name} is not implemented by the reconciliation cash-flow adapter — only getCashFlow is used by BankReconciliationService.`)
    );
  }

  return {
    getCashFlow,
    getProfitAndLoss: (): Promise<ProfitAndLossStatement> => notImplemented("getProfitAndLoss"),
    getBalanceSheet: (): Promise<BalanceSheetStatement> => notImplemented("getBalanceSheet"),
  };
}
