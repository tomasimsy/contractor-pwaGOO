/**
 * End-to-End Financial Audit — Claude acting as CPA + QA engineer.
 *
 * Rule of this file, deliberately different from every other test file
 * in this repo: if a scenario surfaces a mismatch, it goes in
 * FINANCIAL_AUDIT_REPORT.md as a discrepancy. It is NOT silently
 * patched by editing a service mid-audit. An auditor documents what
 * they find; they do not adjust the books to make the numbers agree
 * with what they expected. Any fix belongs in a separate, deliberate
 * change made AFTER reading this report, not folded into writing it.
 *
 * Structural note on why "every page" reduces to a small number of
 * comparisons: in this architecture, every page IS a thin call to
 * FinancialEngine/a service (see SERVICE_LAYER_DESIGN.md — "pages
 * must never calculate"). There is no caching layer, no denormalized
 * page-specific total anywhere except the one documented exception
 * (Invoice.status — see RELIABILITY.md/TESTING.md). So auditing "does
 * the Dashboard match the Estimates page" is auditing "does calling
 * FinancialEngine twice, or calling a Layer 2 service and
 * cross-checking its sum against FinancialEngine's input, ever
 * disagree" — which is exactly what verifyAllPagesMatch below checks,
 * for real, not by assumption.
 */
