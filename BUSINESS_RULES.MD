# Contractor App Business Rules

## 1. Core Architecture Rules

- FinancialEngine is the single source of truth for all financial calculations.
- Dashboard, Reports, Accounting, and Tax must consume FinancialEngine results.
- Never create separate calculations in UI components.
- Avoid duplicate business logic.
- Reuse existing services before creating new ones.
- Do not create new tables/columns unless required.

---

# 2. Data Ownership Rules

Company owns all business records.

Hierarchy:

Company
 └── Client
      └── Project
           ├── Estimate
           │    ├── Estimate Items
           │    ├── Change Orders
           │    └── Expenses
           │
           ├── Invoice
           │    ├── Invoice Items
           │    └── Payments
           │
           ├── Documents
           └── Photos

All financial records must maintain their company relationship.

---

# 3. Financial Record Principles

Financial history is permanent.

If money was:
- received
- spent
- invoiced
- committed

it must remain traceable.

Deleting visibility must never erase financial history.

---

# 4. Record Lifecycle Rules

## Delete

Delete is only for mistakes before business activity exists.

Allowed:
- Empty drafts
- Test records with no relationships

Not allowed:
- Invoice exists
- Payment exists
- Expense exists
- Change order exists
- Signed approval exists

---

## Archive

Archive means:
"The business event happened but is no longer active."

Archived records:
- remain in FinancialEngine
- remain in reports
- remain searchable
- remain connected to history

Examples:
- Completed jobs
- Cancelled jobs after expenses occurred
- Old customers

---

## Void

Void means:
"This record should not affect business numbers."

Voided records:
- excluded from financial calculations
- excluded from reports
- kept for audit trail

Examples:
- Duplicate estimate
- Wrong entry
- Test invoice

---

# 5. Estimate Rules

Estimate lifecycle:

Draft
→ Sent
→ Viewed
→ Approved
→ Converted
→ Completed
→ Archived
→ Voided

Rules:
- Estimates with financial activity cannot be deleted.
- Approved estimates should maintain history.
- Converted estimates remain linked to invoices.

---

# 6. Invoice Rules

Invoice lifecycle:

Draft
→ Sent
→ Partial
→ Paid
→ Overdue
→ Archived
→ Voided

Rules:
- Paid invoices cannot be deleted.
- Payments belong to invoices.
- Removing an invoice must not remove payment history.
- Refunds/credits should be used instead of deleting payments.

---

# 7. Payment Rules

Payments are financial transactions.

Rules:
- Never silently delete payments.
- Payments require:
  - invoice
  - customer
  - company
- Payment history must remain auditable.

---

# 8. Expense Rules

Expenses represent real business costs.

Rules:
- Expenses must always belong to:
  - company
  - project
  - estimate when applicable

If estimate is archived:
- expense remains active.

If expense was entered incorrectly:
- void expense.

Never silently remove expenses from reports.

---

# 9. Change Order Rules

Change orders affect contract value.

Rules:
- Approved change orders affect estimate totals.
- Rejected/voided change orders do not affect totals.
- Change order history must remain.

---

# 10. Project Rules

Projects are containers, not financial transactions.

Archiving a project:
- hides it from active workflow
- keeps financial history

Deleting a project:
- only allowed if no business records exist.

---

# 11. Dashboard Rules

Dashboard does not calculate.

Dashboard displays FinancialEngine results.

Examples:

Revenue:
- payments received
- approved revenue rules

Expenses:
- active financial expenses

Profit:
- revenue - expenses

---

# 12. Reporting Rules

Reports must answer:

- How much did we sell?
- How much did we collect?
- How much did we spend?
- Which jobs are profitable?
- What money is outstanding?

Reports must use FinancialEngine.

---

# 13. Audit Rules

Important actions should be traceable:

Track:
- created
- updated
- archived
- voided
- restored
- approved
- signed
- paid

Never permanently erase important business history.

---

# 14. Soft Delete Rules

Soft delete means hidden, not destroyed.

