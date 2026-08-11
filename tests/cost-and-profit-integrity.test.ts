/**
 * Cost-side financial integrity: Expenses, Subcontractors, Agent
 * commissions, Reimbursements, and the Profit figure they all feed.
 *
 * The estimate/invoice/change-order (REVENUE) side is covered by
 * stress-and-edge-cases.test.ts and financial-service-calculations.
 * test.ts. This file is the equivalent for the COST side, written
 * during the Expense/Subcontractor/Agent/Profit audit and pinning the
 * four real bugs that audit found:
 *
 *   1. SubcontractorService.listAssignments / AgentCommissionService.
 *      listAssignments didn't filter deletedAt, so a soft-deleted
 *      assignment kept its full contracted amount in project costs
 *      (and out of profit) forever.
 *   2. ExpenseService.getBudgetComparison used deleted estimates as
 *      the budget baseline.
 *   3. getProjectFinancials added `agent_reimbursement_owed` (a
 *      LIABILITY per TRANSACTION_TYPE_META) into agentCosts, so an
 *      agent-funded purchase cost twice what the identical
 *      company-funded purchase cost.
 *   4. getCompanyFinancials had the same double-count on its
 *      cash-basis side: settling a reimbursement re-charged spending
 *      already counted in expenseItems.
 *
 * Every assertion here is a value that was WRONG before those fixes,
 * so a regression re-breaks this file rather than silently shipping.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "company-1";
const RANGE = { start: new Date("2026-01-01"), end: new Date("2026-12-31") };

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

/** Record a payment to a subcontractor / agent. ONE PAYMENT = ONE
 * EXPENSE RECORD, so this is just an expense row typed and tagged with
 * its payee — the same call ExpenseDialog and the assignment panels
 * make. */
async function payPayee(
  projectId: string,
  role: "subcontractor" | "agent",
  payeeId: string,
  amount: number,
  expenseDate: string
) {
  return services.expenseService.create({
    companyId: COMPANY_ID,
    projectId,
    expenseType: role === "subcontractor" ? "subcontractor" : "agent_commission",
    amount,
    expenseDate,
    payeeType: role,
    payeeId,
  });
}

/** A project with a $10,000 invoiced estimate — a realistic revenue
 * baseline so profit assertions below are about COST changes only. */
async function seedProjectWithRevenue(name = "Cost Integrity Project") {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name });
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID,
    projectId: project.id,
    clientId: null,
    lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 10000, taxable: false }],
    markup: 0,
    discount: 0,
    taxRate: 0,
  });
  await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });
  return { project, estimate };
}

describe("Expense integrity", () => {
  test("creating an expense increases project cost and reduces profit by exactly the amount", async () => {
    const { project } = await seedProjectWithRevenue();
    const before = await services.financialEngine.getProjectFinancials(project.id);

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 250, expenseDate: "2026-01-05",
    });

    const after = await services.financialEngine.getProjectFinancials(project.id);
    expect(after.totalExpenses).toBe(before.totalExpenses + 250);
    expect(after.netProfit).toBe(before.netProfit - 250);
  });

  test("updating an expense amount re-derives cost from the new amount, never the sum of both", async () => {
    const { project } = await seedProjectWithRevenue();
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 250, expenseDate: "2026-01-05",
    });

    await services.expenseService.update(expense.id, { amount: 400 });

    const after = await services.financialEngine.getProjectFinancials(project.id);
    // 400, NOT 650 (250 + 400) — the classic incremental-math failure.
    expect(after.totalExpenses).toBe(400);
    expect(after.netProfit).toBe(10000 - 400);
  });

  test("deleting an expense immediately removes it from cost and restores profit", async () => {
    const { project } = await seedProjectWithRevenue();
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 250, expenseDate: "2026-01-05",
    });

    await services.expenseService.softDelete(expense.id, "Recorded against the wrong project");

    const after = await services.financialEngine.getProjectFinancials(project.id);
    expect(after.totalExpenses).toBe(0);
    expect(after.netProfit).toBe(10000);
    expect(await services.expenseService.listForProject(project.id)).toHaveLength(0);
  });

  test("restoring a deleted expense brings the cost back", async () => {
    const { project } = await seedProjectWithRevenue();
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 250, expenseDate: "2026-01-05",
    });
    await services.expenseService.softDelete(expense.id, "Mistake");
    await services.expenseService.restore(expense.id);

    const after = await services.financialEngine.getProjectFinancials(project.id);
    expect(after.totalExpenses).toBe(250);
    expect(after.netProfit).toBe(10000 - 250);
  });

  test("budget comparison ignores deleted estimates on the budget side", async () => {
    // Regression: a deleted estimate's line items kept forming the
    // budget baseline, comparing live spend against a dead quote.
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Budget" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ category: "material", name: "m", description: null, quantity: 1, unitPrice: 900, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });

    expect((await services.expenseService.getBudgetComparison(project.id)).material.budget).toBe(900);
    await services.estimateService.softDelete(estimate.id, "Client cancelled");
    expect((await services.expenseService.getBudgetComparison(project.id)).material.budget).toBe(0);
  });
});

