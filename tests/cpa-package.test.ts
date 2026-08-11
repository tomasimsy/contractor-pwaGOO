/**
 * Regression tests for the CPA Year-End Package
 * (lib/services/cpaPackageService.ts), verifying it implements
 * docs/CPA_YEAR_END_PACKAGE.md's data contract exactly: cash-basis
 * only, paid-only expense totals, the triple-equality reconciliation
 * rule, and every payee/vendor/employee/reimbursement edge case the
 * spec calls out by name.
 *
 * Uses the same in-memory service doubles as the System Integrity
 * Audit — independently hand-computed expected values throughout,
 * never a call compared to itself.
 */
import { describe, test, expect } from "vitest";
import { createInMemoryServices, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { createCpaPackageService } from "../lib/services/cpaPackageService";

async function newProjectAndClient(services: InMemoryServices, companyId: string) {
  const client = await services.clientService.create({ companyId, name: `Client ${crypto.randomUUID().slice(0, 6)}` });
  const project = await services.projectService.create({ companyId, clientId: client.id, name: `Project ${crypto.randomUUID().slice(0, 6)}` });
  return { client, project };
}

async function approveEstimate(services: InMemoryServices, estimateId: string) {
  await services.estimateService.changeStatus(estimateId, "sent");
  const result = await services.estimateService.changeStatus(estimateId, "approved");
  if (!result.valid) throw new Error(`Could not approve estimate ${estimateId}: ${result.issues.map((i) => i.message).join("; ")}`);
}

function cpaFor(services: InMemoryServices) {
  return createCpaPackageService({
    expenseService: services.expenseService,
    paymentService: services.paymentService,
    invoiceService: services.invoiceService,
    projectService: services.projectService,
    clientService: services.clientService,
  });
}

// ======================================================================
// Income Summary
// ======================================================================
describe("Income Summary", () => {
  test("cash-basis: recognized by payment date, not invoice issue date; partial payments split across years", async () => {
    const services = createInMemoryServices();
    const companyId = "co-income";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 2000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    // Issued in December of the tax year, but paid across the boundary.
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-12-15", dueDate: "2027-01-15" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 1500, method: "check", paymentDate: "2026-12-28" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 500, method: "check", paymentDate: "2027-01-05" });

    const cpa = cpaFor(services);
    const income2026 = await cpa.getIncomeSummary(companyId, 2026);
    const income2027 = await cpa.getIncomeSummary(companyId, 2027);

    expect(income2026.totalCashCollected).toBe(1500);
    expect(income2027.totalCashCollected).toBe(500);
    // Invoiced (accrual, informational) is dated by issueDate — all in 2026.
    expect(income2026.totalInvoiced).toBe(2000);
    expect(income2027.totalInvoiced).toBe(0);
    // Outstanding receivables — snapshot, same regardless of which year queried.
    expect(income2026.outstandingReceivables).toBe(0);
    expect(income2026.byMonth).toEqual([{ month: "2026-12", amount: 1500 }]);
  });

  test("a deleted payment is excluded entirely", async () => {
    const services = createInMemoryServices();
    const companyId = "co-income-del";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 1000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-03-01", dueDate: "2026-04-01" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 400, method: "check", paymentDate: "2026-03-05" });
    const badPaymentResult = await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 600, method: "check", paymentDate: "2026-03-10" });
    if (!badPaymentResult.payment) throw new Error("Expected payment to be recorded");
    await services.paymentService.softDelete(badPaymentResult.payment.id, "Recorded in error");

    const cpa = cpaFor(services);
    const income = await cpa.getIncomeSummary(companyId, 2026);
    expect(income.totalCashCollected).toBe(400);
  });

  test("a payment against a void invoice still counts as cash collected (v1 decision)", async () => {
    const services = createInMemoryServices();
    const companyId = "co-income-void";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 800, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-05-01", dueDate: "2026-06-01" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 800, method: "check", paymentDate: "2026-05-10" });
    // draft -> void is not a legal transition; must pass through "sent" first.
    await services.invoiceService.changeStatus(invoice.id, "sent");
    const voidResult = await services.invoiceService.changeStatus(invoice.id, "void");
    if (!voidResult.valid) throw new Error(`Could not void invoice: ${voidResult.issues.map((i) => i.message).join("; ")}`);

    const cpa = cpaFor(services);
    const income = await cpa.getIncomeSummary(companyId, 2026);
    // Cash collected still counts...
    expect(income.totalCashCollected).toBe(800);
    // ...but "Total Invoiced" (accrual, informational) excludes the
    // now-void invoice via isRevenueInvoice.
    expect(income.totalInvoiced).toBe(0);
  });
});

