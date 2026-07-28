/**
 * Expenses module regression suite.
 *
 * The through-line: an expense is the ONE source of project cost, and
 * every consumer — the panel, FinancialEngine, profit, tax — reads it
 * through the same calculation. So each test asserts a fact about the
 * money AND that the fact survives to the profit figure.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { calculateExpenseTotals } from "../lib/services/financialCalculations";

const COMPANY_ID = "company-1";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

/** A project billed $10,000 and fully collected, so profit moves purely
 * with cost and nothing else muddies the assertions. */
async function seedProject(revenue = 10000) {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Expense Test" });
  const invoice = await services.invoiceService.createStandalone({
    companyId: COMPANY_ID,
    projectId: project.id,
    clientId: "client-1",
    lineItems: [{ name: "Work", description: null, quantity: 1, unitPrice: revenue }],
    issueDate: "2026-03-01",
    dueDate: "2099-12-31",
  });
  await services.invoiceService.changeStatus(invoice.id, "sent");
  await services.paymentService.record({
    companyId: COMPANY_ID, invoiceId: invoice.id, amount: revenue, method: "check", paymentDate: "2026-03-05",
  });
  return { project, invoice };
}

const spend = (projectId: string, amount: number, extra: Record<string, unknown> = {}) =>
  services.expenseService.create({
    companyId: COMPANY_ID,
    projectId,
    expenseType: "materials",
    amount,
    expenseDate: "2026-03-10",
    ...extra,
  });

const profitOf = async (projectId: string) => (await services.financialEngine.getProjectFinancials(projectId)).netProfit;

describe("CRUD and its effect on profit", () => {
  test("adding an expense reduces profit by exactly that amount", async () => {
    const { project } = await seedProject(10000);
    expect(await profitOf(project.id)).toBe(10000);

    await spend(project.id, 250);

    const f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.expenseItems).toBe(250);
    expect(f.totalExpenses).toBe(250);
    expect(f.netProfit).toBe(9750);
  });

  test("editing the amount rebuilds the total — it never accumulates", async () => {
    const { project } = await seedProject(10000);
    const expense = await spend(project.id, 250);

    await services.expenseService.update(expense.id, { amount: 400 });

    // 400, not 650 — a full rebuild from the row, not a delta applied
    // to a running total.
    expect((await services.expenseService.getTotalsForProject(project.id)).total).toBe(400);
    expect(await profitOf(project.id)).toBe(9600);
  });

  test("a soft-deleted expense stops costing money everywhere", async () => {
    // This is THE regression the module exists for: the old ledger-based
    // cost path was append-only, so a deleted expense kept reducing
    // profit forever.
    const { project } = await seedProject(10000);
    const expense = await spend(project.id, 250);
    expect(await profitOf(project.id)).toBe(9750);

    await services.expenseService.softDelete(expense.id, "Duplicate receipt");

    expect(await services.expenseService.listForProject(project.id)).toHaveLength(0);
    expect((await services.expenseService.getTotalsForProject(project.id)).total).toBe(0);
    expect(await profitOf(project.id)).toBe(10000);
  });

  test("restoring brings the cost back", async () => {
    const { project } = await seedProject(10000);
    const expense = await spend(project.id, 250);
    await services.expenseService.softDelete(expense.id, "Filed against the wrong project");
    await services.expenseService.restore(expense.id);

    expect(await profitOf(project.id)).toBe(9750);
  });

  test("deleting requires a reason", async () => {
    const { project } = await seedProject();
    const expense = await spend(project.id, 100);
    await expect(services.expenseService.softDelete(expense.id, "")).rejects.toThrow();
  });

  test("every field round-trips", async () => {
    const { project } = await seedProject();
    await services.expenseService.create({
      companyId: COMPANY_ID,
      projectId: project.id,
      expenseType: "permit",
      amount: 125,
      expenseDate: "2026-03-11",
      description: "City building permit",
      notes: "Receipt in the truck",
      vendor: "City of Charlotte",
      payeeType: "vendor",
      paymentMethod: "card",
      isPaid: false,
    });

    const [e] = await services.expenseService.listForProject(project.id);
    expect(e).toMatchObject({
      expenseType: "permit",
      amount: 125,
      expenseDate: "2026-03-11",
      description: "City building permit",
      notes: "Receipt in the truck",
      vendor: "City of Charlotte",
      payeeType: "vendor",
      paymentMethod: "card",
      isPaid: false,
      paidByType: "company",
    });
    // The legacy projection is derived, never supplied by the caller.
    expect(e.category).toBe("other");
  });

  test("the legacy category projection follows expense type", async () => {
    const { project } = await seedProject();
    const a = await spend(project.id, 10, { expenseType: "materials" });
    const b = await spend(project.id, 10, { expenseType: "labor" });
    const c = await spend(project.id, 10, { expenseType: "equipment" });
    expect([a.category, b.category, c.category]).toEqual(["material", "labor", "other"]);
  });
});

