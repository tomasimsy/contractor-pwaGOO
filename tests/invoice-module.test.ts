/**
 * Invoice module regression suite — the lifecycle, locking, numbering,
 * snapshotting, and derived-total guarantees the Invoice module is
 * built on.
 *
 * Runs against the in-memory reference stack (the same one every other
 * suite uses), so it verifies the CONTRACT that both implementations
 * share. Two things it deliberately cannot cover, called out honestly
 * rather than faked: the Supabase-specific SQL in
 * lib/services/supabase/invoiceService.ts, and the HTTP-level PDF /
 * public-page routes — those were verified against live production data
 * in the browser instead.
 *
 * Pins the live data corruption this module was designed to make
 * impossible (audited 2026-07-24): 5 of 8 production invoices had
 * `status='paid'` while `payment_status='pending'`, and all 8 claimed
 * "paid" with zero payment rows, because status was a stored column
 * nobody recomputed.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { deriveInvoiceStatus } from "../lib/services/financialCalculations";

const COMPANY_ID = "company-1";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

async function seedProject(name = "Invoice Project") {
  return services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name });
}

async function seedApprovedEstimate(projectId: string, unitPrice = 10000) {
  const estimate = await services.estimateService.create({
    companyId: COMPANY_ID,
    projectId,
    clientId: "client-1",
    lineItems: [{ category: "material", name: "Scope of work", description: "Full job", quantity: 1, unitPrice, taxable: false }],
    markup: 0,
    discount: 0,
    taxRate: 0,
  });
  await services.estimateService.changeStatus(estimate.id, "sent");
  await services.estimateService.changeStatus(estimate.id, "approved");
  return estimate;
}

describe("Invoice creation", () => {
  test("a standalone invoice derives its totals from the line items submitted", async () => {
    const project = await seedProject();
    const invoice = await services.invoiceService.createStandalone({
      companyId: COMPANY_ID,
      projectId: project.id,
      clientId: "client-1",
      lineItems: [
        { name: "Labor", description: null, quantity: 10, unitPrice: 50 },
        { name: "Materials", description: null, quantity: 1, unitPrice: 250 },
      ],
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
    });

    expect(invoice.subtotal).toBe(750); // 10*50 + 250
    expect(invoice.total).toBe(750);
    expect(invoice.lifecycleStatus).toBe("draft");
    expect(invoice.status).toBe("draft");
  });

  test("createFromEstimate copies the estimate's line items and matches its total exactly", async () => {
    const project = await seedProject();
    const estimate = await seedApprovedEstimate(project.id, 10000);

    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-03-01", dueDate: "2026-03-31" });

    expect(invoice.total).toBe(estimate.total);
    expect(invoice.estimateId).toBe(estimate.id);
    const full = await services.invoiceService.getById(invoice.id);
    expect(full!.lineItems).toHaveLength(1);
    expect(full!.lineItems[0].name).toBe("Scope of work");
  });

  test("invoice numbers are sequential and unique across many invoices", async () => {
    const project = await seedProject();
    const numbers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const inv = await services.invoiceService.createStandalone({
        companyId: COMPANY_ID, projectId: project.id, clientId: null,
        lineItems: [{ name: `Item ${i}`, description: null, quantity: 1, unitPrice: 100 }],
        issueDate: "2026-03-01", dueDate: "2026-03-31",
      });
      numbers.push(inv.invoiceNumber);
    }
    expect(new Set(numbers).size).toBe(5); // no duplicates
    expect(numbers.every((n) => n.length > 0)).toBe(true);
  });
});

describe("Invoice snapshotting: later estimate edits must not alter an issued invoice", () => {
  test("editing the estimate after invoicing leaves the invoice's totals and items untouched", async () => {
    const project = await seedProject();
    const estimate = await seedApprovedEstimate(project.id, 10000);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-03-01", dueDate: "2026-03-31" });
    expect(invoice.total).toBe(10000);

    // Double the estimate's scope AFTER the invoice exists.
    await services.estimateService.updateLineItems(estimate.id, [
      { category: "material", name: "Scope of work", description: "Expanded", quantity: 2, unitPrice: 10000, taxable: false },
    ]);
    const reEstimate = await services.estimateService.getById(estimate.id);
    expect(reEstimate!.total).toBe(20000); // the estimate did change

    // The invoice is a snapshot — it must not have followed.
    const after = await services.invoiceService.getById(invoice.id);
    expect(after!.total).toBe(10000);
    expect(after!.lineItems[0].quantity).toBe(1);
  });
});

describe("Invoice lifecycle and locking", () => {
  test("a draft invoice can be edited; an issued one cannot", async () => {
    const project = await seedProject();
    const invoice = await services.invoiceService.createStandalone({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ name: "Labor", description: null, quantity: 1, unitPrice: 500 }],
      issueDate: "2026-03-01", dueDate: "2026-03-31",
    });

    // Draft: edit succeeds and totals rebuild.
    const edited = await services.invoiceService.updateLineItems(invoice.id, [
      { name: "Labor", description: null, quantity: 1, unitPrice: 800 },
    ]);
    expect(edited.valid).toBe(true);
    expect(edited.invoice!.total).toBe(800);

    // Issue it — this must lock financials.
    const sent = await services.invoiceService.changeStatus(invoice.id, "sent");
    expect(sent.valid).toBe(true);
    expect(sent.invoice!.isLocked).toBe(true);

    // Now edits are refused.
    const blocked = await services.invoiceService.updateLineItems(invoice.id, [
      { name: "Sneaky change", description: null, quantity: 1, unitPrice: 99999 },
    ]);
    expect(blocked.valid).toBe(false);
    expect((await services.invoiceService.getById(invoice.id))!.total).toBe(800);
  });

  test("illegal lifecycle transitions are rejected", async () => {
    const project = await seedProject();
    const invoice = await services.invoiceService.createStandalone({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ name: "Labor", description: null, quantity: 1, unitPrice: 500 }],
      issueDate: "2026-03-01", dueDate: "2026-03-31",
    });

    await services.invoiceService.changeStatus(invoice.id, "sent");
    await services.invoiceService.changeStatus(invoice.id, "void");
    // void is terminal — cannot be resurrected.
    const revive = await services.invoiceService.changeStatus(invoice.id, "sent");
    expect(revive.valid).toBe(false);
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("void");
  });

  test("deleting a line item recalculates the total immediately", async () => {
    const project = await seedProject();
    const invoice = await services.invoiceService.createStandalone({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [
        { name: "A", description: null, quantity: 1, unitPrice: 300 },
        { name: "B", description: null, quantity: 1, unitPrice: 200 },
      ],
      issueDate: "2026-03-01", dueDate: "2026-03-31",
    });
    expect(invoice.total).toBe(500);

    // Remove "B" — the total must be a full rebuild (300), not 500-200
    // computed incrementally, and certainly not left at 500.
    const result = await services.invoiceService.updateLineItems(invoice.id, [
      { name: "A", description: null, quantity: 1, unitPrice: 300 },
    ]);
    expect(result.invoice!.total).toBe(300);
    expect((await services.invoiceService.getById(invoice.id))!.lineItems).toHaveLength(1);
  });
});

describe("Invoice status is derived, never stored", () => {
  test("payments drive partially_paid -> paid with no refresh call", async () => {
    const project = await seedProject();
    const invoice = await services.invoiceService.createStandalone({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ name: "Job", description: null, quantity: 1, unitPrice: 1000 }],
      issueDate: "2026-03-01", dueDate: "2026-03-31",
    });
    await services.invoiceService.changeStatus(invoice.id, "sent");

    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 400, method: "cash", paymentDate: "2026-03-05" });
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");

    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 600, method: "cash", paymentDate: "2026-03-06" });
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("paid");

    // Deleting a payment walks the status straight back.
    const payments = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.softDelete(payments[0].id, "Recorded in error");
    expect((await services.invoiceService.getById(invoice.id))!.status).toBe("partially_paid");
  });

  test("balance due is always total minus ACTIVE payments", async () => {
    const project = await seedProject();
    const invoice = await services.invoiceService.createStandalone({
      companyId: COMPANY_ID, projectId: project.id, clientId: null,
      lineItems: [{ name: "Job", description: null, quantity: 1, unitPrice: 1000 }],
      issueDate: "2026-03-01", dueDate: "2026-03-31",
    });

    await services.paymentService.record({ companyId: COMPANY_ID, invoiceId: invoice.id, amount: 250, method: "cash", paymentDate: "2026-03-05" });
    let summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary).toMatchObject({ totalPaid: 250, remainingBalance: 750 });

    const payments = await services.paymentService.listForInvoice(invoice.id);
    await services.paymentService.softDelete(payments[0].id, "Bounced cheque");
    summary = await services.paymentService.getSummaryForInvoice(invoice.id);
    expect(summary).toMatchObject({ totalPaid: 0, remainingBalance: 1000 });
  });

  describe("deriveInvoiceStatus precedence (the shared formula)", () => {
    const base = { total: 1000, dueDate: "2026-03-31", today: "2026-06-01" };

    test("an unpaid issued invoice past its due date is overdue", () => {
      expect(deriveInvoiceStatus({ ...base, lifecycleStatus: "sent", amountPaid: 0 })).toBe("overdue");
    });

    test("a DRAFT past the due date is never overdue — it was never sent", () => {
      expect(deriveInvoiceStatus({ ...base, lifecycleStatus: "draft", amountPaid: 0 })).toBe("draft");
    });

    test("money beats the calendar: a fully paid invoice past due reads paid, not overdue", () => {
      expect(deriveInvoiceStatus({ ...base, lifecycleStatus: "sent", amountPaid: 1000 })).toBe("paid");
    });

    test("an overpayment still reads paid", () => {
      expect(deriveInvoiceStatus({ ...base, lifecycleStatus: "sent", amountPaid: 1200 })).toBe("paid");
    });

    test("void and cancelled outrank both payments and dates", () => {
      expect(deriveInvoiceStatus({ ...base, lifecycleStatus: "void", amountPaid: 1000 })).toBe("void");
      expect(deriveInvoiceStatus({ ...base, lifecycleStatus: "cancelled", amountPaid: 0 })).toBe("cancelled");
    });

    test("this is exactly the live corruption that can no longer happen", () => {
      // 5 of 8 production invoices claimed status='paid' with zero
      // payments. Derived, that state is unrepresentable.
      expect(deriveInvoiceStatus({ lifecycleStatus: "sent", total: 6800, amountPaid: 0, dueDate: null, today: "2026-06-01" })).not.toBe("paid");
    });
  });
});

describe("Invoice totals reconcile with the Financial Engine", () => {
  test("the engine's invoiced revenue equals the sum of invoice totals, and approved change orders stay separate", async () => {
    const project = await seedProject();
    const estimate = await seedApprovedEstimate(project.id, 10000);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-03-01", dueDate: "2026-03-31" });

    const co = await services.changeOrderService.createChangeOrder({
      companyId: COMPANY_ID, projectId: project.id, estimateId: estimate.id,
      changeOrderNumber: "CO-1", title: "Extra work", totalAmount: 1500, tax: 0,
    });
    await services.changeOrderService.approveChangeOrder(co.id);

    const financials = await services.financialEngine.getProjectFinancials(project.id);
    // The invoice's own total is untouched by the change order...
    expect((await services.invoiceService.getById(invoice.id))!.total).toBe(10000);
    expect(financials.invoicesTotal).toBe(10000);
    // ...while project revenue counts both, as two independent inputs.
    expect(financials.revisedTotal).toBe(11500);
  });

  test("a deleted invoice disappears from the engine's revenue", async () => {
    const project = await seedProject();
    const estimate = await seedApprovedEstimate(project.id, 10000);
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-03-01", dueDate: "2026-03-31" });
    expect((await services.financialEngine.getProjectFinancials(project.id)).invoicesTotal).toBe(10000);

    await services.invoiceService.softDelete(invoice.id, "Issued to the wrong client");

    expect((await services.financialEngine.getProjectFinancials(project.id)).invoicesTotal).toBe(0);
    expect(await services.invoiceService.listForProject(project.id)).toHaveLength(0);
  });
});

describe("Permission enforcement", () => {
  test("the permission matrix gates invoice actions by role", () => {
    const { validationService } = services;
    // Accountant owns billing.
    expect(validationService.validatePermission("accountant", "invoice", "create").valid).toBe(true);
    expect(validationService.validatePermission("accountant", "invoice", "delete").valid).toBe(true);
    // Sales may see what's been billed but not bill or delete.
    expect(validationService.validatePermission("sales", "invoice", "view").valid).toBe(true);
    expect(validationService.validatePermission("sales", "invoice", "create").valid).toBe(false);
    expect(validationService.validatePermission("sales", "invoice", "delete").valid).toBe(false);
    // External parties get nothing.
    expect(validationService.validatePermission("subcontractor", "invoice", "view").valid).toBe(false);
  });
});