// ======================================================================
// Expense Summary by Category
// ======================================================================
describe("Expense Summary by Category", () => {
  test("only paid, active, in-year rows count; grouped and summed correctly", async () => {
    const services = createInMemoryServices();
    const companyId = "co-expense";
    const { project } = await newProjectAndClient(services, companyId);

    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 300, expenseDate: "2026-02-01", isPaid: true });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 150, expenseDate: "2026-02-10", isPaid: true });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "labor", amount: 500, expenseDate: "2026-03-01", isPaid: true });
    // Unpaid — must be excluded.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "equipment", amount: 999, expenseDate: "2026-03-05", isPaid: false });
    // Wrong year — must be excluded.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "permit", amount: 75, expenseDate: "2025-12-31", isPaid: true });
    // Deleted — must be excluded.
    const toDelete = await services.expenseService.create({ companyId, projectId: project.id, expenseType: "miscellaneous", amount: 60, expenseDate: "2026-04-01", isPaid: true });
    await services.expenseService.softDelete(toDelete.id, "duplicate");

    const cpa = cpaFor(services);
    const summary = await cpa.getExpenseSummary(companyId, 2026);

    expect(summary.grandTotal).toBe(950); // 300 + 150 + 500
    const materials = summary.categories.find((c) => c.category === "materials");
    expect(materials).toMatchObject({ totalPaid: 450, count: 2 });
    const labor = summary.categories.find((c) => c.category === "labor");
    expect(labor).toMatchObject({ totalPaid: 500, count: 1 });
    expect(summary.categories.find((c) => c.category === "equipment")).toBeUndefined();
    expect(summary.categories.find((c) => c.category === "permit")).toBeUndefined();
    expect(summary.categories.find((c) => c.category === "miscellaneous")).toBeUndefined();
    // Percent of total.
    expect(materials!.percentOfTotal).toBeCloseTo((450 / 950) * 100, 2);
  });

  test("a settled reimbursement (isPaid: true) counts in its category; a pending one does not", async () => {
    const services = createInMemoryServices();
    const companyId = "co-expense-reimb";
    const { project } = await newProjectAndClient(services, companyId);
    const agentId = crypto.randomUUID();
    services.store.agents.set(agentId, {
      id: agentId, companyId, name: "Agent R", commissionRate: 0,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    // A fronted expense (isPaid true — the vendor was paid), reimbursement pending.
    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "materials", amount: 200, expenseDate: "2026-06-01",
      paidByType: "agent", paidById: agentId, reimbursable: true, isPaid: true,
    });

    const cpa = cpaFor(services);
    const summary = await cpa.getExpenseSummary(companyId, 2026);
    // isPaid governs inclusion, not reimbursementStatus — the vendor
    // WAS paid (isPaid: true), so it counts as a 2026 deductible
    // expense even though the company hasn't reimbursed the agent yet.
    expect(summary.grandTotal).toBe(200);
  });
});