Every service must:
- filter deleted records consistently
- support restore where appropriate
- prevent orphaned relationships

---

# 15. Implemented Financial Lifecycle Rules (verified against code, 2026-08-01)

Sections 1–14 above are the design intent. This section documents what the
code in `lib/services/financialEngine.ts` and the Layer 2 services actually
do today, after the deletion-safety and lifecycle fixes. Where it narrows or
corrects the aspirational rules above, this section is authoritative.

## What counts as revenue

`FinancialEngine.getProjectFinancials` / `getEstimateFinancials` /
`getCompanyFinancials` assemble revenue from exactly two sources, summed —
never from `estimates.total`:

- **Invoice totals**, excluding any invoice whose `lifecycleStatus` is
  `void` or `cancelled` (`isRevenueInvoice()` in financialEngine.ts — the
  one place this filter is applied; invoice list pages still show
  void/cancelled invoices, they're just excluded from every revenue sum).
- **Approved change orders only** (`listApprovedChangeOrders`,
  `status = "approved"`). `draft`/`pending`/`rejected`/`invoiced` change
  orders contribute nothing.

`originalEstimateTotal` is returned alongside revenue but is informational
only (quoted vs. billed) — it is never added into `revisedTotal`,
`grossProfit`, or `netProfit`. It is computed with `includeDeleted: true`,
so a deleted estimate's quoted amount still appears here (financial
history is permanent), even though it never counted as revenue anyway.

## What counts as expense

- **Project level (committed-cost model)**: every non-deleted expense row
  (`estimate_expenses`, filtered only on `deleted_at is null`) — paid or
  unpaid. Subcontractor/agent costs use `max(assigned, paid)` per
  assignment. An assignment or expense is a real cost the moment it's
  made, not when it's paid.
- **Company/period level (cash-basis model, Dashboard/Tax/Reports)**: only
  expenses with `isPaid = true` **and** dated inside the requested range.
  An unpaid bill is not counted in a period P&L.
- Agent/subcontractor **reimbursement settlements** are never added to
  cost — they repay a liability for spending already counted once as an
  expense row. Counting both double-charges the same spend.

## Archive behavior

Archive exists for **projects only** — a status transition
(`changeStatus(id, "archived")`), reachable only from `completed` or
`cancelled`. It is not a delete: `deletedAt` is untouched, the row stays
fully queryable, and FinancialEngine treats an archived project exactly
like any other status. Nothing about "archived" gates a project's
financials — the row and its history are simply presented as inactive by
the UI.

## Void behavior

Void exists for **invoices only** — a status transition
(`lifecycleStatus = "void"`), reachable only from `sent`/`viewed` (the
escape hatch for an invoice already out in the world; `cancelled` is the
separate terminal state for one never sent, reachable only from `draft`).
A voided invoice:
- is **excluded from revenue** in every FinancialEngine calculation
  (see "What counts as revenue" above),
- is **still returned** by `listForProject`/`listForCompany` and still
  visible in the UI — voiding does not hide the record, only its
  contribution to totals,
- is **not soft-deleted** — `deletedAt` stays null, so it is not subject
  to the delete-protection guards below,
- **freezes its payments**: `PaymentService.softDelete` refuses to delete
  a payment once its invoice's `lifecycleStatus` is `void`, since a voided
  invoice's record is meant to stay exactly as it was at the moment of
  voiding.

## Delete behavior

Delete is always a soft-delete (`deleted_at`/`deleted_by`/`delete_reason`)
— there is no hard delete anywhere in the Layer 2 services, and no
cascade. `ValidationService.validateDeleteReason` requires a non-empty
reason on every financial soft-delete. Beyond that, each entity has its
own delete-protection guard, checked before the row is ever written:

