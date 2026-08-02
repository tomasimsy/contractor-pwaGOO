/**
 * Real Supabase-backed PaymentService — implements the EXISTING
 * PaymentService interface against the live `invoice_payments` table.
 *
 * Note the table name: the interface's domain type is `CustomerPayment`
 * but the live table is `invoice_payments` (there is no
 * `customer_payments` table — confirmed against the live schema, which
 * returns PGRST205 for that name).
 *
 * Balances are always a QUERY, never a column. `getSummaryForInvoice`
 * sums active payment rows and runs them through the shared
 * calculateRemainingBalance/derivePaymentStatus — it never reads
 * `invoices.amount_paid` or `invoices.remaining_balance`, both of which
 * exist on the live table as denormalized leftovers from the old app.
 * InvoiceService keeps those two columns mirrored for the old app's
 * benefit but likewise never reads them back.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPayment, PaymentService } from "../paymentService";
import type { UUID, ValidationResult, PaymentStatus, QueryScope } from "../types";
import type { ValidationService } from "../validationService";
import { calculateRemainingBalance, derivePaymentStatus } from "../financialCalculations";

interface PaymentRow {
  id: string;
  company_id: string;
  invoice_id: string;
  amount: number | null;
  method: string | null;
  payment_date: string | null;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToPayment(row: PaymentRow): CustomerPayment {
  return {
    id: row.id,
    companyId: row.company_id,
    invoiceId: row.invoice_id,
    amount: row.amount ?? 0,
    method: row.method ?? "",
    paymentDate: row.payment_date ?? row.created_at.slice(0, 10),
    referenceNumber: row.reference_number,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabasePaymentService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): PaymentService {
  async function listForInvoice(invoiceId: UUID): Promise<CustomerPayment[]> {
    const { data, error } = await supabase
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false });
    if (error) throw new Error(`Failed to list payments: ${error.message}`);
    return (data as PaymentRow[]).map(rowToPayment);
  }

  async function listForCompany(scope: QueryScope): Promise<CustomerPayment[]> {
    let query = supabase.from("invoice_payments").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("payment_date", { ascending: false });
    if (error) throw new Error(`Failed to list payments: ${error.message}`);
    return (data as PaymentRow[]).map(rowToPayment);
  }

  async function getSummaryForInvoice(invoiceId: UUID): Promise<{ totalPaid: number; remainingBalance: number; status: PaymentStatus }> {
    const { data: invoiceRow, error } = await supabase.from("invoices").select("total").eq("id", invoiceId).single();
    if (error) throw new Error(`Failed to load invoice: ${error.message}`);
    const total = (invoiceRow as { total: number | null }).total ?? 0;

    // Sums the payment ROWS — deliberately not invoices.amount_paid.
    const payments = await listForInvoice(invoiceId);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      totalPaid,
      remainingBalance: calculateRemainingBalance(total, totalPaid),
      status: derivePaymentStatus(total, totalPaid),
    };
  }

  /* The legacy denormalized columns on `invoices` (amount_paid,
   * remaining_balance, payment_status, status) are maintained by the
   * database itself: trg_update_invoice_payment_totals fires on every
   * invoice_payments insert/update/delete and recomputes them from the
   * active rows — the same full-recompute-never-increment rule this
   * service follows. Mirroring them from here as well was duplicated
   * logic with two owners, so it was removed. Nothing in this app reads
   * those columns; every figure is derived on read.
   */

  async function record(input: {
    companyId: UUID;
    invoiceId: UUID;
    amount: number;
    method: string;
    paymentDate: string;
    referenceNumber?: string;
    notes?: string;
    allowOverpayment?: boolean;
  }): Promise<ValidationResult & { payment?: CustomerPayment }> {
    const summary = await getSummaryForInvoice(input.invoiceId);
    const check = validationService.validatePaymentAmount({
      amount: input.amount,
      remainingBalance: summary.remainingBalance,
      allowOverpayment: input.allowOverpayment ?? false,
    });
    if (!check.valid) return check;

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("invoice_payments")
      .insert({
        company_id: input.companyId,
        invoice_id: input.invoiceId,
        amount: input.amount,
        method: input.method,
        payment_date: input.paymentDate,
        reference_number: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to record payment: ${error.message}`);

    return { valid: true, issues: [], payment: rowToPayment(data as PaymentRow) };
  }

  async function update(
    paymentId: UUID,
    changes: Partial<Pick<CustomerPayment, "amount" | "method" | "paymentDate" | "referenceNumber" | "notes">>
  ): Promise<CustomerPayment> {
    const payload: Record<string, unknown> = {};
    if (changes.amount !== undefined) payload.amount = changes.amount;
    if (changes.method !== undefined) payload.method = changes.method;
    if (changes.paymentDate !== undefined) payload.payment_date = changes.paymentDate;
    if (changes.referenceNumber !== undefined) payload.reference_number = changes.referenceNumber;
    if (changes.notes !== undefined) payload.notes = changes.notes;

    const { data, error } = await supabase.from("invoice_payments").update(payload).eq("id", paymentId).select().single();
    if (error) throw new Error(`Failed to update payment: ${error.message}`);

    const payment = rowToPayment(data as PaymentRow);
    return payment;
  }

  /** Same delete-protection discipline as Project/Estimate/Invoice/
   * Expense/ChangeOrder — but scoped to the one case where deleting a
   * payment would rewrite the history of a document already treated as
   * closed: once its invoice has been voided, that invoice (and what was
   * actually collected against it before voiding) is meant to be a
   * frozen record. Ordinary corrections (bounced cheque, refund,
   * duplicate entry — see payments-module.test.ts) all happen against
   * invoices that are still draft/sent/viewed, so this never blocks
   * them. Queries `invoices` directly rather than through
   * InvoiceService — a simple existence/status check, not a second
   * calculation. */
  async function assertNoFinancialActivity(paymentId: UUID): Promise<void> {
    const { data: paymentRow, error: paymentError } = await supabase.from("invoice_payments").select("invoice_id").eq("id", paymentId).single();
    if (paymentError) throw new Error(`Failed to load payment: ${paymentError.message}`);

    const { data: invoiceRow, error: invoiceError } = await supabase.from("invoices").select("lifecycle_status").eq("id", (paymentRow as { invoice_id: string }).invoice_id).maybeSingle();
    if (invoiceError) throw new Error(`Failed to load invoice: ${invoiceError.message}`);

    if ((invoiceRow as { lifecycle_status: string } | null)?.lifecycle_status === "void") {
      throw new Error("Cannot delete this payment: its invoice has been voided, and that invoice's record is meant to stay frozen as-is.");
    }
  }

  async function softDelete(paymentId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "A delete reason is required.");
    await assertNoFinancialActivity(paymentId);

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("invoice_payments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", paymentId);
    if (error) throw new Error(`Failed to delete payment: ${error.message}`);

  }

  async function restore(paymentId: UUID): Promise<void> {
    const { error } = await supabase
      .from("invoice_payments")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", paymentId);
    if (error) throw new Error(`Failed to restore payment: ${error.message}`);
  }

  return { listForInvoice, listForCompany, record, update, softDelete, restore, getSummaryForInvoice };
}