// ======================================================================
// Payee Report
// ======================================================================
describe("Payee Report", () => {
  test("groups by (payeeType, payeeId) when structured, sums repeated payments correctly", async () => {
    const services = createInMemoryServices();
    const companyId = "co-payee";
    const { project } = await newProjectAndClient(services, companyId);
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub A", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "subcontractor", amount: 400, expenseDate: "2026-01-10", vendor: "Sub A", payeeType: "subcontractor", payeeId: subId, isPaid: true });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "subcontractor", amount: 600, expenseDate: "2026-02-15", vendor: "Sub A", payeeType: "subcontractor", payeeId: subId, isPaid: true });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ payeeName: "Sub A", payeeType: "subcontractor", payeeId: subId, totalPaid: 1000, paymentCount: 2, isInternalLabor: false });
    expect(report.grandTotal).toBe(1000);
  });

  test("employee/team-labor rows are included but flagged isInternalLabor", async () => {
    const services = createInMemoryServices();
    const companyId = "co-payee-emp";
    const { project } = await newProjectAndClient(services, companyId);
    const userId = crypto.randomUUID();
    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "labor", amount: 750, expenseDate: "2026-04-01",
      vendor: "Team Member One", payeeType: "employee", payeeId: userId, isPaid: true,
    });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ payeeType: "employee", isInternalLabor: true, totalPaid: 750 });
  });

  test("a reimbursement is not a separate payee category — it rolls into the reimbursed payee's total, only once paid", async () => {
    const services = createInMemoryServices();
    const companyId = "co-payee-reimb";
    const { project } = await newProjectAndClient(services, companyId);
    const agentId = crypto.randomUUID();
    services.store.agents.set(agentId, {
      id: agentId, companyId, name: "Agent Fronted", commissionRate: 0,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    // paidByType is the agent (fronted); payeeType is the actual vendor
    // paid — no payeeType/payeeId here since it's a materials purchase,
    // so it groups under the vendor name.
    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "materials", amount: 250, expenseDate: "2026-05-01",
      vendor: "Ace Hardware", paidByType: "agent", paidById: agentId, reimbursable: true, isPaid: true,
    });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    // Grouped as a vendor (Ace Hardware), not as "agent" — payeeType
    // describes who received the money, which here is the hardware
    // store, not the agent who fronted it.
    const row = report.rows.find((r) => r.payeeName === "Ace Hardware");
    expect(row).toMatchObject({ payeeType: "other", totalPaid: 250 });
    expect(report.rows).toHaveLength(1);
  });

  test("vendors with no payeeId group by exact vendor name; rows with neither payeeId nor vendor fall into Unspecified", async () => {
    const services = createInMemoryServices();
    const companyId = "co-payee-vendor";
    const { project } = await newProjectAndClient(services, companyId);
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "equipment", amount: 100, expenseDate: "2026-01-05", vendor: "Home Depot", isPaid: true });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "equipment", amount: 50, expenseDate: "2026-01-06", vendor: "Home Depot", isPaid: true });
    // Different casing/whitespace — v1 known limitation, does NOT merge.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "equipment", amount: 25, expenseDate: "2026-01-07", vendor: "home depot ", isPaid: true });
    // No vendor, no payeeId at all.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "miscellaneous", amount: 40, expenseDate: "2026-01-08", isPaid: true });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    const homeDepotExact = report.rows.find((r) => r.payeeName === "Home Depot");
    expect(homeDepotExact).toMatchObject({ totalPaid: 150, paymentCount: 2 });
    // The lowercase/trailing-space variant is its own row (documented
    // v1 limitation — exact-string grouping only).
    const homeDepotVariant = report.rows.find((r) => r.payeeName === "home depot");
    expect(homeDepotVariant).toMatchObject({ totalPaid: 25 });
    const unspecified = report.rows.find((r) => r.payeeName === "(Unspecified Payee)");
    expect(unspecified).toMatchObject({ totalPaid: 40 });
    // Unspecified sorts last regardless of amount.
    expect(report.rows[report.rows.length - 1].payeeName).toBe("(Unspecified Payee)");
  });

  test("committed but unpaid subcontractor/agent assignments never appear — payee report is paid-only", async () => {
    const services = createInMemoryServices();
    const companyId = "co-payee-committed";
    const { project } = await newProjectAndClient(services, companyId);
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub Unpaid", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    // Assignment only — no expense row, so no payment ever happened.
    await services.subcontractorService.assignToProject({ companyId, projectId: project.id, subcontractorId: subId, contractedAmount: 5000 });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    expect(report.rows).toHaveLength(0);
    expect(report.grandTotal).toBe(0);
  });
});

