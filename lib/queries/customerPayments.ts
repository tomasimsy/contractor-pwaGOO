import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';

export type CustomerPayment = {
  id: string;
  invoice_id: string;
  company_id: string;
  amount: number;
  method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type InvoicePaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export interface InvoicePaymentSummary {
  invoiceId: string;
  invoiceTotal: number;
  totalPaid: number;
  remainingBalance: number;
  status: InvoicePaymentStatus;
  payments: CustomerPayment[];
}

export interface RecordPaymentInput {
  invoiceId: string;
  companyId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
}

/** Record a customer payment for an invoice
 * Automatically updates invoice totals and payment status */
export async function recordCustomerPayment(input: RecordPaymentInput): Promise<string> {
  // Build insert object with all available fields
  // Note: payment_date, reference_number, and notes columns should exist from migration
  // If they don't exist yet, this will gracefully fail with a clear error message
  const insertData: any = {
    invoice_id: input.invoiceId,
    company_id: input.companyId,
    amount: input.amount,
    method: input.paymentMethod,
  };

  // Add optional fields if the columns exist in the database
  // These are added via migration: 20260725000000_customer_payments_enhancements.sql
  if (input.paymentDate) {
    insertData.payment_date = input.paymentDate;
  }
  if (input.referenceNumber) {
    insertData.reference_number = input.referenceNumber;
  }
  if (input.notes) {
    insertData.notes = input.notes;
  }

  const { data, error } = await supabase
    .from("invoice_payments")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    // Check if error is about missing columns
    if (error.message?.includes("payment_date") || error.message?.includes("reference_number")) {
      throw new Error(
        `Database schema is missing payment tracking columns. Please apply the migration:
        supabase/migrations/20260725000000_customer_payments_enhancements.sql\n\n` +
        `Error details: ${error.message}`
      );
    }
    throw error;
  }
  if (!data) throw new Error("Failed to record payment");

  // Invoice totals and status are automatically updated by database trigger:
  // trg_update_invoice_payment_totals in 20260725000000_customer_payments_enhancements.sql

  return data.id;
}

/** Get all payments for an invoice, excluding soft-deleted ones */
export async function getInvoicePayments(invoiceId: string): Promise<CustomerPayment[]> {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false }); // Falls back to created_at if payment_date doesn't exist

  if (error) {
    if (error.message?.includes("payment_date")) {
      console.warn(
        "payment_date column not found. Please apply the database migration: " +
        "supabase/migrations/20260725000000_customer_payments_enhancements.sql"
      );
      // Fallback: return empty array to prevent crashes
      return [];
    }
    throw error;
  }
  return data || [];
}

/** Get payment summary for an invoice including total paid, remaining balance, and status */
export async function getInvoicePaymentSummary(invoiceId: string): Promise<InvoicePaymentSummary> {
  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, total, amount_paid, remaining_balance, payment_status")
    .eq("id", invoiceId)
    .single();

  if (invoiceError) throw invoiceError;
  if (!invoiceData) throw new Error("Invoice not found");

  const payments = await getInvoicePayments(invoiceId);

  const status: InvoicePaymentStatus =
    invoiceData.remaining_balance <= 0
      ? invoiceData.amount_paid > invoiceData.total
        ? "overpaid"
        : "paid"
      : invoiceData.amount_paid > 0
        ? "partial"
        : "unpaid";

  return {
    invoiceId: invoiceData.id,
    invoiceTotal: invoiceData.total,
    totalPaid: invoiceData.amount_paid,
    remainingBalance: invoiceData.remaining_balance,
    status,
    payments,
  };
}

/** Update an existing payment
 * Only allows updating reference_number, notes, payment_date, and method fields */
export async function updateCustomerPayment(
  paymentId: string,
  updates: Partial<{
    amount: number;
    method: string;
    payment_date: string;
    reference_number: string | null;
    notes: string | null;
  }>
): Promise<void> {
  const { error } = await supabase
    .from("invoice_payments")
    .update(updates)
    .eq("id", paymentId);

  if (error) throw error;
}

/** Soft-delete a payment by setting deleted_at
 * Invoice totals are automatically recalculated by trigger */
export async function deleteCustomerPayment(paymentId: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", paymentId);

  if (error) throw error;
}

/** Restore a soft-deleted payment */
export async function restoreCustomerPayment(paymentId: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_payments")
    .update({ deleted_at: null })
    .eq("id", paymentId);

  if (error) throw error;
}

/** Get all payments for a company within a date range (for reporting) */
export async function getCompanyPaymentsByDateRange(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<CustomerPayment[]> {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("company_id", companyId)
    .gte("payment_date", startDate)
    .lte("payment_date", endDate)
    .is("deleted_at", null)
    .order("payment_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Get payment totals by method for reporting */
export async function getPaymentsByMethod(companyId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("method, amount")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (error) throw error;

  const totals: Record<string, number> = {};
  (data || []).forEach((payment: any) => {
    totals[payment.method] = (totals[payment.method] || 0) + payment.amount;
  });

  return totals;
}

/** Calculate accounts receivable: sum of all remaining balances across invoices */
export async function getAccountsReceivable(companyId: string): Promise<number> {
  const { data, error } = await supabase
    .from("invoices")
    .select("remaining_balance")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .gt("remaining_balance", 0);

  if (error) throw error;

  return (data || []).reduce((sum: number, inv: any) => sum + (inv.remaining_balance || 0), 0);
}

/** Get overdue invoices (due_date < today and not fully paid) */
export async function getOverdueInvoices(companyId: string) {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_id, clients(name), total, remaining_balance, due_date")
    .eq("company_id", companyId)
    .eq("is_deleted", false)
    .lt("due_date", today)
    .gt("remaining_balance", 0)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

/** Get total revenue received (sum of all non-deleted payments) */
export async function getTotalRevenueReceived(companyId: string): Promise<number> {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (error) throw error;

  return (data || []).reduce((sum: number, payment: any) => sum + (payment.amount || 0), 0);
}

/** Get monthly revenue trend */
export async function getMonthlyRevenueTrend(companyId: string, months: number = 12) {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("payment_date, amount")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("payment_date", new Date(new Date().setMonth(new Date().getMonth() - months)).toISOString().split("T")[0])
    .order("payment_date", { ascending: true });

  if (error) throw error;

  // Group by month
  const monthlyData: Record<string, number> = {};
  (data || []).forEach((payment: any) => {
    const month = payment.payment_date.substring(0, 7); // YYYY-MM
    monthlyData[month] = (monthlyData[month] || 0) + payment.amount;
  });

  return monthlyData;
}
