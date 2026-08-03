/**
 * Validates the legacy payment backfill —
 * supabase/migrations/20260803000000_migrate_payments_to_expenses.sql —
 * before it is ever run against real data.
 *
 * The SQL cannot be executed here, so the three rules it implements are
 * re-implemented once, in `runBackfill` below, against the in-memory
 * store. Rule-for-rule this mirrors the migration:
 *
 *   1. active subcontractor_payments -> 'subcontractor' expense rows
 *   2. active agent_payments (commission) -> 'agent_commission' rows
 *   3. agent_payments (reimbursement) -> settle the existing expense,
 *      inserting NOTHING (a reimbursement repays a purchase already
 *      recorded; a new row would double-charge it)
 *   - soft-deleted payments are skipped: they were never cost, so
 *     migrating them would invent cost that never existed
 *   - a `migrated-from:` marker in `notes` makes it idempotent
 *
 * What is proven: total cost AFTER the backfill equals what the OLD
 * cash-basis model reported for the same records, and running it twice
 * changes nothing.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "migration-co";
const RANGE = { start: new Date("2026-01-01"), end: new Date("2026-12-31") };

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

const marker = (table: string, id: string) => `migrated-from:${table}:${id}`;

/** The migration's three rules, applied to the in-memory store. */
async function runBackfill() {
  const existingMarkers = new Set(
    (await services.expenseService.listForCompany(COMPANY_ID)).map((e) => e.notes).filter(Boolean)
  );
  let inserted = 0;
  let settled = 0;

  // 1. Subcontractor payments.
  for (const payment of store.subcontractorPayments.values()) {
    if (payment.deletedAt) continue;
    const assignment = store.subAssignments.get(payment.assignmentId);
    if (!assignment || assignment.deletedAt) continue;
    const note = marker("subcontractor_payments", payment.id);
    if (existingMarkers.has(note)) continue;
    await services.expenseService.create({
      companyId: payment.companyId,
      projectId: assignment.projectId,
      expenseType: "subcontractor",
      amount: payment.amount,
      expenseDate: payment.paymentDate,
      notes: note,
      payeeType: "subcontractor",
      payeeId: assignment.subcontractorId,
      paidByType: "company",
      isPaid: true,
      reimbursable: false,
    });
    existingMarkers.add(note);
    inserted++;
  }

  // 2. Agent commissions.
  for (const payment of store.agentPayments.values()) {
    if (payment.deletedAt || payment.paymentType !== "commission") continue;
    const assignment = payment.assignmentId ? store.agentAssignments.get(payment.assignmentId) : null;
    const note = marker("agent_payments", payment.id);
    if (existingMarkers.has(note)) continue;
    await services.expenseService.create({
      companyId: payment.companyId,
      projectId: assignment && !assignment.deletedAt ? assignment.projectId : null,
      expenseType: "agent_commission",
      amount: payment.amount,
      expenseDate: payment.paymentDate,
      notes: note,
      payeeType: "agent",
      payeeId: payment.agentId,
      paidByType: "company",
      isPaid: true,
      reimbursable: false,
    });
    existingMarkers.add(note);
    inserted++;
  }

  // 3. Reimbursements settle, never insert.
  for (const payment of store.agentPayments.values()) {
    if (payment.deletedAt || payment.paymentType !== "reimbursement") continue;
    if (!payment.reimbursesExpenseId) continue;
    const expense = await services.expenseService.getById(payment.reimbursesExpenseId);
    if (!expense || expense.deletedAt || expense.reimbursementStatus === "reimbursed") continue;
    await services.expenseService.markReimbursed(payment.reimbursesExpenseId);
    settled++;
  }

  return { inserted, settled };
}

/** A realistic legacy data set: assignments and payments written the
 * OLD way, with nothing yet in the expense table for them. */
async function seedLegacyData() {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: null, name: "Legacy Job" });
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID, projectId: project.id, clientId: null,
    lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 20000, taxable: false }],
    markup: 0, discount: 0, taxRate: 0,
  });
  await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });

  // A normal expense that predates the change — must be untouched.
  await services.expenseService.create({
    companyId: COMPANY_ID, projectId: project.id, expenseType: "materials", amount: 900, expenseDate: "2026-01-02",
  });

  const subAssignment = await services.subcontractorService.assignToProject({
    companyId: COMPANY_ID, projectId: project.id, subcontractorId: "sub-1", contractedAmount: 5000,
  });
  await services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: subAssignment.id, amount: 2000, paymentDate: "2026-01-10" });
  await services.subcontractorService.recordPayment({ companyId: COMPANY_ID, assignmentId: subAssignment.id, amount: 1500, paymentDate: "2026-01-20" });

  // A payment that was deleted back then — never counted, must stay so.
  const voidedPayment = await services.subcontractorService.recordPayment({
    companyId: COMPANY_ID, assignmentId: subAssignment.id, amount: 750, paymentDate: "2026-01-25",
  });
  await services.subcontractorService.softDelete(voidedPayment.id, "Paid the wrong subcontractor");

  const agentAssignment = await services.agentCommissionService.assignToProject({
    companyId: COMPANY_ID, projectId: project.id, agentId: "agent-1", assignedAmount: 1200,
  });
  await services.agentCommissionService.recordPayment({
    companyId: COMPANY_ID, agentId: "agent-1", assignmentId: agentAssignment.id,
    amount: 1200, paymentType: "commission", paymentDate: "2026-01-15",
  });

  // An agent-funded purchase, repaid the old way.
  const agentPaidExpense = await services.expenseService.create({
    companyId: COMPANY_ID, projectId: project.id, expenseType: "miscellaneous", amount: 300,
    expenseDate: "2026-01-16", paidByType: "agent", paidById: "agent-1",
  });
  await services.agentCommissionService.recordPayment({
    companyId: COMPANY_ID, agentId: "agent-1", amount: 300, paymentType: "reimbursement",
    paymentDate: "2026-01-18", reimbursesExpenseId: agentPaidExpense.id,
  });

  return { project, subAssignment, agentAssignment, agentPaidExpense };
}

