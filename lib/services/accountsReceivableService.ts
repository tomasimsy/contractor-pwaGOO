/**
 * Layer 3 — accounts receivable: aging of what customers owe. Composes
 * InvoiceService.listForCompany + PaymentService.getSummaryForInvoice
 * (the same two calls FinancialEngine.getCompanyFinancials' totals
 * come from) — this service adds no new financial fact, only buckets
 * existing invoice balances by how overdue they are.
 */
import type { UUID, QueryScope } from "./types";
import type { InvoiceService } from "./invoiceService";
import type { PaymentService } from "./paymentService";
import { isRevenueInvoice } from "./financialEngine";

export interface ARAgingLine {
  invoiceId: UUID;
  invoiceNumber: string;
  clientId: UUID | null;
  balance: number;
  daysPastDue: number; // negative means not yet due
  bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
}

export interface ARAgingReport {
  scope: QueryScope;
  asOf: string;
  lines: ARAgingLine[];
  totals: Record<ARAgingLine["bucket"], number>;
  totalReceivable: number;
}

function bucketFor(daysPastDue: number): ARAgingLine["bucket"] {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

export interface AccountsReceivableService {
  getAgingReport(scope: QueryScope, asOfDate?: string): Promise<ARAgingReport>;
}

export function createAccountsReceivableService(deps: {
  invoiceService: InvoiceService;
  paymentService: PaymentService;
}): AccountsReceivableService {
  async function getAgingReport(scope: QueryScope, asOfDate?: string): Promise<ARAgingReport> {
    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    const invoices = await deps.invoiceService.listForCompany(scope);

    const lines: ARAgingLine[] = [];
    for (const invoice of invoices) {
      // Same rule FinancialEngine.isRevenueInvoice applies everywhere
      // else: a void/cancelled invoice was never real revenue, so it
      // cannot be a real receivable either — found diverging from
      // FinancialEngine during the 2026-08-01 financial audit (this
      // method had only the remainingBalance>0 check below, which a
      // voided invoice with zero payments still passes).
      if (!isRevenueInvoice(invoice)) continue;
      const summary = await deps.paymentService.getSummaryForInvoice(invoice.id);
      if (summary.remainingBalance <= 0) continue; // paid/overpaid invoices carry no receivable

      const daysPastDue = invoice.dueDate
        ? Math.floor((asOf.getTime() - new Date(invoice.dueDate).getTime()) / 86400000)
        : -1; // no due date set -> treat as not yet due, same convention as contractor-pwa's getARAgingBuckets

      lines.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        balance: summary.remainingBalance,
        daysPastDue,
        bucket: bucketFor(daysPastDue),
      });
    }

    const totals: Record<ARAgingLine["bucket"], number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const line of lines) totals[line.bucket] += line.balance;

    return {
      scope,
      asOf: asOf.toISOString().slice(0, 10),
      lines,
      totals,
      totalReceivable: lines.reduce((sum, l) => sum + l.balance, 0),
    };
  }

  return { getAgingReport };
}