describe("Who paid: company, agent, subcontractor, employee, customer", () => {
  test("a company-paid expense creates no reimbursement", async () => {
    const { project } = await seedProject();
    await spend(project.id, 300, { paidByType: "company" });

    const totals = await services.expenseService.getTotalsForProject(project.id);
    expect(totals).toMatchObject({ total: 300, companyPaid: 300, outstandingReimbursements: 0 });
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID)).toHaveLength(0);
  });

  test.each(["agent", "subcontractor", "employee", "customer"] as const)(
    "a %s-paid expense costs the project once and is owed back",
    async (payer) => {
      const { project } = await seedProject(10000);
      await spend(project.id, 300, { paidByType: payer, paidById: `${payer}-1` });

      const totals = await services.expenseService.getTotalsForProject(project.id);
      expect(totals.total).toBe(300);
      expect(totals.companyPaid).toBe(0);
      expect(totals.outstandingReimbursements).toBe(300);

      // The cost is counted ONCE. The reimbursement is a liability, not
      // a second cost — booking both is the double-count that made an
      // identical purchase look twice as expensive when someone else
      // fronted it.
      const f = await services.financialEngine.getProjectFinancials(project.id);
      expect(f.totalExpenses).toBe(300);
      expect(f.netProfit).toBe(9700);
    }
  );

  test("the same purchase costs the same whoever fronted it", async () => {
    const companyProject = (await seedProject(10000)).project;
    const agentProject = (await seedProject(10000)).project;

    await spend(companyProject.id, 300, { paidByType: "company" });
    await spend(agentProject.id, 300, { paidByType: "agent", paidById: "agent-1" });

    expect(await profitOf(companyProject.id)).toBe(await profitOf(agentProject.id));
  });

  test("reassigning the payer to the company clears the reimbursement", async () => {
    const { project } = await seedProject();
    const expense = await spend(project.id, 300, { paidByType: "agent", paidById: "agent-1" });
    expect((await services.expenseService.getTotalsForProject(project.id)).outstandingReimbursements).toBe(300);

    await services.expenseService.update(expense.id, { paidByType: "company", paidById: null });

    const totals = await services.expenseService.getTotalsForProject(project.id);
    expect(totals.outstandingReimbursements).toBe(0);
    expect(totals.companyPaid).toBe(300);
  });
});

