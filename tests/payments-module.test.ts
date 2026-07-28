/**
 * Payments module regression suite — the full lifecycle the brief calls
 * out: record (full and partial) -> status transitions -> history ->
 * edit -> delete -> totals stay correct everywhere.
 *
 * The invariant under test throughout: NO payment figure is ever stored
 * or incremented. Balance, amount paid, and invoice status are always
 * rebuilt from the currently-active payment rows, so any mutation is
 * reflected immediately with no refresh step.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "company-1";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

async function seedInvoice(unitPrice = 1000) {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Payments Test" });
  const invoice = await services.invoiceService.createStandalone({
    companyId: COMPANY_ID,
    projectId: project.id,
    clientId: "client-1",
    lineItems: [{ name: "Work", description: null, quantity: 1, unitPrice }],
    issueDate: "2026-04-01",
    dueDate: "2026-04-30",
  });
  await services.invoiceService.changeStatus(invoice.id, "sent");
  return { project, invoice };
}

const pay = (invoiceId: string, amount: number, extra: Record<string, unknown> = {}) =>
  services.paymentService.record({
    companyId: COMPANY_ID, invoiceId, amount, method: "check", paymentDate: "2026-04-05", ...extra,
  });

describe("Recording payments", () => {
  test("a partial payment moves the invoice to partially_paid and leaves the right balance", async () => {
    const { invoice } = await seedInvoice(1000);

    const result = await pay(invoice.id, 400);
    expect(result.valid).toBe(true);

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary).toMatchObject({ totalPaid: 400, remainingBalance: 600, status: "partial" });
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");
  });

  test("paying the remainder moves it to paid with a zero balance", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 400);
    await pay(invoice.id, 600);

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary).toMatchObject({ totalPaid: 1000, remainingBalance: 0, status: "paid" });
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");
  });

  test("a single full payment goes straight to paid", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 1000);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");
  });

  test("an overpayment is REJECTED unless explicitly acknowledged", async () => {
    const { invoice } = await seedInvoice(1000);

    const blocked = await pay(invoice.id, 1500);
    expect(blocked.valid).toBe(false);
    expect((await services.paymentService.getSummaryForInvoice(invoice.id)).totalPaid).toBe(0);

    const allowed = await pay(invoice.id, 1500, { allowOverpayment: true });
    expect(allowed.valid).toBe(true);

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary.status).toBe("overpaid");
    // Remaining balance is deliberately NOT floored at zero — the
    // negative IS the overpayment, and losing it would hide money owed
    // back to the customer.
    expect(summary.remainingBalance).toBe(-500);
    // The invoice still reads "paid" to a user; "overpaid" is a
    // payment-level distinction.
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");
  });

  test("a zero or negative payment is rejected", async () => {
    const { invoice } = await seedInvoice(1000);
    expect((await pay(invoice.id, 0)).valid).toBe(false);
    expect((await pay(invoice.id, -50)).valid).toBe(false);
  });

  test("method, date, reference and notes round-trip", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 250, {
      method: "zelle", paymentDate: "2026-04-09", referenceNumber: "ZL-99", notes: "Deposit",
    });
    const [p] = await services.paymentService.listForInvoice(invoice.id);
    expect(p).toMatchObject({ amount: 250, method: "zelle", paymentDate: "2026-04-09", referenceNumber: "ZL-99", notes: "Deposit" });
  });
});

describe("Editing and deleting payments", () => {
  test("editing an amount rebuilds the balance and status", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 1000);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");

    const [p] = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.update(p.id, { amount: 250 });

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    // 250, not 1250 — a full rebuild, never an increment.
    expect(summary).toMatchObject({ totalPaid: 250, remainingBalance: 750, status: "partial" });
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");
  });

  test("deleting a payment restores the balance and walks the status back", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 400);
    await pay(invoice.id, 600);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");

    const payments = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.softDelete(payments[0].id, "Cheque bounced");

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary.totalPaid).toBe(600);
    expect(summary.remainingBalance).toBe(400);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");
  });

  test("deleting every payment returns the invoice to unpaid", async () => {
    // Due date far in the future so this asserts the PAYMENT effect
    // rather than accidentally testing the overdue rule — the shared
    // seed's 2026-04-30 due date is in the past, which correctly makes
    // an unpaid issued invoice read "overdue" and would make this test
    // depend on the wall clock.
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Unpay Test" });
    const invoice = await services.invoiceService.createStandalone({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
      lineItems: [{ name: "Work", description: null, quantity: 1, unitPrice: 1000 }],
      issueDate: "2026-04-01", dueDate: "2099-12-31",
    });
    await services.invoiceService.changeStatus(invoice.id, "sent");

    await pay(invoice.id, 1000);
    const [p] = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.softDelete(p.id, "Recorded against the wrong invoice");

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary).toMatchObject({ totalPaid: 0, remainingBalance: 1000, status: "unpaid" });
    // Back to its lifecycle status, not stuck on a stale "paid".
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("sent");
  });

  test("an unpaid issued invoice past its due date reads overdue, and a payment clears that", async () => {
    // The complement of the test above: the seed's due date IS past, so
    // this pins the precedence rule — money beats the calendar.
    const { invoice } = await seedInvoice(1000);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("overdue");

    await pay(invoice.id, 1000);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");
  });

  test("a deleted payment leaves the history and is excluded from totals", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 300);
    const [p] = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.softDelete(p.id, "Duplicate entry");

    expect(await services.paymentService.listForInvoice(invoice.id)).toHaveLength(0);
    expect((await services.paymentService.getSummaryForInvoice(invoice.id)).totalPaid).toBe(0);
  });

  test("deleting requires a reason", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 100);
    const [p] = await services.paymentService.listForInvoice(invoice.id);
    await expect(services.paymentService.softDelete(p.id, "")).rejects.toThrow();
  });

  test("restoring a deleted payment brings its amount back", async () => {
    const { invoice } = await seedInvoice(1000);
    await pay(invoice.id, 400);
    const [p] = await services.paymentService.listForInvoice(invoice.id);

    await services.paymentService.softDelete(p.id, "Testing restore");
    expect((await services.paymentService.getSummaryForInvoice(invoice.id)).totalPaid).toBe(0);

    await services.paymentService.restore(p.id);
    expect((await services.paymentService.getSummaryForInvoice(invoice.id)).totalPaid).toBe(400);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");
  });
});

describe("Payments agree across every surface", () => {
  test("the invoice, the payment summary, and the financial engine all report the same collected figure", async () => {
    const { project, invoice } = await seedInvoice(1000);
    await pay(invoice.id, 650);

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    const financials = await services.financialEngine.getProjectFinancials(project.id);

    // Invoice detail / Customer Portal read the summary; Dashboard and
    // Reports read the engine. Both must land on 650.
    expect(summary.totalPaid).toBe(650);
    expect(financials.amountPaid).toBe(650);
    expect(financials.remainingBalance).toBe(summary.remainingBalance);
  });

  test("a deleted payment disappears from the engine too, not just the invoice", async () => {
    const { project, invoice } = await seedInvoice(1000);
    await pay(invoice.id, 650);
    const [p] = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.softDelete(p.id, "Refunded to customer");

    expect((await services.financialEngine.getProjectFinancials(project.id)).amountPaid).toBe(0);
    expect((await services.paymentService.getSummaryForInvoice(invoice.id)).totalPaid).toBe(0);
  });

  test("editing an amount keeps the engine in step with the invoice", async () => {
    const { project, invoice } = await seedInvoice(1000);
    await pay(invoice.id, 200);
    const [p] = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.update(p.id, { amount: 900 });

    const summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    const financials = await services.financialEngine.getProjectFinancials(project.id);
    expect(summary.totalPaid).toBe(900);
    expect(financials.amountPaid).toBe(900);
  });
});

describe("Permission enforcement", () => {
  test("the matrix gates who may record and delete payments", () => {
    const { validationService } = services;
    expect(validationService.validatePermission("accountant", "payment", "create").valid).toBe(true);
    expect(validationService.validatePermission("office", "payment", "create").valid).toBe(true);
    // Sales can see what's been collected but must not record or remove it.
    expect(validationService.validatePermission("sales", "payment", "view").valid).toBe(true);
    expect(validationService.validatePermission("sales", "payment", "create").valid).toBe(false);
    expect(validationService.validatePermission("sales", "payment", "delete").valid).toBe(false);
    expect(validationService.validatePermission("subcontractor", "payment", "view").valid).toBe(false);
  });
});
