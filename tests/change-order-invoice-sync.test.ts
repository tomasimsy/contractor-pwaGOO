/**
 * Change Order -> Invoice synchronization —
 * lib/services/changeOrderInvoiceSync.ts.
 *
 * The bug: signing an estimate auto-creates an invoice; approving a
 * change order afterwards grew every INTERNAL figure but never the
 * customer's invoice, so they were billed for the original scope only.
 *
 * The trap: project revenue is `invoicesTotal + approvedChangeOrders`.
 * Billing a change order on the invoice without changing that formula
 * counts the same money twice. Several tests below exist purely to pin
 * that down — they are the reason this feature is safe.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { syncInvoiceWithApprovedChangeOrders, changeOrderIdFromLine } from "../lib/services/changeOrderInvoiceSync";
import { approveChangeOrder as approveViaWorkflow } from "../lib/services/changeOrderWorkflow";
import { signEstimate } from "../lib/services/estimateWorkflow";

const COMPANY_ID = "co-sync-co";
const SIGNATURE = { type: "type" as const, value: "Jane Customer", date: "2026-01-02" };

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

const syncDeps = () => ({
  estimateService: services.estimateService,
  invoiceService: services.invoiceService,
  changeOrderService: services.changeOrderService,
});

/** Approve through the WORKFLOW — the path both staff and the customer
 * portal actually use, so these tests exercise the real wiring. */
const approve = (changeOrderId: string) => approveViaWorkflow(syncDeps(), changeOrderId);

/** A signed estimate with its auto-generated invoice, the state the
 * whole feature builds on. */
async function seedSignedEstimate(quoted = 10_000) {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Sync Job" });
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
    title: "Original scope",
    lineItems: [{ category: "material", name: "Original scope", description: null, quantity: 1, unitPrice: quoted, taxable: false }],
    markup: 0, discount: 0, taxRate: 0,
  });
  await services.estimateService.changeStatus(estimate.id, "sent");
  // The real signing workflow — the same one staff and the portal use,
  // and the thing that auto-creates the invoice this feature syncs.
  const signed = await signEstimate(
    { estimateService: services.estimateService, invoiceService: services.invoiceService, paymentService: services.paymentService, projectService: services.projectService },
    estimate.id,
    SIGNATURE
  );
  expect(signed.ok).toBe(true);
  const invoice = (await services.invoiceService.listForProject(project.id))[0];
  return { project, estimate, invoice };
}

async function addChangeOrder(projectId: string, estimateId: string, number: string, amount: number, tax = 0) {
  return services.changeOrderService.createChangeOrder({
    companyId: COMPANY_ID, projectId, estimateId,
    changeOrderNumber: number, title: `Extra work ${number}`, totalAmount: amount, tax,
  });
}

const invoiceOf = (id: string) => services.invoiceService.getById(id);

describe("1. A signed estimate creates an invoice", () => {
  test("signing generates exactly one invoice for the quoted amount", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);

    expect(await services.invoiceService.listForProject(project.id)).toHaveLength(1);
    expect(invoice.estimateId).toBe(estimate.id);
    expect(invoice.total).toBe(10_000);

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    expect(financials.revisedTotal).toBe(10_000);
  });
});

