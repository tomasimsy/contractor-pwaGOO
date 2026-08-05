/**
 * Layer 2 — owns `estimates` + `estimate_items`. Scoped down to what
 * the original brief asked for: "customer proposal / contract offer,"
 * nothing else. Deliberately has NO method that returns profit,
 * outstanding balance, or cost data — that discipline is what stops
 * this table from sliding back into the overloaded role it played in
 * contractor-pwa (simultaneously sales doc + cost ledger parent +
 * payables parent). A project can have more than one estimate
 * (original + a revised-scope redo); this service treats that as the
 * normal case, not an edge case.
 *
 * Change orders moved out to ChangeOrderService (changeOrderService.ts)
 * during the service-layer completion pass — see that file's header
 * for why. This service now owns only the proposal document itself.
 */
import type { UUID, AuditedEntity, EstimateStatus, ValidationResult, QueryScope } from "./types";

export type EstimateLineItemUnit = "EA" | "SF" | "SQFT" | "SQ" | "LF" | "FT" | "HR" | "DAY" | "LS";

export interface EstimateLineItem {
  id: UUID;
  category: "material" | "labor" | "other";
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  /** Optional unit of measure (EA, SF, SQFT, SQ, LF, FT, HR, DAY, LS). Undefined/null for legacy rows. */
  unit?: EstimateLineItemUnit | null;
  total: number;
  taxable: boolean;
}

export interface Estimate extends AuditedEntity {
  projectId: UUID;
  clientId: UUID | null;
  estimateNumber: string | null;
  title: string | null;
  /** Free-text project overview shown on the estimate (and its PDF) —
   * the real, live `estimates.description` column (distinct from
   * `title`, which is a short document label). Previously never
   * mapped anywhere in this service, so existing description text on
   * live rows was invisible in the app despite being read and
   * rendered by the PDF route (app/api/estimates/[id]/pdf) all along. */
  description: string | null;
  status: EstimateStatus;
  /** DERIVED — never set directly. Always the sum of this estimate's
   * currently-active (non-soft-deleted) line items, computed by
   * financialCalculations.calculateSubtotal. The only writer is
   * lib/services/supabase/estimateService.ts's private
   * writeRecalculatedTotals (see that file's header for the full
   * "why this is derived" audit); every caller reaches it through
   * recalculateTotal(), never a bare field assignment. */
  subtotal: number;
  markup: number;
  discount: number;
  taxRate: number;
  /** DERIVED — never set directly. Always
   * calculateDocumentTotal(subtotal, markup, discount, taxRate).total,
   * recomputed from scratch on every write, never incremented/
   * decremented. A PROPOSAL figure only — FinancialEngine must never
   * read this as project revenue; see its own doc comment on why
   * revenue is computed from invoices/change orders instead. Approved
   * change orders NEVER contribute to this field — their effect is
   * always the separate, NEVER-PERSISTED "revised total"
   * (financialCalculations.calculateRevisedEstimateTotal = this total
   * + sum of currently-approved change orders), computed fresh by
   * every page that shows it, every time. There is no `revisedTotal`
   * column and there must never be one — persisting it would
   * reintroduce the exact "change order amount cached onto the
   * estimate" anti-pattern this rebuild removed (see
   * changeOrderService.ts's header). */
  total: number;
  // Requested deposit — a PROPOSAL TERM ("we require 30% down"), not a
  // payment-tracking field. Deliberately has no depositPaid/depositPaidAt
  // sibling: contractor-pwa duplicated that boolean across estimates AND
  // invoices and they drifted. Actually collecting a deposit means
  // generating a real invoice for this amount (InvoiceService) and
  // recording a real payment against it (PaymentService) — see
  // useEstimateForm's requestDeposit, which is workflow orchestration,
  // not a field this service tracks as "paid."
  depositAmount: number;
  signature: { type: "draw" | "type"; value: string; date: string } | null;
  /** Opaque per-estimate capability token backing the customer portal.
   * Safe to expose to STAFF (they need it to build the share link);
   * never returned by the portal RPC itself. Null before the token
   * backfill migration. */
  customerToken: string | null;
  /** Estimate classification: 'standard' (line-item based) or
   * 'roofing' (area-based with photos). Defaults to 'standard'. */
  estimateType?: "standard" | "roofing";
}

/**
 * ONE normalized scope line, whatever kind of estimate produced it.
 *
 * A standard estimate's scope lives in `estimate_items`. A ROOFING
 * estimate's lives in `estimate_areas` (+ `estimate_area_line_items`)
 * and carries fields a line item has no business holding — defect,
 * location, corrective action, measurements, before/after photos. The
 * two therefore stay in separate tables, deliberately: merging them
 * would either bloat `estimate_items` with roofing columns or mirror
 * the same dollar in two places.
 *
 * What every CONSUMER actually needs, though, is the same short list:
 * what was quoted, and for how much. `getScopeLines` is that list.
 * It exists so no caller outside EstimateService has to know which
 * tables back which estimate type — the branch that InvoiceService,
 * the customer portal, and EstimateDetail each independently got wrong.
 */
