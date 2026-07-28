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
