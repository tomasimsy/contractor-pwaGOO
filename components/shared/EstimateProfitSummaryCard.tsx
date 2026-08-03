"use client";

/**
 * The complete job-costing view for ONE estimate, rendered from an
 * EstimateFinancials object FinancialEngine.getEstimateFinancials()
 * produced. Same discipline as ProfitSummaryCard (the project-level
 * sibling this mirrors): every figure here is a field the engine
 * already computed — this component never adds, subtracts, or
 * re-derives anything itself, so it cannot disagree with any other
 * page showing the same estimate's numbers.
 *
 * Money earned (estimate total, change orders, revised contract) →
 * money received (payments, remaining balance) → money spent (expenses,
 * subcontractor/agent costs, total job cost) → actual profit/loss.
 */
import { TrendingUp, TrendingDown } from "lucide-react";
import type { EstimateFinancials } from "@/lib/services";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function Row({ label, value, tone, strong }: { label: string; value: number; tone?: "good" | "bad"; strong?: boolean }) {
  const toneClass = tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-foreground";
  return (
    <div className={`flex items-center justify-between gap-2 py-1 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={toneClass}>{money(value)}</span>
    </div>
  );
}

export function EstimateProfitSummaryCard({ financials }: { financials: EstimateFinancials | null }) {
  if (!financials) return null;
  const f = financials;
  const isProfit = f.netProfit >= 0;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        {isProfit ? <TrendingUp className="size-4 text-success" /> : <TrendingDown className="size-4 text-danger" />}
        Job Costing — This Estimate
      </h2>

      <p className="mb-3 text-xs text-muted-foreground">
        Scoped to this estimate only (not the whole project) — every figure comes from the shared financial engine.
      </p>

      <div className="divide-y divide-border">
        {/* Money Earned Section */}
        <div className="pb-2 bg-emerald-500/5 -mx-4 px-4 py-2 rounded-lg transition-colors">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Revenue & Earnings</div>
          <Row label="Estimate total" value={f.estimateTotal} />
          <Row label="Approved change orders" value={f.approvedChangeOrderTotal} />
          <Row label="Revised contract total" value={f.revisedTotal} strong />
        </div>

        {/* Money Received Section */}
        <div className="py-2 mt-2 bg-blue-500/5 -mx-4 px-4 py-2 rounded-lg transition-colors">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Customer Collections</div>
          <Row label="Customer payments received" value={f.amountPaid} />
          <Row label="Remaining customer balance" value={f.remainingBalance} tone={f.remainingBalance > 0 ? "bad" : undefined} />
        </div>

        {/* Money Spent Section */}
        <div className="py-2 mt-2 bg-amber-500/5 -mx-4 px-4 py-2 rounded-lg transition-colors">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Costs & Expenses</div>
          <Row label="Subcontractor costs" value={f.subcontractorCosts} />
          <Row label="Agent commissions" value={f.agentCommissionCosts} />
          <Row label="Total expenses" value={f.totalExpenses} />
          <Row label="Total job cost" value={f.totalExpenses} strong />
        </div>

        {/* Profitability Section */}
        <div className="pt-2 mt-2 bg-purple-500/5 -mx-4 px-4 py-2 rounded-lg transition-colors">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Profitability</div>
          <Row label="Gross profit" value={f.grossProfit} tone={f.grossProfit >= 0 ? "good" : "bad"} strong />
          <Row label="Net profit" value={f.netProfit} tone={isProfit ? "good" : "bad"} strong />
          <div className="flex items-center justify-between gap-2 py-1 text-sm">
            <span className="text-muted-foreground">Profit margin</span>
            <span className={isProfit ? "text-success font-semibold" : "text-danger font-semibold"}>{f.profitMargin.toFixed(1)}%</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm font-semibold">
            <span className="text-muted-foreground">Status</span>
            <span className={isProfit ? "text-success" : "text-danger"}>{isProfit ? "Profit" : "Loss"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}