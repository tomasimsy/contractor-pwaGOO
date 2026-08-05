/**
 * Regression test for the 2026-08-02 fix to
 * InvoiceService.createFromEstimate's roofing branch
 * (ESTIMATE_TO_INVOICE_CONVERSION_AUDIT.md): a roofing estimate's
 * subtotal is area line items PLUS each area's estimated_repair_cost,
 * but the invoice conversion only ever copied the line items, silently
 * dropping the repair-cost figure from the resulting invoice.
 *
 * This exercises the REAL `createSupabaseInvoiceService` implementation
 * (lib/services/supabase/invoiceService.ts) against a minimal fake
 * Postgrest-shaped Supabase client.
 *
 * UPDATED for the scope-lines refactor. InvoiceService no longer knows
 * what a roof area IS: it asks `EstimateService.getScopeLines`, which
 * owns the "area line items PLUS estimated_repair_cost" composition
 * rule in one place. These tests therefore now assert the same money
 * through that seam — the repair cost still has to reach the invoice,
 * and a standard estimate still must not go anywhere near roofing
 * data. Both guarantees survive the refactor; only the wiring moved.
 */
import { describe, test, expect } from "vitest";
import { createSupabaseInvoiceService } from "../lib/services/supabase/invoiceService";
import { createValidationService } from "../lib/services/validationService";
import type { EstimateService } from "../lib/services/estimateService";
import type { ChangeOrderService } from "../lib/services/changeOrderService";
import type { AuditService } from "../lib/services/auditService";

const COMPANY_ID = "company-1";
const PROJECT_ID = "project-1";
const CLIENT_ID = "client-1";
const ESTIMATE_ID = "estimate-1";
const AREA_ID = "area-1";

/**
 * Minimal fake Postgrest-shaped client: supports exactly the
 * .from(table).select()/.eq()/.ilike()/.is()/.insert()/.select()/.single()
 * chain shape createFromEstimate's write path (insertInvoice +
 * sumActivePayments) actually calls, backed by plain in-memory arrays
 * per table. Not a general-purpose Supabase mock — scoped to this test.
 */
function createFakeSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
  function from(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    let insertRows: Array<Record<string, unknown>> | null = null;
    let wantsSingle = false;

    const api = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push(["eq", col, val]);
        return api;
      },
      ilike(col: string, val: string) {
        filters.push(["ilike", col, val]);
        return api;
      },
      is(col: string, val: unknown) {
        filters.push(["is", col, val]);
        return api;
      },
      insert(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
        insertRows = Array.isArray(rows) ? rows : [rows];
        return api;
      },
      single() {
        wantsSingle = true;
        return exec();
      },
      then(onFulfilled: (v: { data: unknown; error: null }) => unknown, onRejected?: (e: unknown) => unknown) {
        return exec().then(onFulfilled, onRejected);
      },
    };

    async function exec(): Promise<{ data: unknown; error: null }> {
      if (insertRows) {
        const inserted = insertRows.map((row, i) => ({
          id: `${table}-${tables[table].length + i}`,
          created_at: new Date().toISOString(),
          ...row,
        }));
        tables[table].push(...inserted);
        return { data: wantsSingle ? inserted[0] : inserted, error: null };
      }
      let rows = tables[table] ?? [];
      for (const [op, col, val] of filters) {
        if (op === "eq") rows = rows.filter((r) => r[col] === val);
        if (op === "is") rows = rows.filter((r) => (val === null ? r[col] == null : r[col] === val));
        if (op === "ilike") {
          const needle = String(val).replace(/%/g, "");
          rows = rows.filter((r) => typeof r[col] === "string" && (r[col] as string).startsWith(needle));
        }
      }
      return { data: wantsSingle ? (rows[0] ?? null) : rows, error: null };
    }

    return api;
  }

  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("Roofing estimate -> invoice conversion includes estimated_repair_cost", () => {
  test("area line items + repair cost + approved change order + markup/discount/tax all land on the invoice", async () => {
    const tables = { invoices: [], invoice_items: [], invoice_payments: [] } as Record<string, Array<Record<string, unknown>>>;
    const supabase = createFakeSupabase(tables);
    const validationService = createValidationService();

    // ---- Estimate: subtotal MUST already equal line items + repair
    // cost, exactly as EstimateService.calculateRoofingAreasSubtotal
    // computes it — this test fakes that computed value directly
    // rather than re-deriving it, since EstimateService's own math is
    // out of scope here (already covered elsewhere); this test is
    // about whether InvoiceService carries it forward correctly.
    const lineItemsSubtotal = 200 + 50; // Shingles (10 x $20) + Flashing (5 x $10)
    const repairCost = 100; // materials + labor + tax, one area
    const estimateSubtotal = lineItemsSubtotal + repairCost; // 350 — what EstimateService actually stores
    const markup = 40; // flat dollar amount
    const discount = 20; // flat dollar amount
    const taxRate = 10; // percent
    // taxedBase = 350 + 40 - 20 = 370; tax = 37; estimate total = 407
    const estimate = {
      id: ESTIMATE_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      clientId: CLIENT_ID,
      estimateNumber: "EST-1",
      title: "Roof replacement",
      description: null,
      status: "approved" as const,
      subtotal: estimateSubtotal,
      markup,
      discount,
      taxRate,
      total: 407,
      depositAmount: 0,
      signature: null,
      customerToken: null,
      createdBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedBy: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
      lineItems: [],
      estimateType: "roofing" as const,
    };

    const estimateServiceFake: Partial<EstimateService> = {
      async getById() {
        return estimate;
      },
      // The scope EstimateService would resolve for this roofing
      // estimate: two area line items ($200 + $50) plus the area's
      // own estimated_repair_cost — the figure the original bug
      // dropped.
      async getScopeLines() {
        return [
          { id: "area-line-1", category: "material", name: "Shingles", description: null, quantity: 10, unitPrice: 20, unit: "SQ", total: 200, source: "area_line_item", areaId: AREA_ID, areaName: "Front Slope" },
          { id: "area-line-2", category: "material", name: "Flashing", description: null, quantity: 5, unitPrice: 10, unit: "LF", total: 50, source: "area_line_item", areaId: AREA_ID, areaName: "Front Slope" },
          { id: AREA_ID, category: "other", name: "Front Slope - Estimated Repair Cost", description: "Materials + labor + tax carried from approved estimate", quantity: 1, unitPrice: repairCost, unit: null, total: repairCost, source: "area_repair_cost", areaId: AREA_ID, areaName: "Front Slope" },
        ];
      },
    };

    const changeOrderServiceFake: Partial<ChangeOrderService> = {
      async listForEstimate() {
        return [
          {
            id: "co-1", companyId: COMPANY_ID, projectId: PROJECT_ID, estimateId: ESTIMATE_ID,
            changeOrderNumber: "CO-1", title: "Extra flashing", description: null, status: "approved" as const,
            totalAmount: 50, tax: 5, approvedAt: "2026-01-02T00:00:00.000Z", signature: null,
            createdBy: null, createdAt: "2026-01-01T00:00:00.000Z", updatedBy: null, updatedAt: "2026-01-01T00:00:00.000Z",
            deletedBy: null, deletedAt: null, deleteReason: null,
          },
        ];
      },
      async listApprovedChangeOrders() {
        return [];
      },
    };

    const auditServiceFake: Partial<AuditService> = {
      async recordStatusChange() {},
    };

    const invoiceService = createSupabaseInvoiceService(
      supabase,
      validationService,
      auditServiceFake as AuditService,
      async () => null,
      estimateServiceFake as EstimateService,
      changeOrderServiceFake as ChangeOrderService,
      () => "2026-01-15"
    );

    const invoice = await invoiceService.createFromEstimate(ESTIMATE_ID, { issueDate: "2026-01-15", dueDate: "2026-02-15" });

    // ---- 1. Every input category landed on the invoice ----
    const items = tables.invoice_items as Array<{ name: string; unit_price: number; total: number }>;
    expect(items.some((i) => i.name === "Shingles")).toBe(true);
    expect(items.some((i) => i.name === "Flashing")).toBe(true);
    const repairLine = items.find((i) => i.name === "Front Slope - Estimated Repair Cost");
    expect(repairLine).toBeDefined();
    expect(repairLine!.unit_price).toBe(repairCost);
    expect(repairLine!.total).toBe(repairCost);
    expect(items.some((i) => i.name === "Change Order CO-1")).toBe(true);
    expect(items.some((i) => i.name === "Markup")).toBe(true); // 40 - 20 = +20 net -> "Markup"

    // ---- 2. Invoice subtotal (before change orders / markup-discount)
    // matches the estimate's own subtotal ----
    const nonAdjustmentTotal = items
      .filter((i) => i.name !== "Change Order CO-1" && i.name !== "Markup" && i.name !== "Discount")
      .reduce((sum, i) => sum + i.total, 0);
    expect(nonAdjustmentTotal).toBe(estimateSubtotal); // 350 — the exact figure that was previously short

    // ---- 3. Invoice total matches expected conversion rules ----
    // invoice.subtotal = lineItems(250) + repairCost(100) + changeOrder(55) + markupNet(20) = 425
    // invoice.tax = estimate's flat tax = 37 (taxedBase 370 * 10%)
    // invoice.total = 425 + 37 = 462, which equals estimate.total (407) + approved CO revenue (55)
    expect(invoice.subtotal).toBe(425);
    expect(invoice.tax).toBe(37);
    expect(invoice.total).toBe(462);
    expect(invoice.total).toBe(estimate.total + 55); // revised-estimate-total identity
  });

  test("drift protection guard still holds: change-order line total always reconciles with sumApprovedChangeOrderRevenue", async () => {
    // The guard in createFromEstimate compares the change-order lines it
    // just built against sumApprovedChangeOrderRevenue(changeOrders) —
    // both derived from the SAME listForEstimate() result, using the
    // SAME calculateChangeOrderRevenue formula. This fix touches only
    // the roofing-area line-item gathering above that guard; asserting
    // the guard doesn't fire on a normal roofing conversion with a real
    // approved change order (as in the test above) is exactly what
    // proves it's undisturbed — a change to the guard's own logic would
    // make that test throw instead of asserting cleanly on totals.
    // This test additionally pins the formula the guard relies on.
    const { calculateChangeOrderRevenue, sumApprovedChangeOrderRevenue } = await import("../lib/services/financialCalculations");
    const co = { status: "approved" as const, totalAmount: 50, tax: 5 };
    expect(sumApprovedChangeOrderRevenue([co])).toBe(calculateChangeOrderRevenue(co.totalAmount, co.tax));
  });

  test("standard (non-roofing) estimate conversion is unaffected by the roofing fix", async () => {
    const tables = { invoices: [], invoice_items: [], invoice_payments: [] } as Record<string, Array<Record<string, unknown>>>;
    const supabase = createFakeSupabase(tables);
    const validationService = createValidationService();

    // subtotal = 2 line items (300 + 150) = 450; markup 50, discount 0, tax 10% -> taxedBase 500, tax 50, total 550
    const estimate = {
      id: ESTIMATE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, clientId: CLIENT_ID,
      estimateNumber: "EST-3", title: null, description: null, status: "approved" as const,
      subtotal: 450, markup: 50, discount: 0, taxRate: 10, total: 550, depositAmount: 0,
      signature: null, customerToken: null, createdBy: null, createdAt: "2026-01-01T00:00:00.000Z",
      updatedBy: null, updatedAt: "2026-01-01T00:00:00.000Z", deletedBy: null, deletedAt: null, deleteReason: null,
      lineItems: [
        { id: "li-1", category: "material" as const, name: "Paint", description: null, quantity: 3, unitPrice: 100, total: 300, taxable: true },
        { id: "li-2", category: "labor" as const, name: "Prep", description: null, quantity: 1, unitPrice: 150, total: 150, taxable: true },
      ],
      estimateType: "standard" as const,
    };

    const estimateServiceFake: Partial<EstimateService> = {
      async getById() { return estimate; },
      // A standard estimate's scope is its own line items, and nothing
      // roofing-shaped may appear. InvoiceService can no longer reach
      // roofing services at all — it doesn't hold them — so this is now
      // guaranteed structurally, not just by convention.
      async getScopeLines() {
        return estimate.lineItems.map((li) => ({
          id: li.id, category: li.category, name: li.name, description: li.description,
          quantity: li.quantity, unitPrice: li.unitPrice, unit: null, total: li.total,
          source: "estimate_item" as const, areaId: null, areaName: null,
        }));
      },
    };
    const changeOrderServiceFake: Partial<ChangeOrderService> = {
      async listForEstimate() {
        return [];
      },
    };
    const auditServiceFake: Partial<AuditService> = { async recordStatusChange() {} };

    const invoiceService = createSupabaseInvoiceService(
      supabase, validationService, auditServiceFake as AuditService, async () => null,
      estimateServiceFake as EstimateService, changeOrderServiceFake as ChangeOrderService,
      () => "2026-01-15"
    );

    const invoice = await invoiceService.createFromEstimate(ESTIMATE_ID, { issueDate: "2026-01-15", dueDate: "2026-02-15" });

    const items = tables.invoice_items as Array<{ name: string; total: number }>;
    expect(items.map((i) => i.name).sort()).toEqual(["Markup", "Paint", "Prep"].sort());
    expect(invoice.subtotal).toBe(500); // 300 + 150 + 50 markup
    expect(invoice.tax).toBe(50);
    expect(invoice.total).toBe(550);
    expect(invoice.total).toBe(estimate.total);
  });
});
