# CPA Year-End Package — Specification (v1)

Status: **APPROVED DESIGN, NOT YET IMPLEMENTED.** This document is the
finalized contract for the first version of the CPA Year-End Package.
No code exists yet. Nothing here should be treated as documentation of
built behavior until an implementation PR references this file and the
tests in `tests/system-integrity-audit.test.ts` (or a dedicated
successor) verify it.

## 1. Goal

"If I export this package at year-end, does my CPA have a complete,
trustworthy picture of the company's income, expenses, and who the
company was paid?"

This is explicitly **not** tax-preparation software. It does not
compute tax liability, does not generate 1099 forms, does not handle
payroll, and does not touch owner equity. It produces the underlying
financial data a CPA needs to do their own work — nothing more.

## 2. Scope

**In scope (v1):** four reports, all strictly cash-basis, all
company-wide for a single calendar tax year, built entirely from
production data that already exists and is already trustworthy.

**Explicitly out of scope (do not build):**
- 1099 form generation or TIN/W-9 collection — the Payee Report gives
  the CPA "who was paid how much"; collecting tax IDs and filing is
  their job or the business owner's, not this system's.
- Payroll/W-2 wage reporting — team labor cost is shown, clearly
  labeled as internal cost, not payroll.
- Owner draws/contributions, bank transfers, manual journal
  entries/equity — no data exists for these anywhere in production
  (the chart-of-accounts/general-ledger layer that could theoretically
  model them is not wired into the running app at all).
- Mileage deductions — no live mileage data exists in production
  (`listMileageForProject` always returns `[]`); omitted rather than
  reported as a false zero.
- Refund/credit-note tracking — no such transaction type exists;
  out of scope for v1.
- Project-by-project financial summaries — useful internally, not
  part of a tax-year package, which needs company totals.
- Accrual/GL-based reporting (P&L via `financialStatementsService`) —
  that layer has no real backing data in production.

## 3. The four reports

Three reports were originally proposed and eliminated as redundant:
a standalone Reimbursement Report (folds into the Payee Report and
Detailed Transaction Report — a reimbursement is just a paid expense
row to a specific payee), a standalone Bills/Payables Report (a bill
is, by this app's own data model, "an expense with a due date" — same
table, same report), and a standalone "supporting transaction export"
(this **is** the Detailed Transaction Report, not a fifth thing).

| # | Report | Format |
|---|---|---|
| 1 | Income Summary | PDF + CSV |
| 2 | Expense Summary by Category | PDF + CSV |
| 3 | Payee Report | PDF + CSV |
| 4 | Detailed Transaction Report | CSV only |

Plus a **Company Information cover page** (PDF only) bundled into the
package — not a standalone "report."

---

### Report 1 — Income Summary

Cash-basis income for the tax year, plus a receivables footnote.

| Column | Source | Calculation |
|---|---|---|
| Total Invoiced (informational) | `InvoiceService.listForCompany` → `Invoice.total` | Sum where `isRevenueInvoice(invoice)` is true and `issueDate` (fallback `createdAt`) falls in the tax year |
| Total Cash Collected (**the taxable figure**) | `PaymentService.listForCompany(scope)` → `CustomerPayment.amount` | Sum where `paymentDate` falls in the tax year, active rows only |
| Outstanding Receivables at year-end | Derived: `Invoice.total` − payments to date | Snapshotted as of Dec 31 of the tax year; informational only, not part of taxable income |
| Monthly breakdown | Same payment rows | Grouped by `paymentDate` month |

- **Date rule:** cash-basis → filter by `CustomerPayment.paymentDate`,
  never `Invoice.issueDate`. A December invoice paid in January books
  as next year's income.
- **Deleted payments:** excluded entirely (`deletedAt is null`,
  enforced by `PaymentService.listForCompany` itself).
- **Void/cancelled invoices:** excluded from "Total Invoiced" via
  `isRevenueInvoice`. A payment recorded against a void/cancelled
  invoice still counts as cash collected (v1 decision — see §5).