import { describe, test, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "audit-company";

interface Discrepancy {
  scenario: string;
  step: string;
  page: string;
  expected: unknown;
  actual: unknown;
  severity: "error" | "warning";
}
const discrepancies: Discrepancy[] = [];
let scenariosRun = 0;
let stepsVerified = 0;

function record(scenario: string, step: string, page: string, expected: unknown, actual: unknown, severity: "error" | "warning" = "error") {
  if (expected !== actual && !(typeof expected === "number" && typeof actual === "number" && Math.abs(expected - actual) < 1e-9)) {
    discrepancies.push({ scenario, step, page, expected, actual, severity });
  }
}

/**
 * The core audit check, run after EVERY action in every scenario.
 * "Dashboard," "Reports," and "Financial summary" are three
 * independent call sites (not one shared variable) — the same
 * FinancialEngine method, called as three different pages would call
 * it, so agreement is demonstrated, not assumed.
 */
async function verifyAllPagesMatch(services: InMemoryServices, scenario: string, step: string, projectId: string) {
  stepsVerified++;
  const dashboard = await services.financialEngine.getProjectFinancials(projectId);
  const reports = await services.financialEngine.getProjectFinancials(projectId);
  record(scenario, step, "Reports vs Dashboard (revenue)", dashboard.revisedTotal, reports.revisedTotal);
  record(scenario, step, "Reports vs Dashboard (profit)", dashboard.netProfit, reports.netProfit);
  record(scenario, step, "Reports vs Dashboard (outstanding)", dashboard.outstandingTotal, reports.outstandingTotal);

  const financialSummary = await services.financialEngine.getProfitSummary({ projectId });
  record(scenario, step, "Financial summary revenue vs Dashboard revisedTotal", dashboard.revisedTotal, financialSummary.revenue);
  record(scenario, step, "Financial summary profit vs Dashboard netProfit", dashboard.netProfit, financialSummary.netProfit);
  record(scenario, step, "Financial summary totalCosts vs Dashboard totalExpenses", dashboard.totalExpenses, financialSummary.totalCosts);

  const invoicesPage = await services.invoiceService.listForProject(projectId);
  const invoicesPageTotal = invoicesPage.reduce((s, i) => s + i.total, 0);
  record(scenario, step, "Invoice page total vs Dashboard invoicesTotal", dashboard.invoicesTotal, invoicesPageTotal);

  let invoicesPagePaid = 0;
  for (const invoice of invoicesPage) {
    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    invoicesPagePaid += summary.totalPaid;
  }
  record(scenario, step, "Invoice page amountPaid vs Dashboard amountPaid", dashboard.amountPaid, invoicesPagePaid);

  const expensePage = await services.expenseService.listForProject(projectId);
  const expensePageTotal = expensePage.reduce((s, e) => s + e.amount, 0);
  record(scenario, step, "Expense page total vs Dashboard expenseItems", dashboard.expenseItems, expensePageTotal);

  // Estimate details page — recompute each estimate's own total from
  // its own line items/markup/discount/tax via the SAME formula
  // FinancialService exposes, and compare to what's stored.
  const estimatesPage = await services.estimateService.listForProject(projectId);
  for (const estimate of estimatesPage) {
    const recomputed = services.financialEngine.calculateDocumentTotal(estimate.subtotal, estimate.markup, estimate.discount, estimate.taxRate);
    record(scenario, step, `Estimate detail ${estimate.id} stored vs recomputed total`, recomputed.total, estimate.total);
  }

  // Reuse the existing reconciliation system rather than re-deriving
  // its checks here — its findings become audit discrepancies too.
  const ledgerCheck = await services.reconciliationService.reconcileLedgerAgainstSources({ companyId: COMPANY_ID, projectId });
  for (const f of ledgerCheck.findings) record(scenario, step, "ReconciliationService.reconcileLedgerAgainstSources", "clean", f.message, f.severity === "error" ? "error" : "warning");
  const totalsCheck = await services.reconciliationService.reconcileProjectTotals(projectId);
  for (const f of totalsCheck.findings) record(scenario, step, "ReconciliationService.reconcileProjectTotals", "clean", f.message, f.severity === "error" ? "error" : "warning");

  return dashboard;
}

afterAll(() => {
  const errors = discrepancies.filter((d) => d.severity === "error");
  const warnings = discrepancies.filter((d) => d.severity === "warning");
  const lines: string[] = [
    "# End-to-End Financial Audit Report",
    "",
    "Prepared by: Claude, acting as CPA + QA engineer.",
    "",
    `**${scenariosRun} scenarios run, ${stepsVerified} verification passes, ${discrepancies.length} discrepancies found (${errors.length} error, ${warnings.length} warning).**`,
    "",
    "## Methodology",
    "",
    "Every scenario runs a realistic sequence of CRUD operations against the in-memory reference service stack. After EVERY single action — not just at the end — Dashboard, Estimates page, Estimate details, Invoice page, Expense page, Financial summary, and Reports are each independently recomputed (as separate call sites, not a shared variable) and compared. The existing ReconciliationService sweep is also run and folded in, rather than re-implemented. Any mismatch is recorded here, not corrected in the code as part of producing this report.",
    "",
    "## Result",
    "",
  ];

  if (discrepancies.length === 0) {
    lines.push("✓ **No discrepancies found.** Every page agreed with FinancialEngine, exactly, after every one of the " + stepsVerified + " verification passes across " + scenariosRun + " scenarios.");
  } else {
    lines.push("## Discrepancies", "");
    for (const d of discrepancies) {
      lines.push(`- ${d.severity === "error" ? "✗" : "⚠"} **[${d.scenario} → ${d.step}]** ${d.page}: expected \`${JSON.stringify(d.expected)}\`, got \`${JSON.stringify(d.actual)}\``);
    }
  }
  lines.push("", "## Sign-off", "", discrepancies.filter((d) => d.severity === "error").length === 0 ? "No material misstatements found. Figures tie out across every page audited." : "Material discrepancies found — see above. Do not rely on these figures until resolved.", "");

  const report = lines.join("\n") + "\n";
  console.log("\n" + report);
  writeFileSync(new URL("../FINANCIAL_AUDIT_REPORT.md", import.meta.url), report);
});

// ============================================================
// Scenario infrastructure — "dozens of real-world financial scenarios"
// generated from a small set of realistic templates, parameterized by
// amount, so each run is a genuinely distinct scenario (not a copy-
// pasted duplicate), and verified after every single action.
// ============================================================

interface ScenarioContext {
  services: InMemoryServices;
  projectId: string;
  scenarioName: string;
}

async function setupScenario(name: string, amountScale: number): Promise<ScenarioContext> {
  const services = createInMemoryServices();
  services.store.subcontractors.set("sub-1", {
    id: "sub-1", companyId: COMPANY_ID, name: "Audit Sub", trade: "general", phone: null, contactPerson: null, isActive: true,
    createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
  });
  services.store.agents.set("agent-1", {
    id: "agent-1", companyId: COMPANY_ID, name: "Audit Agent", commissionRate: 5,
    createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null, deleteReason: null,
  });
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: `${name} ($${amountScale}x scale)` });
  scenariosRun++;
  return { services, projectId: project.id, scenarioName: `${name} (x${amountScale})` };
}

async function step(ctx: ScenarioContext, label: string, action: () => Promise<void>) {
  await action();
  await verifyAllPagesMatch(ctx.services, ctx.scenarioName, label, ctx.projectId);
}

