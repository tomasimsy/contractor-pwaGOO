# Automated Testing & Reconciliation

## Why an in-memory reference implementation

No service has a real Supabase-backed implementation yet (only `FinancialEngine` and `FilteringService` are concrete). To "test complete financial workflows" at all, something has to actually run the other services. `lib/services/testing/inMemoryServices.ts` is a full in-memory implementation of every interface, wired so `createFinancialEngine` — the one real implementation everything depends on — runs completely unmodified against it. A passing test proves the arithmetic is correct independent of whatever the eventual database layer looks like.

Run with `npm test` (or `npm run test:watch`).

## The workflow test (`tests/workflow.test.ts`)

Runs exactly the example from the brief — project → $10,000 estimate → $2,000 change order approved → convert to invoice → $5,000 payment → $2,000 expense → $3,000 subcontractor payment → $500 agent payment — then verifies every number by hand:

- `revisedTotal` = 12,000 (10,000 invoiced + 2,000 approved change order — never `estimate.total`)
- `netProfit` = 6,500 at the project level (committed-cost model) vs. **-500** at the company/period level (cash-basis) — the two models are supposed to disagree, and the test asserts they do, for the documented reason (period P&L only counts cash that's actually moved).
- Dashboard/Reports/Tax are modeled as independent wrapper functions (not shared variables) that each call `FinancialEngine` the way a real page would, then asserted equal to each other and to a direct engine call — proving agreement, not assuming it.

## CRUD, multi-tenant, reconciliation

- `tests/crud.test.ts` — create/update/delete/restore, delete-reason enforcement, and the load-bearing claim "deleted records must never affect calculations" verified directly: the same expense is summed before deletion, after deletion (excluded), and after restoration (back).
- `tests/multi-tenant.test.ts` — two companies' data in the same store simultaneously; asserts neither company's totals ever include the other's, `resolveScope` refuses to run without a `companyId`, and adjustments are attributed to the correct user.
- `tests/reconciliation.test.ts` — the six explicit checks: estimate matches invoice, invoice matches payments, expenses match FinancialEngine, Dashboard matches FinancialEngine, Tax matches FinancialEngine, Reports match FinancialEngine. Each is two independently-computed values asserted equal, plus a final test that changes an input and re-checks agreement, to rule out the equality being a coincidence of the fixture data.

## Three real bugs this suite found and fixed (not hypothetical — the tests failed first)

1. **`update()` didn't touch the ledger.** Changing an expense's or payment's `amount` updated the source record but left the original ledger row untouched, so `FinancialEngine` (which only ever reads the ledger) kept reporting the old amount forever. Fixed by appending a same-type **delta** row on update — the ledger stays append-only/immutable (no row is edited), and the full history (original + correction) is still visible via `getAuditTrail`.
2. **Ledger rows had no business date.** The schema redesign that simplified the ledger to the exact requested field list (`id, company_id, project_id, type, amount, reference_id, reference_type, created_by, created_at`) dropped the transaction's own date entirely — rows were only stamped with `createdAt` (when the row happened to be inserted). Every date-ranged query (`getCompanyFinancials`, `getTaxSummary`) silently filtered out correctly-dated-but-differently-inserted rows. Fixed by adding back `transactionDate` (a required field on every `append()`/`recordAdjustment()` call, sourced from the record's own `paymentDate`/`expenseDate`/`issueDate`) — the same class of bug contractor-pwa's own code comments had already warned about for `invoice_payments.created_at` vs. `payment_date`, reintroduced here and now caught by a test instead of by a user report.
3. **Invoice-from-estimate ignored markup/discount/tax.** `createFromEstimate` summed raw line items instead of using the estimate's own computed total, so an invoice converted from a $4,300 estimate (after markup/discount) came out at $4,000. Caught by the "estimate matches invoice" reconciliation check. Fixed by carrying the estimate's `subtotal`/`markup`/`discount`/`taxRate`-derived total through to the invoice; standalone invoices (no source estimate) correctly keep the simple line-item sum, since they have no markup/discount concept.

Also fixed while writing the tests, before they could even run: `EstimateService` had no way to create a change order at all (only approve one), and an adjustment's `direction` was accepted by `recordAdjustment` but never persisted anywhere on the `Transaction` row — added `adjustmentDirection` to the type.

## Automatic reconciliation (`tests/auto-reconciliation.test.ts`)