- **Reconciliation anchor:** must equal Report 4 Section A's total,
  exactly — same source rows, same filter, no exceptions.

---

### Report 2 — Expense Summary by Category

Deductible expenses, cash-basis, grouped by `expenseType`.

| Column | Source | Calculation |
|---|---|---|
| Category | `Expense.expenseType` (8 values: materials, labor, subcontractor, agent_commission, permit, equipment, reimbursement, miscellaneous) | Group key |
| Total Paid | `Expense.amount` | Sum where `isPaid === true`, active, `expenseDate` in tax year |
| Count | — | Row count per category |
| % of Total | — | Category sum ÷ grand total |

- **Basis:** same grouping keys as `calculateExpenseTotals`'s
  `byType`, but re-scoped to `isPaid === true` and the tax-year date
  range (the existing function has no date filter and folds unpaid
  rows into its `total`, tracking them separately as `unpaid` instead
  of excluding them — this report must exclude them, not just flag
  them).
- **Paid vs. unpaid:** only `isPaid === true` counts. Unpaid/committed
  costs never appear in this report, not even as a footnote.
- **Deleted expenses:** excluded (`deletedAt is null`).
- **Date rule:** `expenseDate` within `[YYYY-01-01, YYYY-12-31]`,
  inclusive, string lexicographic comparison (matches
  `financialEngine.ts`'s existing `withinRange` — no timezone risk
  since dates are stored as `YYYY-MM-DD`).
- **Reimbursement category rows:** counted here only when
  `isPaid === true` — a reimbursement *category* row means an actual
  payout event, not the underlying liability.

---

### Report 3 — Payee Report

The centerpiece. Answers "who did we actually pay, and how much."

**Source (single, exclusive):** `ExpenseService.listForCompany(companyId)`
— real `estimate_expenses` rows.

**Explicitly excluded as sources:** the legacy `subcontractor_payments`
and `agent_payments` tables, and `SubcontractorService.getTotalPaidForYear`
(which reads that legacy table). All three have zero real production
writers — production payments are recorded exclusively through
`ExpenseService.create`. Using any of them would silently report $0
for real, actively-paid subcontractors.

| Column | Source | Calculation |
|---|---|---|
| Payee Name | `Expense.vendor` | Display name, always populated |
| Payee Type | `Expense.payeeType` (`vendor \| subcontractor \| agent \| employee \| other \| null`) | Group key, component 1 |
| Payee ID | `Expense.payeeId` (nullable) | Group key, component 2 |
| Total Paid | `Expense.amount` | Sum, `isPaid === true`, active, `expenseDate` in tax year |
| Payment Count | — | Row count |
| Classification note | Derived | See employee/vendor rules below |

**Grouping rule (how repeated payments to the same payee aggregate):**
- `payeeId` non-null → group by `(payeeType, payeeId)` — the exact
  join key `FinancialEngine.sumPaidToPayee`/`sumOutstandingAgainstContracts`
  already use, so this report's totals are provably consistent with
  the rest of the app.
- `payeeId` null → group by `(payeeType, vendor)`, i.e. exact-string
  match on the free-text vendor name (v1 decision — see §5).

**Unknown/missing payee:** a row with both `payeeId` and `vendor`
null/empty is grouped into a single literal `"(Unspecified Payee)"`
bucket, sorted last — visible and reconcilable, never silently
dropped or merged into a real payee.

**Employee/team-labor rows (`payeeType === "employee"`):** included in
the report (money did leave the business to a specific person) but
visually/structurally separated — a distinct sub-section or an
explicit `"Internal Team Labor — not a 1099 candidate"` label per row
and subtotal. Must never be silently mixed into the same list as
subcontractor/agent/vendor rows.

**Reimbursements:** not a separate payee category. A reimbursement is
`expenseType === "reimbursement"` on a row that already carries a real
`payeeType`/`payeeId`; it rolls into that payee's total like any other
paid expense. Counts only when `isPaid === true` — a pending
reimbursement liability is not yet a payment and must not inflate this
report.