describe("2. An approved change order updates the invoice", () => {
  test("the customer's invoice grows by the change order amount", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);
    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 2_500);

    // Before approval the invoice is untouched — a PENDING change order
    // is not billable.
    await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);
    expect((await invoiceOf(invoice.id))!.total).toBe(10_000);

    const result = await approve(co.id);
    expect(result.ok).toBe(true);

    const updated = (await invoiceOf(invoice.id))!;
    expect(updated.total).toBe(12_500);
    expect(updated.lineItems).toHaveLength(2);

    // The original scope line survives verbatim; the change order is a
    // new, identifiable line.
    expect(updated.lineItems[0]).toMatchObject({ name: "Original scope", unitPrice: 10_000 });
    const coLine = updated.lineItems.find((li) => changeOrderIdFromLine(li) === co.id)!;
    expect(coLine).toBeDefined();
    expect(coLine.unitPrice).toBe(2_500);
    expect(coLine.name).toContain("CO-1");
  });

  test("a change order's TAX is billed too", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(1_000);
    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 500, 40);

    await approve(co.id);

    expect((await invoiceOf(invoice.id))!.total).toBe(1_540); // 1000 + 500 + 40
  });

  test("no duplicate invoice is ever created", async () => {
    const { project, estimate } = await seedSignedEstimate();
    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 2_500);

    await approve(co.id);
    await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);
    await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);

    expect(await services.invoiceService.listForProject(project.id)).toHaveLength(1);
  });

  test("re-syncing is idempotent — no duplicate line, no inflated total", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);
    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 2_500);
    await approve(co.id);

    await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);
    await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);

    const updated = (await invoiceOf(invoice.id))!;
    expect(updated.lineItems).toHaveLength(2);
    expect(updated.total).toBe(12_500);
  });

  test("revenue is NOT double-counted: the engine stops adding a billed change order", async () => {
    // The whole reason this is safe. invoicesTotal already contains the
    // change order, so approvedChangeOrderTotal must drop it.
    const { project, estimate } = await seedSignedEstimate(10_000);
    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 2_500);
    await approve(co.id);

    const f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.invoicesTotal).toBe(12_500);
    expect(f.approvedChangeOrderTotal).toBe(0); // billed — counted inside the invoice
    expect(f.revisedTotal).toBe(12_500); // NOT 15,000
  });

  test("an approved change order with no invoice yet still counts as revenue", async () => {
    // Unsigned estimate: nothing to bill against, so the change order
    // must keep contributing on its own — never dropped entirely.
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Unsigned" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 8_000, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 1_000);

    const result = await approve(co.id);
    expect(result.ok).toBe(true);

    const f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.invoicesTotal).toBe(0);
    expect(f.approvedChangeOrderTotal).toBe(1_000); // unbilled — counted standalone
    expect(f.revisedTotal).toBe(1_000);
  });
});

describe("3. Existing payments remain unchanged", () => {
  test("payments survive the sync and the balance re-derives from the new total", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);

    const payment = await services.paymentService.record({
      companyId: COMPANY_ID, invoiceId: invoice.id, amount: 4_000, method: "check", paymentDate: "2026-01-10",
    });
    expect(payment.valid).toBe(true);

    const before = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(before).toMatchObject({ totalPaid: 4_000, remainingBalance: 6_000, status: "partial" });

    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 2_500);
    await approve(co.id);

    // The payment itself is byte-for-byte untouched.
    const payments = await services.paymentService.listForInvoice(invoice.id);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(4_000);
    expect(payments[0].deletedAt).toBeNull();

    // Only the balance moves, because the bill grew — 12,500 − 4,000.
    const after = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(after.totalPaid).toBe(4_000);
    expect(after.remainingBalance).toBe(8_500);
    expect(after.status).toBe("partial");

    const f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.amountPaid).toBe(4_000);
    expect(f.remainingBalance).toBe(8_500);
  });

  test("a fully-paid invoice reopens as partially paid rather than losing the payment", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(1_000);
    await services.paymentService.record({
      companyId: COMPANY_ID, invoiceId: invoice.id, amount: 1_000, method: "check", paymentDate: "2026-01-10",
    });
    expect((await services.paymentService.getSummaryForInvoice(invoice.id)).status).toBe("paid");

    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 500);
    await approve(co.id);

    const after = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(after.totalPaid).toBe(1_000); // still collected
    expect(after.remainingBalance).toBe(500); // the new work is now owed
    expect(after.status).toBe("partial");
  });
});

