/**
 * Real Supabase-backed EstimateService — implements the EXISTING
 * EstimateService interface (lib/services/estimateService.ts) against
 * the real, live `estimates` + `estimate_items` tables (same shared
 * Supabase project as contractor-pwa — those tables predate this app
 * and are confirmed live via information_schema.columns dumps during
 * this pass). No parallel estimate system, no new tables: `project_id`
 * and `client_id` already exist on the live `estimates` table, so an
 * Estimate can be created against a Project with zero schema changes.
 *
 * Calculation math is NOT reimplemented here — every subtotal/total/
 * line-item/deposit computation delegates to financialCalculations.ts,
 * the same functions the in-memory EstimateService (testing/
 * inMemoryServices.ts) already uses, so both share one formula.
 *
 * Numbering reuses contractor-pwa's exact format (`OSR<year><4-digit
 * sequence>`, see lib/utils/estimateNumber.ts there) rather than
 * inventing a new scheme, but adds retry-on-conflict: the live table
 * has a documented history of a real duplicate estimate_number
 * (STRESS_TEST_REPORT.md / DATABASE_INTEGRITY_AUDIT.md finding #6)
 * caused by that generator's plain count+1 race. Once
 * estimates_company_number_unique (supabase/migrations/
 * 20260730000300_unique_estimate_invoice_numbers.sql) is applied, a
 * collision surfaces as a real 23505 here instead of a silent
 * duplicate — retried a few times with the next candidate number
 * before giving up.
 *
 * Audit logging for create/update is the generic `log_audit_change()`
 * trigger, same as ClientService/ProjectService — `estimates` is
 * already in that trigger's table list. Status transitions
 * additionally call AuditService.recordStatusChange for the semantic
 * "why," matching the interface's own doc comment.
 *
 * ---------------------------------------------------------------
 * `subtotal` / `total` are DERIVED, not user-editable, columns.
 * ---------------------------------------------------------------
 * They are always computed from source data (active estimate_items +
 * markup/discount/taxRate) via calculateSubtotal/calculateDocumentTotal
 * — never accepted as raw input from a caller, never incremented or
 * decremented. "Revised total" (subtotal/total + approved change
 * order revenue) is derived a level further and is NEVER persisted
 * anywhere — see financialCalculations.calculateRevisedEstimateTotal,
 * always computed at display/read time from the estimate's current
 * `total` plus whatever change orders are currently approved.
 *
 * A repo-wide grep audit (2026-07-24) confirmed `writeRecalculatedTotals`
 * below is the ONLY function in this codebase that ever writes
 * `estimates.subtotal` or `estimates.total` (the other write site is
 * this file's own `create()`, which computes the row's INITIAL values
 * the same way, before any row exists to recalculate). No page,
 * component, or other service issues a raw `.update({ subtotal, ... })`
 * / `.update({ total, ... })` against `estimates` — `EstimateService.
 * update()`'s public `changes` parameter type doesn't even include
 * these fields, so TypeScript itself refuses a caller that tries.
 * `update()` additionally asserts this at runtime (see its own
 * comment) in case that type is ever loosened by a future change.
 *
 * If you are about to write `estimates.subtotal` or `estimates.total`
 * anywhere else: don't. Call `recalculateTotal(estimateId)` instead —
 * every financial mutation (line item edits, markup/discount/tax
 * changes, and every ChangeOrderService create/update/approve/reject/
 * delete/restore) already does.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Estimate, EstimateLineItem, EstimateService, ScopeLine } from "../estimateService";
import type { UUID, EstimateStatus, ValidationResult, QueryScope } from "../types";
import type { ValidationService } from "../validationService";
import type { AuditService } from "../auditService";
import type { ProjectService } from "../projectService";
import { calculateLineItemTotal, calculateSubtotal, calculateDocumentTotal, validateDepositAmount, needsTotalRecalculation } from "../financialCalculations";
import { DEFAULT_ESTIMATE_TERMS_TEMPLATE, type EstimateTermsTemplateKey } from "../../estimateTerms";

interface EstimateRow {
  id: string;
  company_id: string;
  project_id: string;
  client_id: string | null;
  estimate_number: string | null;
  title: string | null;
  description: string | null;
  status: string;
  subtotal: number;
  markup: number;
  discount: number;
  tax_rate: number;
  total: number;
  deposit_amount: number | null;
  signature: Estimate["signature"];
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  customer_token: string | null;
  estimate_type: "standard" | "roofing";
  terms_template: string | null;
}

interface EstimateItemRow {
  id: string;
  estimate_id: string;
  category: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  unit: string | null;
  total: number;
  taxable: boolean;
  deleted_at: string | null;
}

function rowToEstimate(row: EstimateRow): Estimate {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    clientId: row.client_id,
    estimateNumber: row.estimate_number,
    title: row.title,
    description: row.description,
    status: row.status as EstimateStatus,
    subtotal: row.subtotal,
    markup: row.markup,
    discount: row.discount,
    taxRate: row.tax_rate,
    total: row.total,
    depositAmount: row.deposit_amount ?? 0,
    signature: row.signature,
    customerToken: row.customer_token,
    estimateType: row.estimate_type,
    // Nullish-coalesced rather than trusted verbatim: a row written
    // before this column existed (or a stale REST schema cache mid-
    // deploy) has no value here, and "custom" is this app's own
    // documented default for exactly that case — see the migration's
    // header on why "custom" specifically.
    termsTemplate: (row.terms_template as EstimateTermsTemplateKey | null) ?? "custom",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

function itemRowToLineItem(row: EstimateItemRow): EstimateLineItem {
  return {
    id: row.id,
    category: row.category as EstimateLineItem["category"],
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    unit: (row.unit as EstimateLineItem["unit"]) ?? null,
    total: row.total,
    taxable: row.taxable,
  };
}

async function generateEstimateNumber(supabase: SupabaseClient, attempt = 0): Promise<string> {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from("estimates")
    .select("estimate_number")
    .ilike("estimate_number", `OSR${year}%`)
    .order("created_at", { ascending: false });

  let maxNum = 0;
  for (const row of (data ?? []) as { estimate_number: string | null }[]) {
    const match = row.estimate_number?.match(new RegExp(`OSR${year}(\\d+)`));
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  const next = maxNum + 1 + attempt;
  return `OSR${year}${next.toString().padStart(4, "0")}`;
}

export function createSupabaseEstimateService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  auditService: AuditService,
  currentUserId: () => Promise<UUID | null>,
  projectService: ProjectService
): EstimateService {
  /**
   * The ONLY place in this entire codebase allowed to write
   * `estimates.subtotal`/`total` — a grep audit across every service,
   * page, and component confirmed no other call site touches these
   * columns (see estimateService.ts's file-level doc comment for the
   * full audit). Every writer (create()'s initial insert excepted —
   * see its own comment) goes through this function, never a bare
   * `.update({ subtotal, total })` of its own, so there is exactly one
   * code path physically capable of persisting these derived values.
   *
   * Deliberately takes ONLY `estimateId` — not a subtotal/total to
   * write — because accepting caller-supplied numbers is exactly the
   * shape of bug this function exists to make impossible: it always
   * derives both values itself, fresh, from the estimate's own
   * markup/discount/taxRate and its CURRENTLY active line items. There
   * is no parameter here a caller could use to inject an incorrect or
   * incrementally-adjusted total.
   */
  /**
   * Subtotal source for a roofing estimate: the sum of every non-
   * deleted line item across every non-deleted roofing area on this
   * estimate (Estimate Roof V2). Reuses calculateSubtotal — the exact
   * same Layer 0 function estimate_items-based subtotals use — so
   * markup/discount/tax/total/deposit all still flow through
   * calculateDocumentTotal() unchanged below. This function ONLY
   * decides which rows feed the subtotal; it does not reimplement any
   * part of the calculation itself.
   */
  /**
   * A ROOFING estimate's scope, as normalized lines.
   *
   * TWO additive sources, both real and both required:
   *   1. `estimate_area_line_items` — granular per-area lines.
   *   2. each area's own `estimated_repair_cost` (material + labor +
   *      tax, computed by calculateAreaRepairCost and persisted on the
   *      area row) — an area may carry this with no line items at all.
   * An area using only one of the two is unaffected by the other; the
   * unused figure is 0. This composition rule now lives in exactly ONE
   * place. It was previously duplicated inside
   * InvoiceService.createFromEstimate, which had to re-derive it to
   * avoid issuing invoices worth less than the approved estimate.
   */
  async function roofingScopeLines(estimateId: UUID): Promise<ScopeLine[]> {
    const { data: areas, error: areasError } = await supabase
      .from("estimate_areas")
      .select("id, area_name, estimated_repair_cost, sequence_number")
      .eq("estimate_id", estimateId)
      .is("deleted_at", null)
      .order("sequence_number", { ascending: true });
    if (areasError) throw new Error(`Failed to load roofing areas: ${areasError.message}`);

    const areaRows = (areas || []) as Array<{ id: string; area_name: string | null; estimated_repair_cost: number | null; sequence_number: number | null }>;
    if (areaRows.length === 0) return [];
    const areaIds = areaRows.map((a) => a.id);

    const { data: lineItemRows, error: lineItemsError } = await supabase
      .from("estimate_area_line_items")
      .select("*")
      .in("estimate_area_id", areaIds)
      .is("deleted_at", null)
      .order("sequence_number", { ascending: true });
    if (lineItemsError) throw new Error(`Failed to load roofing area line items: ${lineItemsError.message}`);

    const areaById = new Map(areaRows.map((a) => [a.id, a] as const));
    const lines: ScopeLine[] = [];

    for (const row of (lineItemRows || []) as Array<Record<string, unknown>>) {
      const areaId = row.estimate_area_id as string;
      lines.push({
        id: row.id as string,
        category: (row.category as ScopeLine["category"]) ?? "other",
        name: (row.name as string) ?? "",
        description: (row.description as string | null) ?? null,
        quantity: (row.quantity as number) ?? 0,
        unitPrice: (row.unit_price as number) ?? 0,
        unit: (row.unit as ScopeLine["unit"]) ?? null,
        total: (row.total as number) ?? 0,
        source: "area_line_item",
        areaId,
        areaName: areaById.get(areaId)?.area_name ?? null,
      });
    }

    for (const area of areaRows) {
      const repairCost = area.estimated_repair_cost ?? 0;
      if (repairCost === 0) continue;
      lines.push({
        // The AREA's id: this figure is a property of the area itself,
        // not of a separate record.
        id: area.id,
        category: "other",
        name: `${area.area_name ?? "Roof area"} - Estimated Repair Cost`,
        description: "Materials + labor + tax carried from approved estimate",
        quantity: 1,
        unitPrice: repairCost,
        unit: null,
        total: repairCost,
        source: "area_repair_cost",
        areaId: area.id,
        areaName: area.area_name ?? null,
      });
    }

    return lines;
  }

  /** A STANDARD estimate's scope: its `estimate_items` rows, verbatim. */
  async function standardScopeLines(estimateId: UUID): Promise<ScopeLine[]> {
    const { data: itemRows, error } = await supabase
      .from("estimate_items").select("*").eq("estimate_id", estimateId).is("deleted_at", null);
    if (error) throw new Error(`Failed to load estimate line items: ${error.message}`);
    return (itemRows as EstimateItemRow[]).map(itemRowToLineItem).map((li) => ({
      id: li.id,
      category: li.category,
      name: li.name,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      unit: li.unit ?? null,
      total: li.total,
      source: "estimate_item" as const,
      areaId: null,
      areaName: null,
    }));
  }

  /** See the interface doc. The ONE place the estimate_type branch for
   * SCOPE lives; every consumer calls this instead of branching.
   *
   * `knownType` is an internal fast path, not part of the public
   * contract: getById and writeRecalculatedTotals have ALREADY loaded
   * the estimate row, so re-reading `estimate_type` here cost a third
   * round-trip on the hottest read in the app — measured at 8 redundant
   * `select=estimate_type` queries on one Estimate Detail load. Callers
   * that don't have the row omit it and the lookup happens as before. */
  async function getScopeLines(estimateId: UUID, knownType?: string | null): Promise<ScopeLine[]> {
    let estimateType = knownType;
    if (estimateType === undefined) {
      const { data: row, error } = await supabase
        .from("estimates").select("estimate_type").eq("id", estimateId).maybeSingle();
      if (error) throw new Error(`Failed to load estimate: ${error.message}`);
      if (!row) return [];
      estimateType = (row as { estimate_type: string | null }).estimate_type;
    }
    return estimateType === "roofing"
      ? roofingScopeLines(estimateId)
      : standardScopeLines(estimateId);
  }

  async function writeRecalculatedTotals(estimateId: UUID): Promise<Estimate> {
    const { data: estimateRow, error } = await supabase.from("estimates").select("*").eq("id", estimateId).single();
    if (error) throw new Error(`Failed to load estimate: ${error.message}`);
    const estimate = rowToEstimate(estimateRow as EstimateRow);

    // The estimate financial engine (calculateDocumentTotal below) does
    // not know or care where the subtotal came from — only WHICH rows
    // feed it differs by estimate_type. Standard estimates: sum of
    // estimate_items (unchanged). Roofing estimates: sum of every roof
    // area's line items (Estimate Roof V2) — estimate_items stays
    // unused/empty for roofing estimates, so this never double-counts.
    // Derived from getScopeLines, NOT from a parallel per-type sum —
    // so "what this estimate is worth" and "what this estimate quotes"
    // are one computation. A test pins sum(scope) === subtotal for both
    // estimate types.
    const subtotal = calculateSubtotal(await getScopeLines(estimateId, estimate.estimateType));
    const { total } = calculateDocumentTotal(subtotal, estimate.markup, estimate.discount, estimate.taxRate);

    const { data, error: updateError } = await supabase.from("estimates").update({ subtotal, total }).eq("id", estimateId).select().single();
    if (updateError) throw new Error(`Failed to write recalculated estimate totals: ${updateError.message}`);
    return rowToEstimate(data as EstimateRow);
  }

  /**
   * Self-healing read: `estimates.subtotal`/`total` are written by
   * this service on every mutation (see recalculateTotal's doc
   * comment), but this DB is also still live-edited by the ORIGINAL
   * contractor-pwa app, which soft-deletes/reinserts estimate_items on
   * save WITHOUT recalculating subtotal/total afterward — found live:
   * estimate 53e7fdf9 had all 6 of its line items soft-deleted by an
   * edit made outside this app, leaving `total`/`subtotal` frozen at
   * $5,800 against zero active items. No write path in THIS app can
   * prevent that (it's an external app editing the same tables), so
   * the fix has to be on the READ side: every getById() recomputes
   * subtotal/total fresh from the CURRENTLY active line items and
   * persists the correction if it differs from what's stored — the
   * estimate is corrected automatically the moment anyone views it,
   * not through a one-off manual data patch. list()/listForProject()
   * still return the stored columns (recomputing for every row in a
   * list would be an N+1 query cost); once any estimate has been
   * viewed once through getById, its stored value is self-corrected
   * for those list views too.
   */
  async function getById(estimateId: UUID, includeDeleted = false): Promise<(Estimate & { lineItems: EstimateLineItem[] }) | null> {
    let estimateQuery = supabase.from("estimates").select("*").eq("id", estimateId);
    if (!includeDeleted) estimateQuery = estimateQuery.is("deleted_at", null);
    const { data: estimateRow, error } = await estimateQuery.maybeSingle();
    if (error) throw new Error(`Failed to load estimate: ${error.message}`);
    if (!estimateRow) return null;

    const { data: itemRows, error: itemsError } = await supabase.from("estimate_items").select("*").eq("estimate_id", estimateId).is("deleted_at", null);
    if (itemsError) throw new Error(`Failed to load estimate line items: ${itemsError.message}`);
    const lineItems = (itemRows as EstimateItemRow[]).map(itemRowToLineItem);

    let estimate = rowToEstimate(estimateRow as EstimateRow);
    // Self-healing comparison basis must match writeRecalculatedTotals'
    // source selection (roofing → area line items, standard →
    // estimate_items) — otherwise every getById() on a roofing estimate
    // would compare its correct, already-persisted subtotal against 0
    // (since `lineItems`/estimate_items are unused for roofing) and
    // force a spurious recalculation on every read.
    const subtotal = calculateSubtotal(await getScopeLines(estimateId, estimate.estimateType));
    const { total } = calculateDocumentTotal(subtotal, estimate.markup, estimate.discount, estimate.taxRate);

    if (needsTotalRecalculation(estimate, { subtotal, total })) {
      // Re-derives via writeRecalculatedTotals rather than writing
      // {subtotal, total} inline here a second time — this file has
      // exactly ONE function that ever issues that update, everywhere.
      estimate = await writeRecalculatedTotals(estimateId);
    }

    return { ...estimate, lineItems };
  }

  async function listForProject(projectId: UUID, includeDeleted = false): Promise<Estimate[]> {
    let query = supabase.from("estimates").select("*").eq("project_id", projectId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list estimates: ${error.message}`);
    return (data as EstimateRow[]).map(rowToEstimate);
  }

  async function list(scope: QueryScope): Promise<Estimate[]> {
    let query = supabase.from("estimates").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list estimates: ${error.message}`);
    return (data as EstimateRow[]).map(rowToEstimate);
  }

  async function create(input: {
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
    termsTemplate?: EstimateTermsTemplateKey;
  }): Promise<Estimate> {
    // Project ownership: the project must belong to the caller's own
    // company — mirrors ProjectService's own clientOwnership check.
    const project = await projectService.getById(input.projectId);
    if (!project) throw new Error("Project not found.");
    const ownership = validationService.validateCompanyOwnership({ payloadCompanyId: project.companyId, sessionCompanyId: input.companyId });
    if (!ownership.valid) throw new Error(ownership.issues[0]?.message ?? "This project does not belong to your company.");

    for (const li of input.lineItems) {
      const check = validationService.validateLineItem(li);
      if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    }

    const lineItemsWithTotal = input.lineItems.map((li) => ({ ...li, total: calculateLineItemTotal(li) }));
    const subtotal = calculateSubtotal(lineItemsWithTotal);
    const { total } = calculateDocumentTotal(subtotal, input.markup, input.discount, input.taxRate);

    const depositCheck = validateDepositAmount(input.depositAmount ?? 0, total);
    if (!depositCheck.valid) throw new Error(depositCheck.message);

    const actorId = await currentUserId();

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const estimateNumber = await generateEstimateNumber(supabase, attempt);
      const { data, error } = await supabase
        .from("estimates")
        .insert({
          company_id: input.companyId,
          project_id: input.projectId,
          client_id: input.clientId,
          estimate_number: estimateNumber,
          title: input.title ?? null,
          description: input.description ?? null,
          status: "draft",
          subtotal,
          markup: input.markup,
          discount: input.discount,
          tax_rate: input.taxRate,
          total,
          deposit_amount: input.depositAmount ?? 0,
          estimate_type: input.estimateType ?? "standard",
          terms_template: input.termsTemplate ?? DEFAULT_ESTIMATE_TERMS_TEMPLATE,
          // Portal capability token, minted at creation so every new
          // estimate is shareable immediately. Without this only rows
          // touched by the backfill migration would have one, and any
          // estimate created afterwards would silently render "no
          // portal link yet" — caught when a token audit came back
          // 20/21 right after the migration.
          customer_token: crypto.randomUUID(),
          created_by: actorId,
        })
        .select()
        .single();

      if (!error) {
        const estimate = rowToEstimate(data as EstimateRow);
        if (lineItemsWithTotal.length > 0) {
          const { error: itemsError } = await supabase.from("estimate_items").insert(
            lineItemsWithTotal.map((li) => ({
              estimate_id: estimate.id,
              // REQUIRED by RLS. `estimate_items` has its own company_id
              // and the insert policy checks it; omitting it fails with
              // "new row violates row-level security policy". This was
              // dropped when the original app's query was ported —
              // invoice_items and change_order_line_items both set it,
              // estimate_items was the one that didn't.
              company_id: input.companyId,
              category: li.category,
              name: li.name,
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unitPrice,
              unit: li.unit ?? null,
              total: li.total,
              taxable: li.taxable,
            }))
          );
          if (itemsError) throw new Error(`Failed to save estimate line items: ${itemsError.message}`);
        }
        return estimate;
      }

      // 23505 = unique_violation — a numbering race; retry with the next number.
      if (error.code === "23505") {
        lastError = error;
        continue;
      }
      throw new Error(`Failed to create estimate: ${error.message}`);
    }
    throw new Error(`Failed to create estimate after retrying a numbering conflict: ${(lastError as { message?: string })?.message ?? "unknown error"}`);
  }

  async function updateLineItems(estimateId: UUID, lineItems: Omit<EstimateLineItem, "id" | "total">[]): Promise<Estimate> {
    for (const li of lineItems) {
      const check = validationService.validateLineItem(li);
      if (!check.valid) throw new Error(check.issues.map((i) => i.message).join("; "));
    }

    // The parent's company_id — required on every child row by RLS.
    const { data: parent, error: parentError } = await supabase
      .from("estimates").select("company_id, estimate_type").eq("id", estimateId).single();
    if (parentError) throw new Error(`Failed to load estimate: ${parentError.message}`);
    const companyId = (parent as { company_id: string }).company_id;

    // A ROOFING estimate's scope lives in its roof areas; `estimate_items`
    // contributes nothing to its subtotal (see getScopeLines). Writing
    // here would create rows that are invisible to every total — the
    // exact defect that let a user edit a line item from $10 to $9 on a
    // roofing estimate, see it save, and watch the total never move.
    // Refused loudly rather than silently ignored, so a caller that
    // means to edit roofing scope is told where it actually lives.
    if ((parent as { estimate_type: string | null }).estimate_type === "roofing") {
      throw new Error(
        "This is a roofing estimate — its scope lives in roof areas, not line items. Edit it through the roof area editor (RoofingAreaService / EstimateAreaLineItemService)."
      );
    }

    const { error: deleteError } = await supabase.from("estimate_items").delete().eq("estimate_id", estimateId);
    if (deleteError) throw new Error(`Failed to update estimate line items: ${deleteError.message}`);

    const lineItemsWithTotal = lineItems.map((li) => ({ ...li, total: calculateLineItemTotal(li) }));
    if (lineItemsWithTotal.length > 0) {
      const { error: insertError } = await supabase.from("estimate_items").insert(
        lineItemsWithTotal.map((li) => ({
          estimate_id: estimateId,
          company_id: companyId,
          category: li.category,
          name: li.name,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unitPrice,
          unit: li.unit ?? null,
          total: li.total,
          taxable: li.taxable,
        }))
      );
      if (insertError) throw new Error(`Failed to save estimate line items: ${insertError.message}`);
    }

    return recalculateTotal(estimateId);
  }

  async function update(
    estimateId: UUID,
    changes: Partial<{ title: string | null; description: string | null; projectId: UUID; clientId: UUID | null; markup: number; discount: number; taxRate: number; depositAmount: number; estimateType: "standard" | "roofing"; termsTemplate: EstimateTermsTemplateKey }>
  ): Promise<Estimate> {
    // Defense-in-depth: `changes`'s type already excludes subtotal/
    // total, so this can only fire if that type is loosened later (an
    // `as any` cast, a copy-paste from another update() signature,
    // etc.) — loudly reject rather than silently letting a derived
    // column be set to whatever a caller computed, which is exactly
    // the class of bug (a manually-maintained total) this whole
    // service exists to prevent. See this file's header comment.
    for (const forbidden of ["subtotal", "total", "revisedTotal"]) {
      if (forbidden in changes) {
        throw new Error(`EstimateService.update() cannot set "${forbidden}" — it is a derived value. Call recalculateTotal() instead.`);
      }
    }

    // An estimate's KIND is immutable once it has scope. Flipping
    // standard <-> roofing silently moves the total between two
    // different tables: a $10,000 standard estimate becomes $0 the
    // instant it is called "roofing" (its estimate_items stop counting
    // and it has no roof areas yet), and the reverse strands real
    // roofing scope. Nothing recalculates the OLD source afterwards, so
    // the damage is invisible until someone reads the total. Cheap to
    // forbid, expensive to detect.
    if (changes.estimateType !== undefined) {
      const { data: currentRow, error } = await supabase
        .from("estimates").select("estimate_type").eq("id", estimateId).single();
      if (error) throw new Error(`Failed to load estimate: ${error.message}`);
      const currentType = (currentRow as { estimate_type: string | null }).estimate_type ?? "standard";
      if (changes.estimateType !== currentType) {
        const existingScope = await getScopeLines(estimateId);
        if (existingScope.length > 0) {
          throw new Error(
            `This estimate already has scope recorded, so its type cannot be changed from "${currentType}" to "${changes.estimateType}". Its total is derived from ${currentType === "roofing" ? "roof areas" : "line items"}; switching would strand that scope. Create a new estimate instead.`
          );
        }
      }
    }

    if (changes.projectId !== undefined) {
      const { data: currentRow, error } = await supabase.from("estimates").select("company_id").eq("id", estimateId).single();
      if (error) throw new Error(`Failed to load estimate: ${error.message}`);
      const project = await projectService.getById(changes.projectId);
      if (!project) throw new Error("Project not found.");
      const ownership = validationService.validateCompanyOwnership({ payloadCompanyId: project.companyId, sessionCompanyId: (currentRow as { company_id: string }).company_id });
      if (!ownership.valid) throw new Error(ownership.issues[0]?.message ?? "This project does not belong to your company.");
    }

    const payload: Record<string, unknown> = {};
    if (changes.title !== undefined) payload.title = changes.title;
    if (changes.description !== undefined) payload.description = changes.description;
    if (changes.projectId !== undefined) payload.project_id = changes.projectId;
    if (changes.clientId !== undefined) payload.client_id = changes.clientId;
    if (changes.markup !== undefined) payload.markup = changes.markup;
    if (changes.discount !== undefined) payload.discount = changes.discount;
    if (changes.taxRate !== undefined) payload.tax_rate = changes.taxRate;
    if (changes.depositAmount !== undefined) payload.deposit_amount = changes.depositAmount;
    if (changes.estimateType !== undefined) payload.estimate_type = changes.estimateType;
    if (changes.termsTemplate !== undefined) payload.terms_template = changes.termsTemplate;

    if (Object.keys(payload).length > 0) {
      const { error } = await supabase.from("estimates").update(payload).eq("id", estimateId);
      if (error) throw new Error(`Failed to update estimate: ${error.message}`);
    }

    if (changes.markup !== undefined || changes.discount !== undefined || changes.taxRate !== undefined) {
      return recalculateTotal(estimateId);
    }
    const { data, error } = await supabase.from("estimates").select("*").eq("id", estimateId).single();
    if (error) throw new Error(`Failed to load estimate: ${error.message}`);
    return rowToEstimate(data as EstimateRow);
  }

  /**
   * The ONE place `estimates.total` is ever written after creation —
   * a true source-of-truth REBUILD, never incremental math. Rebuilds
   * `subtotal`/`total` from scratch every time: fetches the estimate
   * row only for markup/discount/taxRate (the row's OWN prior `total`
   * is fetched incidentally but never read as an input below — it's
   * discarded, not added to or subtracted from), fetches every
   * CURRENTLY-ACTIVE line item fresh, and recomputes via
   * calculateSubtotal/calculateDocumentTotal. Change orders are never
   * read here and never contribute to this figure — an approved
   * change order's effect is ALWAYS the separate, derived "Revised
   * Total" (financialCalculations.calculateRevisedEstimateTotal =
   * this total + sum of approved change orders), computed at display
   * time by callers, never folded back into this column. Every
   * mutation that can affect this figure (updateLineItems, update()
   * when markup/discount/taxRate change, and every ChangeOrderService
   * mutation — create/update/approve/reject/delete/restore) calls
   * this same function afterward, so there is exactly one recalculation
   * formula and no caller ever increments/decrements a stored total.
   */
  /**
   * Public entry point for "something that can affect this estimate's
   * total just happened" (line items changed, markup/discount/tax
   * changed, a change order was created/approved/rejected/deleted/
   * restored). Thin wrapper over writeRecalculatedTotals — kept as a
   * separate named method because it's part of EstimateService's
   * public interface (every caller outside this file reaches
   * recalculation through here, never through writeRecalculatedTotals
   * directly, which stays private to this module).
   */
  async function recalculateTotal(estimateId: UUID): Promise<Estimate> {
    return writeRecalculatedTotals(estimateId);
  }

  async function changeStatus(estimateId: UUID, toStatus: EstimateStatus): Promise<ValidationResult & { estimate?: Estimate }> {
    const { data: currentRow, error } = await supabase.from("estimates").select("*").eq("id", estimateId).single();
    if (error) throw new Error(`Failed to load estimate: ${error.message}`);
    const current = rowToEstimate(currentRow as EstimateRow);

    const validation = validationService.validateEstimateStatusTransition(current.status, toStatus);
    if (!validation.valid) return validation;

    const { data, error: updateError } = await supabase.from("estimates").update({ status: toStatus }).eq("id", estimateId).select().single();
    if (updateError) throw new Error(`Failed to change estimate status: ${updateError.message}`);
    const estimate = rowToEstimate(data as EstimateRow);

    const actorId = await currentUserId();
    await auditService.recordStatusChange({
      companyId: estimate.companyId,
      entityTable: "estimates",
      entityId: estimate.id,
      fromStatus: current.status,
      toStatus,
      actorUserId: actorId,
    });

    return { valid: true, issues: [], estimate };
  }

  async function recordSignature(estimateId: UUID, signature: Estimate["signature"]): Promise<Estimate> {
    const { data, error } = await supabase.from("estimates").update({ signature }).eq("id", estimateId).select().single();
    if (error) throw new Error(`Failed to record signature: ${error.message}`);
    return rowToEstimate(data as EstimateRow);
  }

  /** Delete protection: financial history is permanent, so an estimate
   * that already has real financial activity attached must not be
   * deletable at all — not "deletable but the numbers get weird
   * later." Direct table existence checks (not a second copy of any
   * calculation, and not routed through InvoiceService/
   * ChangeOrderService, which would create a circular constructor
   * dependency — those services already depend on EstimateService).
   * Blocks on ANY non-deleted row, regardless of status: a draft
   * invoice or a pending change order is still real financial
   * activity someone would lose track of. */
  async function assertNoFinancialActivity(estimateId: UUID): Promise<void> {
    const [invoices, changeOrders, expenses] = await Promise.all([
      supabase.from("invoices").select("id").eq("estimate_id", estimateId).is("deleted_at", null).limit(1),
      supabase.from("change_orders").select("id").eq("estimate_id", estimateId).is("deleted_at", null).limit(1),
      supabase.from("estimate_expenses").select("id").eq("estimate_id", estimateId).is("deleted_at", null).limit(1),
    ]);
    if (invoices.error) throw new Error(`Failed to check invoices: ${invoices.error.message}`);
    if (changeOrders.error) throw new Error(`Failed to check change orders: ${changeOrders.error.message}`);
    if (expenses.error) throw new Error(`Failed to check expenses: ${expenses.error.message}`);

    if ((invoices.data?.length ?? 0) > 0) {
      throw new Error("Cannot delete this estimate: it has an active invoice (and possibly payments). Delete the invoice first if it was created in error.");
    }
    if ((changeOrders.data?.length ?? 0) > 0) {
      throw new Error("Cannot delete this estimate: it has an active change order.");
    }
    if ((expenses.data?.length ?? 0) > 0) {
      throw new Error("Cannot delete this estimate: it has recorded expenses attached to it.");
    }
  }

  async function softDelete(estimateId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "A delete reason is required.");
    await assertNoFinancialActivity(estimateId);

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("estimates")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", estimateId);

    if (error) throw new Error(`Failed to delete estimate: ${error.message}`);
  }

  async function restore(estimateId: UUID): Promise<void> {
    const { error } = await supabase.from("estimates").update({ deleted_at: null, deleted_by: null, delete_reason: null }).eq("id", estimateId);
    if (error) throw new Error(`Failed to restore estimate: ${error.message}`);
  }

  return { getById, listForProject, list, create, getScopeLines, updateLineItems, update, recalculateTotal, changeStatus, recordSignature, softDelete, restore };
}
