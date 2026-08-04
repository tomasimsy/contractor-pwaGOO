/**
 * THE canonical "an approved change order must reach the customer's
 * invoice" workflow.
 *
 * ============================================================
 * THE BUG THIS FIXES
 * ============================================================
 * Signing an estimate auto-generates an invoice (estimateWorkflow.
 * signEstimate). Approving a change order afterwards grew the
 * estimate's revised total and every internal profit figure, but never
 * touched that invoice — so the customer kept receiving a bill for the
 * ORIGINAL scope while the company's own reports counted the larger
 * one. Real money, under-billed, silently.
 *
 * ============================================================
 * THE DOUBLE-COUNT THIS MUST NOT CAUSE
 * ============================================================
 * Read FinancialEngine's header before changing anything here. Project
 * revenue is `revisedTotal = invoicesTotal + approvedChangeOrderTotal`
 * — invoices and change orders as two INDEPENDENT inputs. That is why
 * Invoice.total's own doc comment says change orders never contribute
 * to it. Billing a change order on the invoice without touching that
 * formula would count the same money twice: once inside invoicesTotal,
 * once again in approvedChangeOrderTotal.
 *
 * So this file and FinancialEngine change together. Once a change
 * order is BILLED on an active invoice, the engine stops adding it
 * separately (see billedChangeOrderIds, which the engine applies to
 * its approved list). Each approved change order is counted
 * exactly once, either as an invoice line (billed) or as a standalone
 * revenue input (not yet billed) — never both, never neither.
 *
 * ============================================================
 * NO SCHEMA CHANGES
 * ============================================================
 * "Which change order does this invoice line represent" is recorded in
 * the line item's own `description` as `change-order:<uuid>` — data in
 * an existing column, not a new one. That marker is what makes this
 * workflow idempotent (re-running replaces the same line instead of
 * appending another) and what lets the engine tell billed from
 * unbilled.
 *
 * ============================================================
 * WHAT THIS FILE DOES *NOT* DO
 * ============================================================
 * - Never creates an invoice. If the estimate has none (unsigned, or
 *   the invoice was deleted), there is nothing to sync and nothing is
 *   written — creating one here would produce the duplicate invoices
 *   estimateWorkflow.signEstimate carefully avoids.
 * - Never touches payments. It rewrites LINE ITEMS through the
 *   existing InvoiceService.updateLineItems; payments are separate
 *   records keyed by invoice id, and none of them is read or written
 *   here. An invoice's derived status recomputes itself from those
 *   untouched payments against the new total.
 * - Never rewrites a LOCKED invoice. Once issued or signed, the
 *   customer has seen the document; InvoiceService already refuses the
 *   edit, and that rule is respected rather than worked around. Such
 *   an invoice is reported back as skipped so a caller can tell the
 *   user to issue a supplemental invoice or credit.
 * - No new calculations. Line amounts come from
 *   calculateChangeOrderRevenue, totals from InvoiceService's own
 *   recompute, the estimate total from EstimateService.recalculateTotal.
 */
import type { UUID } from "./types";
import type { ChangeOrder, ChangeOrderService } from "./changeOrderService";
import type { EstimateService } from "./estimateService";
import type { Invoice, InvoiceLineItem, InvoiceService } from "./invoiceService";
import { calculateChangeOrderRevenue } from "./financialCalculations";

/** Marker written into an invoice line item's `description` to record
 * which change order it bills. An existing text column carrying a
 * machine-readable tag — deliberately NOT a new column. */
const CHANGE_ORDER_MARKER = "change-order:";

export function changeOrderLineDescription(changeOrderId: UUID): string {
  return `${CHANGE_ORDER_MARKER}${changeOrderId}`;
}

/** The change order a line bills, or null for an ordinary scope line. */
export function changeOrderIdFromLine(line: { description: string | null }): UUID | null {
  const d = line.description ?? "";
  return d.startsWith(CHANGE_ORDER_MARKER) ? d.slice(CHANGE_ORDER_MARKER.length) : null;
}

/**
 * Every change order id billed somewhere in these line-item sets.
 *
 * THE guard against double-counting revenue — FinancialEngine uses
 * this to decide which approved change orders still need adding on top
 * of invoicesTotal. Callers pass only REVENUE invoices (void/cancelled
 * excluded), so a change order billed solely on a voided invoice
 * correctly returns to "unbilled" and starts counting again.
 */
export function billedChangeOrderIds(lineItemSets: InvoiceLineItem[][]): Set<UUID> {
  const billed = new Set<UUID>();
  for (const lines of lineItemSets) {
    for (const li of lines) {
      const id = changeOrderIdFromLine(li);
      if (id) billed.add(id);
    }
  }
  return billed;
}

export interface ChangeOrderSyncDeps {
  estimateService: EstimateService;
  invoiceService: InvoiceService;
  changeOrderService: ChangeOrderService;
}

export interface ChangeOrderSyncResult {
  /** False only when something genuinely failed; "nothing to sync" is
   * a success, not an error. */
  ok: boolean;
  /** The invoice that was updated, if one was. */
  invoice?: Invoice;
  /** Why no invoice was updated — for the caller to surface. */
  skipped?: "no-invoice" | "locked" | "no-approved-change-orders";
  message?: string;
}

