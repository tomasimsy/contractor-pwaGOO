/**
 * SYSTEM INTEGRITY AUDIT
 * =======================================================================
 * ONE reusable, repeatable regression suite over the full financial
 * flow — estimate -> invoice -> payment -> expenses -> payables ->
 * profit — run entirely through services + FinancialEngine against the
 * in-memory doubles (lib/services/testing/inMemoryServices.ts). No UI,
 * no database, no network. Run it with:
 *
 *   npm run test:integrity
 *
 * ----------------------------------------------------------------------
 * WHY THIS FILE LOOKS DIFFERENT FROM A NORMAL UNIT TEST
 * ----------------------------------------------------------------------
 * Every expected value below is written by hand, from the scenario's
 * own inputs, BEFORE the system under test ever runs — never by calling
 * a FinancialEngine/financialCalculations function and asserting its
 * result equals itself. That would prove the function is deterministic,
 * not that it is correct. "Actual" always comes from driving the real
 * service layer (creating real rows, through real service methods) and
 * reading FinancialEngine's output — the one place this app calls
 * authoritative (see FINANCIAL_TRUTH_MAP, produced the prior turn).
 *
 * Each `check()` records PASS/FAIL/expected/actual/difference/entity
 * ids into a shared report, printed in full at the end of the file
 * regardless of outcome. Each scenario `test()` ALSO fails (throws) if
 * any of its own checks failed, so `npm run test:integrity`'s exit
 * code is a real regression signal, not just a printed report nobody
 * reads.
 *
 * This run is a BASELINE measurement against the current system.
 * Failures are not fixed here — see the accompanying report to the
 * user for what failed and why, before anything is changed.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { approveChangeOrder as approveChangeOrderWorkflow } from "../lib/services/changeOrderWorkflow";
import { getActionablePayables } from "../lib/services/payablesWorklist";

// ======================================================================
// REPORT INFRASTRUCTURE
// ======================================================================

interface CheckResult {
  suite: string;
  name: string;
  pass: boolean;
  expected: number | string | boolean;
  actual: number | string | boolean;
  difference: number | null;
  entityIds?: Record<string, string>;
}

const REPORT: CheckResult[] = [];

/** Numeric check, tolerant of floating-point noise (currency math). */
function check(
  suite: string,
  name: string,
  expected: number,
  actual: number,
  entityIds?: Record<string, string>,
  tolerance = 0.005
): boolean {
  const difference = Math.round((actual - expected) * 100) / 100;
  const pass = Math.abs(actual - expected) <= tolerance;
  REPORT.push({ suite, name, pass, expected, actual, difference, entityIds });
  return pass;
}

/** Exact check for strings/booleans (status values, flags). */
function checkExact(
  suite: string,
  name: string,
  expected: string | boolean,
  actual: string | boolean,
  entityIds?: Record<string, string>
): boolean {
  const pass = expected === actual;
  REPORT.push({ suite, name, pass, expected, actual, difference: null, entityIds });
  return pass;
}

/** Called at the end of every scenario test — fails the test (with
 * every failing check's full detail in the message) if this scenario
 * recorded any failure. Scoped by suite name, not global position, so
 * scenarios can run in any order. */
function assertSuitePassed(suite: string) {
  const mine = REPORT.filter((r) => r.suite === suite);
  const failed = mine.filter((r) => !r.pass);
  if (failed.length > 0) {
    const detail = failed
      .map(
        (f) =>
          `  ✗ ${f.name}\n` +
          `      expected: ${f.expected}\n` +
          `      actual:   ${f.actual}\n` +
          (f.difference !== null ? `      difference: ${f.difference > 0 ? "+" : ""}${f.difference}\n` : "") +
          (f.entityIds ? `      entities: ${JSON.stringify(f.entityIds)}\n` : "")
      )
      .join("\n");
    expect.fail(`[${suite}] ${failed.length} of ${mine.length} check(s) failed:\n\n${detail}`);
  }
  expect(failed.length).toBe(0);
}

function printReport() {
  const passCount = REPORT.filter((r) => r.pass).length;
  const failCount = REPORT.length - passCount;
  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(100));
  lines.push("SYSTEM INTEGRITY AUDIT — BASELINE REPORT");
  lines.push("=".repeat(100));
  lines.push(`TOTAL: ${REPORT.length}   PASS: ${passCount}   FAIL: ${failCount}`);
  lines.push("");

  const bySuite = new Map<string, CheckResult[]>();
  for (const r of REPORT) {
    if (!bySuite.has(r.suite)) bySuite.set(r.suite, []);
    bySuite.get(r.suite)!.push(r);
  }

  for (const [suite, checks] of bySuite) {
    const suitePass = checks.every((c) => c.pass);
    lines.push(`${suitePass ? "PASS" : "FAIL"}  ${suite}  (${checks.filter((c) => c.pass).length}/${checks.length})`);
    for (const c of checks) {
      const mark = c.pass ? "  ok " : "  ✗  ";
      const diffStr = c.difference !== null && !c.pass ? ` [diff ${c.difference > 0 ? "+" : ""}${c.difference}]` : "";
      lines.push(`${mark}${c.name} — expected ${JSON.stringify(c.expected)}, actual ${JSON.stringify(c.actual)}${diffStr}`);
      if (!c.pass && c.entityIds) lines.push(`        entities: ${JSON.stringify(c.entityIds)}`);
    }
    lines.push("");
  }
  lines.push("=".repeat(100));
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

// ======================================================================
// SHARED FIXTURE HELPERS
// ======================================================================

const money = (n: number) => Math.round(n * 100) / 100;

async function newProjectAndClient(services: InMemoryServices, companyId: string) {
  const client = await services.clientService.create({ companyId, name: `Client ${crypto.randomUUID().slice(0, 6)}` });
  const project = await services.projectService.create({ companyId, clientId: client.id, name: `Project ${crypto.randomUUID().slice(0, 6)}` });
  return { client, project };
}

/** Estimate -> sent -> approved, the same valid state-machine path
 * every other test in this repo uses before an invoice can be created. */
async function approveEstimate(services: InMemoryServices, estimateId: string) {
  await services.estimateService.changeStatus(estimateId, "sent");
  const result = await services.estimateService.changeStatus(estimateId, "approved");
  if (!result.valid) throw new Error(`Could not approve estimate ${estimateId}: ${result.issues.map((i) => i.message).join("; ")}`);
}