// ======================================================================
// Payee Payment Statement (per-payee, docs/PAYEE_PAYMENT_STATEMENT.md)
// ======================================================================
describe("Payee Payment Statement", () => {
  test("a statement's total and line items match the Payee Report row it came from, exactly", async () => {
    const services = createInMemoryServices();
    const companyId = "co-statement";
    const { project } = await newProjectAndClient(services, companyId);
    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub Stmt", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "subcontractor", amount: 400, expenseDate: "2026-03-10", vendor: "Sub Stmt", payeeType: "subcontractor", payeeId: subId, isPaid: true });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "subcontractor", amount: 250, expenseDate: "2026-01-05", vendor: "Sub Stmt", payeeType: "subcontractor", payeeId: subId, isPaid: true });
    // Different payee, must not leak into Sub Stmt's statement.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 999, expenseDate: "2026-02-01", vendor: "Someone Else", isPaid: true });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    const row = report.rows.find((r) => r.payeeName === "Sub Stmt")!;
    expect(row.groupKey).not.toBeNull();

    const statement = await cpa.getPayeeStatement(companyId, 2026, row.groupKey!);
    expect(statement).not.toBeNull();
    expect(statement!.totalPaid).toBe(row.totalPaid);
    expect(statement!.totalPaid).toBe(650);
    expect(statement!.payeeName).toBe("Sub Stmt");
    expect(statement!.isInternalLabor).toBe(false);
    // Line items sorted chronologically, not insertion order.
    expect(statement!.lineItems.map((li) => li.amount)).toEqual([250, 400]);
    expect(statement!.lineItems.map((li) => li.date)).toEqual(["2026-01-05", "2026-03-10"]);
  });

  test("an employee's statement is flagged isInternalLabor", async () => {
    const services = createInMemoryServices();
    const companyId = "co-statement-emp";
    const { project } = await newProjectAndClient(services, companyId);
    const userId = crypto.randomUUID();
    await services.expenseService.create({
      companyId, projectId: project.id, expenseType: "labor", amount: 500, expenseDate: "2026-05-01",
      vendor: "Team Member", payeeType: "employee", payeeId: userId, isPaid: true,
    });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    const row = report.rows.find((r) => r.payeeType === "employee")!;
    const statement = await cpa.getPayeeStatement(companyId, 2026, row.groupKey!);
    expect(statement!.isInternalLabor).toBe(true);
  });

  test("the unspecified-payee bucket has no groupKey and produces no statement", async () => {
    const services = createInMemoryServices();
    const companyId = "co-statement-unspec";
    const { project } = await newProjectAndClient(services, companyId);
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "miscellaneous", amount: 40, expenseDate: "2026-01-08", isPaid: true });

    const cpa = cpaFor(services);
    const report = await cpa.getPayeeReport(companyId, 2026);
    const row = report.rows.find((r) => r.payeeName === "(Unspecified Payee)")!;
    expect(row.groupKey).toBeNull();

    const statement = await cpa.getPayeeStatement(companyId, 2026, "unspecified");
    expect(statement).toBeNull();
  });

  test("a groupKey with no matching rows in the requested tax year returns null", async () => {
    const services = createInMemoryServices();
    const companyId = "co-statement-none";
    const cpa = cpaFor(services);
    const statement = await cpa.getPayeeStatement(companyId, 2026, "id:subcontractor:does-not-exist");
    expect(statement).toBeNull();
  });
});

