/**
 * Layer 3 — bank reconciliation: matches externally-supplied bank
 * statement lines against this company's own cash-affecting ledger
 * postings (via FinancialStatementsService.getCashFlow, so "what
 * counts as a cash transaction" is one definition, not re-derived
 * here). A real implementation would import statement lines from a
 * bank-feed integration or CSV upload — that ingestion path doesn't
 * exist yet (no bank-feed connector in this codebase), so
 * `BankStatementLine[]` is accepted as a plain input parameter,
 * exactly the seam a real importer would feed.
 */
import type { QueryScope } from "./types";
import type { FinancialStatementsService } from "./financialStatementsService";

export interface BankStatementLine {
  id: string;
  date: string; // ISODate
  amount: number; // signed, same convention as CashFlowLine: + deposit, - withdrawal
  description: string;
}

export interface ReconciliationMatch {
  bankLine: BankStatementLine;
  ledgerTransactionId: string;
  ledgerDate: string;
  ledgerDescription: string;
  amount: number;
}

export interface BankReconciliationReport {
  scope: QueryScope;
  matched: ReconciliationMatch[];
  unmatchedBankLines: BankStatementLine[];
  unmatchedLedgerLines: { transactionId: string; date: string; description: string; amount: number }[];
  isFullyReconciled: boolean;
}

export interface BankReconciliationService {
  /** Matches each bank line to at most one ledger cash-flow line with
   * the exact same signed amount, within `dateToleranceDays` of each
   * other (bank posting dates commonly lag the actual transaction date
   * by a few days) — greedy, closest-date-first matching, same
   * amount-then-date-proximity approach a bookkeeper would use by
   * hand. Every ledger line and every bank line is used at most once. */
  reconcile(scope: QueryScope, bankLines: BankStatementLine[], dateToleranceDays?: number): Promise<BankReconciliationReport>;
}

export function createBankReconciliationService(deps: { financialStatementsService: FinancialStatementsService }): BankReconciliationService {
  async function reconcile(scope: QueryScope, bankLines: BankStatementLine[], dateToleranceDays = 3): Promise<BankReconciliationReport> {
    const cashFlow = await deps.financialStatementsService.getCashFlow(scope);
    const ledgerLines = cashFlow.lines.map((l) => ({ ...l, used: false }));
    const bankQueue = [...bankLines];

    const matched: ReconciliationMatch[] = [];
    const unmatchedBankLines: BankStatementLine[] = [];

    for (const bankLine of bankQueue) {
      const bankDate = new Date(bankLine.date).getTime();

      // Every unused ledger line with the same signed amount, ranked
      // by how close its date is to the bank line's — closest wins.
      const candidates = ledgerLines
        .filter((l) => !l.used && Math.abs(l.amount - bankLine.amount) < 0.005)
        .map((l) => ({ line: l, dateDiffDays: Math.abs(new Date(l.date).getTime() - bankDate) / 86400000 }))
        .filter((c) => c.dateDiffDays <= dateToleranceDays)
        .sort((a, b) => a.dateDiffDays - b.dateDiffDays);

      if (candidates.length === 0) {
        unmatchedBankLines.push(bankLine);
        continue;
      }

      const best = candidates[0].line;
      best.used = true;
      matched.push({
        bankLine,
        ledgerTransactionId: best.transactionId,
        ledgerDate: best.date,
        ledgerDescription: best.description,
        amount: best.amount,
      });
    }

    const unmatchedLedgerLines = ledgerLines
      .filter((l) => !l.used)
      .map((l) => ({ transactionId: l.transactionId, date: l.date, description: l.description, amount: l.amount }));

    return {
      scope,
      matched,
      unmatchedBankLines,
      unmatchedLedgerLines,
      isFullyReconciled: unmatchedBankLines.length === 0 && unmatchedLedgerLines.length === 0,
    };
  }

  return { reconcile };
}
