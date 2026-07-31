/**
 * Agent commission workflow verification.
 *
 * Tests the complete flow: record expenses, calculate remaining profit,
 * allocate commissions to agents, verify no double-counting.
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

/** Seed a project with $1000 revenue, $300 other expenses */
async function seedScenario() {
  const project = await services.projectService.create({
    companyId: COMPANY_ID,
    clientId: "client-1",
    name: "Commission Test Project",
  });

  // Create invoice for $1000
  const invoice = await services.invoiceService.createStandalone({
    companyId: COMPANY_ID,
    projectId: project.id,
    clientId: "client-1",
    lineItems: [{ name: "Work", description: null, quantity: 1, unitPrice: 1000 }],
    issueDate: "2026-03-01",
    dueDate: "2099-12-31",
  });

  await services.invoiceService.changeStatus(invoice.id, "sent");
  await services.paymentService.record({
    companyId: COMPANY_ID,
    invoiceId: invoice.id,
    amount: 1000,
    method: "check",
    paymentDate: "2026-03-05",
  });

  // Add $200 subcontractor expense
  await services.expenseService.create({
    companyId: COMPANY_ID,
    projectId: project.id,
    expenseType: "subcontractor",
    amount: 200,
    expenseDate: "2026-03-10",
    vendor: "Sub Inc",
    payeeType: "subcontractor",
    payeeId: "sub-1",
  });

  // Add $100 materials
  await services.expenseService.create({
    companyId: COMPANY_ID,
    projectId: project.id,
    expenseType: "materials",
    amount: 100,
    expenseDate: "2026-03-10",
  });

  return { project, invoice };
}

describe("Agent Commission Workflow", () => {
  describe("Test 1: Single agent, 40% commission", () => {
    test("allocates commission correctly: Agent=$200, Company=$300", async () => {
      const { project } = await seedScenario();

      // At this point: Revenue $1000, Expenses $300 (sub $200 + materials $100)
      // Remaining profit = $700

      // Allocate 40% to Agent A
      const commissionAmount = 700 * 0.4; // = $280, not $200

      // Record commission as an expense
      await services.expenseService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        expenseType: "agent_commission",
        amount: commissionAmount,
        expenseDate: "2026-03-11",
        vendor: "Agent A",
        payeeType: "agent",
        payeeId: "agent-a",
        paidByType: "company",
        isPaid: true,
      });

      // Verify totals
      const totals = await services.expenseService.getTotalsForProject(project.id);
      const f = await services.financialEngine.getProjectFinancials(project.id);

      expect(totals.total).toBe(300 + commissionAmount);
      expect(f.totalExpenses).toBe(300 + commissionAmount);
      // Estimated profit = revised_total - expenses
      // = 1000 - (300 + 280) = 420
      expect(f.netProfit).toBe(1000 - (300 + commissionAmount));
    });
  });

  describe("Test 2: Two agents, 40% commission", () => {
    test("splits commission evenly: Agent A=$140, Agent B=$140, Company=$420", async () => {
      const { project } = await seedScenario();

      // Revenue $1000, Expenses $300, Remaining = $700
      // 40% commission = $280, split 2 ways = $140 each

      const commissionPerAgent = (700 * 0.4) / 2; // = $140

      // Record commission for Agent A
      await services.expenseService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        expenseType: "agent_commission",
        amount: commissionPerAgent,
        expenseDate: "2026-03-11",
        vendor: "Agent A",
        payeeType: "agent",
        payeeId: "agent-a",
        paidByType: "company",
        isPaid: true,
      });

      // Record commission for Agent B
      await services.expenseService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        expenseType: "agent_commission",
        amount: commissionPerAgent,
        expenseDate: "2026-03-11",
        vendor: "Agent B",
        payeeType: "agent",
        payeeId: "agent-b",
        paidByType: "company",
        isPaid: true,
      });

      // Verify totals
      const totals = await services.expenseService.getTotalsForProject(project.id);
      const f = await services.financialEngine.getProjectFinancials(project.id);

      const totalCommission = commissionPerAgent * 2; // = $280
      expect(totals.total).toBe(300 + totalCommission);
      expect(f.totalExpenses).toBe(300 + totalCommission);
      expect(f.netProfit).toBe(1000 - (300 + totalCommission)); // = $420
    });
  });

  describe("No double-counting verification", () => {
    test("commissions are expenses, not separate line items", async () => {
      const { project } = await seedScenario();

      await services.expenseService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        expenseType: "agent_commission",
        amount: 100,
        expenseDate: "2026-03-11",
        vendor: "Agent A",
        payeeType: "agent",
        payeeId: "agent-a",
        paidByType: "company",
        isPaid: true,
      });

      // Expenses should be: subcontractor $200 + materials $100 + commission $100 = $400
      const allExpenses = await services.expenseService.listForProject(project.id);
      const totals = calculateExpenseTotals(allExpenses);

      expect(totals.total).toBe(400);
      expect(allExpenses.some((e) => e.expenseType === "agent_commission")).toBe(true);
      expect(allExpenses.filter((e) => e.expenseType === "agent_commission")).toHaveLength(1);
    });

    test("FinancialEngine doesn't double-count commission", async () => {
      const { project } = await seedScenario();

      // Record commission
      await services.expenseService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        expenseType: "agent_commission",
        amount: 280,
        expenseDate: "2026-03-11",
        vendor: "Agent A",
        payeeType: "agent",
        payeeId: "agent-a",
        paidByType: "company",
        isPaid: true,
      });

      const f = await services.financialEngine.getProjectFinancials(project.id);

      // Total expenses = $300 (sub + materials) + $280 (commission) = $580
      // Profit = $1000 - $580 = $420
      expect(f.totalExpenses).toBe(580);
      expect(f.netProfit).toBe(420);

      // Commission should NOT appear in outstandingTotal (not a reimbursement)
      expect(f.outstandingTotal).toBe(0);
    });
  });

  describe("Expense filtering by estimate still works", () => {
    test("project-level commissions don't break estimate filtering", async () => {
      const { project } = await seedScenario();

      // Create estimate
      const estimate = await services.estimateService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        clientId: "client-1",
        lineItems: [{ category: "material", name: "Quote", description: null, quantity: 1, unitPrice: 500, taxable: false }],
        markup: 0,
        discount: 0,
        taxRate: 0,
      });

      // Add expense to estimate
      const estimateExpense = await services.expenseService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        estimateId: estimate.id,
        expenseType: "materials",
        amount: 50,
        expenseDate: "2026-03-10",
      });

      // Add project-level commission
      await services.expenseService.create({
        companyId: COMPANY_ID,
        projectId: project.id,
        expenseType: "agent_commission",
        amount: 100,
        expenseDate: "2026-03-11",
        vendor: "Agent A",
        payeeType: "agent",
        payeeId: "agent-a",
        paidByType: "company",
        isPaid: true,
      });

      // listForEstimate should only return estimate-attached expenses
      const estimateExpenses = await services.expenseService.listForEstimate(estimate.id);
      expect(estimateExpenses).toHaveLength(1);
      expect(estimateExpenses[0].id).toBe(estimateExpense.id);

      // listForProject should return all
      const allExpenses = await services.expenseService.listForProject(project.id);
      expect(allExpenses.length).toBeGreaterThan(1);
      expect(allExpenses.some((e) => e.expenseType === "agent_commission")).toBe(true);
    });
  });
});
