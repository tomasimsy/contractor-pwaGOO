import { describe, test, expect } from "vitest";
import { categorizeUnmatched } from "../lib/bankReconciliationReview";
import type { BankReconciliationReport } from "../lib/services/bankReconciliationService";

function baseReport(overrides: Partial<BankReconciliationReport>): BankReconciliationReport {
  return {
    scope: { companyId: "company-1" },
    matched: [],
    unmatchedBankLines: [],
    unmatchedLedgerLines: [],
    isFullyReconciled: true,
    ...overrides,
  };
}

describe("categorizeUnmatched", () => {
  test("flags a same-amount, different-date pair as a review candidate, not truly unmatched", () => {
    const report = baseReport({
      unmatchedBankLines: [{ id: "b1", date: "2026-01-15", amount: -200, description: "Check 1042" }],
      unmatchedLedgerLines: [{ transactionId: "t1", date: "2026-01-02", description: "Subcontractor payment", amount: -200 }],
    });
    const { reviewCandidates, trulyUnmatchedBankLines } = categorizeUnmatched(report);
    expect(reviewCandidates).toHaveLength(1);
    expect(reviewCandidates[0].ledgerCandidate.transactionId).toBe("t1");
    expect(reviewCandidates[0].dateDiffDays).toBe(13);
    expect(trulyUnmatchedBankLines).toHaveLength(0);
  });

  test("leaves a bank line with no same-amount ledger line truly unmatched", () => {
    const report = baseReport({
      unmatchedBankLines: [{ id: "b1", date: "2026-01-15", amount: -75, description: "Unknown charge" }],
      unmatchedLedgerLines: [{ transactionId: "t1", date: "2026-01-02", description: "Subcontractor payment", amount: -200 }],
    });
    const { reviewCandidates, trulyUnmatchedBankLines } = categorizeUnmatched(report);
    expect(reviewCandidates).toHaveLength(0);
    expect(trulyUnmatchedBankLines).toHaveLength(1);
  });

  test("picks the closest-dated candidate and does not reuse a ledger line for two bank lines", () => {
    const report = baseReport({
      unmatchedBankLines: [
        { id: "b1", date: "2026-01-10", amount: -100, description: "Charge A" },
        { id: "b2", date: "2026-01-20", amount: -100, description: "Charge B" },
      ],
      unmatchedLedgerLines: [{ transactionId: "t1", date: "2026-01-11", description: "Expense", amount: -100 }],
    });
    const { reviewCandidates, trulyUnmatchedBankLines } = categorizeUnmatched(report);
    // b1 is one day from t1, b2 is nine days — b1 should claim it.
    expect(reviewCandidates).toHaveLength(1);
    expect(reviewCandidates[0].bankLine.id).toBe("b1");
    expect(trulyUnmatchedBankLines.map((l) => l.id)).toEqual(["b2"]);
  });

  test("an empty unmatched report produces no candidates", () => {
    const { reviewCandidates, trulyUnmatchedBankLines } = categorizeUnmatched(baseReport({}));
    expect(reviewCandidates).toHaveLength(0);
    expect(trulyUnmatchedBankLines).toHaveLength(0);
  });
});