// ======================================================================
// A. ESTIMATE PRICING PIPELINE — subtotal, markup, discount, tax, total
// ======================================================================
describe("A. Estimate pricing pipeline", () => {
  test("subtotal -> markup -> discount -> tax -> total, computed independently", async () => {
    const suite = "A. Estimate pricing pipeline";
    const services = createInMemoryServices();
    const companyId = "company-A";
    const { project, client } = await newProjectAndClient(services, companyId);

    // Independently chosen inputs — nothing here is copied from any
    // production formula.
    const items = [
      { category: "material" as const, name: "Lumber", description: null, quantity: 40, unitPrice: 6.5, taxable: true },
      { category: "material" as const, name: "Shingles", description: null, quantity: 12, unitPrice: 38, taxable: true },
      { category: "labor" as const, name: "Install labor", description: null, quantity: 1, unitPrice: 900, taxable: true },
    ];
    const markup = 150;
    const discount = 75;
    const taxRate = 7; // percent

    // Hand-computed expected values — the definition of "subtotal",
    // "markup", "discount", "tax", "total" as those words are used on
    // an invoice, not a re-typed copy of calculateDocumentTotal's body.
    const expectedSubtotal = money(40 * 6.5 + 12 * 38 + 1 * 900); // 260 + 456 + 900 = 1616
    const expectedTaxedBase = money(expectedSubtotal + markup - discount); // 1616 + 150 - 75 = 1691
    const expectedTax = money(expectedTaxedBase * (taxRate / 100)); // 1691 * 0.07 = 118.37
    const expectedTotal = money(expectedTaxedBase + expectedTax); // 1809.37

    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id, lineItems: items,
      markup, discount, taxRate,
    });

    const ids = { estimateId: estimate.id, projectId: project.id };
    check(suite, "estimate.subtotal", expectedSubtotal, estimate.subtotal, ids);
    check(suite, "estimate.total", expectedTotal, estimate.total, ids);

    // FinancialEngine's own read of the same estimate must agree.
    const financials = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "getEstimateFinancials.estimateTotal", expectedTotal, financials.estimateTotal, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// B. CHANGE ORDERS — estimate revised total vs. project revised total
//    (CONFLICT ① from the truth map — both numbers are correct, and
//    they are EXPECTED to differ once a change order is billed)
// ======================================================================
describe("B. Change orders and the estimate-vs-project revised total", () => {
  test("before invoicing, estimate and project revised totals agree", async () => {
    const suite = "B. Change orders (pre-invoice)";
    const services = createInMemoryServices();
    const companyId = "company-B";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Base scope", description: null, quantity: 1, unitPrice: 5000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    // estimate.total = 5000, independently known from the single line item.
    const co1 = await services.changeOrderService.createChangeOrder({
      companyId, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-1", title: "Extra work", totalAmount: 800, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(co1.id);

    const expectedEstimateRevised = money(5000 + 800);
    const estFin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "estimate.revisedTotal (5000 base + 800 approved CO)", expectedEstimateRevised, estFin.revisedTotal, { estimateId: estimate.id });

    // No invoice exists yet, so invoicesTotal contributes $0 — but
    // project.revisedTotal = invoicesTotal + UNBILLED approved change
    // orders (getProjectFinancials), and an approved CO with nothing to
    // bill it onto is unbilled by definition. So it counts here even
    // pre-invoice: 0 (invoices) + 800 (unbilled approved CO) = 800.
    // This coincides with estimate.revisedTotal (5800... here 800 alone
    // since the base 5000 isn't "invoiced revenue" yet) for a different
    // reason each time — the two formulas are independent, not the same
    // rule re-expressed.
    const projFin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "project.revisedTotal (0 invoiced + 800 unbilled approved CO)", 800, projFin.revisedTotal, { projectId: project.id });

    assertSuitePassed(suite);
  });

  test("after the change order is billed onto the invoice, the two figures legitimately diverge", async () => {
    const suite = "B. Change orders (post-invoice, CO billed)";
    const services = createInMemoryServices();
    const companyId = "company-B2";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Base scope", description: null, quantity: 1, unitPrice: 5000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });

    const co = await services.changeOrderService.createChangeOrder({
      companyId, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-1", title: "Extra work", totalAmount: 800, tax: 0,
    });
    // approveChangeOrderWorkflow both approves AND bills the CO onto the
    // existing invoice — the exact production pathway (see
    // changeOrderWorkflow.ts / changeOrderInvoiceSync.ts).
    const result = await approveChangeOrderWorkflow(
      { changeOrderService: services.changeOrderService, estimateService: services.estimateService, invoiceService: services.invoiceService },
      co.id
    );
    if (!result.ok) throw new Error(`Failed to approve+bill change order: ${result.message}`);

    const ids = { estimateId: estimate.id, projectId: project.id, changeOrderId: co.id };

    // Estimate revised total: always base + ALL approved COs, regardless
    // of billing state. Independently expected = 5800.
    const estFin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "estimate.revisedTotal (base 5000 + approved CO 800)", 5800, estFin.revisedTotal, ids);

    // Project revised total: invoices + UNBILLED approved COs. The CO is
    // now billed (a line item on the invoice), so it must NOT also be
    // added as a standalone change-order revenue figure — the
    // documented double-count this exact mechanism exists to prevent.
    // Independently expected = invoicesTotal alone = 5800 (the invoice
    // itself now carries the extra 800 as a line item).
    const projFin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "project.invoicesTotal (base 5000 + billed CO 800, on the invoice)", 5800, projFin.invoicesTotal, ids);
    check(suite, "project.approvedChangeOrderTotal (0 — fully billed, no UNBILLED remainder)", 0, projFin.approvedChangeOrderTotal, ids);
    check(suite, "project.revisedTotal (= invoicesTotal, no double count)", 5800, projFin.revisedTotal, ids);

    // The two revised totals now agree in VALUE (5800 = 5800) but for
    // DIFFERENT reasons — estimate's is base+CO, project's is billed
    // invoice total. Documented as an explicit, intentional property.
    check(suite, "estimate.revisedTotal === project.revisedTotal once fully billed", estFin.revisedTotal, projFin.revisedTotal, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// C. INVOICE, PAYMENTS, OUTSTANDING BALANCE, PAYMENT STATUS
// ======================================================================
describe("C. Invoice, payments, outstanding balance", () => {
  test("partial then full payment moves remainingBalance and paymentStatus correctly", async () => {
    const suite = "C. Invoice + payments";
    const services = createInMemoryServices();
    const companyId = "company-C";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 4000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });
    const ids = { invoiceId: invoice.id, projectId: project.id };

    check(suite, "invoice.total", 4000, invoice.total, ids);

    let fin = await services.financialEngine.getProjectFinancials(project.id);
    checkExact(suite, "paymentStatus before any payment", "unpaid", fin.paymentStatus, ids);
    check(suite, "remainingBalance before any payment", 4000, fin.remainingBalance, ids);

    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 1500, method: "check", paymentDate: "2026-01-05" });
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "amountPaid after $1500 partial payment", 1500, fin.amountPaid, ids);
    check(suite, "remainingBalance after $1500 partial payment (4000 - 1500)", 2500, fin.remainingBalance, ids);
    checkExact(suite, "paymentStatus after partial payment", "partial", fin.paymentStatus, ids);

    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 2500, method: "bank_transfer", paymentDate: "2026-01-20" });
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "amountPaid after full payment", 4000, fin.amountPaid, ids);
    check(suite, "remainingBalance after full payment", 0, fin.remainingBalance, ids);
    checkExact(suite, "paymentStatus after full payment", "paid", fin.paymentStatus, ids);
    checkExact(suite, "isFullyPaid after full payment", true, fin.isFullyPaid, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// D. EXPENSES — multiple entries, categories, no double counting
// ======================================================================
describe("D. Expenses — multiple entries and categories", () => {
  test("five expenses across four categories sum correctly, per-category and in total", async () => {
    const suite = "D. Expenses by category";
    const services = createInMemoryServices();
    const companyId = "company-D";
    const { project } = await newProjectAndClient(services, companyId);

    const entries: Array<{ expenseType: "materials" | "labor" | "permit" | "equipment"; amount: number }> = [
      { expenseType: "materials", amount: 320.5 },
      { expenseType: "materials", amount: 89.25 },
      { expenseType: "labor", amount: 600 },
      { expenseType: "permit", amount: 45 },
      { expenseType: "equipment", amount: 150 },
    ];
    for (const e of entries) {
      await services.expenseService.create({
        companyId, projectId: project.id, expenseType: e.expenseType, amount: e.amount, expenseDate: "2026-01-10", vendor: "Test Vendor",
      });
    }

    // Hand-computed expected values, grouped by hand — not by calling
    // calculateExpenseTotals.
    const expectedMaterials = money(320.5 + 89.25); // 409.75
    const expectedLabor = 600;
    const expectedPermit = 45;
    const expectedEquipment = 150;
    const expectedTotal = money(expectedMaterials + expectedLabor + expectedPermit + expectedEquipment); // 1204.75

    const fin = await services.financialEngine.getProjectFinancials(project.id);
    const ids = { projectId: project.id };
    check(suite, "totalExpenses (5 rows, 4 categories)", expectedTotal, fin.expenseItems, ids);

    const costEntries = await services.financialEngine.getProjectCostEntries(project.id);
    const byCategory = (label: string) => money(costEntries.filter((c) => c.category === label).reduce((s, c) => s + c.amount, 0));
    check(suite, "materials category total", expectedMaterials, byCategory("Materials"), ids);
    check(suite, "labor category total", expectedLabor, byCategory("Labor"), ids);
    check(suite, "permit category total", expectedPermit, byCategory("Permit"), ids);
    check(suite, "equipment category total", expectedEquipment, byCategory("Equipment"), ids);
    check(suite, "sum of the 5 rows via cost entries", expectedTotal, money(costEntries.reduce((s, c) => s + c.amount, 0)), ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// E. REIMBURSEMENT — an agent-fronted expense must cost the job ONCE,
//    not twice. This is a direct regression test for a real,
//    previously-fixed bug documented in financialEngine.ts's own
//    comments (an agent-funded $300 purchase used to cost $600).
// ======================================================================
describe("E. Reimbursement — one cost, one liability, never two costs", () => {
  test("agent-fronted expense costs the project exactly once; reimbursing it settles the liability without adding cost", async () => {
    const suite = "E. Reimbursement double-count guard";
    const services = createInMemoryServices();
    const companyId = "company-E";
    const { project } = await newProjectAndClient(services, companyId);
    const agentId = crypto.randomUUID();
    services.store.agents.set(agentId, {
      id: agentId, companyId, name: "Agent Fronted", commissionRate: 0,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });

    const expense = await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-10",
      vendor: "Home Depot", paidByType: "agent", paidById: agentId, reimbursable: true,
    });
    const ids = { projectId: project.id, expenseId: expense.id, agentId };

    let fin = await services.financialEngine.getProjectFinancials(project.id);
    // Expected cost = 300, exactly once — NOT 600.
    check(suite, "project cost after agent-fronted $300 expense (must be 300, not 600)", 300, fin.expenseItems, ids);
    check(suite, "outstandingAgent includes the $300 owed back to the agent", 300, fin.outstandingAgent, ids);

    await services.expenseService.markReimbursed(expense.id);
    fin = await services.financialEngine.getProjectFinancials(project.id);
    // Reimbursing settles the LIABILITY, and must not change the cost —
    // still 300, never 600, and never 0.
    check(suite, "project cost after reimbursement settled (must remain 300, not 0 or 600)", 300, fin.expenseItems, ids);
    check(suite, "outstandingAgent after reimbursement settled (liability cleared)", 0, fin.outstandingAgent, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// F/G/H. COMMITTED COST LIFECYCLE — subcontractor, agent, team labor.
//    Assigning is a cost the moment it's made (committed); paying it
//    must shift the SAME dollars from "committed remaining" into
//    "expense rows" without ever changing total cost.
// ======================================================================
describe("F. Subcontractor committed-cost lifecycle", () => {
  test("assign 1000, pay 400, pay 600 — total project cost is 1000 at every step", async () => {
    const suite = "F. Subcontractor committed cost";
    const services = createInMemoryServices();
    const companyId = "company-F";
    const { project } = await newProjectAndClient(services, companyId);
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub One", trade: "framing", phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const assignment = await services.subcontractorService.assignToProject({ companyId, projectId: project.id, subcontractorId: subId, contractedAmount: 1000 });
    const ids = { projectId: project.id, subcontractorId: subId, assignmentId: assignment.id };

    let fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses immediately after $1000 assignment (committed, unpaid)", 1000, fin.totalExpenses, ids);
    check(suite, "subcontractorCosts (expense-row based) before any payment", 0, fin.subcontractorCosts, ids);
    check(suite, "outstandingSubcontractor before any payment", 1000, fin.outstandingSubcontractor, ids);

    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "subcontractor", amount: 400, expenseDate: "2026-01-15",
      vendor: "Sub One", payeeType: "subcontractor", payeeId: subId,
    });
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses after $400 partial payment (still 1000 total, not 1400)", 1000, fin.totalExpenses, ids);
    check(suite, "subcontractorCosts after $400 partial payment", 400, fin.subcontractorCosts, ids);
    check(suite, "outstandingSubcontractor after $400 partial payment (1000 - 400)", 600, fin.outstandingSubcontractor, ids);

    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "subcontractor", amount: 600, expenseDate: "2026-01-20",
      vendor: "Sub One", payeeType: "subcontractor", payeeId: subId,
    });
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses after full payment (still 1000 total, never doubles)", 1000, fin.totalExpenses, ids);
    check(suite, "subcontractorCosts after full payment", 1000, fin.subcontractorCosts, ids);
    check(suite, "outstandingSubcontractor after full payment", 0, fin.outstandingSubcontractor, ids);

    assertSuitePassed(suite);
  });
});

describe("G. Agent committed-cost lifecycle", () => {
  test("assign 500, pay in full — total cost is 500 both before and after payment", async () => {
    const suite = "G. Agent committed cost";
    const services = createInMemoryServices();
    const companyId = "company-G";
    const { project } = await newProjectAndClient(services, companyId);
    const agentId = crypto.randomUUID();
    services.store.agents.set(agentId, {
      id: agentId, companyId, name: "Agent One", commissionRate: 5,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const assignment = await services.agentCommissionService.assignToProject({ companyId, projectId: project.id, agentId, assignedAmount: 500 });
    const ids = { projectId: project.id, agentId, assignmentId: assignment.id };

    let fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses immediately after $500 assignment", 500, fin.totalExpenses, ids);
    check(suite, "outstandingAgent before payment", 500, fin.outstandingAgent, ids);

    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "agent_commission", amount: 500, expenseDate: "2026-01-15",
      vendor: "Agent One", payeeType: "agent", payeeId: agentId,
    });
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses after full payment (still 500, not 1000)", 500, fin.totalExpenses, ids);
    check(suite, "agentCosts after full payment", 500, fin.agentCosts, ids);
    check(suite, "outstandingAgent after full payment", 0, fin.outstandingAgent, ids);

    assertSuitePassed(suite);
  });
});

describe("H. Team labor committed-cost lifecycle (exercises the new in-memory double)", () => {
  test("assign 600 on an estimate, pay 250, pay 350 — total cost is 600 at every step", async () => {
    const suite = "H. Team labor committed cost";
    const services = createInMemoryServices();
    const companyId = "company-H";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "labor", name: "Scope", description: null, quantity: 1, unitPrice: 2000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const userId = crypto.randomUUID();
    const assignment = await services.teamAssignmentService.assign({ companyId, estimateId: estimate.id, projectId: project.id, userId, amount: 600 });
    const ids = { estimateId: estimate.id, projectId: project.id, userId, assignmentId: assignment.id };

    let estFin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "estimate totalExpenses right after $600 team assignment (2000 base has no expenses; only the 600 commitment)", 600, estFin.totalExpenses, ids);
    check(suite, "teamLabourAssigned", 600, estFin.teamLabourAssigned, ids);
    check(suite, "teamLabourRemaining before any payment", 600, estFin.teamLabourRemaining, ids);

    await services.expenseService.create({
      companyId, projectId: project.id, estimateId: estimate.id, expenseType: "labor", amount: 250, expenseDate: "2026-01-12",
      vendor: "Team Member", payeeType: "employee", payeeId: userId, isPaid: true,
    });
    estFin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "totalExpenses after $250 partial payment (still 600 total)", 600, estFin.totalExpenses, ids);
    check(suite, "teamLabourRemaining after $250 partial payment (600 - 250)", 350, estFin.teamLabourRemaining, ids);

    await services.expenseService.create({
      companyId, projectId: project.id, estimateId: estimate.id, expenseType: "labor", amount: 350, expenseDate: "2026-01-18",
      vendor: "Team Member", payeeType: "employee", payeeId: userId, isPaid: true,
    });
    estFin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "totalExpenses after full payment (still 600, never 1200)", 600, estFin.totalExpenses, ids);
    check(suite, "teamLabourRemaining after full payment", 0, estFin.teamLabourRemaining, ids);

    // Project-level must agree with estimate-level for the same job.
    const projFin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "project.outstandingTeamLabour after full payment", 0, projFin.outstandingTeamLabour, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// I. REASSIGNMENT / MULTI-JOB NETTING PROTECTION
//    Regression test for a real, previously-fixed bug: a payee's
//    balance across TWO jobs must never net against each other. Paying
//    one job in full must not silently "settle" a different job for
//    the same payee.
// ======================================================================
describe("I. Payee reassignment — no netting across different jobs", () => {
  test("Sub-1 assigned $500 on Job A and $300 on Job B; paying Job A in full leaves Job B fully outstanding", async () => {
    const suite = "I. Multi-job payee netting protection";
    const services = createInMemoryServices();
    const companyId = "company-I";
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub-1", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const { project: projectA, client: clientA } = await newProjectAndClient(services, companyId);
    const estimateA = await services.estimateService.create({
      companyId, projectId: projectA.id, clientId: clientA.id,
      lineItems: [{ category: "material", name: "Job A scope", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const { project: projectB, client: clientB } = await newProjectAndClient(services, companyId);
    const estimateB = await services.estimateService.create({
      companyId, projectId: projectB.id, clientId: clientB.id,
      lineItems: [{ category: "material", name: "Job B scope", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });

    const assignA = await services.subcontractorService.assignToProject({
      companyId, projectId: projectA.id, estimateId: estimateA.id, subcontractorId: subId, contractedAmount: 500,
    });
    const assignB = await services.subcontractorService.assignToProject({
      companyId, projectId: projectB.id, estimateId: estimateB.id, subcontractorId: subId, contractedAmount: 300,
    });
    const ids = { subcontractorId: subId, estimateAId: estimateA.id, estimateBId: estimateB.id, assignAId: assignA.id, assignBId: assignB.id };

    // Pay Job A in full, tagged to estimate A.
    await services.expenseService.create({
      companyId, projectId: projectA.id, estimateId: estimateA.id, expenseType: "subcontractor", amount: 500,
      expenseDate: "2026-01-15", vendor: "Sub-1", payeeType: "subcontractor", payeeId: subId,
    });

    const payables = await services.financialEngine.getPayablesSummary({ companyId });
    const lineA = payables.lines.find((l) => l.assignmentId === assignA.id);
    const lineB = payables.lines.find((l) => l.assignmentId === assignB.id);

    check(suite, "Job A outstanding after full payment (must be 0)", 0, lineA?.outstanding ?? -1, ids);
    check(suite, "Job B outstanding — MUST STILL BE 300 (not netted against Job A's payment)", 300, lineB?.outstanding ?? -1, ids);

    // Payee-level balance is the SUM (contracted 800, paid 500) —
    // outstanding at the payee level must equal the two per-job
    // outstandings summed, not a payee-wide max(0, 800-500)=300 vs
    // reality (0 + 300 = 300, coincidentally equal here — assert the
    // per-job figures directly instead, which is the property that
    // actually matters and that a payee-wide netting bug would violate
    // differently — see the H-vs-payee-wide scenario below for a case
    // where a naive payee-wide model gives a WRONG answer).
    const payeeWideOutstanding = money((lineA?.outstanding ?? 0) + (lineB?.outstanding ?? 0));
    check(suite, "payee-wide outstanding = sum of per-job outstanding (0 + 300)", 300, payeeWideOutstanding, ids);

    assertSuitePassed(suite);
  });

  test("the netting bug this guards against: if job payments pooled payee-wide, a fully-paid small job would falsely appear to reduce a DIFFERENT unpaid job", async () => {
    const suite = "I. Multi-job netting — the exact historical failure mode";
    const services = createInMemoryServices();
    const companyId = "company-I2";
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub-2", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const { project: projectA, client: clientA } = await newProjectAndClient(services, companyId);
    const estimateA = await services.estimateService.create({
      companyId, projectId: projectA.id, clientId: clientA.id,
      lineItems: [{ category: "material", name: "Small job", description: null, quantity: 1, unitPrice: 100, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const { project: projectB, client: clientB } = await newProjectAndClient(services, companyId);
    const estimateB = await services.estimateService.create({
      companyId, projectId: projectB.id, clientId: clientB.id,
      lineItems: [{ category: "material", name: "Big unpaid job", description: null, quantity: 1, unitPrice: 900, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await services.subcontractorService.assignToProject({ companyId, projectId: projectA.id, estimateId: estimateA.id, subcontractorId: subId, contractedAmount: 100 });
    const assignB = await services.subcontractorService.assignToProject({ companyId, projectId: projectB.id, estimateId: estimateB.id, subcontractorId: subId, contractedAmount: 900 });

    // Pay the SMALL job in full. If payments pooled payee-wide (the
    // pre-fix behavior for assignments with no estimate id), this
    // could be mis-attributed toward Job B instead of Job A.
    await services.expenseService.create({
      companyId, projectId: projectA.id, estimateId: estimateA.id, expenseType: "subcontractor", amount: 100,
      expenseDate: "2026-01-10", vendor: "Sub-2", payeeType: "subcontractor", payeeId: subId,
    });

    const payables = await services.financialEngine.getPayablesSummary({ companyId });
    const lineB = payables.lines.find((l) => l.assignmentId === assignB.id);
    const ids = { subcontractorId: subId, estimateBId: estimateB.id };
    // Job B must show its FULL $900 as outstanding — the $100 paid on
    // Job A must not have leaked into it.
    check(suite, "Big unpaid job outstanding — must remain the full 900, unaffected by the unrelated small job's payment", 900, lineB?.outstanding ?? -1, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// J. SOFT DELETE / RESTORE — deleted records must not affect totals;
//    restoring must bring them back exactly.
// ======================================================================
describe("J. Soft delete and restore", () => {
  test("deleting an expense removes it from cost; restoring brings it back", async () => {
    const suite = "J. Expense soft delete/restore";
    const services = createInMemoryServices();
    const companyId = "company-J";
    const { project } = await newProjectAndClient(services, companyId);
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 500, expenseDate: "2026-01-01" });
    const toDelete = await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 200, expenseDate: "2026-01-02" });
    const ids = { projectId: project.id, expenseId: toDelete.id };

    let fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses with both rows active", 700, fin.expenseItems, ids);

    await services.expenseService.softDelete(toDelete.id, "duplicate entry");
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses after soft-deleting the $200 row (700 - 200)", 500, fin.expenseItems, ids);

    await services.expenseService.restore(toDelete.id);
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses after restoring the $200 row", 700, fin.expenseItems, ids);

    assertSuitePassed(suite);
  });

  test("deleting a team assignment removes its committed cost; restoring brings it back", async () => {
    const suite = "J. Team assignment soft delete/restore";
    const services = createInMemoryServices();
    const companyId = "company-J2";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "labor", name: "Scope", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const userId = crypto.randomUUID();
    const assignment = await services.teamAssignmentService.assign({ companyId, estimateId: estimate.id, projectId: project.id, userId, amount: 400 });
    const ids = { estimateId: estimate.id, assignmentId: assignment.id };

    let fin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "teamLabourRemaining with assignment active", 400, fin.teamLabourRemaining, ids);

    await services.teamAssignmentService.softDelete(assignment.id, "assigned in error");
    fin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "teamLabourRemaining after soft-deleting the assignment", 0, fin.teamLabourRemaining, ids);

    await services.teamAssignmentService.restore(assignment.id);
    fin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "teamLabourRemaining after restoring the assignment", 400, fin.teamLabourRemaining, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// K. DATE-RANGE FILTERING — company-level is cash-basis (isPaid AND
//    within range); project-level is committed cost (all-time). The
//    SAME underlying expense must read differently at each level.
// ======================================================================
describe("K. Date-range filtering (cash-basis vs. committed)", () => {
  test("only paid expenses within the date range count at company level; project level counts all of them, unpaid or not", async () => {
    const suite = "K. Date-range filtering";
    const services = createInMemoryServices();
    const companyId = "company-K";
    const { project } = await newProjectAndClient(services, companyId);

    // In range, paid.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 100, expenseDate: "2026-02-15", isPaid: true });
    // Out of range, paid.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 250, expenseDate: "2026-05-01", isPaid: true });
    // In range, NOT paid (a bill) — must be excluded at company level (cash-basis) but still counted at project level (committed).
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 75, expenseDate: "2026-02-20", isPaid: false, dueDate: "2026-03-01" });

    const ids = { projectId: project.id };

    // Project level: ALL THREE count (committed cost model — see truth map).
    const projFin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "project.expenseItems (committed — all 3 rows, paid or not, any date)", money(100 + 250 + 75), projFin.expenseItems, ids);

    // Company level, February only: ONLY the $100 row (in range AND paid).
    const companyFin = await services.financialEngine.getCompanyFinancials({
      companyId, dateRange: { start: new Date("2026-02-01"), end: new Date("2026-02-28") },
    });
    check(suite, "company.expenseItems for Feb range (cash-basis: only the $100 in-range, PAID row)", 100, companyFin.expenseItems, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// L. ROOFING PRICE INPUT vs. ACTUAL COST — CONFLICT ② from the truth
//    map. estimate_areas' pricing figure and estimate_expenses' cost
//    rows are unrelated numbers that share no formula. Proves the cost
//    engine reads only the latter.
// ======================================================================
describe("L. Roofing price input vs. actual incurred cost (independence)", () => {
  test("a roofing area's repair-cost PRICE feeds the estimate total, but never the project's expense/cost total", async () => {
    const suite = "L. Roofing price vs. cost independence";
    const services = createInMemoryServices();
    const companyId = "company-L";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [], markup: 0, discount: 0, taxRate: 0, estimateType: "roofing",
    });

    // The PRICING input — what the customer is charged for this repair
    // line. Modeled in the in-memory double as one collapsed
    // `estimatedRepairCost` figure (material+labor+tax combined) —
    // documented limitation of the double; the independence property
    // under test does not depend on splitting it further.
    const areaId = crypto.randomUUID();
    services.store.roofingAreas.set(areaId, {
      id: areaId, estimateId: estimate.id, areaName: "Front slope", sequenceNumber: 1, estimatedRepairCost: 350, deletedAt: null,
    });

    // The ACTUAL COST — real money spent, unrelated in amount to the
    // pricing figure above.
    await services.expenseService.create({ companyId, projectId: project.id, estimateId: estimate.id, expenseType: "materials", amount: 80, expenseDate: "2026-01-10" });
    await services.expenseService.create({ companyId, projectId: project.id, estimateId: estimate.id, expenseType: "labor", amount: 60, expenseDate: "2026-01-10" });

    const ids = { estimateId: estimate.id, projectId: project.id, areaId };

    const recalculated = await services.estimateService.recalculateTotal(estimate.id);
    check(suite, "estimate.total includes the $350 roofing PRICE input", 350, recalculated.total, ids);

    const fin = await services.financialEngine.getProjectFinancials(project.id);
    // Independently expected: cost = 80 + 60 = 140 — the $350 pricing
    // figure must NOT appear here in any form.
    check(suite, "project cost = actual expense rows ONLY (80+60=140) — the $350 price input must not leak in", 140, fin.expenseItems, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// M. A/P (sub+agent, lifetime) vs. Needs-Payment (wider scope) — the
//    two payables figures are DIFFERENT ON PURPOSE. Assert the exact
//    scope delta rather than asserting they're equal.
// ======================================================================
describe("M. A/P vs. Needs-Payment scope difference", () => {
  test("Needs-Payment includes team labour + bills + reimbursements that A/P (sub+agent only) does not", async () => {
    const suite = "M. A/P vs Needs-Payment scope";
    const services = createInMemoryServices();
    const companyId = "company-M";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 5000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });
    // Mark the whole job complete so "not_due" doesn't hide anything —
    // isActionablePayable/derivePayableState both key off job status.
    await services.projectService.update(project.id, { status: "completed" });

    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub-M", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    await services.subcontractorService.assignToProject({ companyId, projectId: project.id, estimateId: estimate.id, subcontractorId: subId, contractedAmount: 200 });

    const userId = crypto.randomUUID();
    await services.teamAssignmentService.assign({ companyId, estimateId: estimate.id, projectId: project.id, userId, amount: 150 });

    // A bill: an ordinary expense with a due date, unpaid.
    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "miscellaneous", amount: 90, expenseDate: "2026-01-05",
      vendor: "Vendor M", dueDate: "2026-01-20", isPaid: false,
    });

    const ids = { projectId: project.id, estimateId: estimate.id, invoiceId: invoice.id, subcontractorId: subId, userId };

    const ap = await services.financialEngine.getPayablesSummary({ companyId, projectId: project.id });
    check(suite, "A/P (sub+agent only) = the $200 subcontractor assignment", 200, ap.totalOutstanding, ids);

    const worklist = await getActionablePayables(services, companyId);
    // Independently expected: 200 (sub) + 150 (team labour) + 90 (bill) = 440.
    check(suite, "Needs-Payment total = sub (200) + team labour (150) + bill (90)", 440, worklist.total, ids);
    check(suite, "Needs-Payment - A/P = team labour + bill (150 + 90 = 240) — the documented scope delta", 240, money(worklist.total - ap.totalOutstanding), ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// N. COMPANY-LEVEL PROFIT ARITHMETIC
// ======================================================================
describe("N. Company-level profit", () => {
  test("netProfit = cash revenue - cash-basis expenses, for a fixed period", async () => {
    const suite = "N. Company-level profit";
    const services = createInMemoryServices();
    const companyId = "company-N";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 3000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-03-01", dueDate: "2026-04-01" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 3000, method: "check", paymentDate: "2026-03-10" });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 1100, expenseDate: "2026-03-12", isPaid: true });

    const range = { start: new Date("2026-03-01"), end: new Date("2026-03-31") };
    const fin = await services.financialEngine.getCompanyFinancials({ companyId, dateRange: range });
    const ids = { companyId, projectId: project.id };

    check(suite, "totalRevenue (cash collected in March)", 3000, fin.totalRevenue, ids);
    check(suite, "totalExpenses (cash-basis, paid in March)", 1100, fin.expenseItems, ids);
    check(suite, "netProfit = 3000 - 1100", 1900, fin.netProfit, ids);
    check(suite, "profitMargin = 1900/3000 * 100", money((1900 / 3000) * 100), money(fin.profitMargin), ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// O. ASSIGNMENT REMOVAL — the paid-guard must block removing a
//    committed assignment once real money has been paid against it,
//    and removing an unpaid one must drop its committed cost to $0.
//    Team, subcontractor, and agent must behave identically.
// ======================================================================
describe("O. Assignment removal — paid-guard and committed-cost drop", () => {
  test("subcontractor: $1,000 assigned, $400 paid — removal is blocked", async () => {
    const suite = "O. Subcontractor removal — paid, blocked";
    const services = createInMemoryServices();
    const companyId = "company-O1";
    const { project } = await newProjectAndClient(services, companyId);
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub-O1", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const assignment = await services.subcontractorService.assignToProject({ companyId, projectId: project.id, subcontractorId: subId, contractedAmount: 1000 });
    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "subcontractor", amount: 400, expenseDate: "2026-01-10",
      vendor: "Sub-O1", payeeType: "subcontractor", payeeId: subId, isPaid: true,
    });
    const ids = { projectId: project.id, subcontractorId: subId, assignmentId: assignment.id };

    let threw = false;
    try {
      await services.subcontractorService.removeAssignment(assignment.id, "Testing removal guard");
    } catch {
      threw = true;
    }
    checkExact(suite, "removeAssignment throws once $400 has been paid against the $1,000 contract", true, threw, ids);

    const fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "committed cost is unaffected by the blocked removal attempt (still 1000)", 1000, fin.totalExpenses, ids);
    assertSuitePassed(suite);
  });

  test("subcontractor: $1,000 assigned, $0 paid — removal succeeds and committed cost drops to $0", async () => {
    const suite = "O. Subcontractor removal — unpaid, succeeds";
    const services = createInMemoryServices();
    const companyId = "company-O2";
    const { project } = await newProjectAndClient(services, companyId);
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub-O2", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const assignment = await services.subcontractorService.assignToProject({ companyId, projectId: project.id, subcontractorId: subId, contractedAmount: 1000 });
    const ids = { projectId: project.id, subcontractorId: subId, assignmentId: assignment.id };

    let fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "committed cost before removal", 1000, fin.totalExpenses, ids);

    await services.subcontractorService.removeAssignment(assignment.id, "Assigned in error");
    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "committed cost after removing the unpaid assignment (must drop to 0)", 0, fin.totalExpenses, ids);
    check(suite, "outstandingSubcontractor after removal", 0, fin.outstandingSubcontractor, ids);
    assertSuitePassed(suite);
  });

  test("agent: same paid-guard and committed-cost-drop behavior as subcontractor", async () => {
    const suite = "O. Agent removal — paid-guard and drop, mirrors subcontractor";
    const services = createInMemoryServices();
    const companyId = "company-O3";
    const { project } = await newProjectAndClient(services, companyId);
    const agentId = crypto.randomUUID();
    services.store.agents.set(agentId, {
      id: agentId, companyId, name: "Agent-O3", commissionRate: 5,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const paidAssignment = await services.agentCommissionService.assignToProject({ companyId, projectId: project.id, agentId, assignedAmount: 1000 });
    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "agent_commission", amount: 400, expenseDate: "2026-01-10",
      vendor: "Agent-O3", payeeType: "agent", payeeId: agentId, isPaid: true,
    });
    let threw = false;
    try {
      await services.agentCommissionService.removeAssignment(paidAssignment.id, "Testing removal guard");
    } catch {
      threw = true;
    }
    checkExact(suite, "removeAssignment throws once $400 has been paid against the $1,000 contract", true, threw, { assignmentId: paidAssignment.id });

    const agent2Id = crypto.randomUUID();
    services.store.agents.set(agent2Id, {
      id: agent2Id, companyId, name: "Agent-O3b", commissionRate: 5,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const unpaidAssignment = await services.agentCommissionService.assignToProject({ companyId, projectId: project.id, agentId: agent2Id, assignedAmount: 500 });
    let finBefore = await services.financialEngine.getProjectFinancials(project.id);
    const committedBeforeUnpaidRemoval = finBefore.totalExpenses;

    await services.agentCommissionService.removeAssignment(unpaidAssignment.id, "Assigned in error");
    const finAfter = await services.financialEngine.getProjectFinancials(project.id);
    check(
      suite,
      "committed cost drops by exactly the removed unpaid $500 assignment",
      money(committedBeforeUnpaidRemoval - 500),
      finAfter.totalExpenses,
      { assignmentId: unpaidAssignment.id }
    );
    assertSuitePassed(suite);
  });

  test("team labor: consistent paid-guard and committed-cost-drop behavior (already-covered baseline, asserted here for cross-role comparison)", async () => {
    const suite = "O. Team labor removal — consistent with subcontractor/agent";
    const services = createInMemoryServices();
    const companyId = "company-O4";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "labor", name: "Scope", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const userId = crypto.randomUUID();
    const assignment = await services.teamAssignmentService.assign({ companyId, estimateId: estimate.id, projectId: project.id, userId, amount: 1000 });
    await services.expenseService.create({
      companyId, projectId: project.id, estimateId: estimate.id, expenseType: "labor", amount: 400, expenseDate: "2026-01-10",
      vendor: "Team-O4", payeeType: "employee", payeeId: userId, isPaid: true,
    });
    const ids = { estimateId: estimate.id, assignmentId: assignment.id };

    let threw = false;
    try {
      await services.teamAssignmentService.softDelete(assignment.id, "Testing removal guard");
    } catch {
      threw = true;
    }
    checkExact(suite, "softDelete throws once $400 has been paid against the $1,000 commitment (same guard shape as sub/agent)", true, threw, ids);

    const fin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "committed cost is unaffected by the blocked removal attempt (still 1000)", 1000, fin.totalExpenses, ids);
    assertSuitePassed(suite);
  });
});

// ======================================================================
// P. REJECTED CHANGE ORDER — must contribute $0 to revenue anywhere.
// ======================================================================
describe("P. Rejected change order contributes zero revenue", () => {
  test("a rejected change order does not appear in estimate.revisedTotal or project.revisedTotal", async () => {
    const suite = "P. Rejected change order";
    const services = createInMemoryServices();
    const companyId = "company-P";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Base scope", description: null, quantity: 1, unitPrice: 4000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });

    const co = await services.changeOrderService.createChangeOrder({
      companyId, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-REJ", title: "Declined extra work", totalAmount: 900, tax: 0,
    });
    const result = await services.changeOrderService.changeStatus(co.id, "rejected");
    if (!result.valid) throw new Error(`Could not reject change order: ${result.issues.map((i) => i.message).join("; ")}`);
    const ids = { estimateId: estimate.id, projectId: project.id, changeOrderId: co.id };

    const estFin = await services.financialEngine.getEstimateFinancials(estimate.id);
    check(suite, "estimate.revisedTotal ignores the rejected $900 CO (stays at base 4000)", 4000, estFin.revisedTotal, ids);
    check(suite, "estimate.approvedChangeOrderTotal is 0 (nothing approved)", 0, estFin.approvedChangeOrderTotal, ids);

    const projFin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "project.revisedTotal ignores the rejected $900 CO (stays at the invoiced 4000)", 4000, projFin.revisedTotal, ids);
    check(suite, "project.approvedChangeOrderTotal is 0", 0, projFin.approvedChangeOrderTotal, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// Q. AGENT CONTRACT + REIMBURSEMENT ON THE SAME PAYEE — the exact seam
//    the recent committedRemaining fix split apart (agentContractRemaining
//    vs. outstandingReimbursements) must not double count when both are
//    active for one agent at once.
// ======================================================================
describe("Q. Agent contract remainder plus reimbursement liability, same payee", () => {
  test("$500 unpaid agent contract + $300 fronted/reimbursable expense = $800 committed cost, not $1,100", async () => {
    const suite = "Q. Agent contract + reimbursement, no double count";
    const services = createInMemoryServices();
    const companyId = "company-Q";
    const { project } = await newProjectAndClient(services, companyId);
    const agentId = crypto.randomUUID();
    services.store.agents.set(agentId, {
      id: agentId, companyId, name: "Agent-Q", commissionRate: 5,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const assignment = await services.agentCommissionService.assignToProject({ companyId, projectId: project.id, agentId, assignedAmount: 500 });
    const frontedExpense = await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-12",
      vendor: "Home Depot", paidByType: "agent", paidById: agentId, reimbursable: true,
    });
    const ids = { projectId: project.id, agentId, assignmentId: assignment.id, expenseId: frontedExpense.id };

    const fin = await services.financialEngine.getProjectFinancials(project.id);
    // Independently expected: the $500 contract is committed the
    // moment it's assigned (unpaid); the $300 fronted purchase is a
    // real expense row already inside expenseItems. 500 + 300 = 800 —
    // the $300 reimbursement LIABILITY (owed back to the agent) must
    // not be added a second time on top.
    check(suite, "totalExpenses = 500 committed contract + 300 fronted expense (never 1100)", 800, fin.totalExpenses, ids);
    check(suite, "expenseItems (the real, already-recorded cash-equivalent cost) = 300", 300, fin.expenseItems, ids);
    check(suite, "outstandingAgent = 500 contract remainder + 300 reimbursement owed = 800", 800, fin.outstandingAgent, ids);

    // Settling the reimbursement moves nothing in totalExpenses — it is
    // a liability being paid off, not a second cost appearing.
    await services.expenseService.markReimbursed(frontedExpense.id);
    const finAfter = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "totalExpenses unchanged after the reimbursement is settled (still 800)", 800, finAfter.totalExpenses, ids);
    check(suite, "outstandingAgent drops to just the 500 contract remainder once reimbursed", 500, finAfter.outstandingAgent, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// R. PAYEE REASSIGNMENT — swap the payee on a commitment, not just
//    remove one. Old payee's committed cost must clear; new payee's
//    must appear; the job's aggregate committed cost is unchanged.
// ======================================================================
describe("R. Payee reassignment", () => {
  test("removing one subcontractor's unpaid assignment and assigning a different one preserves the job's total committed cost", async () => {
    const suite = "R. Subcontractor reassignment";
    const services = createInMemoryServices();
    const companyId = "company-R";
    const { project } = await newProjectAndClient(services, companyId);
    const oldSubId = crypto.randomUUID();
    const newSubId = crypto.randomUUID();
    services.store.subcontractors.set(oldSubId, {
      id: oldSubId, companyId, name: "Old Sub", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    services.store.subcontractors.set(newSubId, {
      id: newSubId, companyId, name: "New Sub", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    const oldAssignment = await services.subcontractorService.assignToProject({ companyId, projectId: project.id, subcontractorId: oldSubId, contractedAmount: 700 });
    const ids = { projectId: project.id, oldSubId, newSubId };

    let fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "committed cost with only the old (unpaid) subcontractor assigned", 700, fin.totalExpenses, ids);

    await services.subcontractorService.removeAssignment(oldAssignment.id, "Wrong subcontractor selected");
    const newAssignment = await services.subcontractorService.assignToProject({ companyId, projectId: project.id, subcontractorId: newSubId, contractedAmount: 700 });

    fin = await services.financialEngine.getProjectFinancials(project.id);
    check(suite, "aggregate committed cost for the job is unchanged after the swap (still 700)", 700, fin.totalExpenses, ids);

    const balances = await services.financialEngine.getPayeeBalances({ companyId, projectId: project.id }, "subcontractor");
    const oldBalance = balances.find((b) => b.payeeId === oldSubId);
    const newBalance = balances.find((b) => b.payeeId === newSubId);
    // Absence from the balances list IS zero — a removed, never-paid
    // assignment leaves no trace to seed a row from, so "not found" and
    // "outstanding: 0" are the same fact here, not a missing check.
    check(suite, "old subcontractor's committed/outstanding balance is 0 (assignment removed)", 0, oldBalance?.outstanding ?? 0, { ...ids, assignmentId: oldAssignment.id });
    check(suite, "new subcontractor now carries the full 700 outstanding", 700, newBalance?.outstanding ?? -1, { ...ids, assignmentId: newAssignment.id });

    assertSuitePassed(suite);
  });
});

// ======================================================================
// S. NEEDS-PAYMENT REIMBURSEMENT SCOPE — an unpaid reimbursable
//    expense must surface in the actionable worklist and must NOT
//    appear in A/P, which only ever covers subcontractor + agent
//    contracts.
// ======================================================================
describe("S. Needs-Payment includes reimbursements; A/P does not", () => {
  test("an unpaid reimbursable expense appears in getActionablePayables but not in getPayablesSummary", async () => {
    const suite = "S. Reimbursement in Needs-Payment, absent from A/P";
    const services = createInMemoryServices();
    const companyId = "company-S";
    const { project } = await newProjectAndClient(services, companyId);
    const agentId = crypto.randomUUID();
    services.store.agents.set(agentId, {
      id: agentId, companyId, name: "Agent-S", commissionRate: 0,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    // No assignment at all for this agent — isolates the reimbursement
    // scope-delta from any contract-remainder contribution.
    const frontedExpense = await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "miscellaneous", amount: 180, expenseDate: "2026-01-08",
      vendor: "Ace Hardware", paidByType: "agent", paidById: agentId, reimbursable: true,
    });
    const ids = { projectId: project.id, agentId, expenseId: frontedExpense.id };

    const worklist = await getActionablePayables(services, companyId);
    check(suite, "Needs-Payment byKind.reimbursements includes the unpaid $180", 180, worklist.byKind.reimbursements, ids);
    check(suite, "Needs-Payment total includes the $180 reimbursement", 180, worklist.total, ids);

    const ap = await services.financialEngine.getPayablesSummary({ companyId, projectId: project.id });
    check(suite, "A/P totalOutstanding does NOT include the reimbursement (sub+agent contracts only)", 0, ap.totalOutstanding, ids);
    check(suite, "A/P has no line for this agent (no contract, only a reimbursement)", 0, ap.lines.length, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// T. MULTI-ESTIMATE PROJECT RECONCILIATION — a project with two
//    estimates must have its aggregate figures equal the SUM of both
//    estimates' own figures, with nothing omitted or doubled.
// ======================================================================
describe("T. Multi-estimate project reconciliation", () => {
  test("project-level totals equal the sum of two independent estimates on the same project", async () => {
    const suite = "T. Multi-estimate reconciliation";
    const services = createInMemoryServices();
    const companyId = "company-T";
    const { project, client } = await newProjectAndClient(services, companyId);

    // Estimate 1: signed, invoiced, partially paid, one expense.
    const estimate1 = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Kitchen scope", description: null, quantity: 1, unitPrice: 3000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate1.id);
    const invoice1 = await services.invoiceService.createFromEstimate(estimate1.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });
    await services.paymentService.record({ companyId, invoiceId: invoice1.id, amount: 2000, method: "check", paymentDate: "2026-01-05" });
    await services.expenseService.create({ companyId, projectId: project.id, estimateId: estimate1.id, expenseType: "materials", amount: 500, expenseDate: "2026-01-06" });

    // Estimate 2: separate scope on the SAME project, signed, invoiced,
    // fully paid, its own expense.
    const estimate2 = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Bathroom scope", description: null, quantity: 1, unitPrice: 1500, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate2.id);
    const invoice2 = await services.invoiceService.createFromEstimate(estimate2.id, { issueDate: "2026-01-10", dueDate: "2026-02-10" });
    await services.paymentService.record({ companyId, invoiceId: invoice2.id, amount: 1500, method: "check", paymentDate: "2026-01-12" });
    await services.expenseService.create({ companyId, projectId: project.id, estimateId: estimate2.id, expenseType: "labor", amount: 200, expenseDate: "2026-01-13" });

    const ids = { projectId: project.id, estimate1Id: estimate1.id, estimate2Id: estimate2.id };

    const est1Fin = await services.financialEngine.getEstimateFinancials(estimate1.id);
    const est2Fin = await services.financialEngine.getEstimateFinancials(estimate2.id);
    const projFin = await services.financialEngine.getProjectFinancials(project.id);

    // Independently expected sums — not re-derived from the project
    // call, so this actually proves reconciliation rather than
    // asserting a tautology.
    check(suite, "project.invoicesTotal = estimate1.invoicesTotal + estimate2.invoicesTotal (3000 + 1500)", est1Fin.invoicesTotal + est2Fin.invoicesTotal, projFin.invoicesTotal, ids);
    check(suite, "project.invoicesTotal = 4500 (independently known)", 4500, projFin.invoicesTotal, ids);
    check(suite, "project.amountPaid = estimate1.amountPaid + estimate2.amountPaid (2000 + 1500)", est1Fin.amountPaid + est2Fin.amountPaid, projFin.amountPaid, ids);
    check(suite, "project.amountPaid = 3500 (independently known)", 3500, projFin.amountPaid, ids);
    check(suite, "project.expenseItems = estimate1.expenseItems + estimate2.expenseItems (500 + 200)", est1Fin.expenseItems + est2Fin.expenseItems, projFin.expenseItems, ids);
    check(suite, "project.expenseItems = 700 (independently known)", 700, projFin.expenseItems, ids);
    check(suite, "project.totalExpenses = estimate1.totalExpenses + estimate2.totalExpenses (no assignments here, so equals expenseItems)", est1Fin.totalExpenses + est2Fin.totalExpenses, projFin.totalExpenses, ids);

    assertSuitePassed(suite);
  });
});

// ======================================================================
// FINAL REPORT — prints regardless of pass/fail, runs last.
// ======================================================================
describe("Z. Summary report", () => {
  test("print the full baseline report", () => {
    printReport();
    // Informational only — does not gate the run. Each scenario above
    // already fails on its own if any of ITS checks failed; this is
    // purely the consolidated view.
    expect(REPORT.length).toBeGreaterThan(0);
  });
});