**Committed-but-unpaid subcontractor/agent/team assignments:**
excluded entirely. This report is inherently paid-only, cash-basis.

**Deleted expenses:** excluded. **Date rule:** same as Report 2.

---

### Report 4 — Detailed Transaction Report

Two independent sections in one export. **Never merged into one
row-set** — this is the explicit non-double-counting guarantee.

#### Section A — Money Received (customers)

| Column | Source |
|---|---|
| Date | `CustomerPayment.paymentDate` |
| Client | `Invoice.clientId` → `Client.name` |
| Invoice # | `Invoice.invoiceNumber` (via `CustomerPayment.invoiceId`) |
| Project | `Invoice.projectId` → `Project.name` |
| Amount | `CustomerPayment.amount` |
| Method | `CustomerPayment.method` (free text, passed through) |
| Reference # | `CustomerPayment.referenceNumber` |

Source: `PaymentService.listForCompany(scope)`, active only,
`paymentDate` in tax year.

#### Section B — Money Paid Out (company)

| Column | Source |
|---|---|
| Date | `Expense.expenseDate` |
| Payee | `Expense.vendor` |
| Payee Type | `Expense.payeeType` |
| Category | `Expense.expenseType` |
| Amount | `Expense.amount` |
| Method | `Expense.paymentMethod` |
| Project | `Expense.projectId` → `Project.name` (nullable) |
| Estimate | `Expense.estimateId` (nullable, passthrough only) |
| Paid Status | `Expense.isPaid` |
| Reimbursement Status | `Expense.reimbursementStatus` |

Source: `ExpenseService.listForCompany(companyId)`, active only,
**includes both `isPaid: true` and `isPaid: false` rows** — this
section is a full ledger, not a deductible-total summary. Unpaid rows
are visible and labeled but never summed into any "total paid" figure
on this report.

**Non-double-counting guarantee:**
- Section A's source (`invoice_payments`) and Section B's source
  (`estimate_expenses`) are structurally disjoint tables with no
  shared key or overlapping write path — a customer payment can never
  appear as an expense row or vice versa.
- Each section must sum independently to a figure that equals its
  corresponding summary report exactly: Section A total (active rows)
  = Report 1's "Total Cash Collected." Section B total
  (`isPaid: true` rows only) = Report 2's grand total = Report 3's
  grand total.
- **This triple equality is the built-in reconciliation check.** If
  any two of these three figures disagree after implementation, that
  is a real defect, not a rounding artifact — all three read the same
  underlying rows with the same filters.

---

## 4. General rules (apply across all four reports)

| Rule | Definition |
|---|---|
| Cash-basis income | Recognized on `CustomerPayment.paymentDate`, never on `Invoice.issueDate` or invoice creation |
| Paid expenses | Recognized on `Expense.expenseDate` **and** requires `isPaid === true` — both conditions, not either |
| Year boundary dates | Inclusive `[YYYY-01-01, YYYY-12-31]`, string lexicographic comparison, matching `financialEngine.ts`'s existing `withinRange` |
| Partial payments | Each `CustomerPayment` row is its own event on its own date — a $2,000 invoice paid $1,500 in December and $500 in January books as $1,500 to Year 1 and $500 to Year 2 automatically, with no special-casing, because the source is payment rows, not invoice totals |
| Deleted payments/expenses | Excluded from every report, every section, no exceptions — a soft-deleted row is treated as if it never existed for package purposes |
| Unpaid expenses | Never counted in Report 2 or 3 totals; visible only in Report 4 Section B, explicitly flagged, excluded from that section's own subtotal |
| Reimbursements | Counted as a paid expense to the reimbursed payee only once `isPaid === true`; a pending reimbursement liability appears nowhere in this package |
| Committed but unpaid subcontractor/agent/team assignments | **Excluded from the entire package.** The package is strictly cash-basis; committed-but-unpaid amounts are not yet cost or income by this app's own architecture. Including them would overstate this year's deductible expenses and misstate next year's when they're actually paid. (A future accrual-basis internal report is a separate, later concern.) |