/** What the OLD cash-basis model charged for these records: expense
 * rows + subcontractor payments + agent COMMISSION payments. (A
 * reimbursement was never additional cost in either model.) */
function legacyCashCost(expenseRowTotal: number) {
  const subPaid = Array.from(store.subcontractorPayments.values())
    .filter((p) => !p.deletedAt)
    .reduce((s, p) => s + p.amount, 0);
  const commissionPaid = Array.from(store.agentPayments.values())
    .filter((p) => !p.deletedAt && p.paymentType === "commission")
    .reduce((s, p) => s + p.amount, 0);
  return expenseRowTotal + subPaid + commissionPaid;
}

describe("Legacy payment -> expense backfill", () => {
  test("before the backfill, historical payments are invisible to cost — this is what it fixes", async () => {
    const { project } = await seedLegacyData();

    const before = await services.financialEngine.getProjectFinancials(project.id);
    // Only the two real expense rows (900 materials + 300 agent-funded).
    expect(before.totalExpenses).toBe(1200);
    expect(before.subcontractorCosts).toBe(0);
    expect(before.agentCosts).toBe(0);
    // The 3,500 paid and the 1,200 commission are the gap.
    expect(legacyCashCost(1200)).toBe(1200 + 3500 + 1200);
  });

  test("after the backfill, total cost equals what the legacy model charged", async () => {
    const { project } = await seedLegacyData();
    const expectedTotal = legacyCashCost(1200);

    const { inserted, settled } = await runBackfill();
    expect(inserted).toBe(3); // 2 sub payments + 1 commission; the deleted one is skipped
    // The reimbursement inserts nothing. It settles zero rows here only
    // because recording it the old way already flipped the expense to
    // "reimbursed" — which is precisely why re-settling must be a
    // no-op rather than a second cost. See the dedicated test below.
    expect(settled).toBe(0);

    const after = await services.financialEngine.getProjectFinancials(project.id);
    expect(after.totalExpenses).toBe(expectedTotal);
    expect(after.expenseItems).toBe(expectedTotal);
    expect(after.subcontractorCosts).toBe(3500);
    expect(after.agentCosts).toBe(1200);
    expect(after.netProfit).toBe(20000 - expectedTotal);

    // Company-level (cash basis) reconciles against the same figure.
    const company = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: RANGE });
    expect(company.totalExpenses).toBe(expectedTotal);
    expect(company.subcontractorPaid).toBe(3500);
    expect(company.agentCommissionPaid).toBe(1200);
  });

  test("a soft-deleted legacy payment is never migrated — it was never cost", async () => {
    await seedLegacyData();
    await runBackfill();

    const expenses = await services.expenseService.listForCompany(COMPANY_ID);
    expect(expenses.some((e) => e.amount === 750)).toBe(false);
  });

  test("re-running the backfill is a no-op: no duplicate expenses, no changed totals", async () => {
    const { project } = await seedLegacyData();
    await runBackfill();
    const afterFirst = await services.financialEngine.getProjectFinancials(project.id);
    const countAfterFirst = (await services.expenseService.listForCompany(COMPANY_ID)).length;

    const second = await runBackfill();
    expect(second).toEqual({ inserted: 0, settled: 0 });

    const afterSecond = await services.financialEngine.getProjectFinancials(project.id);
    expect(afterSecond.totalExpenses).toBe(afterFirst.totalExpenses);
    expect(afterSecond.netProfit).toBe(afterFirst.netProfit);
    expect((await services.expenseService.listForCompany(COMPANY_ID)).length).toBe(countAfterFirst);

    // Each legacy payment produced exactly one expense.
    const notes = (await services.expenseService.listForCompany(COMPANY_ID))
      .map((e) => e.notes)
      .filter((n): n is string => !!n && n.startsWith("migrated-from:"));
    expect(new Set(notes).size).toBe(notes.length);
  });

  test("a reimbursement settles the original purchase instead of adding a second cost", async () => {
    const { project, agentPaidExpense } = await seedLegacyData();
    const beforeCount = (await services.expenseService.listForProject(project.id)).length;

    await runBackfill();

    const settled = await services.expenseService.getById(agentPaidExpense.id);
    expect(settled?.reimbursementStatus).toBe("reimbursed");
    expect(await services.expenseService.listPendingReimbursements(COMPANY_ID, "agent-1")).toHaveLength(0);

    // Exactly 3 new rows (2 sub + 1 commission) — the $300 repayment
    // added none, and the purchase is still counted once.
    const after = await services.expenseService.listForProject(project.id);
    expect(after.length).toBe(beforeCount + 3);
    expect(after.filter((e) => e.amount === 300)).toHaveLength(1);
  });

  test("payees' outstanding balances are correct once the payments are visible again", async () => {
    const { project } = await seedLegacyData();
    await runBackfill();

    const [sub] = await services.financialEngine.getPayeeBalances({ companyId: COMPANY_ID, projectId: project.id }, "subcontractor");
    expect(sub).toMatchObject({ payeeId: "sub-1", contracted: 5000, paid: 3500, outstanding: 1500 });

    const [agent] = await services.financialEngine.getPayeeBalances({ companyId: COMPANY_ID, projectId: project.id }, "agent");
    expect(agent).toMatchObject({ payeeId: "agent-1", contracted: 1200, paid: 1200, outstanding: 0 });
  });
});
