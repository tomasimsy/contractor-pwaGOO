/**
 * Company/agent profit split — the same two presets used in
 * ProjectFinancialsModal. Not persisted anywhere (no DB column backs
 * this); it's a calculator over whatever net figure the caller has on
 * hand, so every consumer stays in sync by sharing this one function
 * instead of re-deriving the math.
 */

export const COMPANY_PERCENTAGE_OPTIONS = [30, 60] as const;
export type CompanyPercentage = (typeof COMPANY_PERCENTAGE_OPTIONS)[number];

export function getAgentPercentage(companyPercentage: CompanyPercentage): number {
  return companyPercentage === 30 ? 70 : 40;
}

export type ProfitSplit = {
  companyPercentage: CompanyPercentage;
  agentPercentage: number;
  companyAmount: number;
  agentAmount: number;
};

/** Splits a net amount (revenue after subcontractor and expense costs
 * are deducted) between the company and its sales agents. */
export function splitProfit(netAfterCosts: number, companyPercentage: CompanyPercentage): ProfitSplit {
  const companyAmount = (netAfterCosts * companyPercentage) / 100;
  return {
    companyPercentage,
    agentPercentage: getAgentPercentage(companyPercentage),
    companyAmount,
    agentAmount: netAfterCosts - companyAmount,
  };
}

/**
 * Splits `total` evenly across `count` shares. The last share absorbs
 * whatever rounding remainder is left over so the shares always sum
 * exactly back to `total` — used both for splitting a dollar amount
 * evenly across agents (ProjectFinancialsModal's "Split Evenly") and
 * for splitting 100% evenly across however many agents are selected
 * on the Add Expense form.
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const shares: number[] = [];
  let allocated = 0;
  for (let i = 0; i < count - 1; i++) {
    const share = Math.round((total / count) * 100) / 100;
    shares.push(share);
    allocated += share;
  }
  shares.push(Math.round((total - allocated) * 100) / 100);
  return shares;
}
