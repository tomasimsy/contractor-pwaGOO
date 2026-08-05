/**
 * Real Supabase-backed InvoiceService — implements the EXISTING
 * InvoiceService interface (lib/services/invoiceService.ts) against the
 * real, live `invoices` + `invoice_items` tables (same shared Supabase
 * project as contractor-pwa; both tables predate this app and hold 8
 * real invoices as of the 2026-07-24 audit).
 *
 * Follows the pattern established by supabase/estimateService.ts and
 * supabase/changeOrderService.ts: no new tables, no parallel schema, no
 * reimplemented arithmetic — every figure comes from
 * financialCalculations.ts.
 *
 * ============================================================
 * DERIVED, NEVER STORED
 * ============================================================
 * The live table carries FOUR denormalized financial columns that this
 * service deliberately never trusts as inputs and never maintains
 * incrementally:
 *
 *   `status` + `payment_status` — two columns nothing kept in sync.
 *      Audited live: 5 of 8 invoices had status='paid' alongside
 *      payment_status='pending', and all 8 said "paid" while having
 *      zero payment rows. Both belong to the ORIGINAL app and this
 *      service neither writes nor trusts them.
 *
 *      This service stores the LIFECYCLE (draft/sent/viewed/cancelled/
 *      void) in its own `lifecycle_status` column and derives the
 *      displayed status on every read via deriveInvoiceStatus. That
 *      column exists because the lifecycle CANNOT live in `status`:
 *      trg_update_invoice_payment_totals rewrites `status` from the
 *      payment rows on every invoice_payments insert/update/delete, so
 *      recording a payment used to flatten a 'sent' invoice to
 *      'partial' and deleting the payments left it 'pending' — read
 *      back as an editable draft that was nonetheless is_locked.
 *      See 20260801000300_invoice_lifecycle_status.sql.
 *
 *   `amount_paid` / `remaining_balance` — recomputed from active
 *      `invoice_payments` rows on every read, never `+=`'d. A stored
 *      running balance is precisely the anti-pattern that produced the
 *      estimate-total corruption fixed earlier in this codebase.
 *
 * `subtotal`/`total` self-heal on read for DRAFTS ONLY — see getById's
 * comment for why an issued invoice is deliberately never rewritten
 * (doing so destroyed $1,700 of real billed revenue on a paid,
 * customer-signed invoice during this module's own verification).
 * Issued-invoice drift is reported via `hasTotalDrift` instead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice, InvoiceLineItem, InvoiceLifecycleStatus, InvoiceService } from "../invoiceService";
import type { UUID, QueryScope, ValidationResult } from "../types";
import type { ValidationService } from "../validationService";
import type { AuditService } from "../auditService";
import type { EstimateService } from "../estimateService";
import type { ChangeOrderService } from "../changeOrderService";
import {
  calculateLineItemTotal,
  calculateSubtotal,
  calculateDocumentTotal,
  calculateInvoiceTotal,
  calculateRemainingBalance,
  deriveInvoiceStatus,
  needsTotalRecalculation,
  sumApprovedChangeOrderRevenue,
} from "../financialCalculations";

interface InvoiceRow {
  id: string;
  company_id: string;
  project_id: string;
  estimate_id: string | null;
  client_id: string | null;
  invoice_number: string | null;
  /** Legacy payment-flavoured column, owned by the original app. */
  status: string | null;
  /** This app's document lifecycle. Null only on rows written by the
   * old app before the backfill migration ran. */
  lifecycle_status: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  discount: number | null;
  deposit_amount: number | null;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  description: string | null;
  customer_token: string | null;
  is_locked: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  deleted_at: string | null;
}

/** The lifecycle of a row, preferring this app's own column and falling
 * back to interpreting the legacy one. The fallback matters for rows the
 * ORIGINAL app inserts after the backfill migration: it doesn't know
 * about `lifecycle_status`, so its invoices arrive with it defaulted to
 * 'draft' — which is right for a genuinely new invoice, while
 * `is_locked` catches the ones that were actually issued. */