| Entity | Blocked when | Still allowed |
|---|---|---|
| Project | has any active (non-deleted) estimate, invoice, or expense | empty/no-activity projects |
| Estimate | has any active invoice, change order, or expense | estimates with no financial activity yet |
| Invoice | has any active (non-deleted) payment recorded against it | invoices with zero payments (void it instead if it needs to stop counting) |
| Payment | its invoice has been voided | ordinary corrections — bounced cheque, refund, duplicate entry — on any non-voided invoice |
| Expense | its reimbursement has already been settled (`reimbursementStatus = "reimbursed"`) | a still-**pending** reimbursement (deleting it correctly removes the debt too) |
| Change order | status is `invoiced` (its amount is already part of an invoice's own total) | `approved` change orders — deleting one deliberately reverses its revenue effect |

`getById`/`listForProject` calls made **for financial computation**
(FinancialEngine's own lookups, and UI pages showing a document's parent
context) pass `includeDeleted: true`, so a deleted parent's numbers remain
computable. Everywhere else defaults to excluding deleted rows.

## Restore behavior

Restore reverses a soft-delete by clearing `deleted_at`/`deleted_by`/
`delete_reason` — nothing else is touched (no recalculation of anything
that was skipped while deleted, beyond what already runs on the next
read). Every soft-deletable entity now has a matching `restore()`:
project, estimate, invoice, change order, payment, expense,
subcontractor, and agent commission. There is no delete-protection check
on restore — anything soft-deleted can always be brought back.

## Change order rules

Status flow: `draft → pending → approved/rejected`, `approved → invoiced`
(reserved — no current UI path reaches `invoiced` yet). Only `approved`
change orders count as revenue. Deleting an `approved` change order is
allowed and correctly pulls its revenue back out of
`getProjectFinancials`/`getEstimateFinancials` on the next read — this is
intended, reversible behavior, not a bug. Deleting an `invoiced` change
order is blocked (see Delete behavior table) since its amount has already
been transferred onto a real invoice line.

## Payment rules

Payments are the terminal, leaf-level record of cash actually collected —
nothing in the schema depends on a payment as a parent. `amountPaid` in
`getProjectFinancials` **and** `getEstimateFinancials` is summed via
`PaymentService.getSummaryForInvoice` per invoice — the SAME call in both
places, as of the 2026-08-01 Dashboard architecture fix (previously
`getProjectFinancials` read this from `transactionService`'s in-memory
ledger, which no real payment ever wrote to in production; see Section 16
below). Recording, correcting, or reversing a payment (bounced cheque,
refund, duplicate entry) is a normal, always-allowed soft-delete as long
as its invoice has not been voided. `restore()` is available to undo any
of those corrections.

---

# 16. Financial Architecture Rules (verified against code, 2026-08-01 Dashboard fix)

This section documents the financial *data-sourcing* architecture — where each number
comes from and why — as it exists after the Dashboard root-cause fix
(`DASHBOARD_AUDIT_REPORT.md` / `DASHBOARD_ARCHITECTURE_FIX_SUMMARY.md`). It sits
alongside Section 15 (lifecycle rules); this section is about *sourcing*, Section 15 is
about *lifecycle*. Where anything below conflicts with an earlier section, this section
is authoritative — it was written by re-reading the actual code, not by design intent.

## Financial source of truth

- `FinancialEngine` (`lib/services/financialEngine.ts`) is the single source of truth
  for every calculated financial number in the application — revenue, payments,
  outstanding balances, expenses, profit, margin, payables, tax figures.
- Dashboard, Project Detail, Reports, Accounting, Analytics, Tax Center, and any future
  financial page or API must call `FinancialEngine` for these numbers, not compute them.
  (Reports/Accounting/Analytics/Tax Center are currently placeholder pages with no data
  of their own yet — see `UI_DATA_FLOW_AUDIT.md` — so this rule is enforced by there
  being nothing to violate it with today; it applies the moment those pages are built.)
- UI components must never calculate a financial total independently. A component may
  format a number `FinancialEngine` already returned (currency formatting, rounding for
  display) — it may never sum, subtract, or derive one itself. See Section 16's
  "Duplicate calculations found and fixed" below for the concrete violations this rule
  caught and closed.

## Revenue

Revenue is the total of **persisted customer payments** (cash basis) for the selected
scope, returned by `PaymentService`:

- `getCompanyFinancials`/`getTaxSummary`: `PaymentService.listForCompany(scope)`,
  filtered to the requested date range and (if a `Filter` narrows to a project subset)
  to invoices within that subset, summed.
- `getProjectFinancials`/`getEstimateFinancials`: `PaymentService.getSummaryForInvoice`
  per invoice, summed — the identical call in both, so a project's and its own
  estimates' collected cash can never disagree.

Revenue must never come from:
- **in-memory data** — `transactionService`'s ledger is never read by any revenue
  calculation (it was, before the 2026-08-01 fix; see "What changed" below).
- **UI state** — no page/component sums payments itself.
- **temporary caches** — there is no cache layer in this app at all (confirmed in
  `UI_DATA_FLOW_AUDIT.md` §0); every read goes to the real service on every fetch.
- **test services** — `createInMemoryServices()` exists only in `lib/services/testing/`
  and `tests/*.test.ts`; production wiring (`ServicesProvider.tsx`,
  `lib/services/server.ts`) uses the real Supabase-backed `PaymentService` exclusively
  for payment data.

## Payments Received

Payments Received (`CompanyFinancials.totalPaid`) equals Revenue
(`CompanyFinancials.totalRevenue`) for the selected scope — both are the same real,
persisted-payment sum. `totalPaid` is currently a direct alias of `totalRevenue`, not a
second calculation: Revenue and Payments Received represent the same cash-basis value
today, and will continue to unless a future accounting requirement (e.g. separately
tracking un-deposited funds, or a revenue-recognition timing difference) intentionally
distinguishes them — at which point that distinction still belongs inside
`FinancialEngine`, never in a page.

## Outstanding Invoices

```
Outstanding Invoices = Revenue Invoice Totals − Payments Received
```

Concretely, `CompanyFinancials.totalOutstanding = totalInvoiced − totalPaid`. Only
**active revenue invoices** participate in `totalInvoiced` — enforced by
`isRevenueInvoice()` (`financialEngine.ts`, exported), which excludes:
- **Void** invoices (`lifecycleStatus = "void"`),
- **Cancelled** invoices (`lifecycleStatus = "cancelled"`).

**Deleted** (soft-deleted) invoices are excluded by a separate, earlier mechanism:
`InvoiceService.listForCompany`/`listForProject` filter `deleted_at is null` by default,
so a deleted invoice never reaches `isRevenueInvoice()` in the first place (Section 15's
Delete/Restore rules govern when an invoice can be deleted at all). Both exclusions are
existing rules, not new ones introduced by this section — this section documents that
the Outstanding Invoices formula correctly composes them, nothing more.

## Expenses

Expenses (`CompanyFinancials.totalExpenses` / `ProjectFinancials.totalExpenses`) are the
sum of persisted business costs, each sourced from its owning service's real rows:

| Cost | Source | Persisted table |
|---|---|---|
| Estimate Expenses | `ExpenseService.listForCompany`/`getTotalsForProject` | `estimate_expenses` |
| Subcontractor Payments | `SubcontractorService.listPayments` (company/period) or `getBalance` (project/committed) | `subcontractor_payments` |
| Agent Commissions | `AgentCommissionService.listPayments` (company/period, `paymentType = "commission"`) or `getBalance` (project/committed) | `agent_payments` |
| Agent Reimbursements | `AgentCommissionService.listPayments` (`paymentType = "reimbursement"`) — tracked but excluded from cost (see Section 15, "reimbursement settlements are never added to cost") | `agent_payments` |
| Mileage | `ExpenseService.listMileageForProject` — real method, correctly returns `[]` today because mileage tracking has no live table yet; will start contributing real cost automatically once one exists, with no `FinancialEngine` change required | `mileage_trips` (not yet wired) |

Expenses must always come from persisted services — never the ledger, never a page-level
sum. This is the same rule Section 15's "What counts as expense" already documented for
the estimate-expense/committed-cost half; this section extends it explicitly to
subcontractor/agent/mileage, which were the parts that used to violate it (see below).

## Net Profit

```
Net Profit = Revenue − Expenses
```

`CompanyFinancials.netProfit = totalRevenue − totalExpenses`;
`ProjectFinancials.netProfit = revisedTotal − totalExpenses` (project-level revenue is
`revisedTotal = invoicesTotal + approvedChangeOrderTotal`, per Section 15/the file
header — company-level revenue has no change-order component of its own, since change
orders are billed through invoices).

## Profit Margin

```
Profit Margin = Net Profit / Revenue
```

Returns `0` when Revenue is `0` (both `getCompanyFinancials` and `getProjectFinancials`
guard this with a ternary — `revenue > 0 ? (netProfit / revenue) * 100 : 0` — never a
`NaN`/`Infinity` result).

## Company Financials

Company-level financial metrics (`CompanyFinancials` — revenue, payments received,
expenses, profit, margin, outstanding, payables) are calculated **only** inside
`FinancialEngine.getCompanyFinancials`. No page or service outside `financialEngine.ts`
may duplicate this calculation. `ReportingService`/`AccountsPayableService` compose
`FinancialEngine`'s own output rather than recomputing anything (confirmed in the
Comprehensive Financial Audit); `AccountsReceivableService` composes
`InvoiceService`/`PaymentService` directly for its aging buckets, which is a different
question ("who owes what, by age") than `FinancialEngine`'s company totals, not a
duplicate of them.

