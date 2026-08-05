/**
 * getCompanyFinancials must respect its dateRange — even when many
 * calls for DIFFERENT ranges run concurrently.
 *
 * WHY THIS EXISTS
 * The Dashboard calls getCompanyFinancials thirteen times on every
 * load: once for the selected range, then once per month for the
 * 12-month chart. Each call was re-fetching every invoice, expense and
 * payment in the company — 138 requests from 11 distinct URLs.
 *
 * Those fetches are range-INDEPENDENT (they pull the whole history;
 * the range is applied in memory afterwards), so the engine now shares
 * one in-flight fetch across concurrent calls. The obvious hazard is
 * that sharing leaks one call's date filtering into another's result —
 * which would silently corrupt every figure on the dashboard chart.
 *
 * These tests exist to prove it does not. If someone ever adds the
 * dateRange to one of those underlying queries (making the fetch
 * range-DEPENDENT) without also adding it to the coalescing key, the
 * concurrent test below fails.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";

const COMPANY_ID = "range-co";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

const monthRange = (year: number, month: number) => ({
  start: new Date(year, month, 1),
  end: new Date(year, month + 1, 0),
});

/** One invoice per month, each paid in that same month, so every
 * month's revenue is a distinct, checkable number. */
async function seedOnePaymentPerMonth(amounts: Record<number, number>) {
  const project = await services.projectService.create({ companyId: COMPANY_ID, clientId: "client-1", name: "Range Job" });

  for (const [monthStr, amount] of Object.entries(amounts)) {
    const month = Number(monthStr);
    const estimate = await services.estimateService.create({
      companyId: COMPANY_ID, projectId: project.id, clientId: "client-1", title: `M${month}`,
      lineItems: [{ category: "material", name: "Work", description: null, quantity: 1, unitPrice: amount, taxable: false }],
      markup: 0, discount: 0, taxRate: 0,
    });
    const day = `2026-${String(month + 1).padStart(2, "0")}-15`;
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: day, dueDate: day });
    await services.invoiceService.changeStatus(invoice.id, "sent");
    await services.paymentService.record({
      companyId: COMPANY_ID, invoiceId: invoice.id, amount, method: "check", paymentDate: day,
    });
  }
  return project;
}

describe("getCompanyFinancials respects its dateRange", () => {
  test("each month returns only ITS OWN revenue when called one at a time", async () => {
    await seedOnePaymentPerMonth({ 0: 100, 1: 250, 2: 400 });

    const jan = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 0) });
    const feb = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 1) });
    const mar = await services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 2) });

    expect(jan.totalRevenue).toBe(100);
    expect(feb.totalRevenue).toBe(250);
    expect(mar.totalRevenue).toBe(400);
  });

  test("CONCURRENT calls for different ranges do not contaminate each other", async () => {
    // The exact shape useDashboardData uses: Promise.all over 12
    // months. If the shared in-flight fetch leaked one call's filtering
    // into another, these would all collapse to the same number.
    await seedOnePaymentPerMonth({ 0: 100, 1: 250, 2: 400, 3: 50 });

    const results = await Promise.all(
      [0, 1, 2, 3].map((m) =>
        services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, m) })
      )
    );

    expect(results.map((r) => r.totalRevenue)).toEqual([100, 250, 400, 50]);
    // …and they are genuinely distinct, not coincidentally equal.
    expect(new Set(results.map((r) => r.totalRevenue)).size).toBe(4);
  });

  test("a month with no activity reports zero, not the neighbouring month's figures", async () => {
    await seedOnePaymentPerMonth({ 0: 100, 2: 400 });

    const [jan, feb, mar] = await Promise.all([
      services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 0) }),
      services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 1) }),
      services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 2) }),
    ]);

    expect(jan.totalRevenue).toBe(100);
    expect(feb.totalRevenue).toBe(0); // empty month must stay empty
    expect(mar.totalRevenue).toBe(400);
  });

  test("a wide range still sums every month inside it", async () => {
    await seedOnePaymentPerMonth({ 0: 100, 1: 250, 2: 400 });

    const [wide, ...months] = await Promise.all([
      services.financialEngine.getCompanyFinancials({
        companyId: COMPANY_ID,
        dateRange: { start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) },
      }),
      ...[0, 1, 2].map((m) =>
        services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, m) })
      ),
    ]);

    expect(wide.totalRevenue).toBe(750);
    // The whole-year figure equals the sum of its months — the property
    // the dashboard's stat tiles and its chart must agree on.
    expect(months.reduce((s, m) => s + m.totalRevenue, 0)).toBe(wide.totalRevenue);
  });

  test("totalInvoiced is period-scoped too, and stays so under concurrency", async () => {
    // `totalInvoiced` is scoped to the range BY ISSUE DATE, on purpose:
    // it is one side of `totalOutstanding`, whose other side
    // (`totalPaid`) is period-scoped cash. Both must span the same
    // window or the difference is meaningless — see getCompanyFinancials'
    // own comment. So a narrow range legitimately reports less.
    await seedOnePaymentPerMonth({ 0: 100, 1: 250 });

    const [jan, feb, year] = await Promise.all([
      services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 0) }),
      services.financialEngine.getCompanyFinancials({ companyId: COMPANY_ID, dateRange: monthRange(2026, 1) }),
      services.financialEngine.getCompanyFinancials({
        companyId: COMPANY_ID,
        dateRange: { start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) },
      }),
    ]);

    // Each range sees only its own invoices — the proof that a shared
    // in-flight fetch did not leak one call's filtering into another.
    expect(jan.totalInvoiced).toBe(100);
    expect(feb.totalInvoiced).toBe(250);
    expect(year.totalInvoiced).toBe(350);
    expect(jan.totalInvoiced + feb.totalInvoiced).toBe(year.totalInvoiced);
  });
});