## 5. V1 decisions (defaults locked in; revisit only if wrong)

1. **Fiscal year:** calendar year only (`Jan 1 – Dec 31`). No
   company-level fiscal-year-start override exists or is being built
   for v1.
2. **Payments against void/cancelled invoices:** counted as income —
   cash that moved is cash that moved, regardless of the invoice's
   later status.
3. **`payeeType: null` vs. `"other"`:** collapsed into a single
   "Other" bucket for display purposes.
4. **Vendor name grouping (no `payeeId`):** exact-string match on
   `vendor`. Casing/whitespace variants (e.g. "Home Depot" vs.
   "home depot ") will not merge. Disclosed as a footnote in the
   report, not solved with fuzzy matching in v1.
5. **Package scope:** single tax year, company-wide, four reports
   only. No project-level cross-check, no multi-year view.

## 6. Data sources (complete list)

| Report | Real, production-backed source(s) |
|---|---|
| 1. Income Summary | `PaymentService.listForCompany`, `InvoiceService.listForCompany` |
| 2. Expense Summary by Category | `ExpenseService.listForCompany` |
| 3. Payee Report | `ExpenseService.listForCompany` |
| 4. Detailed Transaction Report | `PaymentService.listForCompany`, `ExpenseService.listForCompany` |
| Cover page | `CompanyService.getByCompanyId` → `CompanySettings` |

All four reports reduce to **two tables** (`estimate_expenses`,
`invoice_payments`) plus one settings row. No other production table
is required.

## 7. Required changes

**Database:** none. Zero new fields or tables.

**Code (net-new, read-only reporting layer — does not touch
`FinancialEngine`, any entity service, or any existing calculation):**
1. A company-wide, date-ranged aggregation function per report,
   composing `ExpenseService.listForCompany`/`PaymentService.listForCompany`
   results — new code, but no new data source.
2. CSV export via the existing, currently-unused
   `exportToCSV` utility (`lib/services/exportService.ts`) — exactly
   what it was built for.
3. PDF layout for the summary-level reports (Income Summary, Expense
   Summary, Payee Report, cover page) — net-new; no PDF infrastructure
   exists today for company-wide reports (only per-document PDFs like
   estimates/invoices).

## 8. Final package structure

```
"[Company Name] — Year-End Financial Package, [Tax Year]"

1. Cover Page (PDF)
   — Legal name, DBA, address, EIN, phone/email
   — Tax year, date range, "prepared by [system] on [date]"

2. Income Summary (PDF + CSV)
   — Total invoiced (accrual) vs. total collected (cash), by month
   — Outstanding receivables at year-end

3. Expense Summary by Category (PDF + CSV)
   — Materials, Labor, Subcontractor, Agent Commission, Permits,
     Equipment, Reimbursement, Miscellaneous — totals + % of total

4. Payee Report (PDF + CSV)
   — One row per payee: name, type, total paid this tax year
   — Real expense rows only, grouped by payeeType + payeeId
   — Employee/team-labor rows clearly labeled, not 1099 candidates
   — Vendor rows (no payeeId) grouped by exact vendor name

5. Detailed Transaction Report (CSV only)
   — Section A: every payment received (date, client, invoice,
     project, amount, method, reference)
   — Section B: every expense (date, payee, type, category, amount,
     method, project, estimate, paid status, reimbursement status)
```

## 9. Implementation plan (not started)

1. Write the aggregation functions (Layer 3-style, composing existing
   Layer 2 service reads — no new Layer 0/1 calculations).
2. Write regression tests proving the triple-equality reconciliation
   rule (§3, Report 4) holds across representative fixtures — reuse
   the in-memory service doubles the System Integrity Audit already
   uses.
3. Wire CSV export via the existing `exportToCSV` utility.
4. Build PDF layouts for the four PDF-bearing reports plus the cover
   page.
5. Add a UI entry point (e.g. a "Year-End Package" action under
   Reports/Settings) that lets a user pick a tax year and download the
   package.

No step above has been started. This document is the spec those steps
will implement against.
