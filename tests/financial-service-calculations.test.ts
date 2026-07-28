/**
 * FinancialService as the single source of truth for the calculations
 * called out explicitly in the brief: Revenue/Expenses/Taxes/Discounts/
 * Deposits/Change Orders/Customer Payments/Agent Commissions/
 * Subcontractor Costs/Profit/Outstanding Balances. Revenue/Expenses/
 * Taxes/Profit/Outstanding Balances are already covered end-to-end by
 * workflow.test.ts and reconciliation.test.ts (they go through
 * getProjectFinancials/getCompanyFinancials/getTaxSummary/
 * getPayablesSummary). This file exercises the lower-level formulas
 * directly — calculateDocumentTotal (Discounts/Taxes),
 * validateDepositAmount (Deposits), calculateChangeOrderRevenue
 * (Change Orders), derivePaymentStatus (Customer Payments),
 * calculateCommittedCostBalance (Subcontractor Costs/Agent
 * Commissions) — all reached through the FinancialService object
 * itself, not by importing financialCalculations.ts directly, proving
 * "all pages must use FinancialService" actually has something to call.
 */
import { describe, test, expect } from "vitest";
import { createInMemoryServices } from "../lib/services/testing/inMemoryServices";
import { needsTotalRecalculation } from "../lib/services/financialCalculations";