describe("4. Multiple change orders accumulate correctly", () => {
  test("three change orders each add exactly once", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);

    const co1 = await addChangeOrder(project.id, estimate.id, "CO-1", 1_000);
    const co2 = await addChangeOrder(project.id, estimate.id, "CO-2", 2_000);
    const co3 = await addChangeOrder(project.id, estimate.id, "CO-3", 500);

    await approve(co1.id);
    expect((await invoiceOf(invoice.id))!.total).toBe(11_000);

    await approve(co2.id);
    expect((await invoiceOf(invoice.id))!.total).toBe(13_000);

    await approve(co3.id);
    const final = (await invoiceOf(invoice.id))!;
    expect(final.total).toBe(13_500);
    expect(final.lineItems).toHaveLength(4); // original + 3

    // One line per change order, each identifiable and distinct.
    const billedIds = final.lineItems.map(changeOrderIdFromLine).filter(Boolean);
    expect(new Set(billedIds).size).toBe(3);
    expect(billedIds).toEqual(expect.arrayContaining([co1.id, co2.id, co3.id]));

    const f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.revisedTotal).toBe(13_500);
    expect(f.approvedChangeOrderTotal).toBe(0);
  });

  test("approved and unapproved change orders are kept apart", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);
    const approved = await addChangeOrder(project.id, estimate.id, "CO-1", 1_000);
    const pending = await addChangeOrder(project.id, estimate.id, "CO-2", 9_999);

    await approve(approved.id);

    const updated = (await invoiceOf(invoice.id))!;
    expect(updated.total).toBe(11_000); // the pending 9,999 is NOT billed
    expect(updated.lineItems.some((li) => changeOrderIdFromLine(li) === pending.id)).toBe(false);
  });

  test("a rejected change order is never billed", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);
    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 3_000);
    await services.changeOrderService.changeStatus(co.id, "rejected");

    await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);

    expect((await invoiceOf(invoice.id))!.total).toBe(10_000);
  });

  test("deleting an approved change order removes it from the invoice again", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);
    const co1 = await addChangeOrder(project.id, estimate.id, "CO-1", 1_000);
    const co2 = await addChangeOrder(project.id, estimate.id, "CO-2", 2_000);
    await approve(co1.id);
    await approve(co2.id);
    expect((await invoiceOf(invoice.id))!.total).toBe(13_000);

    await services.changeOrderService.softDelete(co2.id, "Customer withdrew the request");
    await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);

    const updated = (await invoiceOf(invoice.id))!;
    expect(updated.total).toBe(11_000);
    expect(updated.lineItems).toHaveLength(2);
    expect(updated.lineItems.some((li) => changeOrderIdFromLine(li) === co2.id)).toBe(false);
  });
});

describe("5. Invoices without approved change orders are never touched", () => {
  test("syncing an estimate with no change orders writes nothing", async () => {
    const { estimate, invoice } = await seedSignedEstimate(10_000);
    const before = (await invoiceOf(invoice.id))!;

    const result = await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("no-approved-change-orders");
    const after = (await invoiceOf(invoice.id))!;
    expect(after.total).toBe(before.total);
    expect(after.updatedAt).toBe(before.updatedAt); // genuinely no write
    expect(after.lineItems).toHaveLength(1);
  });

  test("an estimate with no invoice is a no-op, not an error, and creates nothing", async () => {
    const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "No invoice" });
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1",
      lineItems: [{ category: "material", name: "Scope", description: null, quantity: 1, unitPrice: 500, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });

    const result = await syncInvoiceWithApprovedChangeOrders(syncDeps(), estimate.id);

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("no-invoice");
    expect(await services.invoiceService.listForProject(project.id)).toHaveLength(0);
  });

  test("a LOCKED invoice is reported, never silently rewritten", async () => {
    const { project, estimate, invoice } = await seedSignedEstimate(10_000);
    // Issuing the invoice locks it — the customer has seen this document.
    await services.invoiceService.changeStatus(invoice.id, "sent");
    expect((await invoiceOf(invoice.id))!.isLocked).toBe(true);

    const co = await addChangeOrder(project.id, estimate.id, "CO-1", 2_500);
    const result = await approve(co.id);

    // Approval still succeeds — billing trouble must not lose it.
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/supplemental invoice/i);
    expect((await services.changeOrderService.getById(co.id))!.status).toBe("approved");

    // The issued document is untouched…
    const after = (await invoiceOf(invoice.id))!;
    expect(after.total).toBe(10_000);
    expect(after.lineItems).toHaveLength(1);

    // …and because it was never billed, the change order keeps counting
    // as revenue on its own. The money is not lost.
    const f = await services.financialEngine.getProjectFinancials(project.id);
    expect(f.approvedChangeOrderTotal).toBe(2_500);
    expect(f.revisedTotal).toBe(12_500);
  });
});
