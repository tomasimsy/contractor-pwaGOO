# Comprehensive Financial Correctness Audit

Executed entirely through the service layer + `FinancialEngine` (no browser, no UI, no
direct SQL — the in-memory reference stack's `Map` writes are the only "direct" state
mutation, and that stack is the same test double every other suite in this repo already
uses). Executable proof: [tests/comprehensive-financial-audit.test.ts](tests/comprehensive-financial-audit.test.ts) — 18 tests,
all passing, plus the existing 224-test suite (242 total, `tsc --noEmit` clean).

## Fix status (applied after this report was first written)

Fixes 1–5 from §6 below have been applied and re-verified (242/242 tests still passing).
Fix 6 could not be applied — the `get_public_invoice` RPC it refers to does not exist in
this project yet (only in the separate `contractor-pwa` codebase); a cross-referencing
comment was added to `paymentService.ts` instead, for whoever implements that RPC here.

| # | Fix | Status |
|---|---|---|
| 1 | Export `isRevenueInvoice`, use it in `invoices/[id]/page.tsx` instead of re-typing the condition | **Done** |
| 2 | `AccountsReceivableService.getAgingReport` now excludes void/cancelled invoices | **Done** |
| 3 | `EstimateDetail.tsx` per-invoice paid total now calls `paymentService.getSummaryForInvoice` | **Done** |
| 4 | Subcontractors/Agents pages now source balances from `financialEngine.getPayablesSummary` | **Done** |
| 5 | In-memory `EstimateService.create()` now persists `estimateType` | **Done** |
| 6 | Audit `get_public_invoice` RPC's payment filter against `PaymentService` | **Not applicable — RPC doesn't exist in this project**; comment added instead |

The two "documentation" tests from the original pass (§1) now assert the FIXED behavior
instead of the bug — see `tests/comprehensive-financial-audit.test.ts`'s roofing-estimate
test and the AR-aging test, both updated in place rather than duplicated.

## 1. Every failing test

**None.** All 242 tests pass, including the 18 new ones covering every workflow named in
the brief. Two tests in the new suite are *intentional-failure documentation tests* —
they assert the presence of a bug rather than its absence, so the suite stays green while
recording the finding (see §2 and §5).

## 2. Every incorrect calculation found

### 2a. `AccountsReceivableService.getAgingReport` does not exclude void/cancelled invoices
**File:** [lib/services/accountsReceivableService.ts:47-53](lib/services/accountsReceivableService.ts#L47)

```ts
const invoices = await deps.invoiceService.listForCompany(scope);
for (const invoice of invoices) {
  const summary = await deps.paymentService.getSummaryForInvoice(invoice.id);
  if (summary.remainingBalance <= 0) continue; // paid/overpaid invoices carry no receivable
  ...
```

There is no `lifecycleStatus !== "void" && lifecycleStatus !== "cancelled"` filter here,
unlike `FinancialEngine`'s `isRevenueInvoice()`. A voided invoice with zero payments has
`remainingBalance = total > 0`, so it **passes** the only filter this method applies and
shows up as a receivable.

**Proof:** `tests/comprehensive-financial-audit.test.ts` → *"KNOWN BUG (found by this
audit, not fixed — see report): AccountsReceivableService.getAgingReport does not exclude
void/cancelled invoices, unlike FinancialEngine"* — voids a $3,000 invoice,
`FinancialEngine.getProjectFinancials().invoicesTotal` correctly reports `0`, but
`getAgingReport().totalReceivable` reports `3000` for the same invoice.

**Impact:** currently **dormant** — grepped the whole `app/` tree; nothing calls
`accountsReceivableService.getAgingReport` from any page yet, so no UI is showing wrong
numbers today. But the moment an AR Aging page is built against this service (a natural
next step for the "Accounting" section), it will silently disagree with Dashboard/Reports
on outstanding receivables for every voided invoice.

**Minimal fix:** add one line before the loop —
`const activeInvoices = invoices.filter(isRevenueInvoiceLike)` — reusing the same
predicate `FinancialEngine.isRevenueInvoice` already encodes (see §3a for why that
predicate needs to be exported/shared rather than re-implemented a third time).

## 3. Every duplicate calculation

Searched every `.reduce((sum` / manual aggregation across `app/`, `components/`, and
`lib/` outside `financialEngine.ts`/`financialCalculations.ts`. Findings, ranked by risk:

### 3a. The "is this invoice revenue" predicate is defined twice
**Files:**
- [lib/services/financialEngine.ts](lib/services/financialEngine.ts) — `isRevenueInvoice()`, the canonical definition (`lifecycleStatus !== "void" && lifecycleStatus !== "cancelled"`), private/unexported.
- [app/(app)/invoices/[id]/page.tsx:176-177](<app/(app)/invoices/[id]/page.tsx#L176>) — re-implements the identical condition inline for `invoicedToDate`:
  ```ts
  const invoicedToDate = projectInvoices
    .filter((i) => i.lifecycleStatus !== "void" && i.lifecycleStatus !== "cancelled")
    .reduce((sum, i) => sum + i.total, 0);
  ```

**How they can diverge:** if a third terminal invoice status is ever added (or the
existing rule changes — e.g. a "disputed" status that should also be excluded), the
engine's private `isRevenueInvoice()` would need updating and this inline copy would need
the *exact same* edit made separately. Nothing enforces that a change to one updates the
other — it is two independent literals, not one shared function. This is also the same
predicate `AccountsReceivableService` is *missing entirely* (§2a) — three places, one
concept, zero to one of them actually correct going forward if it changes.

**Minimal fix:** export `isRevenueInvoice` from `financialEngine.ts` (or promote it to
`financialCalculations.ts`, Layer 0, since it's a pure predicate with no service
dependency) and have the invoice detail page import it instead of re-typing the
condition. No behavior change — same values today, just one source instead of two.

### 3b. Per-invoice "amount paid" is recomputed inline instead of calling `PaymentService.getSummaryForInvoice`
**Files:**
- [components/estimates/EstimateDetail.tsx:484](components/estimates/EstimateDetail.tsx#L484) — `(paymentsByInvoice[inv.id] ?? []).reduce((sum, p) => sum + p.amount, 0)`
- [app/invoice/\[id\]/page.tsx:99](<app/invoice/[id]/page.tsx#L99>) — `paymentRows.reduce((sum, p) => sum + (p.amount ?? 0), 0)` (the **public**, unauthenticated customer invoice page)

**How they can diverge:** `PaymentService.getSummaryForInvoice` is the one place
`FinancialEngine.getEstimateFinancials` and every other authenticated surface source
`amountPaid` from. Both call sites above instead sum whatever payment rows they were
already handed upstream. Today those upstream rows come from the same underlying source
(a `listForInvoice`-style call, or — for the public page — a token-scoped RPC), so the
values currently agree. But nothing *guarantees* agreement: if the RPC backing the public
page's payment rows ever diverges from `PaymentService`'s own soft-delete filtering (e.g.
the RPC is a hand-written SQL function separate from the TypeScript service, per that
page's own header), a customer could see a different "amount paid" than staff see in the
app for the exact same invoice.

**Minimal fix:** for `EstimateDetail.tsx`, call `paymentService.getSummaryForInvoice(inv.id)`
instead of reducing the raw array (the data is already being fetched per-invoice
elsewhere on the same page). For the public page, this is a documented architectural
exception (server-rendered, anonymous, cannot reach the authenticated service layer at
all) — the fix there is to ensure the `get_public_invoice` RPC's payment-filtering SQL is
audited to match `PaymentService`'s `deleted_at is null` rule exactly, not to route it
through the TS service (which is structurally impossible for this route).

### 3c. Payables pages re-sum balances the service already summed once
**Files:**
- [app/(app)/subcontractors/page.tsx:153](<app/(app)/subcontractors/page.tsx#L153>) — `subAssignments.reduce((sum, a) => sum + (balances[a.id]?.outstanding ?? 0), 0)`
- [app/(app)/agents/page.tsx:141](<app/(app)/agents/page.tsx#L141>) — same pattern for agent balances

**Assessment:** lower risk than 3a/3b — both reduce over `getBalance()` results, the
exact same per-assignment source `FinancialEngine.getPayablesSummary` itself sums. This
is not an independently-invented formula; it's the same numbers, summed twice in two
places. Confirmed via `tests/comprehensive-financial-audit.test.ts` → *"getPayablesSummary
matches the sum of FinancialEngine's own outstanding figures"* — no divergence found.
**Still worth simplifying**: both pages could call `financialEngine.getPayablesSummary(scope)`
directly instead of re-deriving the total, removing the duplicate `reduce` and any future
risk if `getPayablesSummary` ever adds a filter these pages don't know about (e.g.
excluding a soft-deleted assignment some other way).

### 3d. No duplicate calculations found in:
`reportingService.ts`, `financialStatementsService.ts`, `accountsPayableService.ts`,
`payrollService.ts`'s money math — all confirmed (by reading, and by the existing/new
test suite) to compose `FinancialEngine`/`TransactionService`/`GeneralLedgerService`
results rather than re-deriving revenue/cost/profit. `useDashboardData.ts` (Dashboard's
data hook) calls only `financialEngine.getCompanyFinancials` for every number shown —
zero direct calculation. Estimate/Invoice/ChangeOrder line-item editors' `reduce()` calls
are document-level subtotals (Layer 0 territory, the same formula `financialCalculations.ts`
itself provides for one document's own total) — not company/project aggregates, so they
are not "duplicate" in the sense this audit is checking for.

## 4. Every architectural weakness

1. **`isRevenueInvoice` is private and unexported** (§3a) — the fix for the "duplicate
   predicate" problem is one line (`export function isRevenueInvoice`), but until that
   happens, every new page that needs "does this invoice count" has no canonical function
   to import and will keep re-typing the condition.
2. **The in-memory `EstimateService` test double silently drops `estimateType`** — see §5.
   Not a production bug (the real Supabase service handles it correctly), but it means the
   fast reference stack every test suite in this repo runs against cannot actually verify
   roofing-specific estimate behavior end-to-end; only the aggregate `total`/financial math
   is provable through it today.
3. **`estimateAreaLineItemService` (the roofing per-area line-item CRUD) has no in-memory
   double at all** — confirmed by grep; only a Supabase-backed implementation exists.
   Per-area add/edit/delete cannot be exercised through the fast reference stack the rest
   of this audit relies on; it can only be verified against a live Supabase instance or
   the browser, both explicitly out of scope for this pass.
4. **`AccountsReceivableService`/payables pages compute their own aggregate instead of
   delegating to `FinancialEngine.getPayablesSummary`/a shared AR summary method** (§3c) —
   works today because the underlying numbers agree, but is one refactor away from
   silent drift the moment either side gains an independent filter.
5. **Public invoice page's payment total is architecturally isolated from `PaymentService`**
   (§3b) — a deliberate, documented boundary (anonymous access, RPC-based), but it means
   the "one filtering rule" guarantee this whole audit is built on has exactly one
   unavoidable exception, and that exception's correctness rests entirely on the RPC's own
   SQL matching `PaymentService`'s TypeScript filter by hand, with no shared code path or
   test enforcing that match.

## 5. Every data consistency issue

1. **§2a** — `AccountsReceivableService.getAgingReport` includes void/cancelled invoices as
   receivable, contradicting `FinancialEngine`. (Dormant — no UI page calls it yet.)
2. **In-memory `EstimateService.create()` does not persist `estimateType`** — confirmed by
   the new roofing test failing on first run (`expected undefined to be 'roofing'`) until
   adjusted to document the gap instead of assuming parity. Grepped
   `lib/services/testing/inMemoryServices.ts`: the `create()` function's returned object
   simply has no `estimateType` field, while `lib/services/supabase/estimateService.ts:390`
   correctly writes `estimate_type: input.estimateType ?? "standard"`. This is a test-double
   gap, not a production data-consistency bug — flagged here because it means every one of
   this repo's 242 tests that create an estimate has been implicitly running against
   `estimateType: undefined` the whole time, silently, and nothing caught it before this audit.
3. No other cross-surface mismatch found. Every other combination tested — Dashboard vs.
   Reports vs. Financial Summary vs. Tax vs. Payables vs. per-project vs. per-client vs.
   per-company, across single/multi-estimate, single/multi-invoice, single/multi-company,
   single/multi-customer, soft-delete/restore, and the 500-invoice/3,000-payment/
   300-expense stress run with randomized delete/restore — agreed exactly (`toBeCloseTo`
   at 1e-6 precision, effectively exact for currency amounts).

## 6. Recommended fixes (in priority order)

1. **Export `isRevenueInvoice` from `financialEngine.ts`** and have
   `app/(app)/invoices/[id]/page.tsx` import it instead of re-typing the condition. Trivial,
   zero behavior change, closes the "two definitions of one rule" gap before a third
   inevitably appears.
2. **Fix `AccountsReceivableService.getAgingReport`** to filter out `void`/`cancelled`
   invoices using the same (now-exported) predicate, before this service gets wired into
   an actual Accounting/AR page and starts showing wrong numbers to a real user.
3. **Route `EstimateDetail.tsx`'s per-invoice paid total through
   `paymentService.getSummaryForInvoice`** instead of reducing the raw payments array —
   removes a duplicate formula for free (the service call is already cheap; the data may
   already be in hand).
4. **Have the Subcontractors/Agents list pages call `financialEngine.getPayablesSummary`**
   instead of re-summing `getBalance()` results client-side — same numbers today, one less
   place for a future filter to be forgotten.
5. **Add `estimateType` to the in-memory `EstimateService.create()`** so the fast reference
   test stack can actually exercise roofing-specific behavior end to end, and add a minimal
   in-memory double for `estimateAreaLineItemService` if per-area CRUD needs to be covered
   by fast tests going forward rather than only manual/browser verification.
6. **Audit the `get_public_invoice` RPC's payment-filtering SQL by hand** against
   `PaymentService`'s `deleted_at is null` rule — this is the one place "one source of
   truth" cannot be enforced by shared TypeScript, so it needs either a recurring manual
   check or (better) a comment/link in both the RPC's SQL and `paymentService.ts` pointing
   at each other so a future edit to one prompts a look at the other.

None of the above were applied — per the brief, this pass proves and documents, and stops
there. The one new test file
([tests/comprehensive-financial-audit.test.ts](tests/comprehensive-financial-audit.test.ts))
is the only change made; no production code was touched.