function readLifecycleStatus(row: InvoiceRow): InvoiceLifecycleStatus {
  if (row.lifecycle_status) return toLifecycleStatus(row.lifecycle_status);
  const fromLegacy = toLifecycleStatus(row.status);
  // A locked invoice was issued by definition — never report it as an
  // editable draft just because the legacy column got flattened.
  if (fromLegacy === "draft" && row.is_locked) return "sent";
  return fromLegacy;
}

/** The live `status` column is free-text and holds legacy values from
 * the original app ("pending", "signed", "partial", and — on every
 * audited row — a meaningless "paid"). Only the lifecycle half is
 * meaningful to this service; anything payment-derived is recomputed,
 * so a legacy "paid"/"partial" maps to the lifecycle state it must
 * have been in to get there (issued), not to a payment claim. */
function toLifecycleStatus(raw: string | null): InvoiceLifecycleStatus {
  switch (raw) {
    case "draft":
    case "pending":
    case null:
      return "draft";
    case "sent":
    case "signed":
      return "sent";
    case "viewed":
      return "viewed";
    case "cancelled":
      return "cancelled";
    case "void":
      return "void";
    // Legacy payment-ish values: the document was certainly issued, but
    // whether it is actually paid is decided by payment rows, not this.
    case "paid":
    case "partial":
    case "partially_paid":
    case "overdue":
      return "sent";
    default:
      return "draft";
  }
}

function itemRowToLineItem(row: InvoiceItemRow): InvoiceLineItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    total: row.total,
  };
}

