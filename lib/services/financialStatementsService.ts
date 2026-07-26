/**
 * Layer 3 — CPA-ready financial statements: Profit & Loss, Balance
 * Sheet, Cash Flow. Every number here comes from
 * GeneralLedgerService.getTrialBalance/getPostings — this file
 * groups/labels trial-balance lines and ledger postings by statement
 * section, it computes nothing new. Since the trial balance is itself
 * a mapping of TransactionService's ledger (which FinancialEngine also
 * reads), these statements structurally cannot disagree with
 * FinancialEngine's own revenue/expense/profit numbers for the same
 * scope — proven in tests, not just claimed.
 */
import type { QueryScope } from "./types";
import type { GeneralLedgerService, TrialBalanceLine } from "./generalLedgerService";

export interface ProfitAndLossStatement {
  scope: QueryScope;
  revenueLines: TrialBalanceLine[];
  expenseLines: TrialBalanceLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheetStatement {
  scope: QueryScope;
  assetLines: TrialBalanceLine[];
  liabilityLines: TrialBalanceLine[];
  equityLines: TrialBalanceLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /** Net income for the same scope, folded into equity as "Retained
   * Earnings (current period)" — there is no period-closing process in
   * this foundation (no journal entry moves P&L accounts into an
   * equity account at period end), so without this line the balance
   * sheet would not balance for any company that has actually earned
   * money. This is the standard unclosed-books convention, not a
   * fudge factor: Assets = Liabilities + Equity + Retained Earnings
   * always holds structurally, checked below, not asserted. */
  retainedEarnings: number;
  isBalanced: boolean;
}

export interface CashFlowLine {
  transactionId: string;
  date: string;
  description: string;
  amount: number; // signed: + increases cash, - decreases it
}

export interface CashFlowStatement {
  scope: QueryScope;
  lines: CashFlowLine[];
  netCashChange: number;
}

export interface FinancialStatementsService {
  getProfitAndLoss(scope: QueryScope): Promise<ProfitAndLossStatement>;
  getBalanceSheet(scope: QueryScope): Promise<BalanceSheetStatement>;
  /** Every posting that touches the Cash account (code "1000"), signed
   * by whether Cash was debited (cash in) or credited (cash out) —
   * derived from the SAME postings the trial balance uses, so "which
   * transaction types affect cash" is never a second list maintained
   * separately from POSTING_RULES. */
  getCashFlow(scope: QueryScope): Promise<CashFlowStatement>;
}

const CASH_ACCOUNT_CODE = "1000";

export function createFinancialStatementsService(deps: { generalLedgerService: GeneralLedgerService }): FinancialStatementsService {
  async function getProfitAndLoss(scope: QueryScope): Promise<ProfitAndLossStatement> {
    const trialBalance = await deps.generalLedgerService.getTrialBalance(scope);
    const revenueLines = trialBalance.lines.filter((l) => l.account.type === "revenue");
    const expenseLines = trialBalance.lines.filter((l) => l.account.type === "expense");
    const totalRevenue = revenueLines.reduce((sum, l) => sum + l.balance, 0);
    const totalExpenses = expenseLines.reduce((sum, l) => sum + l.balance, 0);
    return { scope, revenueLines, expenseLines, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
  }

  async function getBalanceSheet(scope: QueryScope): Promise<BalanceSheetStatement> {
    const [trialBalance, profitAndLoss] = await Promise.all([
      deps.generalLedgerService.getTrialBalance(scope),
      getProfitAndLoss(scope),
    ]);

    const assetLines = trialBalance.lines.filter((l) => l.account.type === "asset");
    const liabilityLines = trialBalance.lines.filter((l) => l.account.type === "liability");
    const equityLines = trialBalance.lines.filter((l) => l.account.type === "equity");

    const totalAssets = assetLines.reduce((sum, l) => sum + l.balance, 0);
    const totalLiabilities = liabilityLines.reduce((sum, l) => sum + l.balance, 0);
    const totalEquity = equityLines.reduce((sum, l) => sum + l.balance, 0);
    const retainedEarnings = profitAndLoss.netIncome;

    return {
      scope,
      assetLines,
      liabilityLines,
      equityLines,
      totalAssets,
      totalLiabilities,
      totalEquity,
      retainedEarnings,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + retainedEarnings)) < 0.005,
    };
  }

  async function getCashFlow(scope: QueryScope): Promise<CashFlowStatement> {
    const postings = await deps.generalLedgerService.getPostings(scope);
    const lines: CashFlowLine[] = [];
    for (const posting of postings) {
      if (posting.debitAccount.code === CASH_ACCOUNT_CODE) {
        lines.push({ transactionId: posting.transactionId, date: posting.transactionDate, description: posting.description, amount: posting.amount });
      } else if (posting.creditAccount.code === CASH_ACCOUNT_CODE) {
        lines.push({ transactionId: posting.transactionId, date: posting.transactionDate, description: posting.description, amount: -posting.amount });
      }
    }
    return { scope, lines, netCashChange: lines.reduce((sum, l) => sum + l.amount, 0) };
  }

  return { getProfitAndLoss, getBalanceSheet, getCashFlow };
}
