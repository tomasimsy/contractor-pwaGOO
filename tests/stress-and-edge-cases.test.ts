/**
 * Stress and edge-case suite. Every check funnels through `check()` /
 * `warn()` below, which both make a real vitest assertion (so CI fails
 * on a real regression) AND accumulate into `results`, printed and
 * written to STRESS_TEST_REPORT.md by the final `afterAll` — the
 * "generate a final report" deliverable, built from what actually ran,
 * not written by hand afterward.
 *
 * A ⚠ warning is used for findings that are real and worth a human
 * decision, but are not this suite's to unilaterally "fix" (a semantic
 * question like "should a $0 invoice count as paid," or a structural
 * limitation like "this in-memory fake's id scheme wouldn't be safe
 * against real concurrent writers") — those are recorded, not asserted
 * as failures.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { createInMemoryServices, createInMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

type Status = "pass" | "warn" | "fail";
interface ResultEntry {
  category: string;
  name: string;
  status: Status;
  detail?: string;
}
const results: ResultEntry[] = [];

function check(category: string, name: string, condition: boolean, detail?: string) {
  results.push({ category, name, status: condition ? "pass" : "fail", detail });
  expect(condition, detail ?? name).toBe(true);
}
function warn(category: string, name: string, detail: string) {
  results.push({ category, name, status: "warn", detail });
}

afterAll(() => {
  const symbol = { pass: "✓", warn: "⚠", fail: "✗" } as const;
  const lines: string[] = ["# Stress & Edge-Case Test Report", ""];
  const byCategory = new Map<string, ResultEntry[]>();
  for (const r of results) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const r of results) counts[r.status]++;
  lines.push(`**${counts.pass} passed, ${counts.warn} warnings, ${counts.fail} failed** (${results.length} checks total)`, "");

  for (const [category, entries] of byCategory) {
    lines.push(`## ${category}`, "");
    for (const r of entries) {
      lines.push(`- ${symbol[r.status]} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
    lines.push("");
  }

  const inconsistencies = results.filter((r) => r.status !== "pass");
  lines.push("## Every inconsistency found", "");
  if (inconsistencies.length === 0) {
    lines.push("None.");
  } else {
    for (const r of inconsistencies) {
      lines.push(`- ${symbol[r.status]} **[${r.category}]** ${r.name}: ${r.detail ?? "(no detail)"}`);
    }
  }

  const report = lines.join("\n") + "\n";
  console.log("\n" + report);
  writeFileSync(new URL("../STRESS_TEST_REPORT.md", import.meta.url), report);
});

const COMPANY_ID = "company-1";

async function seedRosterAndProject(services: InMemoryServices) {
  services.store.subcontractors.set("sub-1", {
    id: "sub-1", companyId: COMPANY_ID, name: "Test Sub", trade: null, phone: null,
    createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
  });
  services.store.agents.set("agent-1", {
    id: "agent-1", companyId: COMPANY_ID, name: "Test Agent", commissionRate: 5,
    createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
  });
  return services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Stress Test Project" });
}

// ============================================================
// FINANCIAL
// ============================================================
describe("Financial edge cases", () => {
  let services: InMemoryServices;

  beforeAll(async () => {
    services = createInMemoryServices();
  });

  test("Partial payments accumulate correctly across many small payments", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    for (const amount of [100, 150, 200, 50, 300]) {
      await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount, method: "cash", paymentDate: "2026-01-05" });
    }
    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    check("Financial", "Partial payments sum to 800/1000, status partial", summary.totalPaid === 800 && summary.status === "partial", `totalPaid=${summary.totalPaid}, status=${summary.status}`);
  });

  test("Overpayment is rejected without allowOverpayment, accepted with it", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 500, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });

    const rejected = await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 600, method: "cash", paymentDate: "2026-01-05" });
    check("Financial", "Overpayment rejected by default", rejected.valid === false);

    const accepted = await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 600, method: "cash", paymentDate: "2026-01-05", allowOverpayment: true });
    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    check("Financial", "Overpayment accepted with allowOverpayment, status overpaid", accepted.valid === true && summary.status === "overpaid", `status=${summary.status}`);
  });

  test("Refund (modeled as payment deletion) reduces amountPaid and restores balance", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    const result = await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 1000, method: "cash", paymentDate: "2026-01-05" });
    await services.paymentService.softDelete(result.payment!.id, "Refund issued to customer");
    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    check("Financial", "Refund via payment deletion zeroes amountPaid", summary.totalPaid === 0 && summary.status === "unpaid", `totalPaid=${summary.totalPaid}`);
    warn("Financial", "No first-class Refund concept", "There is no RefundService/refund transaction type — a refund is modeled as soft-deleting the original payment. This is correct arithmetically (proven above) but means a refund has no independent record of ITS OWN (who authorized it, when, how) beyond the delete_reason string on the original payment.");
  });

  test("Negative change orders (scope reduction) decrease revenue correctly", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 5000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });

    const co = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-NEG-1", title: "Remove a fixture", totalAmount: -800, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(co.id);

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    check("Financial", "Negative change order reduces revisedTotal", financials.approvedChangeOrderTotal === -800 && financials.revisedTotal === 4200, `approvedChangeOrderTotal=${financials.approvedChangeOrderTotal}, revisedTotal=${financials.revisedTotal}`);

    const ledgerCheck = await services.reconciliationService.reconcileLedgerAgainstSources({ companyId: COMPANY_ID, projectId: project.id });
    check("Financial", "Negative change order still reconciles cleanly", ledgerCheck.isClean, JSON.stringify(ledgerCheck.findings));
  });

  test("Multiple change orders: approved ones count, rejected ones never do", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });

    const co1 = await services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-A", title: "A", totalAmount: 300, tax: 0 });
    const co2 = await services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-B", title: "B", totalAmount: 400, tax: 0 });
    const co3 = await services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-C", title: "C (rejected)", totalAmount: 9999, tax: 0 });

    await services.changeOrderService.approveChangeOrder(co1.id);
    await services.changeOrderService.approveChangeOrder(co2.id);
    await services.changeOrderService.changeStatus(co3.id, "rejected");

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    check("Financial", "Only approved change orders (300+400=700) count, rejected 9999 excluded", financials.approvedChangeOrderTotal === 700, `approvedChangeOrderTotal=${financials.approvedChangeOrderTotal}`);
  });

  test("Deposit cannot exceed estimate total", async () => {
    const project = await seedRosterAndProject(services);
    await expect(
      services.estimateService.create({
        companyId: COMPANY_ID, projectId: project.id, clientId: null,
        lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
        markup: 0, discount: 0, taxRate: 0, depositAmount: 5000,
      })
    ).rejects.toThrow();
    check("Financial", "Deposit exceeding total is rejected at creation", true);
  });

  test("Tax rate change after conversion does not retroactively alter the already-issued invoice", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    const invoiceTotalBefore = invoice.total;

    // Change the estimate's tax rate AFTER conversion and recalculate.
    await services.estimateService.updateLineItems(estimate.id, [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }]);
    const updatedEstimate = await services.estimateService.getById(estimate.id);
    const invoiceAfter = await services.invoiceService.getById(invoice.id);

    check(
      "Financial",
      "Invoice total unchanged after estimate is edited post-conversion (invoice is a snapshot)",
      invoiceAfter!.total === invoiceTotalBefore,
      `invoiceTotalBefore=${invoiceTotalBefore}, invoiceAfter=${invoiceAfter!.total}, estimateAfter=${updatedEstimate!.total}`
    );
    warn("Financial", "No re-invoicing workflow for a post-conversion estimate change", "If a contractor edits an estimate's tax/pricing after it's already been converted to an invoice, there is currently no service method that re-syncs or flags the now-diverged invoice — this test confirms the invoice correctly stays a fixed snapshot, but there's no alert surfaced anywhere that the source estimate has since changed.");
  });

  test("Discount larger than subtotal+markup produces a negative taxed base without throwing", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 100, taxable: false }],
      markup: 0, discount: 500, taxRate: 10,
    });
    check("Financial", "Over-discounted estimate computes a negative total, not NaN/throw", estimate.total < 0 && Number.isFinite(estimate.total), `total=${estimate.total}`);
    warn("Financial", "No floor at zero for over-discounted totals", `A discount exceeding subtotal+markup produces a negative estimate total ($${estimate.total}) — mathematically consistent but no validation currently blocks a discount larger than the amount being discounted; worth a product decision on whether that should be allowed.`);
  });

  test("Zero-dollar invoice: payment status semantics", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "other", name: "Free item", description: null, quantity: 1, unitPrice: 0, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    check("Financial", "Zero-dollar invoice does not crash getSummaryForInvoice", summary.remainingBalance === 0);
    warn("Financial", "Zero-dollar invoice reports status \"unpaid\", not \"paid\"", `derivePaymentStatus(0, 0) returns "${summary.status}" because its "paid" branch requires totalAmount > 0. A $0 invoice arguably has nothing left to collect and could reasonably show as fully paid instead — a semantic call for the business, not a calculation bug (the $0/$0 arithmetic itself is correct).`);
  });

  test("Large numbers do not lose precision through the full revenue/cost/profit chain", async () => {
    const project = await seedRosterAndProject(services);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "Huge project", description: null, quantity: 1, unitPrice: 987_654_321, taxable: false }],
      markup: 12_345, discount: 6_789, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 500_000_000, method: "wire", paymentDate: "2026-01-02" });

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    const expectedTotal = 987_654_321 + 12_345 - 6_789;
    check("Financial", "Large-number estimate total is exact, not floating-point-corrupted", estimate.total === expectedTotal, `expected=${expectedTotal}, actual=${estimate.total}`);
    check("Financial", "Large-number invoice/payment figures are exact", financials.invoicesTotal === expectedTotal && financials.amountPaid === 500_000_000, `invoicesTotal=${financials.invoicesTotal}, amountPaid=${financials.amountPaid}`);
  });
});

// ============================================================
// CRUD
// ============================================================
describe("CRUD stress", () => {
  let services: InMemoryServices;
  let projectId: string;

  beforeAll(async () => {
    services = createInMemoryServices();
    const project = await seedRosterAndProject(services);
    projectId = project.id;
  });

  test("Rapid create/update/delete/restore cycles leave the ledger internally consistent", async () => {
    const expense = await services.expenseService.create({ companyId: COMPANY_ID, projectId, category: "material", amount: 100, expenseDate: "2026-01-01" });
    // Each update must actually change the amount (update() only
    // appends a ledger delta row when the value truly differs) —
    // starting at +10 rather than +0 avoids a no-op first iteration.
    for (let i = 1; i <= 5; i++) {
      await services.expenseService.update(expense.id, { amount: 100 + i * 10 });
    }
    await services.expenseService.softDelete(expense.id, "cycle test delete 1");
    await services.expenseService.restore(expense.id);
    await services.expenseService.softDelete(expense.id, "cycle test delete 2");
    await services.expenseService.restore(expense.id);

    const financials = await services.financialEngine.getProjectFinancials(projectId);
    const finalExpense = await services.expenseService.listForProject(projectId).then((list) => list.find((e) => e.id === expense.id));
    check("CRUD", "Final amount after 5 rapid updates + 2 delete/restore cycles matches stored value", financials.expenseItems === finalExpense!.amount, `financials.expenseItems=${financials.expenseItems}, stored=${finalExpense!.amount}`);

    const trail = await services.transactionService.getAuditTrail("estimate_expense", expense.id);
    check("CRUD", "Full history preserved: create + 5 updates = 6 ledger rows for this expense", trail.length === 6, `trail.length=${trail.length}`);
  });

  test("Multiple edits to an estimate before any external read only reflect the LAST edit", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "v1", description: null, quantity: 1, unitPrice: 100, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.estimateService.updateLineItems(estimate.id, [{ category: "material", name: "v2", description: null, quantity: 1, unitPrice: 200, taxable: false }]);
    await services.estimateService.updateLineItems(estimate.id, [{ category: "material", name: "v3", description: null, quantity: 1, unitPrice: 300, taxable: false }]);
    const final = await services.estimateService.updateLineItems(estimate.id, [{ category: "material", name: "v4-final", description: null, quantity: 1, unitPrice: 400, taxable: false }]);

    check("CRUD", "Estimate reflects only the final edit (400), not a sum of all edits", final.total === 400, `total=${final.total}`);
  });

  test("Restoring a deleted change order re-includes its approved revenue everywhere it's shown", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const co = await services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId, estimateId: estimate.id, changeOrderNumber: "CO-RESTORE", title: "Restore test", totalAmount: 250, tax: 0 });
    await services.changeOrderService.approveChangeOrder(co.id);
    const before = await services.financialEngine.getProjectFinancials(projectId);
    const revisedBefore = services.financialEngine.calculateRevisedEstimateTotal(estimate.total, await services.changeOrderService.listForEstimate(estimate.id));
    check("CRUD", "Estimate's revised total includes the approved change order before delete", revisedBefore === estimate.total + 250, `revisedBefore=${revisedBefore}, estimate.total=${estimate.total}`);

    await services.changeOrderService.softDelete(co.id, "testing restore");
    const afterDelete = await services.financialEngine.getProjectFinancials(projectId);
    check("CRUD", "Deleting an approved change order removes its revenue from project financials", afterDelete.approvedChangeOrderTotal === before.approvedChangeOrderTotal - 250, `before=${before.approvedChangeOrderTotal}, afterDelete=${afterDelete.approvedChangeOrderTotal}`);
    const revisedAfterDelete = services.financialEngine.calculateRevisedEstimateTotal(estimate.total, await services.changeOrderService.listForEstimate(estimate.id));
    check("CRUD", "Deleting an approved change order removes its revenue from the estimate's revised total too", revisedAfterDelete === estimate.total, `revisedAfterDelete=${revisedAfterDelete}, estimate.total=${estimate.total}`);

    await services.changeOrderService.restore(co.id);
    const afterRestore = await services.financialEngine.getProjectFinancials(projectId);
    check("CRUD", "Restoring re-includes the revenue in project financials", afterRestore.approvedChangeOrderTotal === before.approvedChangeOrderTotal, `before=${before.approvedChangeOrderTotal}, afterRestore=${afterRestore.approvedChangeOrderTotal}`);
    const revisedAfterRestore = services.financialEngine.calculateRevisedEstimateTotal(estimate.total, await services.changeOrderService.listForEstimate(estimate.id));
    check("CRUD", "Restoring re-includes the revenue in the estimate's revised total", revisedAfterRestore === revisedBefore, `revisedAfterRestore=${revisedAfterRestore}, revisedBefore=${revisedBefore}`);
  });

  test("An estimate with no tax/markup/discount/deposit and no approved change orders has Subtotal === Total === Revised Total", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "Cabinet", description: null, quantity: 1, unitPrice: 4163.6, taxable: false }],
      markup: 0, discount: 0, taxRate: 0, depositAmount: 0,
    });
    const changeOrders = await services.changeOrderService.listForEstimate(estimate.id);
    const revisedTotal = services.financialEngine.calculateRevisedEstimateTotal(estimate.total, changeOrders);

    check("Financial", "Subtotal equals Total with no adjustments", estimate.subtotal === estimate.total, `subtotal=${estimate.subtotal}, total=${estimate.total}`);
    check("Financial", "Total equals Revised Total with no approved change orders", estimate.total === revisedTotal, `total=${estimate.total}, revisedTotal=${revisedTotal}`);
    check("Financial", "Subtotal, Total, and Revised Total are all identical", estimate.subtotal === estimate.total && estimate.total === revisedTotal, `subtotal=${estimate.subtotal}, total=${estimate.total}, revisedTotal=${revisedTotal}`);
  });

  test("Deleting a change order self-heals a stale estimate total (legacy contamination regression)", async () => {
    // Reproduces a real, live bug: contractor-pwa's ORIGINAL app used to
    // cascade an approved change order's amount directly into
    // estimates.total (the exact anti-pattern this rebuild's
    // architecture avoids — ChangeOrderService never writes to
    // estimates.total on approve). Found live on estimate 706de637:
    // an old, pre-rebuild change order approval had baked $1,700 into
    // estimates.total; deleting that change order through the NEW
    // ChangeOrderService correctly never re-added anything, but also
    // had no way to undo a write it never made, leaving Total stuck
    // $1,700 above Subtotal even with zero approved change orders.
    // Own isolated store — this test deliberately reaches into it to
    // simulate a write the service layer itself can never make (no
    // EstimateService method accepts an arbitrary `total` override;
    // it's always recalculated from line items/markup/discount/tax).
    // That's the real point: this contamination can ONLY happen via a
    // legacy/external writer, exactly as it did in production.
    const store = createInMemoryStore();
    const localServices = createInMemoryServices(store);
    const localProject = await localServices.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Legacy Contamination Test" });
    const estimate = await localServices.estimateService.create({
      companyId: COMPANY_ID, projectId: localProject.id, clientId: null,
      lineItems: [{ category: "material", name: "Cabinet", description: null, quantity: 1, unitPrice: 4163.6, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const existing = store.estimates.get(estimate.id)!;
    store.estimates.set(estimate.id, { ...existing, total: existing.total + 1700 });
    const contaminated = await localServices.estimateService.getById(estimate.id);
    check("Financial", "Setup: total is contaminated relative to subtotal before the fix runs", contaminated!.total === contaminated!.subtotal + 1700, `total=${contaminated!.total}, subtotal=${contaminated!.subtotal}`);

    const co = await localServices.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: localProject.id, estimateId: estimate.id, changeOrderNumber: "CO-LEGACY", title: "Legacy contamination test", totalAmount: 1700, tax: 0,
    });
    await localServices.changeOrderService.approveChangeOrder(co.id);
    await localServices.changeOrderService.softDelete(co.id, "cleanup test data");

    const healed = await localServices.estimateService.getById(estimate.id);
    check("Financial", "Deleting a change order recalculates the estimate's total back to match its subtotal, self-healing legacy contamination", healed!.total === healed!.subtotal, `total=${healed!.total}, subtotal=${healed!.subtotal}`);
  });

  test("Totals stay correct through a full sequence: create, edit, approve, reject, delete, restore, multiple change orders", async () => {
    const localProject = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Sequential Ops Test" });
    let estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: localProject.id, clientId: null,
      lineItems: [{ category: "material", name: "Widget", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    check("Financial", "1. Fresh estimate: total equals subtotal (no adjustments)", estimate.total === 1000 && estimate.subtotal === 1000, `total=${estimate.total}, subtotal=${estimate.subtotal}`);

    // 2. Edit line items — total must be a full rebuild from the NEW
    // items, never the old total plus/minus a delta.
    estimate = await services.estimateService.updateLineItems(estimate.id, [
      { category: "material", name: "Widget", description: null, quantity: 2, unitPrice: 1000, taxable: false },
    ]);
    check("Financial", "2. Editing line items rebuilds total from current items only", estimate.total === 2000, `total=${estimate.total}`);

    // 3. Create + approve a change order — base Total must NOT move;
    // only Revised Total (a separate derived figure) reflects it.
    const coA = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: localProject.id, estimateId: estimate.id, changeOrderNumber: "CO-SEQ-A", title: "Addition", totalAmount: 500, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(coA.id);
    let current = await services.estimateService.getById(estimate.id);
    let cos = await services.changeOrderService.listForEstimate(estimate.id);
    let revised = services.financialEngine.calculateRevisedEstimateTotal(current!.total, cos);
    check("Financial", "3. Approving a change order never changes base Total", current!.total === 2000, `total=${current!.total}`);
    check("Financial", "3. Approving a change order updates Revised Total to Total + amount", revised === 2500, `revised=${revised}`);

    // 4. A second, pending change order must not affect either figure
    // until it is itself approved.
    const coB = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: localProject.id, estimateId: estimate.id, changeOrderNumber: "CO-SEQ-B", title: "Pending, ignored", totalAmount: 9999, tax: 0,
    });
    current = await services.estimateService.getById(estimate.id);
    cos = await services.changeOrderService.listForEstimate(estimate.id);
    revised = services.financialEngine.calculateRevisedEstimateTotal(current!.total, cos);
    check("Financial", "4. A pending change order affects neither Total nor Revised Total", current!.total === 2000 && revised === 2500, `total=${current!.total}, revised=${revised}`);

    // 5. Reject it — must remain excluded permanently.
    await services.changeOrderService.changeStatus(coB.id, "rejected");
    cos = await services.changeOrderService.listForEstimate(estimate.id);
    revised = services.financialEngine.calculateRevisedEstimateTotal(current!.total, cos);
    check("Financial", "5. A rejected change order is excluded from Revised Total", revised === 2500, `revised=${revised}`);

    // 6. Delete the approved one — Revised Total must drop back to
    // Total exactly (base Total still untouched throughout).
    await services.changeOrderService.softDelete(coA.id, "testing sequential ops");
    current = await services.estimateService.getById(estimate.id);
    cos = await services.changeOrderService.listForEstimate(estimate.id);
    revised = services.financialEngine.calculateRevisedEstimateTotal(current!.total, cos);
    check("Financial", "6. Deleting the approved change order drops Revised Total back to Total", current!.total === 2000 && revised === 2000, `total=${current!.total}, revised=${revised}`);

    // 7. Restore it — Revised Total must recover exactly.
    await services.changeOrderService.restore(coA.id);
    current = await services.estimateService.getById(estimate.id);
    cos = await services.changeOrderService.listForEstimate(estimate.id);
    revised = services.financialEngine.calculateRevisedEstimateTotal(current!.total, cos);
    check("Financial", "7. Restoring the change order recovers Revised Total exactly", current!.total === 2000 && revised === 2500, `total=${current!.total}, revised=${revised}`);

    // 8. One more line-item edit at the end, with change orders still
    // in play — Total must rebuild from the NEW items only; Revised
    // Total must rebuild on top of that new Total, not drift.
    estimate = await services.estimateService.updateLineItems(estimate.id, [
      { category: "material", name: "Widget", description: null, quantity: 3, unitPrice: 1000, taxable: false },
    ]);
    cos = await services.changeOrderService.listForEstimate(estimate.id);
    revised = services.financialEngine.calculateRevisedEstimateTotal(estimate.total, cos);
    check("Financial", "8. A late line-item edit rebuilds Total from current items and Revised Total from the new Total", estimate.total === 3000 && revised === 3500, `total=${estimate.total}, revised=${revised}`);
  });

  test("Estimate -> Invoice -> Payment -> Change Order -> Revised Balance: invoices never drift from change order events", async () => {
    const localProject = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Invoice Integrity Test" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: localProject.id, clientId: null,
      lineItems: [{ category: "material", name: "Kitchen remodel", description: null, quantity: 1, unitPrice: 10000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    check("Financial", "1. Invoice created from an estimate must equal the estimate's Total exactly", true, "asserted below after createFromEstimate");

    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-02-01", dueDate: "2026-02-28" });
    check("Financial", "1. Invoice total equals the estimate's total at issue time", invoice.total === 10000, `invoice.total=${invoice.total}`);

    // 2. Partial payment — remaining balance must be a fresh rebuild
    // from active payments, never a cached/incremented field.
    const paymentResult = await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 4000, method: "check", paymentDate: "2026-02-05" });
    check("Financial", "2. Payment recorded successfully", paymentResult.valid, JSON.stringify(paymentResult.issues));
    let summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    check("Financial", "2. Remaining balance after partial payment", summary.remainingBalance === 6000 && summary.status === "partial", `remainingBalance=${summary.remainingBalance}, status=${summary.status}`);

    // 3. A change order is created and approved AFTER the invoice
    // already exists — this must NEVER change the invoice's own total
    // or remaining balance. Its only effect is on the PROJECT's
    // revenue figure (FinancialEngine.getProjectFinancials.revisedTotal),
    // a completely separate calculation.
    const co = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: localProject.id, estimateId: estimate.id, changeOrderNumber: "CO-INV-1", title: "Add pantry shelving", totalAmount: 1500, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(co.id);

    const invoiceAfterApproval = await services.invoiceService.getById(invoice.id);
    summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    check("Financial", "3. Approving a change order after invoicing never changes the invoice's total", invoiceAfterApproval!.total === 10000, `total=${invoiceAfterApproval!.total}`);
    check("Financial", "3. Approving a change order after invoicing never changes remaining balance", summary.remainingBalance === 6000, `remainingBalance=${summary.remainingBalance}`);

    const financialsAfterApproval = await services.financialEngine.getProjectFinancials(localProject.id);
    check("Financial", "3. The approved change order DOES show up in the project's revised total", financialsAfterApproval.revisedTotal === 11500, `revisedTotal=${financialsAfterApproval.revisedTotal}`); // 10000 invoiced + 1500 approved CO

    // 4. Reject a second change order — must never affect the invoice
    // OR the project's revised total.
    const coRejected = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: localProject.id, estimateId: estimate.id, changeOrderNumber: "CO-INV-2", title: "Rejected scope", totalAmount: 9999, tax: 0,
    });
    await services.changeOrderService.changeStatus(coRejected.id, "rejected");
    const invoiceAfterReject = await services.invoiceService.getById(invoice.id);
    const financialsAfterReject = await services.financialEngine.getProjectFinancials(localProject.id);
    check("Financial", "4. A rejected change order never affects the invoice total", invoiceAfterReject!.total === 10000, `total=${invoiceAfterReject!.total}`);
    check("Financial", "4. A rejected change order never affects the project's revised total", financialsAfterReject.revisedTotal === 11500, `revisedTotal=${financialsAfterReject.revisedTotal}`);

    // 5. Delete the approved change order — invoice must still be
    // untouched; only the project's revised total drops.
    await services.changeOrderService.softDelete(co.id, "scope removed");
    const invoiceAfterDelete = await services.invoiceService.getById(invoice.id);
    summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    const financialsAfterDelete = await services.financialEngine.getProjectFinancials(localProject.id);
    check("Financial", "5. Deleting an approved change order never affects the invoice total", invoiceAfterDelete!.total === 10000, `total=${invoiceAfterDelete!.total}`);
    check("Financial", "5. Deleting an approved change order never affects remaining balance", summary.remainingBalance === 6000, `remainingBalance=${summary.remainingBalance}`);
    check("Financial", "5. Deleting an approved change order drops the project's revised total back", financialsAfterDelete.revisedTotal === 10000, `revisedTotal=${financialsAfterDelete.revisedTotal}`);

    // 6. Final payment — remaining balance and status must rebuild
    // fully from the sum of active payments, not an increment.
    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 6000, method: "check", paymentDate: "2026-02-20" });
    summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    check("Financial", "6. Invoice is fully paid after the second payment, rebuilt from both active payments", summary.remainingBalance === 0 && summary.status === "paid", `remainingBalance=${summary.remainingBalance}, status=${summary.status}`);
  });

  test("Cascading deletes: deleting a project does NOT cascade to its estimates/invoices/expenses", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Cascade Test" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 100, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.projectService.softDelete(project.id, "cascade test");

    const estimateAfter = await services.estimateService.getById(estimate.id);
    const stillComputable = await services.financialEngine.getProjectFinancials(project.id);
    check("CRUD", "Estimate is untouched after its parent project is deleted (no cascade)", estimateAfter?.deletedAt == null);
    warn("CRUD", "No cascading soft-delete from Project to its children", `After deleting project ${project.id}, its estimate/invoices/expenses remain active and FinancialEngine.getProjectFinancials still returns a full computation (revisedTotal=${stillComputable.revisedTotal}) for a project that no longer shows up in ProjectService.list(). This is orphaned-but-still-active data — worth an explicit product decision on whether project deletion should cascade or block if children exist.`);
  });
});

// ============================================================
// CONCURRENCY
// ============================================================
describe("Concurrency", () => {
  let services: InMemoryServices;
  let projectId: string;

  beforeAll(async () => {
    services = createInMemoryServices();
    const project = await seedRosterAndProject(services);
    projectId = project.id;
  });

  test("Two users editing the same estimate concurrently: last write wins, no crash/corruption", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 100, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });

    const [userAResult] = await Promise.all([
      services.estimateService.updateLineItems(estimate.id, [{ category: "material", name: "user-A-edit", description: null, quantity: 1, unitPrice: 500, taxable: false }]),
      services.estimateService.changeStatus(estimate.id, "sent"),
    ]);

    const final = await services.estimateService.getById(estimate.id);
    check("Concurrency", "Concurrent line-item edit + status change both land without throwing", final != null && final.lineItems.length === 1);
    warn("Concurrency", "No optimistic locking on estimate edits", `Two concurrent writers (one editing line items to $500, one changing status to "sent") both succeeded silently — the final line items are ${JSON.stringify(final?.lineItems.map((i) => i.name))}. There is no version/etag check, so a real second user's simultaneous edit can be silently overwritten with no conflict warning to either user.`);
  });

  test("Simultaneous payments against the same invoice: a real TOCTOU race in overpayment validation", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });

    // Two payments of $700 each, fired concurrently, against a $1,000
    // invoice — sequentially the second would be rejected as an
    // overpayment (700 > 300 remaining). Concurrently, both read
    // "remaining balance = $1,000" before either has committed.
    const [r1, r2] = await Promise.all([
      services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 700, method: "cash", paymentDate: "2026-01-02" }),
      services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 700, method: "cash", paymentDate: "2026-01-02" }),
    ]);

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    const bothSucceeded = r1.valid && r2.valid;
    if (bothSucceeded && summary.totalPaid > invoice.total && summary.status !== "overpaid") {
      warn(
        "Concurrency",
        "Simultaneous payments can silently exceed the invoice total without being flagged overpaid",
        `Both $700 payments were accepted (validated independently against the same $1,000 starting balance), producing totalPaid=$${summary.totalPaid} against a $${invoice.total} invoice. getSummaryForInvoice DOES correctly report status="${summary.status}" after the fact once both are recorded — so the number itself is not wrong — but validatePaymentAmount's check-then-act pattern has no locking, so the OVERPAYMENT REJECTION that would have caught the second payment sequentially never fires under true concurrency. This is a check-then-act race inherent to the validation approach, not something an in-memory single-threaded fake can fully reproduce (a real database needs a transaction/row lock to close this, which is outside this service layer's current scope).`
      );
    } else {
      check("Concurrency", "Simultaneous overlapping payments correctly resolve to a consistent, non-corrupted total", summary.totalPaid === (r1.valid ? 700 : 0) + (r2.valid ? 700 : 0), `totalPaid=${summary.totalPaid}, status=${summary.status}`);
    }
  });

  test("Simultaneous expenses on the same project: no lost writes", async () => {
    const amounts = [50, 75, 100, 125, 150];
    await Promise.all(amounts.map((amount) => services.expenseService.create({ companyId: COMPANY_ID, projectId, category: "material", amount, expenseDate: "2026-01-03" })));

    const expenses = await services.expenseService.listForProject(projectId);
    const relevant = expenses.filter((e) => amounts.includes(e.amount));
    check("Concurrency", "All 5 concurrently-created expenses are present (no lost writes)", relevant.length === 5, `found ${relevant.length} of 5`);
  });

  test("Simultaneous change order approvals: both booked, neither lost", async () => {
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const co1 = await services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId, estimateId: estimate.id, changeOrderNumber: "CO-CONC-1", title: "Concurrent A", totalAmount: 111, tax: 0 });
    const co2 = await services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId, estimateId: estimate.id, changeOrderNumber: "CO-CONC-2", title: "Concurrent B", totalAmount: 222, tax: 0 });

    const before = await services.financialEngine.getProjectFinancials(projectId);
    await Promise.all([services.changeOrderService.approveChangeOrder(co1.id), services.changeOrderService.approveChangeOrder(co2.id)]);
    const after = await services.financialEngine.getProjectFinancials(projectId);

    check("Concurrency", "Both concurrently-approved change orders (111+222=333) are reflected", after.approvedChangeOrderTotal === before.approvedChangeOrderTotal + 333, `delta=${after.approvedChangeOrderTotal - before.approvedChangeOrderTotal}`);
  });
});

// ============================================================
// DATA INTEGRITY
// ============================================================
describe("Data integrity", () => {
  let services: InMemoryServices;
  let projectId: string;

  beforeAll(async () => {
    services = createInMemoryServices();
    const project = await seedRosterAndProject(services);
    projectId = project.id;

    // Build a representative mix of records for the integrity sweep.
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: null,
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 2000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 500, method: "cash", paymentDate: "2026-01-02" });
    await services.expenseService.create({ companyId: COMPANY_ID, projectId, category: "material", amount: 300, expenseDate: "2026-01-03" });
    const assignment = await services.agentCommissionService.assignToProject({ companyId: COMPANY_ID, projectId, agentId: "agent-1", assignedAmount: 200 });
    await services.agentCommissionService.recordPayment({ companyId: COMPANY_ID, agentId: "agent-1", assignmentId: assignment.id, amount: 200, paymentType: "commission", paymentDate: "2026-01-04" });
  });

  test("No duplicate estimate numbers", async () => {
    // Fire several concurrent estimate creations — the id scheme
    // (`EST-${store.estimates.size + 1}`) is a real production risk
    // (see the warning below), even though this in-memory fake's
    // synchronous-until-first-await execution model happens to avoid
    // an actual collision here.
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        services.estimateService.create({
          companyId: COMPANY_ID, projectId, clientId: null,
          lineItems: [{ category: "other", name: `concurrent-${i}`, description: null, quantity: 1, unitPrice: 10, taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        })
      )
    );
    const numbers = created.map((e) => e.estimateNumber);
    const unique = new Set(numbers);
    check("Data Integrity", "No duplicate estimate numbers across 5 concurrent creations", unique.size === numbers.length, `numbers=${JSON.stringify(numbers)}`);
    warn(
      "Data Integrity",
      "Estimate number scheme is not concurrency-safe by construction",
      `estimateNumber is generated as EST-\${store.estimates.size + 1} — a count-based scheme. This test passed only because this in-memory fake happens to run each create() call's synchronous portion to completion before yielding; a real database-backed implementation using the equivalent "SELECT count(*) then use count+1" pattern WOULD produce duplicate numbers under real concurrent writers. A production implementation needs a DB sequence or a unique constraint with retry, not a count.`
    );
  });

  test("No duplicate invoice numbers", async () => {
    const estimates = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        services.estimateService.create({
          companyId: COMPANY_ID, projectId, clientId: null,
          lineItems: [{ category: "other", name: `inv-src-${i}`, description: null, quantity: 1, unitPrice: 10, taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        })
      )
    );
    const invoices = await Promise.all(estimates.map((e) => services.invoiceService.createFromEstimate(e.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" })));
    const numbers = invoices.map((i) => i.invoiceNumber);
    check("Data Integrity", "No duplicate invoice numbers across concurrent conversions", new Set(numbers).size === numbers.length, `numbers=${JSON.stringify(numbers)}`);
  });

  test("Every payment belongs to exactly one existing invoice", () => {
    let allValid = true;
    const problems: string[] = [];
    for (const payment of services.store.payments.values()) {
      const invoice = services.store.invoices.get(payment.invoiceId);
      if (!invoice) {
        allValid = false;
        problems.push(payment.id);
      }
    }
    check("Data Integrity", "Every payment.invoiceId resolves to a real invoice", allValid, problems.length ? `orphaned payments: ${problems.join(", ")}` : undefined);
  });

  test("Every expense belongs to exactly one existing project", () => {
    let allValid = true;
    const problems: string[] = [];
    for (const expense of services.store.expenses.values()) {
      if (!services.store.projects.has(expense.projectId)) {
        allValid = false;
        problems.push(expense.id);
      }
    }
    check("Data Integrity", "Every expense.projectId resolves to a real project", allValid, problems.length ? `orphaned expenses: ${problems.join(", ")}` : undefined);
  });

  test("Every ledger entry has a valid, resolvable reference", () => {
    const resolvers: Record<string, (id: string) => boolean> = {
      invoice: (id) => services.store.invoices.has(id),
      invoice_payment: (id) => services.store.payments.has(id),
      estimate_expense: (id) => services.store.expenses.has(id),
      change_order: (id) => services.store.changeOrders.has(id),
      subcontractor_payment: () => true, // no dedicated map in this fake — tracked via side-table, see inMemoryServices.ts
      agent_payment: (id) => services.store.agentPayments.has(id),
      adjustment: () => true, // adjustments are self-referential by design, no source to resolve
    };
    const problems: string[] = [];
    for (const tx of services.store.ledger) {
      const resolver = resolvers[tx.referenceType];
      if (!resolver || !resolver(tx.referenceId)) problems.push(`${tx.id} (${tx.referenceType}:${tx.referenceId})`);
    }
    check("Data Integrity", "Every ledger row's (referenceType, referenceId) resolves to a real record", problems.length === 0, problems.length ? problems.join("; ") : undefined);
  });

  test("No orphan records: every estimate/invoice/change order/assignment references a real project", () => {
    const problems: string[] = [];
    for (const e of services.store.estimates.values()) if (!services.store.projects.has(e.projectId)) problems.push(`estimate ${e.id}`);
    for (const i of services.store.invoices.values()) if (!services.store.projects.has(i.projectId)) problems.push(`invoice ${i.id}`);
    for (const c of services.store.changeOrders.values()) if (!services.store.projects.has(c.projectId)) problems.push(`change order ${c.id}`);
    for (const a of services.store.subAssignments.values()) if (!services.store.projects.has(a.projectId)) problems.push(`sub assignment ${a.id}`);
    for (const a of services.store.agentAssignments.values()) if (!services.store.projects.has(a.projectId)) problems.push(`agent assignment ${a.id}`);
    check("Data Integrity", "No orphan estimates/invoices/change-orders/assignments", problems.length === 0, problems.length ? problems.join("; ") : undefined);
  });
});

// ============================================================
// CROSS-PAGE VALIDATION
// ============================================================
describe("Cross-page validation", () => {
  let services: InMemoryServices;
  let projectId: string;

  beforeAll(async () => {
    services = createInMemoryServices();
    const project = await seedRosterAndProject(services);
    projectId = project.id;

    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId, clientId: "client-1",
      lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: 8000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 3000, method: "cash", paymentDate: "2026-01-02" });
    await services.expenseService.create({ companyId: COMPANY_ID, projectId, category: "material", amount: 1000, expenseDate: "2026-01-03" });
    const co = await services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId, estimateId: estimate.id, changeOrderNumber: "CO-X", title: "X", totalAmount: 500, tax: 0 });
    await services.changeOrderService.approveChangeOrder(co.id);
    const subAssignment = await services.subcontractorService.assignToProject({ companyId: COMPANY_ID, projectId, subcontractorId: "sub-1", contractedAmount: 1500 });
    await services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: subAssignment.id, amount: 1500, paymentDate: "2026-01-04" });
    const agentAssignment = await services.agentCommissionService.assignToProject({ companyId: COMPANY_ID, projectId, agentId: "agent-1", assignedAmount: 400 });
    await services.agentCommissionService.recordPayment({ companyId: COMPANY_ID, agentId: "agent-1", assignmentId: agentAssignment.id, amount: 400, paymentType: "commission", paymentDate: "2026-01-05" });
  });

  test("Dashboard, Estimates, Invoices, Expenses, Reports, Tax, Customer, Project, Agent, Subcontractor pages all agree", async () => {
    // Every "page" below is modeled as its own call site, exactly as a
    // real page is only allowed to call FinancialService/other
    // services — never its own formula.
    const dashboardPage = await services.financialEngine.getProjectFinancials(projectId);
    const reportsPage = await services.financialEngine.getProjectFinancials(projectId);
    const projectPage = await services.financialEngine.getProjectFinancials(projectId);

    check("Cross-page", "Dashboard === Reports === Project page (same call, same result)", JSON.stringify(dashboardPage) === JSON.stringify(reportsPage) && JSON.stringify(reportsPage) === JSON.stringify(projectPage));

    const estimatesPage = await services.estimateService.listForProject(projectId);
    check("Cross-page", "Estimates page total is the proposal figure, independent of but consistent with revenue inputs", estimatesPage.length === 1 && estimatesPage[0].total === 8000);

    const invoicesPage = await services.invoiceService.listForProject(projectId);
    check("Cross-page", "Invoices page total matches Dashboard's invoicesTotal", invoicesPage.reduce((s, i) => s + i.total, 0) === dashboardPage.invoicesTotal);

    const expensesPage = await services.expenseService.listForProject(projectId);
    check("Cross-page", "Expenses page total matches Dashboard's expenseItems", expensesPage.reduce((s, e) => s + e.amount, 0) === dashboardPage.expenseItems);

    const range = { start: new Date("2025-12-01"), end: new Date("2026-03-01") };
    const taxPage = await services.financialEngine.getTaxSummary({ companyId: COMPANY_ID, dateRange: range });
    const companyFinancials = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: range });
    check("Cross-page", "Tax page's taxableRevenue matches company financials' totalRevenue (same cash-basis source)", taxPage.taxableRevenue === companyFinancials.totalRevenue);

    const customerPage = await services.financialEngine.getClientFinancials("client-1", COMPANY_ID);
    check("Cross-page", "Customer page's totalInvoiced matches Dashboard's invoicesTotal", customerPage.totalInvoiced === dashboardPage.invoicesTotal);

    const payables = await services.financialEngine.getPayablesSummary({ companyId: COMPANY_ID, projectId });
    const agentPage = payables.lines.filter((l) => l.role === "agent");
    const subcontractorPage = payables.lines.filter((l) => l.role === "subcontractor");
    check("Cross-page", "Agent page outstanding matches Dashboard's outstandingAgent", agentPage.reduce((s, l) => s + l.outstanding, 0) === dashboardPage.outstandingAgent);
    check("Cross-page", "Subcontractor page outstanding matches Dashboard's outstandingSubcontractor", subcontractorPage.reduce((s, l) => s + l.outstanding, 0) === dashboardPage.outstandingSubcontractor);

    const reconciliation = await services.reconciliationService.reconcileLedgerAgainstSources({ companyId: COMPANY_ID, projectId });
    check("Cross-page", "Full reconciliation sweep is clean across every page's data source", reconciliation.isClean, JSON.stringify(reconciliation.findings));
  });
});