describe("Subcontractor integrity: assigned -> paid -> remaining owed", () => {
  test("the full lifecycle nets to zero outstanding and never double-counts cost", async () => {
    const { project } = await seedProjectWithRevenue();
    const assignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 3000,
    });

    const readBalance = async () =>
      (await services.financialEngine.getPayeeBalances({ companyId: COMPANY_ID, projectId: project.id }, "subcontractor"))[0];

    // Contracted but unpaid: owed in full, and not yet a cost.
    expect(await readBalance()).toMatchObject({ contracted: 3000, paid: 0, outstanding: 3000 });
    expect((await services.financialEngine.getProjectFinancials(project.id)).subcontractorCosts).toBe(0);

    await payPayee(project.id, "subcontractor", "sub-1", 1200, "2026-01-10");
    expect(await readBalance()).toMatchObject({ contracted: 3000, paid: 1200, outstanding: 1800 });

    await payPayee(project.id, "subcontractor", "sub-1", 1800, "2026-01-20");
    expect(await readBalance()).toMatchObject({ contracted: 3000, paid: 3000, outstanding: 0 });

    // Cost is the cash paid, counted once — 1200 + 1800, never the
    // contract PLUS each payment as it lands.
    const financials = await services.financialEngine.getProjectFinancials(project.id);
    expect(financials.subcontractorCosts).toBe(3000);
    expect(financials.expenseItems).toBe(3000);
    expect(financials.totalExpenses).toBe(3000);
    expect(financials.netProfit).toBe(10000 - 3000);
    void assignment;
  });

  test("deleting a subcontractor payment restores the outstanding balance", async () => {
    const { project } = await seedProjectWithRevenue();
    const assignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 3000,
    });
    const payment = await services.subcontractorService.recordPayment({
      companyId: COMPANY_ID, assignmentId: assignment.id, amount: 3000, paymentDate: "2026-01-10",
    });
    expect((await services.subcontractorService.getBalance(assignment.id)).outstanding).toBe(0);

    await services.subcontractorService.softDelete(payment.id, "Paid the wrong subcontractor");

    const balance = await services.subcontractorService.getBalance(assignment.id);
    expect(balance).toMatchObject({ assigned: 3000, paid: 0, outstanding: 3000 });
  });

  test("deleting a subcontractor ASSIGNMENT removes its commitment from every payables report", async () => {
    // Regression: listAssignments didn't filter deletedAt, so the full
    // contracted amount stayed owed forever.
    const { project } = await seedProjectWithRevenue();
    const assignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 5000,
    });
    // The commitment is owed, but no cash has moved, so it is not cost.
    expect((await services.financialEngine.getProjectFinancials(project.id)).outstandingSubcontractor).toBe(5000);
    expect((await services.financialEngine.getProjectFinancials(project.id)).subcontractorCosts).toBe(0);

    store.subAssignments.set(assignment.id, { ...store.subAssignments.get(assignment.id)!, deletedAt: new Date().toISOString() });

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    expect(financials.outstandingSubcontractor).toBe(0);
    expect(financials.subcontractorCosts).toBe(0);
    expect(financials.netProfit).toBe(10000);

    const payables = await services.financialEngine.getPayablesSummary({ companyId: COMPANY_ID });
    expect(payables.lines.filter((l) => l.assignmentId === assignment.id)).toHaveLength(0);
    expect(payables.totalOutstandingSubcontractor).toBe(0);
  });

  test("deleting a subcontractor PAYMENT expense restores the outstanding balance and removes the cost", async () => {
    const { project } = await seedProjectWithRevenue();
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 3000,
    });
    const payment = await payPayee(project.id, "subcontractor", "sub-1", 3000, "2026-01-10");
    expect((await services.financialEngine.getProjectFinancials(project.id)).outstandingSubcontractor).toBe(0);

    await services.expenseService.softDelete(payment.id, "Paid the wrong subcontractor");

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    expect(financials.subcontractorCosts).toBe(0);
    expect(financials.outstandingSubcontractor).toBe(3000);
    // The $3,000 contract is still committed even with the payment
    // gone — it just moved back from paid cost into outstanding
    // commitment, so it still counts against profit. netProfit =
    // 10000 revenue - 3000 committedRemaining.
    expect(financials.netProfit).toBe(7000);
  });
});