## Project Financials

Project-level financial metrics (`ProjectFinancials` — revenue, costs, profit, payment
status) also originate from `FinancialEngine.getProjectFinancials`, itself built
entirely from persisted services: `InvoiceService`, `ChangeOrderService`,
`PaymentService`, `ExpenseService`, `SubcontractorService`, `AgentCommissionService`.
`EstimateFinancials` (the estimate-scoped counterpart) shares the same formulas from
`financialCalculations.ts` and the same `PaymentService.getSummaryForInvoice` payment
source, so a project's numbers and its own estimates' numbers are built from the same
kind of data, not two different models that happen to usually agree.

## Date range rules — what's scoped, what's all-time

| Metric | Date-scoped? |
|---|---|
| Revenue, Payments Received, Expenses, Net Profit, Profit Margin, Outstanding (Dashboard tiles) | **Yes** — `CompanyFinancials` requires a `dateRange`; every figure is filtered to it |
| Tax Summary (taxable revenue, deductible expenses, approved costs) | **Yes** — same `dateRange` requirement |
| `ProjectFinancials`/`EstimateFinancials` (Project Detail, Estimate Detail) | **No** — lifetime figures for that project/estimate; there is no date range parameter on `getProjectFinancials`/`getEstimateFinancials` |
| Payables (`getPayablesSummary`) | **No** — lifetime outstanding, by design (matches `getCompanyFinancials`'s own lifetime payables sub-call, not period-scoped even when the surrounding company financials are) |
| Pending Estimates / Signed Estimates / Active Projects (Dashboard count tiles) | **Intentionally all-time** — plain status counts over `estimateService.list()`/`projectService.list()`, unaffected by the Dashboard's date-range picker. Labeled "All time" in the UI (`app/(app)/dashboard/page.tsx`) specifically so this reads as deliberate rather than a stuck/non-updating card. |

## Single source of truth — every consumer

Every current and future financial consumer must call `FinancialEngine`, not compute its
own numbers:

- **Dashboard** — `useDashboardData` → `financialEngine.getCompanyFinancials` (only).
- **Project Detail** — `financialEngine.getProjectFinancials`.
- **Estimate Detail** — `financialEngine.getEstimateFinancials`.
- **Reports** — not yet built (placeholder page); when built, must call
  `financialEngine`/`ReportingService` (which itself composes `FinancialEngine`), never
  re-derive.
- **Accounting** — not yet built; same rule, via `FinancialStatementsService`/
  `AccountsReceivableService`/`AccountsPayableService`, all of which already compose
  `FinancialEngine`/`GeneralLedgerService` rather than inventing new arithmetic.
- **Analytics** — not yet built; same rule.
- **Tax Center** — not yet built; `financialEngine.getTaxSummary` already exists and is
  correct — building the page is display work, not a new calculation.
- **Future APIs** — any server route exposing a financial number must call
  `FinancialEngine` via the same `lib/services/server.ts` construction path every other
  server-side service use already goes through, not query Supabase tables directly.

## Architecture rules (permanent)

1. **No financial calculations inside React components.** A component may format a
   number `FinancialEngine` returned; it may never sum/subtract/derive one.
2. **No duplicated financial logic.** If two places need the same figure, one calls
   `FinancialEngine` (or a shared Layer 0 function in `financialCalculations.ts`) and the
   other imports/calls the same thing — never two independent implementations of the
   same formula.
3. **No production dependency on in-memory services.** `ServicesProvider.tsx`
   (browser) and `lib/services/server.ts` (server routes) must wire every
   financial-calculation input to a real, Supabase-backed service. As of the 2026-08-01
   fix, `transactionService` is the only remaining in-memory dependency in production
   wiring, and it is no longer read by any `FinancialEngine` calculation — it is passed
   only because `FinancialEngineDeps` still requires it for constructor-signature
   compatibility (see "What changed" below).
4. **In-memory services are for testing and development only.**
   `lib/services/testing/inMemoryServices.ts` exists so `tests/*.test.ts` can exercise
   the full service/`FinancialEngine` contract quickly, without a live database. It must
   never be the backing implementation for a production financial calculation.
5. **Reuse existing services before adding new ones.** The 2026-08-01 fix added exactly
   three new *methods* (`PaymentService.listForCompany`,
   `SubcontractorService.listPayments`, `AgentCommissionService.listPayments`) to
   *existing* services — no new service files, no new `FinancialEngine` consumers
   bypassing it.
6. **Avoid new tables or columns unless absolutely necessary.** The fix required zero
   schema changes — every new method queries a table (`invoice_payments`,
   `subcontractor_payments`, `agent_payments`) that already existed and was already
   company-scoped.

## What changed (2026-08-01) — obsolete references corrected

Before this fix, `getCompanyFinancials`, `getProjectFinancials`, and `getTaxSummary` read
Revenue, Payments Received, subcontractor/agent paid, and mileage cost from
`transactionService`'s **in-memory transaction ledger** — which in production
(`ServicesProvider.tsx`) is the `createInMemoryServices()` test double, recreated empty
on every page load, and which the real `PaymentService` never wrote to at all. This made
Revenue and Payments Received permanently incorrect in production (see
`DASHBOARD_AUDIT_REPORT.md`), and made subcontractor/agent cash-paid figures correct only
for the lifetime of one browser session.

**Fixed**: all three methods now read from `PaymentService`/`SubcontractorService`/
`AgentCommissionService`'s real, persisted rows via two new shared private helpers in
`financialEngine.ts` — `getRealizedCashFlows` (customer/subcontractor/agent payments,
attributed to a project and filtered to a date range) and `getMileageCostForProjects`
(real `ExpenseService.listMileageForProject` data). `transactionService` remains on
`FinancialEngineDeps` only for constructor-signature compatibility with existing
call sites; it is not read by any calculation. Proven by
`tests/financial-engine-ledger-independence.test.ts`, which constructs
`FinancialEngine` with a `transactionService` that throws on every call and confirms
every figure above is still computed correctly.

**Superseded references**: Section 15's "Payment rules" previously stated
`getProjectFinancials`'s `amountPaid` was "read from the transaction ledger" — corrected
above (2026-08-01) to reflect that it now uses `PaymentService.getSummaryForInvoice`, the
same call `getEstimateFinancials` already used. No other section of this document
referenced the ledger or in-memory financial calculations as of this review.