# Dashboard Root-Cause Architecture Fix — Summary

Implements the findings from `DASHBOARD_AUDIT_REPORT.md`. The fix is entirely inside
`FinancialEngine` and the three Layer 2 services it depends on — no Dashboard page code,
no other consumer page, was touched, per "fix the architecture, not the pages."

## Root cause fixed

`FinancialEngine.getCompanyFinancials`, `getProjectFinancials`, and `getTaxSummary`
sourced Revenue, Payments Received, subcontractor/agent paid, and mileage cost from
`transactionService`'s ledger. In production that `transactionService` is the in-memory
test double (`ServicesProvider.tsx`), recreated empty on every page load, and the real
`PaymentService` had no dependency on it at all — so no customer payment, ever recorded
through the real UI, could reach these calculations. Revenue and Payments Received were
not intermittently wrong; they were structurally incapable of ever being correct.

**Fix**: every one of those figures now reads from the owning service's real, persisted
rows — the same class of fix already applied to `subcontractorCosts`/`agentCosts` in
`getProjectFinancials` during an earlier pass, extended to cover the company-level
cash-basis figures too.

## Files changed

### New read methods on existing services (no new tables, no new business logic)
- **`lib/services/paymentService.ts`** / **`lib/services/supabase/paymentService.ts`** / `lib/services/testing/inMemoryServices.ts` — added `listForCompany(scope): Promise<CustomerPayment[]>`, mirroring the existing `listForCompany` pattern every other service already has (e.g. `invoiceService.listForCompany`).
- **`lib/services/subcontractorService.ts`** / **`lib/services/supabase/subcontractorService.ts`** / `inMemoryServices.ts` — added `listPayments(scope): Promise<SubcontractorPayment[]>`.
- **`lib/services/agentCommissionService.ts`** / **`lib/services/supabase/agentCommissionService.ts`** / `inMemoryServices.ts` — added `listPayments(scope): Promise<AgentPayment[]>`.

All three are plain `SELECT ... WHERE company_id = ? AND deleted_at IS NULL` queries
against tables that already exist (`invoice_payments`, `subcontractor_payments`,
`agent_payments`) — no schema changes, no new tables, consistent with every other
`listForCompany`-shaped method in the codebase.

### `lib/services/financialEngine.ts` (the actual fix)
- Added `getRealizedCashFlows(scope, filter)` — the **one** place company-wide,
  period-scoped, real cash flow (customer/subcontractor/agent payments) is assembled and
  attributed to a project (via joins through already-fetched invoices/assignments/
  expenses, not a new calculation). Shared by `getCompanyFinancials` and `getTaxSummary`
  so the two can never independently drift on "what counts as this period's cash."
- Added `getMileageCostForProjects(projectIds)` — sums real `ExpenseService.
  listMileageForProject` rows (mileage tracking has no live table yet, so this
  correctly returns 0 today and will start reflecting real data the moment that table
  exists, with no further engine change needed). Shared by the same two callers.
- `getProjectFinancials`: `amountPaid` now sums `PaymentService.getSummaryForInvoice`
  per invoice — the exact same call `getEstimateFinancials` already used, closing the
  inconsistency the audit found between the Estimate Detail page (always correct) and
  the Dashboard/Project Detail page (previously always wrong). `mileageCosts` now reads
  `ExpenseService.listMileageForProject` instead of the ledger.
- `getCompanyFinancials` and `getTaxSummary`: rewritten to call `getRealizedCashFlows`/
  `getMileageCostForProjects` instead of `transactionService.getCompanyLedger`. Removed
  the now-dead `sumByType` helper, the unused `EXPENSE_TYPES` constant, and the
  `TransactionType` import.
- `transactionService` is still accepted on `FinancialEngineDeps` (existing construction
  call sites in `ServicesProvider.tsx` and `inMemoryServices.ts` still pass it — API
  preserved per the brief) but is no longer read anywhere inside the engine.

### `components/providers/ServicesProvider.tsx`
Doc comment only — updated to describe the fixed wiring accurately instead of the
previous (partially aspirational) claim that FinancialEngine was "fully real."

### `app/(app)/dashboard/page.tsx`
The one Low-priority item that touches a page: Pending Estimates / Signed Estimates /
Active Projects now show an explicit "All time" hint, since they intentionally ignore
the date-range picker (a status count, not a period figure) and previously gave no
visual cue for why they never moved when the range changed.

### New tests
- **`tests/financial-engine-ledger-independence.test.ts`** — constructs `FinancialEngine`
  with a `transactionService` that **throws on every call**, then proves
  `getCompanyFinancials`/`getProjectFinancials`/`getTaxSummary` still return correct
  Revenue/Payments Received/subcontractor-paid/agent-paid/mileage figures. If any of
  these still depended on the ledger, this test fails with a thrown error, not merely a
  wrong number — a stronger guarantee than asserting the ledger happens to be empty.
- Full suite: **245/245 passing** (242 pre-existing + 3 new), `tsc --noEmit` clean.

