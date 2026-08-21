import { describe, test, expect } from "vitest";
import { createReconciliationCashFlowAdapter } from "../lib/services/reconciliationCashFlowAdapter";
import type { PaymentService, CustomerPayment } from "../lib/services/paymentService";
import type { ExpenseService, Expense } from "../lib/services/expenseService";

function stubPaymentService(payments: CustomerPayment[]): PaymentService {
  return {
    listForCompany: async () => payments,
  } as unknown as PaymentService;
}

function stubExpenseService(expenses: Expense[]): ExpenseService {
  return {
    listForCompany: async () => expenses,
  } as unknown as ExpenseService;
}

function payment(overrides: Partial<CustomerPayment>): CustomerPayment {
  return {
    id: "p1",
    companyId: "company-1",
    invoiceId: "inv-1",
    amount: 500,
    method: "check",
    paymentDate: "2026-01-15",
    referenceNumber: null,
    notes: null,
    createdBy: null,
    createdAt: "2026-01-15T00:00:00Z",
    updatedBy: null,
    updatedAt: "2026-01-15T00:00:00Z",
    deletedBy: null,
    deletedAt: null,
    deleteReason: null,
    ...overrides,
  };
}

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "e1",
    companyId: "company-1",
    projectId: null,
    estimateId: null,
    changeOrderId: null,
    expenseType: "materials",
    category: "materials",
    description: "Lumber",
    amount: 120,
    expenseDate: "2026-01-16",
    notes: null,
    vendor: "Home Depot",
    payeeType: null,
    payeeId: null,
    paidByType: "company",
    paidById: null,
    createdBy: null,
    createdAt: "2026-01-16T00:00:00Z",
    updatedBy: null,
    updatedAt: "2026-01-16T00:00:00Z",
    deletedBy: null,
    deletedAt: null,
    deleteReason: null,
    ...overrides,
  } as unknown as Expense;
}

describe("createReconciliationCashFlowAdapter", () => {
  test("turns a payment into a positive cash-flow line and an expense into a negative one", async () => {
    const adapter = createReconciliationCashFlowAdapter({
      paymentService: stubPaymentService([payment({ amount: 500, paymentDate: "2026-01-15" })]),
      expenseService: stubExpenseService([expense({ amount: 120, expenseDate: "2026-01-16", vendor: "Home Depot" })]),
    });

    const result = await adapter.getCashFlow({ companyId: "company-1" });
    expect(result.lines).toEqual([
      { transactionId: "p1", date: "2026-01-15", description: "Payment received", amount: 500 },
      { transactionId: "e1", date: "2026-01-16", description: "Home Depot", amount: -120 },
    ]);
    expect(result.netCashChange).toBe(380);
  });

  test("filters both payments and expenses by scope.dateRange, since neither service does it itself", async () => {
    const adapter = createReconciliationCashFlowAdapter({
      paymentService: stubPaymentService([
        payment({ id: "in-range", paymentDate: "2026-01-15" }),
        payment({ id: "out-of-range", paymentDate: "2025-06-01" }),
      ]),
      expenseService: stubExpenseService([
        expense({ id: "in-range-e", expenseDate: "2026-01-16" }),
        expense({ id: "out-of-range-e", expenseDate: "2025-06-02" }),
      ]),
    });

    const result = await adapter.getCashFlow({
      companyId: "company-1",
      dateRange: { start: new Date("2026-01-01"), end: new Date("2026-01-31") },
    });

    const ids = result.lines.map((l) => l.transactionId);
    expect(ids).toEqual(["in-range", "in-range-e"]);
  });

  test("getProfitAndLoss and getBalanceSheet reject rather than return a fabricated statement", async () => {
    const adapter = createReconciliationCashFlowAdapter({
      paymentService: stubPaymentService([]),
      expenseService: stubExpenseService([]),
    });
    await expect(adapter.getProfitAndLoss({ companyId: "company-1" })).rejects.toThrow();
    await expect(adapter.getBalanceSheet({ companyId: "company-1" })).rejects.toThrow();
  });
});