Every mutating call on `estimateService`/`invoiceService`/`paymentService`/`expenseService`/`subcontractorService`/`agentCommissionService`/`changeOrderService`/`projectService` is wrapped (`withAutoReconciliation`, `autoReconciliation.ts`) so it automatically calls `ReconciliationService.reconcileAfterMutation` afterward — no manual "now reconcile" step anywhere in a form/hook/test. That method reuses `reconcileLedgerAgainstSources` + `reconcileProjectTotals` unchanged (detect), logs every run via `ReconciliationLogSink` to `store.reconciliationLog` (log), and — only when something's actually wrong — calls `InvoiceService.refreshStatus` on every invoice in the affected project (recalculate + keep synchronized).

Two new checks were added to make "Customer balances"/"Agent Payables"/"Subcontractor Payables" from the requirements list real, not just implied: an invoice's *stored* status vs. what `PaymentService.getSummaryForInvoice` actually derives (catches drift in the one piece of denormalized state this schema has), and every payables line vs. `TransactionService.getAssignmentBalance` for the same assignment, plus a check that no assignment is silently missing from the payables view entirely.

**Caught by the test suite itself, not assumed**: the "recalculate derived values" step is only reachable when a finding actually exists — the first version of the invoice-status test found nothing wrong (no check compared stored status to derived status yet) and so never triggered a recalculation, failing the test. Fixed by adding the stored-status-vs-derived-status check above, which is what "Customer balances" needed anyway.

## Full workflow integration suite (`tests/full-workflow-integration.test.ts`)

The complete named workflow — Create Estimate → Edit → Sign → Convert to Invoice → Partial Payment → Full Payment → Add/Delete Change Orders → Add/Delete Expenses → Assign/Pay Agent → Assign/Pay Subcontractor → Delete Transaction — as 14 sequential steps, each followed by `verifyAllModulesAgree()`: Dashboard vs. Reports (two independent call sites), profit = revenue − expenses, outstanding = billed − collected, every payables line cross-checked against `TransactionService.getAssignmentBalance`, and the full `ReconciliationService` sweep. A wrong number anywhere fails the specific step that introduced it, not a generic end-of-suite assertion.

**Two real gaps this test found before it could even pass, fixed rather than worked around:**
- `ChangeOrderService` had no delete method at all — added `softDelete`, required for "Add/Delete Change Orders."
- Deleting an approved change order didn't actually exclude its booked revenue from any calculation, on **two independent levels**: the ledger's `referenceIsActive` check unconditionally treated `change_order` references as active regardless of deletion, *and* `listApprovedChangeOrders`/`listForProject` (which `FinancialEngine` reads directly for revenue, bypassing the ledger entirely for this one input) had no `deletedAt` filter at all — the only service in the codebase missing it. Both fixed; the test's "delete a change order, confirm revenue drops back down" step is what caught it.

## Stress & edge-case suite (`tests/stress-and-edge-cases.test.ts`)

Financial edge cases (partial/overpayment/refund/negative & multiple change orders/deposit limits/tax-after-conversion/discounts/zero-dollar/large numbers), CRUD stress (rapid cycles, multi-edit-before-save, restore, cascading delete), concurrency (interleaved `Promise.all` writers — the closest a single-threaded Node test can get to real concurrent users), data integrity (duplicate numbering, orphan records, ledger reference validity), and cross-page agreement (Dashboard/Estimates/Invoices/Expenses/Reports/Tax/Customer/Project/Agent/Subcontractor all modeled as independent call sites). Every check runs through a `check()`/`warn()` helper that both makes a real assertion (fails CI on a regression) and accumulates into a generated report — **`STRESS_TEST_REPORT.md`, written by the test run itself** (via `afterAll`), not authored by hand.

**One real bug this suite found and fixed**: `validateDepositAmount` rejected a deposit of **$0** whenever the document total was negative (`0 > negativeTotal` is true), which meant *any* over-discounted estimate — not just ones that actually requested a deposit — could never be created at all. Fixed by treating a $0 deposit as always valid regardless of the total's sign.

**8 warnings currently open** (real findings, not failures — each is a product/architecture decision, not a calculation error): no first-class Refund record (modeled as payment deletion), no re-invoicing workflow after a post-conversion estimate edit, no floor at zero for over-discounted totals, a $0 invoice reports "unpaid" rather than "paid", `ChangeOrderService` has no `restore()`, `Project` deletion doesn't cascade to its children, no optimistic locking on concurrent estimate edits, and the count-based estimate/invoice numbering scheme (`EST-${size+1}`) would not be safe against real concurrent writers in a database-backed implementation even though it passes here. Full detail on each is in the generated report.

## What this doesn't cover yet

No real database — these tests prove the composition logic (arithmetic, ledger semantics, cross-service agreement) is correct, not that a Supabase-backed implementation of any Layer 2 service will behave identically. No UI/component tests. No RLS/permission-layer tests (those require a real Postgres instance to exercise policies against).