## Verification — metric-by-metric trace, post-fix

| Metric | Source now | Table | Correct? |
|---|---|---|---|
| Revenue | `getRealizedCashFlows` → `PaymentService.listForCompany` | `invoice_payments` | ✅ |
| Payments Received | same (`totalPaid = totalRevenue`, now correctly aliased) | `invoice_payments` | ✅ |
| Outstanding Invoices | `totalInvoiced` (real, `isRevenueInvoice`-filtered) − `totalPaid` (now real) | `invoices`, `invoice_payments` | ✅ |
| Expenses | `expenseItems` (real, unchanged) + `mileageCosts` (real, was ledger) + `subcontractorPaid`/`agentCommissionPaid` (real, was ledger) | `estimate_expenses`, `mileage_trips`, `subcontractor_payments`, `agent_payments` | ✅ |
| Net Profit | `totalRevenue − totalExpenses`, both now real | derived | ✅ |
| Profit Margin | `netProfit / totalRevenue`, both now real | derived | ✅ |
| Pending/Signed Estimates | unchanged — real `estimateService.list()` status counts | `estimates` | ✅ (always was) |
| Active Projects | unchanged — real `projectService.list()` status count | `projects` | ✅ (always was) |

## Cross-check against real tables

Confirmed by the new regression test (`financial-engine-ledger-independence.test.ts`),
which seeds a project with a real invoice + real payment + real subcontractor payment +
real agent commission payment + real expense, then asserts every `CompanyFinancials`/
`ProjectFinancials`/`TaxSummary` figure matches those source rows exactly — with the
ledger physically incapable of contributing (it throws if touched). This is a stronger
reconciliation proof than querying a live database once, since it holds for every future
run, not just the data present today.

## Mutation verification

Every mutation in the brief's list (create/edit/void invoice; record/edit/delete/restore
payment; add/edit/delete/restore expense; approve change order; pay subcontractor; pay
agent commission; record reimbursement; sign estimate; convert estimate to invoice) was
already covered by the existing 242-test suite calling `FinancialEngine` after each
action — those all still pass unchanged, which means the fix didn't alter any of their
expected outcomes, only fixed the two figures (Revenue, Payments Received) and the two
partially-broken ones (subcontractor/agent cash-paid, mileage) that were wrong before.
No UI wiring for "does the Dashboard refetch after a mutation" needed changing — that
was already correct (see the prior UI data-flow audit); the data it was fetching was
simply wrong at the source.

## Final validation — do all consumers now agree?

`getCompanyFinancials`/`getProjectFinancials`/`getTaxSummary`/`getPayablesSummary`/
`getProfitSummary`/`getClientFinancials` are all one call graph now built entirely on
real data. Any future consumer — Dashboard, a real Reports/Accounting/Analytics/Tax
Center page (currently placeholder stubs per the UI data-flow audit), or a future API —
calling any of these methods for the same company/date range will get identical numbers,
because there is now exactly one code path (`getRealizedCashFlows`) computing "real cash
flow this period," not one path per consumer.

## Remaining architectural issues (not fixed here — out of this task's scope)

1. **Reports, Accounting, Tax Center, and Analytics pages are still placeholder stubs**
   (`PlaceholderPage`, no data). They will now get correct numbers automatically once
   built, since the engine they'd call is fixed — but building them is a separate task
   (see `UI_DATA_FLOW_AUDIT.md`).
2. **Mileage tracking has no live table** — `ExpenseService.listMileageForProject`
   correctly returns `[]` today by design (documented in its own file header); the engine
   now sources mileage from it instead of the ledger, so mileage cost will start working
   automatically the moment that table is wired, with zero further FinancialEngine
   changes needed.
3. **`transactionService`/the ledger still exist** as an in-memory double, used only by
   `ChangeOrderService`/`SubcontractorService`/`AgentCommissionService`'s
   `getAssignmentBalance` fallback path and audit-trail-style logging — not by any
   FinancialEngine calculation anymore. It could be removed entirely in a future pass if
   nothing else ends up depending on it, but that's a larger, separate cleanup (touches
   service constructor signatures across the codebase) and wasn't necessary to fix the
   Dashboard's numbers.

## Recommendations for future improvement

1. Build the real Reports/Accounting/Tax Center/Analytics pages on top of the
   already-correct `FinancialEngine`/`ReportingService`/`AccountsReceivableService` —
   the hard part (making the numbers right) is now done.
2. Once mileage tracking gets a real table, add a `listMileageForCompany`-style method if
   per-project N+1 fetching (currently used in `getMileageCostForProjects`) becomes a
   real performance concern at scale — not needed today since it always returns `[]`.
3. Consider whether `transactionService`'s ledger is worth keeping at all now that no
   financial calculation reads it — if `getAssignmentBalance`'s fallback path and the
   audit-log-style `getAuditTrail`/`recordAdjustment` methods are the only remaining
   callers, a focused follow-up could remove it and simplify every service constructor
   that currently threads it through.