describe("FinancialService calculation methods", () => {
  test("calculateDocumentTotal covers discounts and taxes in one formula", () => {
    const { financialEngine } = createInMemoryServices();
    // $4,000 subtotal + $500 markup - $200 discount = $4,300 taxed base, 0% tax
    const result = financialEngine.calculateDocumentTotal(4000, 500, 200, 0);
    expect(result).toEqual({ subtotal: 4000, taxedBase: 4300, tax: 0, total: 4300 });

    // Same base, 10% tax
    const withTax = financialEngine.calculateDocumentTotal(4000, 500, 200, 10);
    expect(withTax.tax).toBeCloseTo(430, 5);
    expect(withTax.total).toBeCloseTo(4730, 5);
  });

  test("validateDepositAmount enforces deposits stay within the document total", () => {
    const { financialEngine } = createInMemoryServices();
    expect(financialEngine.validateDepositAmount(1000, 5000)).toEqual({ valid: true });
    expect(financialEngine.validateDepositAmount(-1, 5000).valid).toBe(false);
    expect(financialEngine.validateDepositAmount(6000, 5000).valid).toBe(false);
  });

  test("calculateChangeOrderRevenue is the one formula both booking and reconciliation use", () => {
    const { financialEngine } = createInMemoryServices();
    expect(financialEngine.calculateChangeOrderRevenue(2000, 150)).toBe(2150);
  });

  describe("needsTotalRecalculation (self-healing read decision)", () => {
    // The exact bug found live: contractor-pwa's original app
    // soft-deletes/reinserts estimate_items on save without ever
    // recalculating estimates.subtotal/total afterward, leaving a
    // stored total that no longer matches current line items. This
    // is the pure comparison EstimateService.getById uses to decide
    // whether to self-heal (recompute + persist) on every read.
    test("matching stored and computed values need no recalculation", () => {
      expect(needsTotalRecalculation({ subtotal: 100, total: 110 }, { subtotal: 100, total: 110 })).toBe(false);
    });

    test("a stale subtotal (e.g. all line items externally deleted) needs recalculation", () => {
      // Reproduces estimate 53e7fdf9: stored subtotal/total = 5800
      // against zero currently-active line items (computed = 0).
      expect(needsTotalRecalculation({ subtotal: 5800, total: 5800 }, { subtotal: 0, total: 0 })).toBe(true);
    });

    test("a stale total alone (markup/discount/tax changed without recompute) needs recalculation", () => {
      expect(needsTotalRecalculation({ subtotal: 100, total: 100 }, { subtotal: 100, total: 130 })).toBe(true);
    });

    test("harmless floating-point noise does not trigger a spurious self-heal write", () => {
      // 0.1 + 0.2 !== 0.3 in raw floating point — this must not read
      // as "stale" and issue a write on every single read.
      expect(needsTotalRecalculation({ subtotal: 0.3, total: 0.3 }, { subtotal: 0.1 + 0.2, total: 0.1 + 0.2 })).toBe(false);
    });

    test("a genuine one-cent discrepancy still needs recalculation", () => {
      expect(needsTotalRecalculation({ subtotal: 100.0, total: 100.0 }, { subtotal: 100.01, total: 100.01 })).toBe(true);
    });
  });

  describe("EstimateService.update() rejects direct writes to derived totals", () => {
    // subtotal/total/revisedTotal must only ever be set through
    // recalculateTotal() — this is the runtime guard's own test,
    // proving the protection actually fires rather than trusting the
    // TypeScript type alone (which a future `as any` cast could
    // bypass). Exercises the in-memory EstimateService directly since
    // it carries the identical guard as the real Supabase-backed one.
    test("update() throws if asked to set subtotal directly", async () => {
      const { estimateService } = createInMemoryServices();
      const estimate = await estimateService.create({
        companyId: "company-1", projectId: "project-1", clientId: null,
        lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 100, taxable: false }],
        markup: 0, discount: 0, taxRate: 0,
      });
      await expect(
        estimateService.update(estimate.id, { subtotal: 999 } as unknown as Parameters<typeof estimateService.update>[1])
      ).rejects.toThrow(/derived value/);
    });

    test("update() throws if asked to set total directly", async () => {
      const { estimateService } = createInMemoryServices();
      const estimate = await estimateService.create({
        companyId: "company-1", projectId: "project-1", clientId: null,
        lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 100, taxable: false }],
        markup: 0, discount: 0, taxRate: 0,
      });
      await expect(
        estimateService.update(estimate.id, { total: 999 } as unknown as Parameters<typeof estimateService.update>[1])
      ).rejects.toThrow(/derived value/);
    });

    test("update() still accepts legitimate fields (markup) unaffected by the guard", async () => {
      const { estimateService } = createInMemoryServices();
      const estimate = await estimateService.create({
        companyId: "company-1", projectId: "project-1", clientId: null,
        lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 100, taxable: false }],
        markup: 0, discount: 0, taxRate: 0,
      });
      const updated = await estimateService.update(estimate.id, { markup: 50 });
      expect(updated.markup).toBe(50);
      expect(updated.total).toBe(150); // recalculated, not manually set
    });
  });

  test("calculateRevisedEstimateTotal ignores draft/pending/rejected change orders", () => {
    const { financialEngine } = createInMemoryServices();
    const changeOrders = [
      { status: "draft", totalAmount: 500, tax: 0 },
      { status: "pending", totalAmount: 1000, tax: 0 },
      { status: "rejected", totalAmount: 9999, tax: 0 },
    ];
    // None of these are approved — revised total must equal the
    // estimate's own total, unchanged.
    expect(financialEngine.calculateRevisedEstimateTotal(110, changeOrders)).toBe(110);
  });

  test("calculateRevisedEstimateTotal sums every approved change order (with tax) onto the estimate total", () => {
    const { financialEngine } = createInMemoryServices();
    const changeOrders = [
      { status: "approved", totalAmount: 10, tax: 0 },
      { status: "approved", totalAmount: 50, tax: 0 },
      { status: "approved", totalAmount: 20, tax: 5 },
      { status: "pending", totalAmount: 9999, tax: 0 }, // must not count
      { status: "rejected", totalAmount: 9999, tax: 0 }, // must not count
    ];
    // 110 (estimate) + 10 + 50 + (20+5) = 195
    expect(financialEngine.calculateRevisedEstimateTotal(110, changeOrders)).toBe(195);
  });

  test("calculateRevisedEstimateTotal with zero approved change orders equals the estimate's own total exactly", () => {
    const { financialEngine } = createInMemoryServices();
    expect(financialEngine.calculateRevisedEstimateTotal(4300, [])).toBe(4300);
  });

  test("a negative (deduction) approved change order reduces the revised total", () => {
    const { financialEngine } = createInMemoryServices();
    const changeOrders = [{ status: "approved", totalAmount: -800, tax: 0 }];
    expect(financialEngine.calculateRevisedEstimateTotal(5000, changeOrders)).toBe(4200);
  });

  test("derivePaymentStatus covers unpaid/partial/paid/overpaid identically everywhere it's used", () => {
    const { financialEngine } = createInMemoryServices();
    expect(financialEngine.derivePaymentStatus(1000, 0)).toBe("unpaid");
    expect(financialEngine.derivePaymentStatus(1000, 400)).toBe("partial");
    expect(financialEngine.derivePaymentStatus(1000, 1000)).toBe("paid");
    expect(financialEngine.derivePaymentStatus(1000, 1200)).toBe("overpaid");
  });

  test("calculateCommittedCostBalance covers subcontractor costs and agent commissions with one formula", () => {
    const { financialEngine } = createInMemoryServices();
    // Assigned more than paid -> committed = assigned, outstanding = the gap
    expect(financialEngine.calculateCommittedCostBalance(3000, 1000)).toEqual({ committed: 3000, outstanding: 2000 });
    // Paid more than assigned (e.g. a bonus) -> committed floors at what was actually paid
    expect(financialEngine.calculateCommittedCostBalance(1000, 1500)).toEqual({ committed: 1500, outstanding: 0 });
  });

  test("PaymentService.getSummaryForInvoice and InvoiceService.refreshStatus agree with FinancialService.derivePaymentStatus (no independent formula left)", async () => {
    const services = createInMemoryServices();
    const project = await services.projectService.create({ companyId: "c1", clientId: null, name: "P" });
    const estimate = await services.estimateService.create({
      companyId: "c1", projectId: project.id, clientId: null,
      lineItems: [{ category: "other", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    await services.paymentService.record({ companyId: "c1", invoiceId: invoice.id, amount: 400, method: "cash", paymentDate: "2026-01-02" });

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary.status).toBe(services.financialEngine.derivePaymentStatus(invoice.total, summary.totalPaid));

    const refreshed = await services.invoiceService.refreshStatus(invoice.id);
    // "partially_paid" is InvoiceStatus's vocabulary for PaymentStatus's
    // "partial" — the two enums stay distinct because an invoice also
    // has draft/sent/void lifecycle states a payment never has.
    expect(refreshed.status).toBe("partially_paid");
  });
});