describe("Reimbursements stay tracked until settled", () => {
  test("pending until marked reimbursed, and the cost never changes", async () => {
    const { project } = await seedProject(10000);
    const expense = await spend(project.id, 300, { paidByType: "agent", paidById: "agent-1" });

    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(1);
    const before = await profitOf(project.id);

    await services.expenseService.markReimbursed(expense.id);

    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(0);
    expect((await services.expenseService.getTotalsForProject(project.id)).outstandingReimbursements).toBe(0);
    // Paying someone back moves cash; it does not change what the job cost.
    expect(await profitOf(project.id)).toBe(before);
  });

  test("outstanding reimbursements surface as an agent payable, not a cost", async () => {
    const { project } = await seedProject(10000);
    await spend(project.id, 300, { paidByType: "agent", paidById: "agent-1" });

    const f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.outstandingAgent).toBe(300);
    expect(f.totalExpenses).toBe(300);
  });

  test("deleting a reimbursable expense removes the debt too", async () => {
    const { project } = await seedProject();
    const expense = await spend(project.id, 300, { paidByType: "agent", paidById: "agent-1" });
    await services.expenseService.softDelete(expense.id, "Never actually purchased");

    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(0);
    expect((await services.financialEngine.getProjectFinancials(project.id)).outstandingAgent).toBe(0);
  });

  test("a non-reimbursable expense cannot be marked reimbursed", async () => {
    const { project } = await seedProject();
    const expense = await spend(project.id, 100, { paidByType: "company" });
    await expect(services.expenseService.markReimbursed(expense.id)).rejects.toThrow();
  });

  test("pending reimbursements can be filtered per payee — the future payouts view", async () => {
    const { project } = await seedProject();
    await spend(project.id, 100, { paidByType: "agent", paidById: "agent-1" });
    await spend(project.id, 200, { paidByType: "agent", paidById: "agent-2" });
    await spend(project.id, 400, { paidByType: "subcontractor", paidById: "sub-1" });

    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(1);
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID)).toHaveLength(3);
  });
});

describe("Expense types cover subcontractor and agent costs without a second system", () => {
  test("subcontractor and commission costs are ordinary expenses", async () => {
    const { project } = await seedProject(10000);
    await spend(project.id, 2000, { expenseType: "subcontractor", payeeType: "subcontractor", payeeId: "sub-1", vendor: "Ace Roofing" });
    await spend(project.id, 500, { expenseType: "agent_commission", payeeType: "agent", payeeId: "agent-1", vendor: "Dana" });

    const totals = await services.expenseService.getTotalsForProject(project.id);
    expect(totals.byType.subcontractor).toBe(2000);
    expect(totals.byType.agent_commission).toBe(500);
    expect(totals.total).toBe(2500);

    // They flow into profit through the ordinary cost path — the future
    // Subcontractor/Agent modules read these rows rather than keeping
    // their own totals.
    expect(await profitOf(project.id)).toBe(7500);
  });

  test("who was PAID and who FRONTED it are independent", async () => {
    const { project } = await seedProject();
    const expense = await spend(project.id, 800, {
      expenseType: "subcontractor",
      payeeType: "subcontractor",
      payeeId: "sub-1",
      paidByType: "agent",
      paidById: "agent-1",
    });

    expect(expense.payeeId).toBe("sub-1");
    expect(expense.paidById).toBe("agent-1");
    // The agent is owed, not the subcontractor.
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(1);
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "sub-1")).toHaveLength(0);
  });
});

describe("Unpaid bills", () => {
  test("an unpaid bill is a cost now and a payable until settled", async () => {
    const { project } = await seedProject(10000);
    await spend(project.id, 750, { isPaid: false, vendor: "Supply Co" });

    const totals = await services.expenseService.getTotalsForProject(project.id);
    expect(totals.unpaid).toBe(750);
    // Accrual at the project level: the job cost $750 the moment the
    // work was done, regardless of when the invoice gets paid.
    expect(totals.total).toBe(750);
    expect(await profitOf(project.id)).toBe(9250);
  });
});