export function createSupabaseInvoiceService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  auditService: AuditService,
  currentUserId: () => Promise<UUID | null>,
  estimateService: EstimateService,
  changeOrderService: ChangeOrderService,
  /** Injected so status derivation is deterministic and testable —
   * never `new Date()` inline. */
  today: () => string = () => new Date().toISOString().slice(0, 10)
): InvoiceService {
  /** Sum of ACTIVE payments — the only source of "how much is paid".
   * Never reads `invoices.amount_paid`. */
  async function sumActivePayments(invoiceId: UUID): Promise<number> {
    const { data, error } = await supabase
      .from("invoice_payments")
      .select("amount")
      .eq("invoice_id", invoiceId)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load invoice payments: ${error.message}`);
    return (data as { amount: number | null }[]).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  }

  /**
   * `knownAmountPaid` lets a LIST caller supply the figure it has
   * already batched, instead of this function issuing its own query per
   * row. Without it, every `invoices` list cost one extra
   * `invoice_payments` round-trip PER INVOICE — measured as 9 such
   * calls on a single Estimate Detail load, and it scaled with the
   * company's invoice count on /payments and /invoices. Single-row
   * callers omit it and behave exactly as before.
   */
  async function rowToInvoice(row: InvoiceRow, knownAmountPaid?: number): Promise<Invoice> {
    const total = row.total ?? 0;
    const amountPaid = knownAmountPaid ?? (await sumActivePayments(row.id));
    const lifecycleStatus = readLifecycleStatus(row);
    return {
      id: row.id,
      companyId: row.company_id,
      projectId: row.project_id,
      estimateId: row.estimate_id,
      clientId: row.client_id,
      invoiceNumber: row.invoice_number ?? "",
      lifecycleStatus,
      status: deriveInvoiceStatus({ lifecycleStatus, total, amountPaid, dueDate: row.due_date, today: today() }),
      subtotal: row.subtotal ?? 0,
      tax: row.tax ?? 0,
      total,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      isLocked: row.is_locked ?? false,
      customerToken: row.customer_token,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at ?? row.created_at,
      deletedBy: row.deleted_by,
      deletedAt: row.deleted_at,
      deleteReason: row.delete_reason,
    };
  }

  async function loadActiveItems(invoiceId: UUID): Promise<InvoiceLineItem[]> {
    const { data, error } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Failed to load invoice line items: ${error.message}`);
    return (data as InvoiceItemRow[]).map(itemRowToLineItem);
  }

  /**
   * The ONLY function that writes `invoices.subtotal`/`total` (plus the
   * legacy mirror columns). A full rebuild from source, never
   * incremental: takes only an id, derives everything itself, so no
   * caller can inject a total. Mirrors EstimateService's
   * writeRecalculatedTotals.
   */
  async function writeRecalculatedTotals(invoiceId: UUID): Promise<Invoice> {
    const { data: row, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    if (error) throw new Error(`Failed to load invoice: ${error.message}`);
    const invoiceRow = row as InvoiceRow;

    const lineItems = await loadActiveItems(invoiceId);
    const subtotal = calculateSubtotal(lineItems);
    const total = calculateInvoiceTotal(subtotal, invoiceRow.tax ?? 0);
    const amountPaid = await sumActivePayments(invoiceId);

    const { data: updated, error: updateError } = await supabase
      .from("invoices")
      .update({
        subtotal,
        total,
        // Legacy denormalized mirrors — kept current for the OLD app,
        // which still reads them. This service never reads them back;
        // every figure it returns is derived above.
        amount_paid: amountPaid,
        remaining_balance: calculateRemainingBalance(total, amountPaid),
      })
      .eq("id", invoiceId)
      .select()
      .single();
    if (updateError) throw new Error(`Failed to write recalculated invoice totals: ${updateError.message}`);
    return rowToInvoice(updated as InvoiceRow);
  }

  async function getById(invoiceId: UUID): Promise<(Invoice & { lineItems: InvoiceLineItem[]; hasTotalDrift?: boolean }) | null> {
    const { data: row, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Failed to load invoice: ${error.message}`);
    if (!row) return null;

    const lineItems = await loadActiveItems(invoiceId);
    let invoice = await rowToInvoice(row as InvoiceRow);

    // Self-healing read — but ONLY while the invoice is still a DRAFT.
    //
    // For a draft, the total is a working figure that must track its
    // editable line items, so repairing it on read is right (same
    // contract as EstimateService.getById, and it fixes rows the old
    // app edited without recalculating).
    //
    // For an ISSUED invoice it is emphatically wrong, and an earlier
    // version of this code got it wrong in exactly that way: a real
    // paid, customer-signed invoice (OSR20260001) had its total
    // rewritten from $5,863.60 down to $4,163.60 because the $1,700 of
    // approved change-order work it billed for had been folded into the
    // stored total by the old app rather than existing as a line item.
    // The "repair" deleted $1,700 of legitimately billed revenue and
    // left the invoice reading 'overpaid by $1,700.40' against payments
    // the customer had actually made.
    //
    // An issued invoice is a historical record of what was billed and
    // agreed. Its total is not derivable from today's line items when
    // those line items are an incomplete legacy record. So: never
    // rewrite it. Drift on an issued invoice is surfaced (see
    // hasTotalDrift below) for a human to resolve — by voiding and
    // reissuing, which is the correct accounting remedy — not silently
    // corrected.
    const subtotal = calculateSubtotal(lineItems);
    const total = calculateInvoiceTotal(subtotal, invoice.tax);
    const drifted = needsTotalRecalculation(invoice, { subtotal, total });

    if (drifted && invoice.lifecycleStatus === "draft" && !invoice.isLocked) {
      invoice = await writeRecalculatedTotals(invoiceId);
    }

    return { ...invoice, lineItems, hasTotalDrift: drifted && invoice.lifecycleStatus !== "draft" };
  }

  /** Active payment totals for a SET of invoices, in one query —
   * the batched form of sumActivePayments. Same `deleted_at is null`
   * filter, so a batched total can never differ from a single one. */
  async function sumActivePaymentsFor(invoiceIds: UUID[]): Promise<Map<UUID, number>> {
    const totals = new Map<UUID, number>();
    for (const id of invoiceIds) totals.set(id, 0);
    if (invoiceIds.length === 0) return totals;

    const { data, error } = await supabase
      .from("invoice_payments")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load payments: ${error.message}`);

    for (const p of (data as { invoice_id: string; amount: number | null }[])) {
      totals.set(p.invoice_id, (totals.get(p.invoice_id) ?? 0) + (p.amount ?? 0));
    }
    return totals;
  }

  /** Maps rows to Invoices with ONE payments query for the whole set
   * rather than one per row. */
  async function rowsToInvoices(rows: InvoiceRow[]): Promise<Invoice[]> {
    const paidByInvoice = await sumActivePaymentsFor(rows.map((r) => r.id));
    return Promise.all(rows.map((row) => rowToInvoice(row, paidByInvoice.get(row.id) ?? 0)));
  }

  async function listForProject(projectId: UUID): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list invoices: ${error.message}`);
    return rowsToInvoices(data as InvoiceRow[]);
  }

  async function listForCompany(scope: QueryScope): Promise<Invoice[]> {
    let query = supabase.from("invoices").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    if (scope.projectId) query = query.eq("project_id", scope.projectId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list invoices: ${error.message}`);
    return rowsToInvoices(data as InvoiceRow[]);
  }

  /**
   * Sequential per-company invoice numbering: INV-1001, INV-1002, ...
   * Deliberately a DIFFERENT series from estimates (which use
   * OSR<year><seq>) — the live data shows old invoices reusing their
   * estimate's number verbatim, which makes "which document is this?"
   * ambiguous in every downstream report.
   *
   * Scans existing INV- numbers for this company and takes max+1 rather
   * than count+1: count+1 collides the moment anything is deleted, and
   * a count-based generator is exactly what produced the duplicate
   * estimate_number found live earlier in this codebase. `attempt`
   * lets create() retry past a lost race (see its 23505 handling).
   */
  async function generateInvoiceNumber(companyId: UUID, attempt = 0): Promise<string> {
    const { data, error } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("company_id", companyId)
      .ilike("invoice_number", "INV-%");
    if (error) throw new Error(`Failed to generate invoice number: ${error.message}`);

    let max = 1000;
    for (const r of (data ?? []) as { invoice_number: string | null }[]) {
      const m = r.invoice_number?.match(/^INV-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `INV-${max + 1 + attempt}`;
  }

  /** Shared insert path for both creation entry points. */
  async function insertInvoice(input: {
    companyId: UUID;
    projectId: UUID;
    estimateId: UUID | null;
    clientId: UUID | null;
    lineItems: Omit<InvoiceLineItem, "id" | "total">[];
    tax: number;
    issueDate: string;
    dueDate: string;
    notes?: string | null;
  }): Promise<Invoice> {
    for (const li of input.lineItems) {
      const check = validationService.validateLineItem({ name: li.name, quantity: li.quantity, unitPrice: li.unitPrice });
      if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    }

    const itemsWithTotals = input.lineItems.map((li) => ({ ...li, total: calculateLineItemTotal(li) }));
    const subtotal = calculateSubtotal(itemsWithTotals);
    const total = calculateInvoiceTotal(subtotal, input.tax);
    const actorId = await currentUserId();

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNumber = await generateInvoiceNumber(input.companyId, attempt);
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          company_id: input.companyId,
          project_id: input.projectId,
          estimate_id: input.estimateId,
          client_id: input.clientId,
          invoice_number: invoiceNumber,
          lifecycle_status: "draft",
          // Legacy columns seeded once so the original app can render a
          // brand-new invoice. From here on they belong to that app and
          // to trg_update_invoice_payment_totals — this service never
          // reads them back and never writes them again.
          status: "pending",
          payment_status: "unpaid",
          subtotal,
          tax: input.tax,
          total,
          amount_paid: 0,
          remaining_balance: total,
          issue_date: input.issueDate,
          due_date: input.dueDate,
          notes: input.notes ?? null,
          is_locked: false,
          // Opaque per-invoice token for the public (unauthenticated)
          // invoice page — generated at creation so a customer link can
          // be shared without a later migration step.
          customer_token: crypto.randomUUID(),
          created_by: actorId,
        })
        .select()
        .single();

      if (!error) {
        const invoice = await rowToInvoice(data as InvoiceRow);
        if (itemsWithTotals.length > 0) {
          const { error: itemsError } = await supabase.from("invoice_items").insert(
            itemsWithTotals.map((li) => ({
              invoice_id: invoice.id,
              company_id: input.companyId,
              name: li.name,
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unitPrice,
              total: li.total,
            }))
          );
          if (itemsError) throw new Error(`Failed to save invoice line items: ${itemsError.message}`);
        }
        return invoice;
      }

      if (error.code === "23505") {
        lastError = error; // numbering race — retry with the next candidate
        continue;
      }
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
    throw new Error(`Failed to create invoice after retrying a numbering conflict: ${(lastError as { message?: string })?.message ?? "unknown error"}`);
  }

  /**
   * Estimate -> invoice conversion. SNAPSHOTS everything: line items
   * are copied as rows on this invoice, and approved change orders are
   * copied in as their own line items. Nothing here holds a live
   * reference back to the estimate, so a later estimate edit cannot
   * retroactively change an issued invoice — the "preserve historical
   * pricing" requirement, and the reason the copy is row-level rather
   * than a join at read time.
   */
  async function createFromEstimate(estimateId: UUID, input: { issueDate: string; dueDate: string }): Promise<Invoice> {
    const estimate = await estimateService.getById(estimateId);
    if (!estimate) throw new Error("Estimate not found.");

    // The estimate's own markup/discount/tax collapse into the
    // invoice's taxedBase + flat tax — reusing calculateDocumentTotal
    // rather than re-deriving, so a quoted $X always invoices as $X.
    const { taxedBase, tax } = calculateDocumentTotal(estimate.subtotal, estimate.markup, estimate.discount, estimate.taxRate);

    // ONE call, whatever kind of estimate this is: getScopeLines
    // resolves estimate_items vs roof areas internally.
    //
    // This replaces ~40 lines that re-implemented the roofing
    // composition rule (area line items PLUS each area's
    // estimated_repair_cost) here. That duplicate existed because
    // reading estimate.lineItems unconditionally produced a $0 invoice
    // for every roofing estimate — and it then had to be patched AGAIN
    // when the repair-cost half was found missing, because the same
    // rule lived in two files. It now lives in one.
    const estimateLines: Omit<InvoiceLineItem, "id" | "total">[] = (
      await estimateService.getScopeLines(estimateId)
    ).map((line) => ({
      name: line.name,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }));

    // Approved change orders become real line items on the invoice —
    // pending/rejected/deleted ones are excluded by listForEstimate
    // (deleted) plus the approved filter, the same rule every other
    // surface applies.
    const changeOrders = await changeOrderService.listForEstimate(estimateId);
    const approved = changeOrders.filter((co) => co.status === "approved");
    const changeOrderLines: Omit<InvoiceLineItem, "id" | "total">[] = approved.map((co) => ({
      name: `Change Order ${co.changeOrderNumber}`,
      description: co.title,
      quantity: 1,
      unitPrice: co.totalAmount + co.tax,
    }));

    // Guard: the line items we're about to write must reconcile with
    // the shared engine's view of what this estimate is worth.
    const expectedApproved = sumApprovedChangeOrderRevenue(changeOrders);
    const changeOrderLineSum = changeOrderLines.reduce((s, l) => s + l.unitPrice, 0);
    if (Math.round(expectedApproved * 100) !== Math.round(changeOrderLineSum * 100)) {
      throw new Error(`Change order snapshot ($${changeOrderLineSum}) disagrees with the financial engine ($${expectedApproved}).`);
    }

    const marginAdjustment = taxedBase - estimate.subtotal;
    const lineItems = [...estimateLines, ...changeOrderLines];
    // Markup/discount don't survive as line items (an invoice has no
    // such concept), so when they net to a non-zero amount they're
    // carried as one explicit adjustment line — visible to the
    // customer rather than silently baked into unit prices.
    if (Math.round(marginAdjustment * 100) !== 0) {
      lineItems.push({
        name: marginAdjustment > 0 ? "Markup" : "Discount",
        description: "Carried from the approved estimate",
        quantity: 1,
        unitPrice: marginAdjustment,
      });
    }

    return insertInvoice({
      companyId: estimate.companyId,
      projectId: estimate.projectId,
      estimateId,
      clientId: estimate.clientId,
      lineItems,
      tax,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
    });
  }

  async function createStandalone(input: {
    companyId: UUID;
    projectId: UUID;
    clientId: UUID | null;
    lineItems: Omit<InvoiceLineItem, "id" | "total">[];
    issueDate: string;
    dueDate: string;
  }): Promise<Invoice> {
    return insertInvoice({ ...input, estimateId: null, tax: 0 });
  }

  async function updateLineItems(
    invoiceId: UUID,
    lineItems: Omit<InvoiceLineItem, "id" | "total">[]
  ): Promise<ValidationResult & { invoice?: Invoice }> {
    const { data: row, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    if (error) throw new Error(`Failed to load invoice: ${error.message}`);
    const current = row as InvoiceRow;

    // Financials lock once the invoice leaves draft. Returned as a
    // ValidationResult, not thrown — the caller renders it as a
    // message, matching updateLineItems' existing contract.
    if (current.is_locked || readLifecycleStatus(current) !== "draft") {
      return {
        valid: false,
        issues: [{ field: "invoice", code: "locked", message: "This invoice is no longer a draft and its financial values are locked." }],
      };
    }

    for (const li of lineItems) {
      const check = validationService.validateLineItem({ name: li.name, quantity: li.quantity, unitPrice: li.unitPrice });
      if (!check.valid) return check;
    }

    // Replace-in-place, same pattern as EstimateService.updateLineItems.
    const { error: deleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
    if (deleteError) throw new Error(`Failed to update invoice line items: ${deleteError.message}`);

    if (lineItems.length > 0) {
      const { error: insertError } = await supabase.from("invoice_items").insert(
        lineItems.map((li) => ({
          invoice_id: invoiceId,
          company_id: current.company_id,
          name: li.name,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unitPrice,
          total: calculateLineItemTotal(li),
        }))
      );
      if (insertError) throw new Error(`Failed to save invoice line items: ${insertError.message}`);
    }

    return { valid: true, issues: [], invoice: await writeRecalculatedTotals(invoiceId) };
  }

  async function lock(invoiceId: UUID): Promise<Invoice> {
    const { data, error } = await supabase
      .from("invoices")
      .update({ is_locked: true, locked_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .select()
      .single();
    if (error) throw new Error(`Failed to lock invoice: ${error.message}`);
    return rowToInvoice(data as InvoiceRow);
  }

  async function recordSignature(
    invoiceId: UUID,
    signature: { type: "draw" | "type"; value: string; date: string }
  ): Promise<Invoice> {
    // `invoices.signature` is TEXT live (estimates' is jsonb) — stored
    // as a JSON string rather than changing a live column's type.
    const { data, error } = await supabase
      .from("invoices")
      .update({ signature: JSON.stringify(signature), signed_date: signature.date, is_locked: true, locked_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .select()
      .single();
    if (error) throw new Error(`Failed to record signature: ${error.message}`);
    return rowToInvoice(data as InvoiceRow);
  }

  async function changeStatus(invoiceId: UUID, toStatus: InvoiceLifecycleStatus): Promise<ValidationResult & { invoice?: Invoice }> {
    const { data: row, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    if (error) throw new Error(`Failed to load invoice: ${error.message}`);
    const current = row as InvoiceRow;
    const from = readLifecycleStatus(current);

    const validation = validationService.validateInvoiceStatusTransition(from, toStatus);
    if (!validation.valid) return validation;

    const locksOnIssue = toStatus === "sent" || toStatus === "viewed";
    const { data: updated, error: updateError } = await supabase
      .from("invoices")
      .update({
        // Only the lifecycle column. Writing `status` here is what the
        // payment trigger kept undoing.
        lifecycle_status: toStatus,
        ...(locksOnIssue ? { is_locked: true, locked_at: new Date().toISOString() } : {}),
      })
      .eq("id", invoiceId)
      .select()
      .single();
    if (updateError) throw new Error(`Failed to change invoice status: ${updateError.message}`);

    const invoice = await rowToInvoice(updated as InvoiceRow);
    await auditService.recordStatusChange({
      companyId: invoice.companyId,
      entityTable: "invoices",
      entityId: invoice.id,
      fromStatus: from,
      toStatus,
      actorUserId: await currentUserId(),
    });

    return { valid: true, issues: [], invoice };
  }

  /** Nothing to refresh — status is derived on read. Kept for interface
   * compatibility; returns the current derived view. */
  async function refreshStatus(invoiceId: UUID): Promise<Invoice> {
    const { data, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    if (error) throw new Error(`Failed to load invoice: ${error.message}`);
    return rowToInvoice(data as InvoiceRow);
  }

  /** Same delete-protection discipline as ProjectService/EstimateService.
   * An invoice with active (non-deleted) payments recorded against it
   * cannot be soft-deleted — those payments are real cash already
   * collected, and deleting the invoice would silently drop them out of
   * every revenue calculation that resolves them through this invoice
   * (e.g. FinancialEngine.getEstimateFinancials, which sums payments via
   * paymentService.getSummaryForInvoice for each of the estimate's
   * invoices). Void the invoice instead if it's already out in the
   * world, or delete the payments first if they were truly recorded in
   * error. Queries `invoice_payments` directly rather than through
   * PaymentService — a simple existence check, not a second
   * calculation, and avoids depending on a service that itself has no
   * dependency on InvoiceService today but shouldn't gain one just for
   * this check. */
  async function assertNoFinancialActivity(invoiceId: UUID): Promise<void> {
    const { data, error } = await supabase.from("invoice_payments").select("id").eq("invoice_id", invoiceId).is("deleted_at", null).limit(1);
    if (error) throw new Error(`Failed to check payments: ${error.message}`);
    if ((data?.length ?? 0) > 0) {
      throw new Error("Cannot delete this invoice: it has active payments recorded against it. Void it instead, or delete the payments first if they were recorded in error.");
    }
  }

  async function softDelete(invoiceId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "A delete reason is required.");
    await assertNoFinancialActivity(invoiceId);

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("invoices")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", invoiceId);
    if (error) throw new Error(`Failed to delete invoice: ${error.message}`);
  }

  /** Was missing entirely — every other soft-deletable entity
   * (project/estimate/change order/payment/expense) already has a
   * restore() half; invoice never got one, making a deleted invoice a
   * dead end. Same contract as ProjectService.restore: clears
   * deleted_at/deleted_by/delete_reason, nothing else. */
  async function restore(invoiceId: UUID): Promise<void> {
    const { error } = await supabase.from("invoices").update({ deleted_at: null, deleted_by: null, delete_reason: null }).eq("id", invoiceId);
    if (error) throw new Error(`Failed to restore invoice: ${error.message}`);
  }

  return {
    getById,
    listForProject,
    listForCompany,
    createFromEstimate,
    createStandalone,
    updateLineItems,
    lock,
    recordSignature,
    changeStatus,
    refreshStatus,
    softDelete,
    restore,
  };
}
