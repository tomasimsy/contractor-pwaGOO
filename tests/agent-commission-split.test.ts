/**
 * Pins calculateAgentCommissionSplit — the ONE agent-commission
 * allocation formula, shared by AgentCommissionPreview (what the user
 * sees) and ExpenseDialog (what actually gets persisted). Before it
 * existed, each had its own copy of this arithmetic, so the figure
 * approved in the preview was not guaranteed to be the figure saved.
 */
import { describe, test, expect } from "vitest";
import { calculateAgentCommissionSplit } from "../lib/services/financialCalculations";

describe("calculateAgentCommissionSplit", () => {
  test("splits a percentage of remaining profit equally among agents", () => {
    // $1000 remaining, 40% commission, 2 agents => $200 each.
    const split = calculateAgentCommissionSplit(1000, 40, 2);
    expect(split.remainingProfit).toBe(1000);
    expect(split.totalCommission).toBe(400);
    expect(split.perAgentCommission).toBe(200);
    expect(split.companyRemaining).toBe(600);
    expect(split.exceedsRemainingProfit).toBe(false);
  });

  test("no agents selected yields no per-agent amount but still reports the pool", () => {
    const split = calculateAgentCommissionSplit(1000, 30, 0);
    expect(split.totalCommission).toBe(300);
    expect(split.perAgentCommission).toBe(0);
  });

  test("a null commission percent contributes nothing", () => {
    const split = calculateAgentCommissionSplit(1000, null, 2);
    expect(split.totalCommission).toBe(0);
    expect(split.perAgentCommission).toBe(0);
    expect(split.companyRemaining).toBe(1000);
  });

  test("a negative remaining profit surfaces as exceeding, never as a payable commission", () => {
    // Costs already exceeded revenue on this estimate.
    const split = calculateAgentCommissionSplit(-500, 30, 1);
    expect(split.remainingProfit).toBe(-500);
    // -150 is "more than" -500, so the guard correctly flags it.
    expect(split.exceedsRemainingProfit).toBe(true);
  });

  test("100% commission leaves the company nothing but does not exceed", () => {
    const split = calculateAgentCommissionSplit(900, 100, 3);
    expect(split.totalCommission).toBe(900);
    expect(split.perAgentCommission).toBe(300);
    expect(split.companyRemaining).toBe(0);
    expect(split.exceedsRemainingProfit).toBe(false);
  });
});
