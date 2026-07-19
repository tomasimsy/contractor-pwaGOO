import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';

export type ClientEstimateSummary = {
  id: string;
  estimate_number: string | null;
  title: string | null;
  total: number;
  status: string | null;
  signature: any;
  created_at: string;
};

export type ClientInvoiceSummary = {
  id: string;
  invoice_number: string | null;
  total: number;
  amount_paid: number;
  remaining_balance: number;
  status: string | null;
  due_date: string | null;
  created_at: string;
  estimate_id: string | null;
};

export type ClientPaymentSummary = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  amount: number;
  method: string | null;
  created_at: string;
};

export type ClientDetail = {
  estimates: ClientEstimateSummary[];
  invoices: ClientInvoiceSummary[];
  payments: ClientPaymentSummary[];
  totals: {
    totalEstimated: number;
    totalInvoiced: number;
    totalPaid: number;
    remainingBalance: number;
  };
};

/**
 * Everything related to one client, for the expandable detail section
 * on the Clients page — reads straight from `estimates`/`invoices`/
 * `invoice_payments` (the same tables the Estimates/Invoices pages and
 * PaymentHistoryPanel already use), no denormalized/duplicate copy.
 * Fetched fresh on expand, so any create/update/delete elsewhere in the
 * app (a new invoice, a recorded payment, a deleted estimate) is
 * reflected the next time this is opened — no separate cache to
 * invalidate.
 */
export async function getClientDetail(clientId: string, companyId: string): Promise<ClientDetail> {
  const [estimatesRes, invoicesRes] = await Promise.all([
    supabase
      .from("estimates")
      .select("id, estimate_number, title, total, status, signature, created_at")
      .eq("client_id", clientId)
      .eq("company_id", companyId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_number, total, amount_paid, remaining_balance, status, due_date, created_at, estimate_id")
      .eq("client_id", clientId)
      .eq("company_id", companyId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false }),
  ]);
  if (estimatesRes.error) throw estimatesRes.error;
  if (invoicesRes.error) throw invoicesRes.error;

  const estimates = (estimatesRes.data ?? []) as ClientEstimateSummary[];
  const invoices = (invoicesRes.data ?? []) as ClientInvoiceSummary[];

  const invoiceIds = invoices.map((i) => i.id);
  let payments: ClientPaymentSummary[] = [];
  if (invoiceIds.length > 0) {
    const { data, error } = await supabase
      .from("invoice_payments")
      .select("id, invoice_id, amount, method, created_at")
      .in("invoice_id", invoiceIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const invoiceNumberById = new Map(invoices.map((i) => [i.id, i.invoice_number]));
    payments = (data ?? []).map((p) => ({
      ...p,
      invoice_number: invoiceNumberById.get(p.invoice_id) ?? null,
    }));
  }

  const totalEstimated = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
  // Paid/remaining come straight from invoices.amount_paid/remaining_balance
  // — the same columns totalAmountPaid()/derivePaymentStatus() in
  // lib/queries/expenses.ts already treat as the source of truth, so this
  // never disagrees with the Expense page or invoice detail page.
  const totalPaid = invoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0);
  const remainingBalance = invoices.reduce((sum, i) => sum + (i.remaining_balance || 0), 0);

  return {
    estimates,
    invoices,
    payments,
    totals: { totalEstimated, totalInvoiced, totalPaid, remainingBalance },
  };
}