/** An invoice that can still represent this estimate's billing. Void
 * and cancelled are dead documents (isRevenueInvoice's rule, applied
 * to the same lifecycle field), and soft-deleted ones never come back
 * from the service at all. */
function isSyncableInvoice(invoice: Invoice, estimateId: UUID): boolean {
  return (
    invoice.estimateId === estimateId &&
    invoice.lifecycleStatus !== "void" &&
    invoice.lifecycleStatus !== "cancelled" &&
    !invoice.deletedAt
  );
}

/**
 * Bring the estimate's invoice in line with its approved change
 * orders. Safe to call repeatedly — the marker makes it converge on
 * the same result rather than appending duplicate lines.
 */
export async function syncInvoiceWithApprovedChangeOrders(
  deps: ChangeOrderSyncDeps,
  estimateId: UUID
): Promise<ChangeOrderSyncResult> {
  const { estimateService, invoiceService, changeOrderService } = deps;

  // 1. Recalculate the estimate from its own line items, through the
  //    service that owns that formula. ChangeOrderService already does
  //    this on mutation; repeating it here means this workflow is
  //    correct when called directly too, and it is idempotent.
  const estimate = await estimateService.getById(estimateId, true);
  if (!estimate) return { ok: false, message: "Estimate not found." };
  await estimateService.recalculateTotal(estimateId);

  // 2. Find the existing invoice. Never create one.
  const invoices = await invoiceService.listForProject(estimate.projectId);
  const syncable = invoices.filter((inv) => isSyncableInvoice(inv, estimateId));
  if (syncable.length === 0) {
    return { ok: true, skipped: "no-invoice", message: "This estimate has no active invoice to update." };
  }
  // Oldest first: the auto-generated invoice from signing is the one
  // that represents this estimate's billing. Deterministic, so
  // repeated runs always target the same document.
  const target = [...syncable].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  // listForProject returns invoices WITHOUT their line items — only
  // getById carries them, and this workflow is entirely about line
  // items.
  const invoice = await invoiceService.getById(target.id);
  if (!invoice) return { ok: false, message: "Invoice not found." };

  const approved = (await changeOrderService.listForEstimate(estimateId)).filter(
    (co) => co.status === "approved" && !co.deletedAt
  );

  // 3. Build the new line-item set: every ORIGINAL scope line kept
  //    verbatim, then one line per approved change order. Rebuilding
  //    the change-order lines from scratch (rather than appending) is
  //    what makes this idempotent and what lets an un-approved or
  //    deleted change order drop back off the invoice.
  const scopeLines = invoice.lineItems.filter((li) => changeOrderIdFromLine(li) === null);
  const changeOrderLines = approved.map((co) => toLineItem(co));
  const nextLines = [...scopeLines, ...changeOrderLines].map((li) => ({
    name: li.name,
    description: li.description,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
  }));

  // Nothing would change — don't write, so an invoice with no approved
  // change orders is never touched at all.
  if (!linesDiffer(invoice.lineItems, nextLines)) {
    return {
      ok: true,
      invoice,
      skipped: approved.length === 0 ? "no-approved-change-orders" : undefined,
      message: approved.length === 0 ? "No approved change orders to bill." : undefined,
    };
  }

  // 4. A locked invoice is a document the customer has already been
  //    issued. InvoiceService refuses the edit and that is the correct
  //    accounting rule — surfaced, not circumvented.
  if (invoice.isLocked) {
    return {
      ok: true,
      invoice,
      skipped: "locked",
      message:
        `Invoice ${invoice.invoiceNumber} is already issued and cannot be rewritten. ` +
        `Issue a supplemental invoice for the approved change order instead.`,
    };
  }

  // 5. Through InvoiceService, which recomputes subtotal/total itself.
  //    Payments are untouched: they are separate records keyed by
  //    invoice id, and the invoice's derived status re-derives from
  //    them against the new total on the next read.
  const result = await invoiceService.updateLineItems(invoice.id, nextLines);
  if (!result.valid || !result.invoice) {
    return { ok: false, invoice, message: result.issues?.[0]?.message ?? "Could not update the invoice." };
  }
  return { ok: true, invoice: result.invoice };
}

function toLineItem(co: ChangeOrder): Omit<InvoiceLineItem, "id" | "total"> {
  return {
    name: `${co.changeOrderNumber} — ${co.title}`,
    description: changeOrderLineDescription(co.id),
    quantity: 1,
    // The ONE change-order revenue formula, same one FinancialEngine
    // and every change-order UI already use. Tax is folded in because
    // an invoice line has no tax field of its own.
    unitPrice: calculateChangeOrderRevenue(co.totalAmount, co.tax),
  };
}

function linesDiffer(
  current: InvoiceLineItem[],
  next: Array<Omit<InvoiceLineItem, "id" | "total">>
): boolean {
  if (current.length !== next.length) return true;
  return current.some((li, i) => {
    const n = next[i];
    return (
      li.name !== n.name ||
      (li.description ?? null) !== (n.description ?? null) ||
      li.quantity !== n.quantity ||
      li.unitPrice !== n.unitPrice
    );
  });
}