describe("Agent commission integrity: earned -> paid -> remaining", () => {
  test("commission balance is derived from active payment records", async () => {
    const { project } = await seedProjectWithRevenue();
    const assignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 800,
    });

    expect(await services.agentCommissionService.getBalance(assignment.id)).toMatchObject({ assigned: 800, paid: 0, outstanding: 800 });

    const payment = await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: assignment.id, amount: 800, paymentType: "commission", paymentDate: "2026-01-15",
    });
    expect(await services.agentCommissionService.getBalance(assignment.id)).toMatchObject({ assigned: 800, paid: 800, outstanding: 0 });

    await services.agentCommissionService.softDelete(payment.id, "Duplicate commission run");
    expect(await services.agentCommissionService.getBalance(assignment.id)).toMatchObject({ assigned: 800, paid: 0, outstanding: 800 });
  });

  test("deleting an agent ASSIGNMENT removes its commitment, and deleting the payment removes the cost", async () => {
    const { project } = await seedProjectWithRevenue();
    const assignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 800,
    });
    const commission = await payPayee(project.id, "agent", "agent-1", 800, "2026-01-15");
    expect((await services.financialEngine.getProjectFinancials(project.id)).agentCosts).toBe(800);

    // Removing the ASSIGNMENT drops the commitment. The commission was
    // already PAID, so it stays a cost — the money really did leave.
    store.agentAssignments.set(assignment.id, { ...store.agentAssignments.get(assignment.id)!, deletedAt: new Date().toISOString() });
    let financials = await services.financialEngine.getProjectFinancials(project.id);
    expect(financials.agentCosts).toBe(800);
    expect(financials.outstandingAgent).toBe(0);

    // Removing the PAYMENT is what removes the cost.
    await services.expenseService.softDelete(commission.id, "Commission run reversed");
    financials = await services.financialEngine.getProjectFinancials(project.id);
    expect(financials.agentCosts).toBe(0);
    expect(financials.netProfit).toBe(10000);
  });
});

