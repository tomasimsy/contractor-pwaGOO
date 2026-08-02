# Estimate → Invoice Conversion Audit

Scope: `/estimates-roof/12f3a69f-b741-4753-8449-b68a036dad26` →
`/invoices/eff5d3f4-3ad4-473d-a49e-68cda9f3b6a7`. Static code trace — no live database
query was run (no authenticated session available to this audit), so the mechanism below
is proven at the code level; whether this specific estimate's roofing areas have a
nonzero `estimated_repair_cost` is the one fact that would need confirming against the
live row to close the loop on this exact pair, but the defect itself does not depend on
that confirmation — it exists for any roofing estimate where that field is set, and the
UI actively invites setting it (see §7). No code was changed, per the brief.

## Executive summary

**Root cause: conversion logic, in `InvoiceService.createFromEstimate` (roofing branch),
in `lib/services/supabase/invoiceService.ts`.**

A roofing estimate's subtotal is the sum of TWO independent inputs:
1. Each area's itemized line items (`estimate_area_line_items`), **and**
2. Each area's `estimated_repair_cost` (`materialCost + laborCost + tax` — a single
   aggregate figure, editable directly in the Roof Areas editor, independent of that
   area's line items).

`EstimateService`'s own subtotal calculation (`calculateRoofingAreasSubtotal`) correctly
sums both. **`InvoiceService.createFromEstimate` only copies input (1) — it never
reads or carries over `estimated_repair_cost` at all.** The invoice's stored
subtotal/total is therefore short by exactly the sum of `estimated_repair_cost` across
that estimate's roofing areas, whenever that field is non-zero.

## Complete data-flow trace

```
Estimate UI (RoofingAreasEditorV2 — Material Cost / Labor Cost inputs)
   ↓ handleUpdateArea → onSave
RoofingAreaService.update/create
   ↓ writes material_cost, labor_cost, estimated_repair_cost = materialCost+laborCost+tax
estimate_areas table (real, persisted)
   ↓
EstimateService.writeRecalculatedTotals / getById
   ↓ calculateRoofingAreasSubtotal(estimateId):
   ↓   SUM(estimate_area_line_items.total) + SUM(estimate_areas.estimated_repair_cost)
estimates.subtotal / estimates.total  ← CORRECT, includes both inputs
   ↓
InvoiceService.createFromEstimate(estimateId, ...)
   ↓ estimateLines = estimateAreaLineItemService.listForArea() results ONLY
   ↓                  — estimated_repair_cost is NEVER read here
   ↓ taxedBase = calculateDocumentTotal(estimate.subtotal, markup, discount, taxRate).taxedBase
   ↓            (uses the estimate's CORRECT, repair-cost-inclusive subtotal)
   ↓ marginAdjustment = taxedBase - estimate.subtotal   (markup/discount delta ONLY)
   ↓ lineItems = estimateLines + changeOrderLines + [marginAdjustment line if ≠ 0]
insertInvoice(...)
   ↓ subtotal = calculateSubtotal(lineItems)   ← recalculated FROM THE LINE ITEMS ARRAY,
   ↓            NOT copied from estimate.subtotal — this is where the gap becomes real
invoices.subtotal / invoices.total   ← INCORRECT — short by Σ(estimated_repair_cost)
   ↓
invoice_items (one row per estimateLines/changeOrderLines/marginAdjustment entry —
                no row ever represents estimated_repair_cost)
   ↓
Invoice page (issued invoice → shows the STORED total as-is, per its own
"never rewrite an issued invoice's total" rule; draft invoice → recomputes from
line items, which are the same incomplete set) — either way, displays the
already-short total.
```

## Field-by-field trace