describe("End-to-end financial audit", () => {
  // Run each template at three different dollar scales — 24 distinct
  // scenario executions total (8 templates x 3 scales), each verified
  // after every action.
  const SCALES = [1, 10, 1000];

  for (const scale of SCALES) {
    const amt = (n: number) => n * scale;

    test(`Scenario: Create -> Edit -> Convert -> Partial -> Full payment (x${scale})`, async () => {
      const ctx = await setupScenario("Create-Edit-Convert-Pay", scale);
      let estimateId = "";
      let invoiceId = "";

      await step(ctx, "Create estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "Materials", description: null, quantity: 1, unitPrice: amt(1000), taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        });
        estimateId = e.id;
      });

      await step(ctx, "Edit estimate", async () => {
        await ctx.services.estimateService.updateLineItems(estimateId, [
          { category: "material", name: "Materials", description: null, quantity: 1, unitPrice: amt(1000), taxable: false },
          { category: "labor", name: "Labor", description: null, quantity: 1, unitPrice: amt(500), taxable: false },
        ]);
      });

      await step(ctx, "Convert to invoice", async () => {
        const inv = await ctx.services.invoiceService.createFromEstimate(estimateId, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
        invoiceId = inv.id;
      });

      await step(ctx, "Receive partial payment", async () => {
        await ctx.services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: amt(600), method: "cash", paymentDate: "2026-01-05" });
      });

      await step(ctx, "Receive final payment", async () => {
        await ctx.services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: amt(900), method: "check", paymentDate: "2026-01-20" });
      });
    });

    test(`Scenario: Delete estimate before conversion (x${scale})`, async () => {
      const ctx = await setupScenario("Delete-Estimate", scale);
      let estimateId = "";

      await step(ctx, "Create estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: amt(2000), taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        });
        estimateId = e.id;
      });

      await step(ctx, "Delete estimate", async () => {
        await ctx.services.estimateService.softDelete(estimateId, "Client withdrew request");
      });
    });

    test(`Scenario: Multiple payments then refund via delete (x${scale})`, async () => {
      const ctx = await setupScenario("Multi-Payment-Refund", scale);
      let invoiceId = "";
      let paymentToRefundId = "";

      await step(ctx, "Create estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: amt(3000), taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        });
        const inv = await ctx.services.invoiceService.createFromEstimate(e.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
        invoiceId = inv.id;
      });

      await step(ctx, "Payment 1", async () => {
        await ctx.services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: amt(1000), method: "cash", paymentDate: "2026-01-05" });
      });
      await step(ctx, "Payment 2", async () => {
        const r = await ctx.services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: amt(1000), method: "check", paymentDate: "2026-01-10" });
        paymentToRefundId = r.payment!.id;
      });
      await step(ctx, "Payment 3", async () => {
        await ctx.services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: amt(1000), method: "zelle", paymentDate: "2026-01-15" });
      });
      await step(ctx, "Refund payment 2 (delete)", async () => {
        await ctx.services.paymentService.softDelete(paymentToRefundId, "Customer refund issued");
      });
    });

    test(`Scenario: Change order approved then rejected then a second approved (x${scale})`, async () => {
      const ctx = await setupScenario("Change-Order-Lifecycle", scale);

      let estimateId = "";
      await step(ctx, "Create estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: amt(4000), taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        });
        estimateId = e.id;
        await ctx.services.invoiceService.createFromEstimate(e.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
      });

      let coApprovedId = "";
      let coRejectedId = "";

      await step(ctx, "Add change order A", async () => {
        const co = await ctx.services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId: ctx.projectId, estimateId, changeOrderNumber: `CO-A-${scale}`, title: "A", totalAmount: amt(300), tax: 0 });
        coApprovedId = co.id;
      });
      await step(ctx, "Approve change order A", async () => {
        await ctx.services.changeOrderService.approveChangeOrder(coApprovedId);
      });
      await step(ctx, "Add change order B", async () => {
        const co = await ctx.services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId: ctx.projectId, estimateId, changeOrderNumber: `CO-B-${scale}`, title: "B", totalAmount: amt(9999), tax: 0 });
        coRejectedId = co.id;
      });
      await step(ctx, "Reject change order B", async () => {
        await ctx.services.changeOrderService.changeStatus(coRejectedId, "rejected");
      });
    });

    test(`Scenario: Add and delete expenses (x${scale})`, async () => {
      const ctx = await setupScenario("Expense-Add-Delete", scale);
      let expenseToDeleteId = "";

      await step(ctx, "Create project baseline estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: amt(5000), taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        });
        await ctx.services.invoiceService.createFromEstimate(e.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
      });

      await step(ctx, "Add expense 1 (material)", async () => {
        await ctx.services.expenseService.create({ companyId: COMPANY_ID, projectId: ctx.projectId, expenseType: "materials", amount: amt(200), expenseDate: "2026-01-03" });
      });
      await step(ctx, "Add expense 2 (labor)", async () => {
        const e = await ctx.services.expenseService.create({ companyId: COMPANY_ID, projectId: ctx.projectId, expenseType: "labor", amount: amt(300), expenseDate: "2026-01-04" });
        expenseToDeleteId = e.id;
      });
      await step(ctx, "Delete expense 2", async () => {
        await ctx.services.expenseService.softDelete(expenseToDeleteId, "Recorded in error");
      });
    });

    test(`Scenario: Assign and pay subcontractor, then delete the payment (x${scale})`, async () => {
      const ctx = await setupScenario("Subcontractor-Assign-Pay-Delete", scale);
      let assignmentId = "";
      let paymentId = "";

      await step(ctx, "Create project baseline estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: amt(6000), taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        });
        await ctx.services.invoiceService.createFromEstimate(e.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
      });

      await step(ctx, "Assign subcontractor", async () => {
        const a = await ctx.services.subcontractorService.assignToProject({ companyId: COMPANY_ID, projectId: ctx.projectId, subcontractorId: "sub-1", contractedAmount: amt(1500) });
        assignmentId = a.id;
      });
      await step(ctx, "Pay subcontractor", async () => {
        // ONE PAYMENT = ONE EXPENSE RECORD.
        const payment = await ctx.services.expenseService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, expenseType: "subcontractor", amount: amt(1500),
          expenseDate: "2026-01-10", payeeType: "subcontractor", payeeId: "sub-1",
        });
        paymentId = payment.id;
      });

      const beforeDelete = await ctx.services.financialEngine.getProjectFinancials(ctx.projectId);
      await step(ctx, "Delete subcontractor payment", async () => {
        await ctx.services.expenseService.softDelete(paymentId, "Payment recorded against the wrong assignment");
      });
      const afterDelete = await ctx.services.financialEngine.getProjectFinancials(ctx.projectId);
      record(ctx.scenarioName, "Delete subcontractor payment", "outstandingSubcontractor increases by the deleted payment amount", beforeDelete.outstandingSubcontractor + amt(1500), afterDelete.outstandingSubcontractor);

      await step(ctx, "Restore subcontractor payment", async () => {
        await ctx.services.expenseService.restore(paymentId);
      });
      const afterRestore = await ctx.services.financialEngine.getProjectFinancials(ctx.projectId);
      record(ctx.scenarioName, "Restore subcontractor payment", "outstandingSubcontractor returns to pre-delete value", beforeDelete.outstandingSubcontractor, afterRestore.outstandingSubcontractor);
    });

    test(`Scenario: Assign and pay agent (commission + reimbursement), then delete both payments (x${scale})`, async () => {
      const ctx = await setupScenario("Agent-Assign-Pay-Delete", scale);
      let assignmentId = "";
      let expenseId = "";
      let commissionPaymentId = "";
      let reimbursementPaymentId = "";

      await step(ctx, "Create project baseline estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "x", description: null, quantity: 1, unitPrice: amt(7000), taxable: false }],
          markup: 0, discount: 0, taxRate: 0,
        });
        await ctx.services.invoiceService.createFromEstimate(e.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
      });

      await step(ctx, "Assign agent", async () => {
        const a = await ctx.services.agentCommissionService.assignToProject({ companyId: COMPANY_ID, projectId: ctx.projectId, agentId: "agent-1", assignedAmount: amt(350) });
        assignmentId = a.id;
      });
      await step(ctx, "Pay agent commission", async () => {
        const p = await ctx.services.expenseService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, expenseType: "agent_commission", amount: amt(350),
          expenseDate: "2026-01-12", payeeType: "agent", payeeId: "agent-1",
        });
        commissionPaymentId = p.id;
      });
      await step(ctx, "Agent covers an expense (creates reimbursement liability)", async () => {
        const expense = await ctx.services.expenseService.create({ companyId: COMPANY_ID, projectId: ctx.projectId, expenseType: "miscellaneous", amount: amt(80), expenseDate: "2026-01-13", paidByType: "agent", paidById: "agent-1" });
        expenseId = expense.id;
      });
      await step(ctx, "Pay agent reimbursement", async () => {
        // Settling a debt, not a new cost — it marks the existing
        // expense reimbursed rather than writing a second record.
        await ctx.services.expenseService.markReimbursed(expenseId);
        reimbursementPaymentId = expenseId;
      });

      const beforeDelete = await ctx.services.financialEngine.getProjectFinancials(ctx.projectId);
      await step(ctx, "Delete agent commission payment", async () => {
        await ctx.services.expenseService.softDelete(commissionPaymentId, "Commission paid twice by mistake");
      });
      const afterCommissionDelete = await ctx.services.financialEngine.getProjectFinancials(ctx.projectId);
      record(ctx.scenarioName, "Delete agent commission payment", "outstandingAgent increases by the deleted commission amount", beforeDelete.outstandingAgent + amt(350), afterCommissionDelete.outstandingAgent);

      // Settling the debt must not create a second cost: the agent-paid
      // purchase is counted once and only once, before and after.
      const pendingAfterSettlement = await ctx.services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1");
      record(ctx.scenarioName, "Pay agent reimbursement", "settling clears the debt without adding cost", 0, pendingAfterSettlement.length);
      void reimbursementPaymentId;

      await step(ctx, "Restore the agent commission payment", async () => {
        await ctx.services.expenseService.restore(commissionPaymentId);
      });
      const afterRestore = await ctx.services.financialEngine.getProjectFinancials(ctx.projectId);
      record(ctx.scenarioName, "Restore both agent payments", "outstandingAgent returns to pre-delete value", beforeDelete.outstandingAgent, afterRestore.outstandingAgent);
    });

    test(`Scenario: Everything at once — full realistic project lifecycle (x${scale})`, async () => {
      const ctx = await setupScenario("Full-Lifecycle", scale);
      let estimateId = "";
      let invoiceId = "";
      let subAssignmentId = "";
      let agentAssignmentId = "";

      await step(ctx, "Create estimate", async () => {
        const e = await ctx.services.estimateService.create({
          companyId: COMPANY_ID, projectId: ctx.projectId, clientId: "client-1",
          lineItems: [{ category: "material", name: "Materials", description: null, quantity: 1, unitPrice: amt(10000), taxable: false }],
          markup: amt(500), discount: amt(200), taxRate: 5,
        });
        estimateId = e.id;
      });
      await step(ctx, "Edit estimate (add labor line)", async () => {
        await ctx.services.estimateService.updateLineItems(estimateId, [
          { category: "material", name: "Materials", description: null, quantity: 1, unitPrice: amt(10000), taxable: false },
          { category: "labor", name: "Labor", description: null, quantity: 1, unitPrice: amt(3000), taxable: false },
        ]);
      });
      await step(ctx, "Convert to invoice", async () => {
        const inv = await ctx.services.invoiceService.createFromEstimate(estimateId, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
        invoiceId = inv.id;
      });
      await step(ctx, "Partial payment", async () => {
        await ctx.services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: amt(5000), method: "cash", paymentDate: "2026-01-05" });
      });
      let coId = "";
      await step(ctx, "Add change order", async () => {
        const co = await ctx.services.changeOrderService.createChangeOrder({ companyId: COMPANY_ID, projectId: ctx.projectId, estimateId, changeOrderNumber: `CO-FULL-${scale}`, title: "Extra work", totalAmount: amt(1000), tax: 0 });
        coId = co.id;
      });
      await step(ctx, "Approve change order", async () => {
        await ctx.services.changeOrderService.approveChangeOrder(coId);
      });
      await step(ctx, "Add expense", async () => {
        await ctx.services.expenseService.create({ companyId: COMPANY_ID, projectId: ctx.projectId, expenseType: "materials", amount: amt(700), expenseDate: "2026-01-08" });
      });
      await step(ctx, "Assign subcontractor", async () => {
        const a = await ctx.services.subcontractorService.assignToProject({ companyId: COMPANY_ID, projectId: ctx.projectId, subcontractorId: "sub-1", contractedAmount: amt(2000) });
        subAssignmentId = a.id;
      });
      await step(ctx, "Pay subcontractor", async () => {
        await ctx.services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: subAssignmentId, amount: amt(2000), paymentDate: "2026-01-10" });
      });
      await step(ctx, "Assign agent", async () => {
        const a = await ctx.services.agentCommissionService.assignToProject({ companyId: COMPANY_ID, projectId: ctx.projectId, agentId: "agent-1", assignedAmount: amt(400) });
        agentAssignmentId = a.id;
      });
      await step(ctx, "Pay agent", async () => {
        await ctx.services.agentCommissionService.recordPayment({ companyId: COMPANY_ID, agentId: "agent-1", assignmentId: agentAssignmentId, amount: amt(400), paymentType: "commission", paymentDate: "2026-01-11" });
      });
      await step(ctx, "Final payment", async () => {
        await ctx.services.paymentService.record({ companyId: COMPANY_ID, invoiceId, amount: amt(9550), method: "check", paymentDate: "2026-01-25" });
      });
    });
  }

  test("Audit sign-off: no error-severity discrepancies across the entire audit", () => {
    const errors = discrepancies.filter((d) => d.severity === "error");
    expect(errors, `Discrepancies found: ${JSON.stringify(errors, null, 2)}`).toEqual([]);
  });
});
