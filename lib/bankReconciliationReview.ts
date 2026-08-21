/**
 * Splits BankReconciliationService's `unmatchedBankLines` into two
 * display buckets — it does NOT change what counts as "matched" (that
 * decision belongs entirely to reconcile()'s own date-tolerance
 * matching, untouched). This only re-labels a subset of the ALREADY
 * unmatched output for the UI:
 *
 *   - "Needs review": a bank line with no auto-match, but there IS an
 *     unmatched ledger line of the exact same amount — just outside
 *     reconcile()'s date-tolerance window (or duplicated same-day, so
 *     the greedy matcher already used the closer one). Very likely the
 *     same transaction; a human should confirm it, not the algorithm.
 *   - Truly unmatched: no ledger line of that amount exists at all.
 */
import type { BankReconciliationReport, BankStatementLine } from "./services/bankReconciliationService";

export interface ReviewCandidate {
  bankLine: BankStatementLine;
  ledgerCandidate: { transactionId: string; date: string; description: string; amount: number };
  dateDiffDays: number;
}

export interface CategorizedUnmatched {
  reviewCandidates: ReviewCandidate[];
  trulyUnmatchedBankLines: BankStatementLine[];
}

export function categorizeUnmatched(report: BankReconciliationReport): CategorizedUnmatched {
  const reviewCandidates: ReviewCandidate[] = [];
  const trulyUnmatchedBankLines: BankStatementLine[] = [];
  const usedLedgerTransactionIds = new Set<string>();

  for (const bankLine of report.unmatchedBankLines) {
    const candidates = report.unmatchedLedgerLines
      .filter((l) => !usedLedgerTransactionIds.has(l.transactionId) && Math.abs(l.amount - bankLine.amount) < 0.005)
      .map((l) => ({
        line: l,
        dateDiffDays: Math.abs(new Date(l.date).getTime() - new Date(bankLine.date).getTime()) / 86400000,
      }))
      .sort((a, b) => a.dateDiffDays - b.dateDiffDays);

    if (candidates.length > 0) {
      const best = candidates[0];
      usedLedgerTransactionIds.add(best.line.transactionId);
      reviewCandidates.push({ bankLine, ledgerCandidate: best.line, dateDiffDays: best.dateDiffDays });
    } else {
      trulyUnmatchedBankLines.push(bankLine);
    }
  }

  return { reviewCandidates, trulyUnmatchedBankLines };
}