export interface ScopeLine {
  /** Stable id of the underlying row. For an area's repair cost this
   * is the AREA's id — that figure is a property of the area itself,
   * not of a separate record. */
  id: UUID;
  category: "material" | "labor" | "other";
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  unit?: EstimateLineItemUnit | null;
  /** Always quantity × unitPrice via calculateLineItemTotal, or the
   * persisted figure for an area repair cost. Never recomputed by a
   * caller. */
  total: number;
  /** Which underlying record this came from. Presentational only —
   * financially every source is just scope, summed once. */
  source: "estimate_item" | "area_line_item" | "area_repair_cost";
  /** Roofing only: which roof area this line belongs to, for grouping
   * in the PDF. Null for standard estimates. */
  areaId?: UUID | null;
  areaName?: string | null;
}

export interface EstimateService {
  /** `includeDeleted` (default false) — same contract as
   * ProjectService/ClientService.getById: pass `true` when this
   * estimate is looked up purely as context for a different,
   * still-active financial record (e.g. a change order or invoice's
   * own detail page showing which estimate it came from). Financial
   * history is permanent. */
  getById(estimateId: UUID, includeDeleted?: boolean): Promise<(Estimate & { lineItems: EstimateLineItem[] }) | null>;
  /** `includeDeleted` (default false): callers that resolve a FINANCIAL
   * relationship (e.g. ExpenseService.listForProject finding which
   * estimates an expense's estimate_id might reference) must pass
   * `true` — a soft-deleted estimate is still a valid parent for money
   * already spent against it. Financial history is permanent and must
   * never be dropped just because the estimate record itself was
   * later deleted. UI callers (estimate lists, project detail pages)
   * should leave this false, unchanged from today's behavior. */
  listForProject(projectId: UUID, includeDeleted?: boolean): Promise<Estimate[]>;

  /** Company-wide estimate list, for the Estimate List page (search
   * across every project, not just one) — same QueryScope contract as
   * ClientService.list/ProjectService.list. */
  list(scope: QueryScope): Promise<Estimate[]>;

  create(input: {
    companyId: UUID;
    projectId: UUID;
    clientId: UUID | null;
    title?: string;
    description?: string;
    lineItems: Omit<EstimateLineItem, "id" | "total">[];
    markup: number;
    discount: number;
    taxRate: number;
    depositAmount?: number;
    estimateType?: "standard" | "roofing";
  }): Promise<Estimate>;

  updateLineItems(estimateId: UUID, lineItems: Omit<EstimateLineItem, "id" | "total">[]): Promise<Estimate>;

  /** The document-level fields Create/Edit both need beyond line
   * items — title, terms (markup/discount/taxRate/depositAmount), and
   * which project/client it's attached to. Changing markup/discount/
   * taxRate recalculates the total the same way updateLineItems does
   * (both funnel through recalculateTotal internally) — never a bare
   * column write that leaves `total` stale. */
  update(estimateId: UUID, changes: Partial<{ title: string | null; description: string | null; projectId: UUID; clientId: UUID | null; markup: number; discount: number; taxRate: number; depositAmount: number; estimateType: "standard" | "roofing" }>): Promise<Estimate>;

  /** Recomputes subtotal/total from current line items + markup/
   * discount/tax — the ONE implementation of that formula (replaces
   * contractor-pwa's calculateTotal/calculateRevisedTotal in
   * lib/utils/calculations.ts, moved here since it's an estimate
   * concern, not a floating utility). */
  recalculateTotal(estimateId: UUID): Promise<Estimate>;

  /**
   * THE scope of this estimate, normalized — the single answer to
   * "what was quoted, and for how much", regardless of estimate type.
   *
   * This is the ONLY supported way to read an estimate's scope outside
   * this service. `estimate.lineItems` remains available but is the
   * RAW `estimate_items` rows, which are empty (and meaningless) for a
   * roofing estimate — reading them unconditionally is what produced
   * $0 roofing invoices and a customer portal whose breakdown didn't
   * sum to its own total.
   *
   * INVARIANT: `sum(getScopeLines(id).total)` === the estimate's
   * `subtotal`. recalculateTotal is derived from this same call, so
   * the two cannot drift; a test pins it for both estimate types.
   */
  getScopeLines(estimateId: UUID, knownType?: string | null): Promise<ScopeLine[]>;

  changeStatus(estimateId: UUID, toStatus: EstimateStatus): Promise<ValidationResult & { estimate?: Estimate }>;

  /** Customer-facing signing action — the authenticated-staff
   * equivalent of contractor-pwa's sign_public_estimate RPC. The
   * anonymous/public signing path stays a thin RPC at the DB edge (a
   * visitor with a link, no session, can't call into an app-side
   * service) but everything it does maps to this same method. */
  recordSignature(estimateId: UUID, signature: Estimate["signature"]): Promise<Estimate>;

  /** `reason` is validated by ValidationService.validateDeleteReason
   * before anything is written — an empty reason is rejected here, at
   * the service level, regardless of what the calling form already
   * checked. See RELIABILITY.md for why this exists at every layer. */
  softDelete(estimateId: UUID, reason: string): Promise<void>;

  /** Was missing entirely — ProjectService has had restore() since its
   * own soft-delete pass, but EstimateService never got the matching
   * half, making a deleted estimate a dead end with no way back
   * through the UI. Same contract as ProjectService.restore: clears
   * deleted_at/deleted_by/delete_reason, nothing else. */
  restore(estimateId: UUID): Promise<void>;
}