describe("Reimbursement integrity: company owes the agent until paid", () => {
  test("an agent-paid expense books a liability that survives until settled, separate from commission", async () => {
    const { project } = await seedProjectWithRevenue();
    const assignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 1000,
    });
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-05", paidByType: "agent", paidById: "agent-1",
    });

    expect(await services.transactionService.getReimbursementBalance(expense.id)).toMatchObject({ owed: 300, paid: 0, outstanding: 300 });
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(1);

    // Paying the COMMISSION must not touch the reimbursement, and vice
    // versa — the two must never merge.
    await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: assignment.id, amount: 1000, paymentType: "commission", paymentDate: "2026-01-10",
    });
    expect(await services.transactionService.getReimbursementBalance(expense.id)).toMatchObject({ owed: 300, paid: 0, outstanding: 300 });
    expect(await services.agentCommissionService.getBalance(assignment.id)).toMatchObject({ paid: 1000, outstanding: 0 });

    const reimbursement = await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: assignment.id, amount: 300, paymentType: "reimbursement", paymentDate: "2026-01-11", reimbursesExpenseId: expense.id,
    });
    expect(await services.transactionService.getReimbursementBalance(expense.id)).toMatchObject({ owed: 300, paid: 300, outstanding: 0 });
    // Settling a reimbursement must NOT look like extra commission.
    expect(await services.agentCommissionService.getBalance(assignment.id)).toMatchObject({ assigned: 1000, paid: 1000, outstanding: 0 });
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(0);

    await services.agentCommissionService.softDelete(reimbursement.id, "Reimbursed twice");
    expect(await services.transactionService.getReimbursementBalance(expense.id)).toMatchObject({ owed: 300, paid: 0, outstanding: 300 });
  });

  test("deleting the agent-paid EXPENSE clears the company's reimbursement liability", async () => {
    // Regression: the "owed" side ignored the expense's own deletion,
    // so the company appeared to owe an agent for a removed expense.
    const { project } = await seedProjectWithRevenue();
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-05", paidByType: "agent", paidById: "agent-1",
    });
    expect((await services.transactionService.getReimbursementBalance(expense.id)).owed).toBe(300);

    await services.expenseService.softDelete(expense.id, "Duplicate receipt");

    expect(await services.transactionService.getReimbursementBalance(expense.id)).toMatchObject({ owed: 0, outstanding: 0 });
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(0);
  });

  test("an agent-funded purchase costs exactly the same as a company-funded one", async () => {
    // Regression (project/committed view): the reimbursement LIABILITY
    // was added to agentCosts on top of the expense already counted,
    // so the same $300 purchase cost $600 when an agent paid it.
    const { project: companyPaid } = await seedProjectWithRevenue("Company Funded");
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: companyPaid.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-05",
    });

    const { project: agentPaid } = await seedProjectWithRevenue("Agent Funded");
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: agentPaid.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-05", paidByType: "agent", paidById: "agent-1",
    });

    const a = await services.financialEngine.getProjectFinancials(companyPaid.id);
    const b = await services.financialEngine.getProjectFinancials(agentPaid.id);
    expect(b.totalExpenses).toBe(a.totalExpenses);
    expect(b.netProfit).toBe(a.netProfit);
    expect(b.totalExpenses).toBe(300);

    // The liability is still visible where it belongs: outstanding.
    expect(b.outstandingAgent).toBe(300);
  });

  test("settling a reimbursement does not re-charge the company at the period level", async () => {
    // Regression (company/cash view): totalExpenses jumped from $300
    // to $600 the moment the agent was repaid.
    const { project } = await seedProjectWithRevenue();
    const assignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 0,
    });
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 300, expenseDate: "2026-01-05", paidByType: "agent", paidById: "agent-1",
    });

    const before = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: RANGE });
    await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: assignment.id, amount: 300, paymentType: "reimbursement", paymentDate: "2026-01-11", reimbursesExpenseId: expense.id,
    });
    const after = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: RANGE });

    expect(after.totalExpenses).toBe(before.totalExpenses);
    expect(after.netProfit).toBe(before.netProfit);
    // Cash to the agent is still reported truthfully — it just isn't a
    // second cost.
    expect(after.agentPaid).toBe(300);
    expect(after.agentCommissionPaid).toBe(0);
  });
});

describe("Project profit: Revised Revenue - Real Project Costs", () => {
  test("profit reflects every cost category and updates as change orders come and go", async () => {
    const { project, estimate } = await seedProjectWithRevenue();

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 500, expenseDate: "2026-01-05",
    });
    await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 700,
    });
    // Both are PAID — cash out the door, so both are expense rows.
    await payPayee(project.id, "subcontractor", "sub-1", 2000, "2026-01-06");
    await payPayee(project.id, "agent", "agent-1", 700, "2026-01-07");

    // Revenue 10,000 - (500 materials + 2,000 sub + 700 commission)
    let f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.revisedTotal).toBe(10000);
    expect(f.totalExpenses).toBe(3200);
    expect(f.netProfit).toBe(6800);

    // An APPROVED change order raises revised revenue and therefore profit.
    const changeOrder = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-1", title: "Extra scope", totalAmount: 1500, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(changeOrder.id);
    f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.revisedTotal).toBe(11500);
    expect(f.netProfit).toBe(11500 - 3200);

    // Deleting it must take that revenue back out.
    await services.changeOrderService.softDelete(changeOrder.id, "Scope pulled");
    f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.revisedTotal).toBe(10000);
    expect(f.netProfit).toBe(6800);

    // Everything contracted has now been paid, so nothing is left
    // outstanding and cost is unchanged — no payment is counted twice.
    f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.outstandingSubcontractor).toBe(0);
    expect(f.outstandingAgent).toBe(0);
    expect(f.totalExpenses).toBe(3200);
    expect(f.netProfit).toBe(6800);
  });

  test("getProfitSummary agrees with getProjectFinancials for the same project", async () => {
    const { project } = await seedProjectWithRevenue();
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "labor", amount: 1250, expenseDate: "2026-01-05",
    });

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    const summary = await services.financialEngine.getProfitSummary({ projectId: project.id });

    expect(summary.revenue).toBe(financials.revisedTotal);
    expect(summary.totalCosts).toBe(financials.totalExpenses);
    expect(summary.netProfit).toBe(financials.netProfit);
  });
});

