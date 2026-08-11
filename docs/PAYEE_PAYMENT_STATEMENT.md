# Per-Payee Payment Statement — Specification (v1)

Status: **DESIGN, NOT YET IMPLEMENTED.**

## 1. What this is — and what it explicitly is NOT

This is a **"here's what we paid you this year"** document, generated
per payee from the same data already powering the Payee Report
(Report 3 of the CPA Year-End Package, see
`docs/CPA_YEAR_END_PACKAGE.md`).

**This is NOT an IRS Form 1099-NEC.** A real 1099 requires the
payee's TIN/SSN and legal address — fields that don't exist anywhere
on the `Subcontractor`/`Agent` roster today (confirmed in the earlier
tax-readiness audit) — plus correct IRS box formatting and either
e-filing or mailed paper copies against the IRS's own deadlines.
Building that is a separate, later decision that starts with adding
those fields to the roster, not a reporting feature. This document is
informal: useful for the payee's own records, or to hand your CPA one
clean page per contractor instead of a single combined CSV. Doc title
says "Payment Summary," never "1099," so nobody mistakes it for a
filed tax form.

## 2. What it contains

One page per payee, for a given tax year:

| Section | Content | Source |
|---|---|---|
| Header | Your company info (name, DBA, address, phone, email) — same block used on estimates/invoices | `CompanySettings` |
| Payee identity | Payee name, payee type (Subcontractor / Agent / Vendor / Internal Labor) | `PayeeReportRow.payeeName`/`payeeType`/`isInternalLabor` |
| Total paid | The same total already in the Payee Report | `PayeeReportRow.totalPaid` |
| Itemized payments | Every individual paid expense row that rolled into this payee's total — date, project, category, amount | `Expense` rows matching this payee's group key, same filter as the Payee Report (`isPaid && expenseDate in tax year`) |
| Footer note | "This is a summary of payments for your records. It is not an IRS Form 1099." | Static text |

**Employee/internal-labor payees:** included, since real money did go
to them, but the doc is explicitly labeled "Internal Labor Summary,"
not "Payment Summary," so it can't be confused with a contractor
document.

**"(Unspecified Payee)" bucket:** no statement is generated for it —
there's no one to send it to. It stays visible only in the Payee
Report/Detailed Transaction Report as a data-quality flag.

**Vendor rows with no `payeeId`** (grouped by exact name, per the CPA
package's existing v1 decision): get a statement too, keyed by that
name — same limitation already documented (casing/whitespace variants
won't merge into one statement).

## 3. Data source

**No new data.** This reuses `CpaPackageService.getPayeeReport`'s
exact grouping logic (`lib/services/cpaPackageService.ts`) for the
totals, plus one more read of the same underlying `Expense[]` rows
already fetched for that report, filtered down to the one payee's
group key, to produce the itemized list. Zero new database fields or
tables — same two tables the CPA package already uses
(`estimate_expenses`, `invoice_payments` is not needed here since this
is money paid OUT, not received).

## 4. Format

**PDF/print only** (same `pdfLayout.ts` pattern as estimates, invoices,
and the CPA package's print view). No CSV — this is a document you
hand to one person, not a spreadsheet a CPA sorts.

## 5. Delivery

Two entry points, both from the existing Payee Report:
1. **Per-row "Statement" link** next to each payee in the `/reports`
   page's Payee Report — opens that one payee's statement.
2. **"Generate All Statements"** — loops the same per-payee route for
   every real payee (excluding "(Unspecified Payee)"), so you don't
   have to click through the list one at a time at year-end.

No email-sending in v1 — download/print only, same as every other
document in this app today. You attach and send it yourself.

## 6. Required changes

- One new function in `cpaPackageService.ts`: `getPayeeStatement(companyId, payeeGroupKey, taxYear)` — reuses the existing grouping logic, adds the itemized row list.
- One new API route: `app/api/reports/cpa-package/payee/route.ts` (or a query-param variant of the existing route) — same auth pattern as the CPA package route, renders one payee via `pdfLayout.ts`.
- One "Statement" link per row + a "Generate All" button on the existing `/reports` page — no new page.

No database changes. No changes to `FinancialEngine` or any entity service.

## 7. Ambiguity to confirm before building

**How is "one payee" identified in the URL?** Structured payees (`payeeId` set) are unambiguous — pass the id. Vendor/unspecified-name payees have no id, only a name — the route would need to accept `payeeType` + `vendor name` as the key (URL-encoded), consistent with how the Payee Report already groups them. Confirming this is fine rather than assuming.

---

If this looks right, I'll build it next: the service function, the
route, and the two UI entry points on the existing Reports page.