describe("Every surface agrees", () => {
  test("the panel's totals and FinancialEngine's cost are the same calculation", async () => {
    const { project } = await seedProject(10000);
    await spend(project.id, 250);
    await spend(project.id, 300, { paidByType: "agent", paidById: "agent-1" });
    await spend(project.id, 125, { expenseType: "permit", isPaid: false });

    const totals = await services.expenseService.getTotalsForProject(project.id);
    const engine = await services.financialEngine.getProjectFinancials(project.id);
    const profit = await services.financialEngine.getProfitSummary({ projectId: project.id });

    expect(totals.total).toBe(675);
    expect(engine.expenseItems).toBe(totals.total);
    expect(engine.totalExpenses).toBe(totals.total);
    expect(profit.totalCosts).toBe(totals.total);
    expect(profit.netProfit).toBe(engine.netProfit);
  });

  test("company financials count only settled expenses inside the period", async () => {
    const { project } = await seedProject(10000);
    await spend(project.id, 250, { expenseDate: "2026-03-10", isPaid: true });
    await spend(project.id, 900, { expenseDate: "2026-09-01", isPaid: true }); // outside the range
    await spend(project.id, 500, { expenseDate: "2026-03-12", isPaid: false }); // not yet cash

    const scope = {
      companyId: COMPANY_ID,
      dateRange: { start: new Date("2026-03-01"), end: new Date("2026-03-31") },
    };
    const company = await services.financialEngine.getCompanyFinancials(scope);

    // Cash-basis and period-scoped: only the settled March expense.
    expect(company.expenseItems).toBe(250);

    const tax = await services.financialEngine.getTaxSummary(scope);
    expect(tax.deductibleExpenses).toBe(250);
  });

  test("a deleted expense disappears from company financials too", async () => {
    const { project } = await seedProject(10000);
    const expense = await spend(project.id, 250, { expenseDate: "2026-03-10" });
    const scope = {
      companyId: COMPANY_ID,
      dateRange: { start: new Date("2026-03-01"), end: new Date("2026-03-31") },
    };
    expect((await services.financialEngine.getCompanyFinancials(scope)).expenseItems).toBe(250);

    await services.expenseService.softDelete(expense.id, "Recorded twice");

    expect((await services.financialEngine.getCompanyFinancials(scope)).expenseItems).toBe(0);
  });

  test("expenses attached to an estimate but no project still count toward the project", async () => {
    // Real legacy rows are shaped this way; a project_id-only query
    // silently understated cost.
    const { project } = await seedProject(10000);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID,
      projectId: project.id,
      clientId: "client-1",
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 500, taxable: false }],
      markup: 0,
      discount: 0,
      taxRate: 0,
    });

    await services.expenseService.create({
      companyId: COMPANY_ID,
      projectId: null,
      estimateId: estimate.id,
      expenseType: "materials",
      amount: 175,
      expenseDate: "2026-03-10",
    });

    expect((await services.expenseService.getTotalsForProject(project.id)).total).toBe(175);
    expect(await profitOf(project.id)).toBe(9825);
  });
});

describe("The shared formula itself", () => {
  test("calculateExpenseTotals excludes deleted rows even if a caller forgets to", async () => {
    const rows = [
      { amount: 100, expenseType: "materials", paidByType: "company", isPaid: true, reimbursable: false, reimbursementStatus: "not_applicable" },
      { amount: 50, expenseType: "labor", paidByType: "company", isPaid: true, reimbursable: false, reimbursementStatus: "not_applicable", deletedAt: "2026-03-01" },
    ];
    expect(calculateExpenseTotals(rows).total).toBe(100);
  });

  test("vendor suggestions come from what's actually been used", async () => {
    const { project } = await seedProject();
    await spend(project.id, 10, { vendor: "Lowes" });
    await spend(project.id, 20, { vendor: "Home Depot" });
    await spend(project.id, 30, { vendor: "Lowes" });

    expect(await services.expenseService.listKnownVendors(COMPANY_ID)).toEqual(["Home Depot", "Lowes"]);
  });
});

describe("Permission enforcement", () => {
  test("the matrix gates who may record and delete expenses", () => {
    const { validationService } = services;
    expect(validationService.validatePermission("accountant", "expense", "create").valid).toBe(true);
    expect(validationService.validatePermission("office", "expense", "create").valid).toBe(true);
    expect(validationService.validatePermission("sales", "expense", "delete").valid).toBe(false);
  });
});