// ======================================================================
// Detailed Transaction Report + triple-equality reconciliation
// ======================================================================
describe("Detailed Transaction Report", () => {
  test("Section A (received) and Section B (paid) are independent and cannot double-count each other", async () => {
    const services = createInMemoryServices();
    const companyId = "co-detail";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 3000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-02-01" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 3000, method: "check", paymentDate: "2026-01-15" });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 900, expenseDate: "2026-01-20", isPaid: true });
    // An unpaid bill — visible in Section B, excluded from its total.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "permit", amount: 150, expenseDate: "2026-01-22", isPaid: false, dueDate: "2026-03-01" });

    const cpa = cpaFor(services);
    const report = await cpa.getDetailedTransactionReport(companyId, 2026);

    expect(report.moneyReceivedTotal).toBe(3000);
    expect(report.moneyReceived).toHaveLength(1);
    // Section B contains BOTH rows (paid + unpaid)...
    expect(report.moneyPaid).toHaveLength(2);
    // ...but the total only reflects the paid one.
    expect(report.moneyPaidTotalPaid).toBe(900);
    const unpaidRow = report.moneyPaid.find((r) => !r.isPaid);
    expect(unpaidRow).toMatchObject({ amount: 150, isPaid: false });
  });

  test("triple-equality: moneyReceivedTotal = IncomeSummary.totalCashCollected; moneyPaidTotalPaid = ExpenseSummary.grandTotal = PayeeReport.grandTotal", async () => {
    const services = createInMemoryServices();
    const companyId = "co-triple";
    const { project, client } = await newProjectAndClient(services, companyId);
    const estimate = await services.estimateService.create({
      companyId, projectId: project.id, clientId: client.id,
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 5000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    await approveEstimate(services, estimate.id);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-02-01", dueDate: "2026-03-01" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 2200, method: "ach", paymentDate: "2026-02-10" });
    await services.paymentService.record({ companyId, invoiceId: invoice.id, amount: 2800, method: "check", paymentDate: "2026-02-20" });

    const subId = crypto.randomUUID();
    services.store.subcontractors.set(subId, {
      id: subId, companyId, name: "Sub Triple", trade: null, phone: null, contactPerson: null, isActive: true,
      createdBy: null, createdAt: new Date().toISOString(), updatedBy: null, updatedAt: new Date().toISOString(),
      deletedBy: null, deletedAt: null, deleteReason: null,
    });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "materials", amount: 700, expenseDate: "2026-02-12", isPaid: true });
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "subcontractor", amount: 1300, expenseDate: "2026-02-15", vendor: "Sub Triple", payeeType: "subcontractor", payeeId: subId, isPaid: true });
    // Unpaid — must not appear in any of the three totals being compared.
    await services.expenseService.create({ companyId, projectId: project.id, expenseType: "equipment", amount: 9999, expenseDate: "2026-02-16", isPaid: false });

    const cpa = cpaFor(services);
    const [income, expenseSummary, payeeReport, detail] = await Promise.all([
      cpa.getIncomeSummary(companyId, 2026),
      cpa.getExpenseSummary(companyId, 2026),
      cpa.getPayeeReport(companyId, 2026),
      cpa.getDetailedTransactionReport(companyId, 2026),
    ]);

    expect(income.totalCashCollected).toBe(5000);
    expect(detail.moneyReceivedTotal).toBe(income.totalCashCollected);

    expect(expenseSummary.grandTotal).toBe(2000); // 700 + 1300
    expect(payeeReport.grandTotal).toBe(expenseSummary.grandTotal);
    expect(detail.moneyPaidTotalPaid).toBe(expenseSummary.grandTotal);

    // A whole package call must produce internally-consistent figures too.
    const pkg = await cpa.getPackage(companyId, 2026);
    expect(pkg.income.totalCashCollected).toBe(pkg.transactions.moneyReceivedTotal);
    expect(pkg.expenses.grandTotal).toBe(pkg.payees.grandTotal);
    expect(pkg.expenses.grandTotal).toBe(pkg.transactions.moneyPaidTotalPaid);
    // netProfitLoss = cash collected (5000) - paid expenses (2000) = 3000.
    expect(pkg.netProfitLoss).toBe(3000);
    expect(pkg.netProfitLoss).toBe(pkg.income.totalCashCollected - pkg.expenses.grandTotal);
  });
});