| Field | 1. Value on Estimate | 2. Value written to Invoice | 3. Where copied | 4. Where recalculated | 5. Stored or recalculated on Invoice? | 6. Omitted? |
|---|---|---|---|---|---|---|
| **Subtotal** | `estimates.subtotal` = Σ(area line items) + Σ(estimated_repair_cost) | `invoices.subtotal` = Σ(estimateLines) + Σ(changeOrderLines) + marginAdjustment | `createFromEstimate` → `insertInvoice` | `insertInvoice`: `calculateSubtotal(itemsWithTotals)` — **recalculated from the line-items array, not copied from `estimate.subtotal`** | Recalculated (from an incomplete line-item set) | **Yes — `estimated_repair_cost` is silently dropped** |
| **Roofing area totals** | Line items (`estimate_area_line_items`) + `estimated_repair_cost` per area | Only the line items become `invoice_items` rows | `roofingAreaService.listForEstimate` + `estimateAreaLineItemService.listForArea` in `createFromEstimate` | N/A — never recomputed on the invoice side because it was never received | N/A | **Yes — `estimated_repair_cost` has no invoice-side representation at all** |
| **Line item totals** | `estimate_area_line_items.total` per row | Copied 1:1 as `invoice_items` rows (name/description/quantity/unitPrice → `calculateLineItemTotal`) | `createFromEstimate` | `insertInvoice`'s `itemsWithTotals` map | Recalculated (same formula, same inputs — this part is correct) | No |
| **Markup** | `estimates.markup` (%) | Folded into a single named "Markup"/"Discount" invoice line (`marginAdjustment = taxedBase − estimate.subtotal`) | `createFromEstimate` | Computed once, at conversion time, via `calculateDocumentTotal` | Neither stored nor recalculated on the invoice afterward — it's baked into a line item at conversion time, by design (an invoice has no markup% concept) | No — this part correctly reconciles **for the line-item total it was computed against**, but that base excludes repair cost (see Subtotal row), so the dollar amount carried is right for the wrong base |
| **Discount** | `estimates.discount` (%) | Same mechanism as Markup, same line | Same | Same | Same | Same caveat as Markup |
| **Tax** | `estimates.taxRate` (%), applied to `taxedBase` | `invoices.tax` = `calculateDocumentTotal(...).tax`, a flat dollar amount | `createFromEstimate` | Computed once at conversion | Stored, not recalculated afterward | No — tax itself is computed correctly against `estimate.subtotal` (which IS repair-cost-inclusive); tax is not part of this bug |
| **Deposit** | `estimates.depositAmount` | **Not written anywhere during `createFromEstimate`** | N/A | N/A | N/A | Intentional, not a bug — deposit is a proposal TERM, not auto-billed; per `EstimateService`'s own doc comment, collecting one means generating a real, separate invoice for that amount via the deposit workflow (`useEstimateForm`'s `requestDeposit`), not a field this conversion path touches |
| **Change Orders** | `changeOrderService.listForEstimate`, filtered to `status === "approved"` | One invoice line per approved change order (`totalAmount + tax`) | `createFromEstimate` | Computed at conversion, cross-checked against `sumApprovedChangeOrderRevenue` (throws if they disagree) | Stored as line items | No — correctly included, and actively guarded against drift |
| **Grand Total** | `estimates.total` (correct, repair-cost-inclusive) | `invoices.total` = `calculateInvoiceTotal(subtotal, tax)`, where `subtotal` is already short | `insertInvoice` | `insertInvoice` | Recalculated from the (incomplete) inputs above | **Yes — inherits the Subtotal gap 1:1** |
| **Amount Paid** | N/A (estimates don't track payments) | `PaymentService.getSummaryForInvoice` — real, sums `invoice_payments` | N/A | Computed on every read | Recalculated, correctly, from real payment rows | No — unaffected by this bug, but measured against an already-wrong `total` |
| **Balance Due** | N/A | `calculateRemainingBalance(total, amountPaid)` | Invoice page | Computed on every read | Recalculated correctly, from the (wrong) `total` | No — correct arithmetic, wrong input |

## Answers to the nine audit questions (summary)

1. **What value exists on the Estimate?** Correct — `estimates.subtotal`/`total` include
   both area line items and each area's `estimated_repair_cost`.
2. **What value is written into the Invoice?** Incorrect — short by
   Σ(`estimated_repair_cost`) across the estimate's roofing areas.
3. **Where is it copied?** `InvoiceService.createFromEstimate`
   ([lib/services/supabase/invoiceService.ts:461-545](lib/services/supabase/invoiceService.ts#L461)) builds `estimateLines`
   from `estimateAreaLineItemService.listForArea` only.
4. **Where is it recalculated?** `insertInvoice` ([:367-386](lib/services/supabase/invoiceService.ts#L367))
   recalculates `subtotal`/`total` from the `lineItems` array it was handed — it never
   receives or falls back to `estimate.subtotal` directly.
5. **Stored or recalculated?** Recalculated — from an incomplete set of inputs.
6. **Is anything omitted?** Yes — `estimated_repair_cost` per roofing area.
7. **Are roofing-specific calculations included?** Partially — area *line items* are
   included; the area *aggregate repair-cost figure* (materialCost + laborCost + tax,
   directly editable in the Roof Areas editor UI, [RoofingAreasEditorV2.tsx:458-490](components/estimates/RoofingAreasEditorV2.tsx#L458))
   is not.
8. **Are change orders included?** Yes, correctly, with an explicit consistency guard.
9. **Does the Invoice use the same business rules as the Estimate?** No — the Estimate's
   rule ("subtotal = line items + repair cost") and the Invoice's rule ("subtotal = sum
   of whatever line items I was given") diverge at exactly the point `estimated_repair_cost`
   should have crossed from one model to the other and didn't.

## Root cause classification

- [x] **Conversion logic** — `InvoiceService.createFromEstimate`'s roofing branch omits
  one of the two inputs `EstimateService.calculateRoofingAreasSubtotal` sums.
- [ ] InvoiceService (structurally) — `insertInvoice`'s recalculate-from-line-items
  design is *correct and consistent* with how the rest of the app works (an invoice's
  total is always derived from its own line items, never blindly copied from a source
  document — this is deliberate, matching how change orders and markup/discount are
  each surfaced as explicit lines rather than silently trusted numbers). The bug is that
  one category of estimate cost was never turned into a line item at all, not that the
  recalculation approach itself is wrong.
- [ ] Invoice page calculations — confirmed correct given whatever `invoices.total`
  it's handed; not implicated.
- [ ] Missing database fields — no schema gap. `estimated_repair_cost` already exists,
  is already persisted, and is already read correctly by `EstimateService`. The gap is
  purely that `InvoiceService` never reads it.
- [x] **Incorrect mapping** — same root cause stated differently: the roofing→invoice
  line-item mapping is incomplete.
- [ ] FinancialEngine — not involved in this conversion path at all (`createFromEstimate`
  is pure Layer 2 service composition, per its own design); not implicated.
- [ ] Duplicated calculation logic — not the cause here. If anything, the opposite
  problem: the repair-cost figure isn't duplicated anywhere on the invoice side, it's
  simply absent.

## Recommended fix (smallest architectural change, single source of truth preserved)

Add one more line-item source to the SAME `estimateLines` array `createFromEstimate`
already builds for roofing estimates — mirroring exactly how it already turns approved
change orders and the markup/discount delta into explicit, named lines rather than
silently folding them into a total:

```ts
// alongside the existing area-line-item mapping, per roofing area:
for (const area of areas) {
  if (area.estimatedRepairCost > 0) {
    estimateLines.push({
      name: `${area.areaName} — Estimated Repair Cost`,
      description: "Materials + labor + tax, carried from the approved estimate",
      quantity: 1,
      unitPrice: area.estimatedRepairCost,
    });
  }
}
```

Why this is the minimal, correct fix:
- **No new source of truth**: `area.estimatedRepairCost` is already computed by the one
  existing formula (`calculateAreaRepairCost`, `financialCalculations.ts`) and already
  persisted — this fix reads it, it doesn't recompute or duplicate it.
- **No FinancialEngine change**: this conversion path doesn't touch FinancialEngine
  today and doesn't need to — the fix is entirely inside the existing
  estimate-line-item-gathering step of `createFromEstimate`.
- **No schema change**: the column already exists and is already returned by
  `roofingAreaService.listForEstimate` (already fetched in this function for the area
  list itself).
- **Consistent with the file's own existing pattern**: change orders and markup/discount
  are both already surfaced as explicit, visible invoice lines rather than baked
  invisibly into a number — this fix extends that same pattern to the one remaining
  estimate input that wasn't yet getting one, rather than introducing a new mechanism
  (e.g. it deliberately does NOT special-case `insertInvoice` to accept a raw subtotal
  override, which would reintroduce "trust a number instead of deriving it from real
  line items," the exact anti-pattern this app's invoice design was built to avoid).
- **Self-verifying**: after this fix, `estimate.subtotal` and the invoice's line-item-
  derived subtotal (before markup/discount) will agree by construction, the same way
  change orders already do — worth adding a guard analogous to the existing change-order
  reconciliation check (`if the roofing-lines total doesn't match calculateRoofingAreasSubtotal's
  line-item component, throw`) if you want the same fail-fast protection change orders
  already have.

Not recommending: changing `insertInvoice` to accept `estimate.subtotal` directly instead
of recalculating from line items. That would fix this one symptom but reintroduce the
exact "stored total the app can't verify against real line items" problem the rest of
this codebase's invoice design deliberately avoids (see `hasTotalDrift`'s own doc comment
in `invoiceService.ts`, which exists specifically to detect exactly that kind of
drift on legacy data). Fixing the input (missing line item) is smaller and safer than
changing the output's derivation model.
