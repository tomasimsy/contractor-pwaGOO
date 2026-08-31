import type { InvoiceStatus } from "@/lib/services/invoiceService";

/** One status->tone mapping shared by the Invoice list, detail, and any
 * other surface that badges an invoice — so "overdue" is never red in
 * one place and grey in another. */
export const INVOICE_STATUS_TONE: Record<InvoiceStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  viewed: "warning",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "danger",
  void: "neutral",
};

export const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** True once an invoice has actually gone out but no payment has fully
 * cleared it yet — the "chase this" set a red badge should call out.
 * Deliberately excludes draft (never sent to the client, so there's
 * nothing to follow up on yet) and cancelled/void (dead, not owed). */
export const UNPAID_INVOICE_STATUSES: readonly InvoiceStatus[] = ["sent", "viewed", "partially_paid", "overdue"];
export const isUnpaidInvoiceStatus = (status: InvoiceStatus): boolean =>
  (UNPAID_INVOICE_STATUSES as InvoiceStatus[]).includes(status);

/** True for any invoice counted in FinancialEngine's totalOutstanding
 * (every status except paid/cancelled/void — including draft, which
 * IS included there since it's already a receivable). Wider than
 * isUnpaidInvoiceStatus on purpose: used only to keep the Dashboard's
 * Outstanding Invoices count from contradicting its own dollar figure,
 * not for the list's "needs follow-up" badge. */
export const isOutstandingInvoiceStatus = (status: InvoiceStatus): boolean =>
  status !== "paid" && status !== "cancelled" && status !== "void";