describe("Cross-view reconciliation: every surface reports the same numbers", () => {
  test("project, payables, and company-level views agree on one representative project", async () => {
    const { project, estimate } = await seedProjectWithRevenue();

    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 500, expenseDate: "2026-01-05",
    });
    const subAssignment = await services.subcontractorService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 2000,
    });
    await payPayee(project.id, "subcontractor", "sub-1", 500, "2026-01-20");
    const agentAssignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 700,
    });
    const changeOrder = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-1", title: "Extra", totalAmount: 1000, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(changeOrder.id);

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    const payables = await services.financialEngine.getPayablesSummary({ companyId: COMPANY_ID });
    const profit = await services.financialEngine.getProfitSummary({ projectId: project.id });

    // Revenue: 10,000 invoiced + 1,000 approved change order.
    expect(financials.revisedTotal).toBe(11000);

    // Outstanding payables agree between the project view and the
    // dedicated payables report.
    expect(financials.outstandingSubcontractor).toBe(1500); // 2,000 assigned - 500 paid
    expect(payables.totalOutstandingSubcontractor).toBe(1500);
    expect(financials.outstandingAgent).toBe(700); // nothing paid yet
    expect(payables.totalOutstandingAgent).toBe(700);

    // Profit agrees across both entry points. Cost is cash paid PLUS
    // what's still committed: 500 materials + 500 paid to the
    // subcontractor + the unpaid 1,500 of that same contract + the
    // unpaid 700 commission — the whole contracted amount counts the
    // moment it's committed, not just the part already paid out.
    expect(profit.netProfit).toBe(financials.netProfit);
    expect(financials.netProfit).toBe(11000 - (500 + 500 + 1500 + 700));

    // The subcontractor's payee balance matches the payables line.
    const line = payables.lines.find((l) => l.assignmentId === subAssignment.id)!;
    const [balance] = await services.financialEngine.getPayeeBalances({ companyId: COMPANY_ID, projectId: project.id }, "subcontractor");
    expect(line.outstanding).toBe(balance.outstanding);
    expect(line.paid).toBe(balance.paid);

    const agentLine = payables.lines.find((l) => l.assignmentId === agentAssignment.id)!;
    const [agentBalance] = await services.financialEngine.getPayeeBalances({ companyId: COMPANY_ID, projectId: project.id }, "agent");
    expect(agentLine.outstanding).toBe(agentBalance.outstanding);
  });

  test("the ledger reconciles cleanly against source records after the full cost lifecycle", async () => {
    const { project, estimate } = await seedProjectWithRevenue();
    const expense = await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 400, expenseDate: "2026-01-05", paidByType: "agent", paidById: "agent-1",
    });
    const assignment = await services.agentCommissionService.assignToProject({
      companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 600,
    });
    await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: assignment.id, amount: 600, paymentType: "commission", paymentDate: "2026-01-15",
    });
    await services.agentCommissionService.recordPayment({
      companyId: COMPANY_ID, agentId: "agent-1", assignmentId: assignment.id, amount: 400, paymentType: "reimbursement", paymentDate: "2026-01-16", reimbursesExpenseId: expense.id,
    });
    const changeOrder = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id, changeOrderNumber: "CO-1", title: "Extra", totalAmount: 250, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(changeOrder.id);

    const report = await services.reconciliationService.reconcileLedgerAgainstSources({ companyId: COMPANY_ID, projectId: project.id });
    expect(report.isClean, JSON.stringify(report.findings, null, 2)).toBe(true);
  });
});
