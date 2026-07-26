# Reliability Systems

## 1. Audit Logs

Tracks exactly six things: **user, company, action, record changed, old value, new value, timestamp** (`AuditLogEntry` in `lib/services/types.ts`).

- **DB**: `audit_logs` table (`contractor-pwa/supabase/migrations/20260729000000_audit_logs_table.sql`) + a generic `log_audit_change()` trigger applied to every business table (same "one function, looped over a table list" pattern as the existing `set_audit_fields()`/`soft_delete_instead()` triggers) — captures the full old/new row as JSONB on every insert/update/delete, with zero per-table code. Company-scoped RLS on `select`; **no** insert/update/delete policy for ordinary users — the log can only be written by the trigger (or the app's elevated status-change path), never rewritten or erased by whoever's action it's recording.
- **Service**: `AuditService` (`lib/services/auditService.ts`), now concretely implemented (`createAuditService(repository)`) against an injected `AuditLogRepository` port — same seam pattern as `TransactionService`'s `QueryExecutor`. `getHistory()` diffs `oldValues`/`newValues` into field-level changes on read; `recordStatusChange()` captures the one thing a generic trigger can't infer — *why* a value changed (an estimate moved from `sent` to `approved` because the customer signed, not just "status: sent -> approved").

## 2. Soft Delete

Every financial record already had `deleted_at`/`deleted_by` (contractor-pwa's July 2026 audit migrations). This pass adds the third piece: **`delete_reason`**.

- **DB**: `delete_reason` column added to every financial table (`20260729000100_soft_delete_reason.sql`) — nullable at the column level only as a safety net for the trigger-intercepted stray hard-`DELETE` path; the application must never leave it empty for a real user action.
- **Service**: every Layer 2 `softDelete` signature now requires `reason: string` (`estimateService.ts`, `invoiceService.ts`, `paymentService.ts`, `expenseService.ts`, `projectService.ts`), enforced by the newly-implemented `ValidationService.validateDeleteReason` — rejects empty/whitespace before anything is written.
- **Application**: `ExpenseList` and `InvoicePaymentsPanel` won't even call the service without a reason typed in — a confirm step, not a silent delete button.

### "Deleted records must never affect calculations" — how this is actually true, not just asserted

The ledger (`financial_transactions`) is immutable — deleting a source record does **not** delete its ledger row (that would break the audit trail; you must still be able to see what a deleted invoice's history was). Instead, `TransactionService.getProjectLedger`/`getCompanyLedger` — the ONLY read paths `FinancialEngine` uses — are contractually required to **exclude** any ledger row whose source record is currently soft-deleted (join against that table's own `deleted_at` at read time; see the updated doc comment in `transactionService.ts`). `getAuditTrail()`, by contrast, deliberately does **not** apply this filter, because forensic history must include deleted records.

`ReconciliationService.reconcileLedgerAgainstSources` is the automated proof of this, not just a comment asserting it: for every soft-deleted source row, it confirms the ledger read paths exclude it while `getAuditTrail` still shows it, and flags a `severity: "error"` finding if a deleted record's amount is ever still being summed into an active total.

## 3. Permissions — Admin / Office / Sales / Project Manager / Accountant / Subcontractor / Agent

Three independent layers, matching the requirement exactly. **Each layer must independently deny an unauthorized action** — a gap in one is a gap, not a hole, only because the other two still hold.

Expanded (2026-07-31) from the original 5-role model (owner/manager/estimator/accountant/agent) to this 7-role set — see `permissions.ts`'s file header for the exact rename mapping (owner→admin, manager→office, estimator→sales; project_manager and subcontractor are new).

| Layer | Where | Mechanism |
|---|---|---|
| **Database** | `contractor-pwa/supabase/migrations/20260729000200_role_permissions.sql` + `20260731000000_expand_roles_seven_role_model.sql` | `profiles.role` expanded to the 7 roles; `current_user_role()` helper (same `SECURITY DEFINER` pattern as `current_company_id()`); RLS policies on `invoices`/`invoice_payments`/`estimate_expenses` deletion restricted to admin/office/accountant; `company_tax_settings` writes restricted to admin/accountant; `agent_payments`/`subcontractor_payments` reads row-scoped to the agent's/subcontractor's own rows. |
| **Service** | `lib/services/permissions.ts` + `validationService.ts` | `PERMISSION_MATRIX`: pure data (role × resource × action → allow/deny), same "data not code" pattern as `SchemaRegistry`. `ValidationService.validatePermission(role, resource, action)` is what every Layer 2 write method calls first, before touching data — using the **caller's session role**, never a role value trusted from a request payload. |
| **Application** | `lib/hooks/usePermission.ts` | UI-only — disables/hides actions the current role can't perform, for user experience, not security. Explicitly documented as not the boundary: `useCurrentRole()` is a stub pending real auth wiring, and the file's own doc comment states a bug here must never be the only thing stopping an unauthorized action. |

### The permission matrix (design intent, not architecture — revisit with the business owner)

- **Admin** — full access everywhere, including role management, company settings, and the audit log.
- **Office** — full day-to-day operational access (projects/estimates/invoices/payments/expenses/payables), not tax settings, role management, or company settings.
- **Sales** — creates/edits estimates and projects; can *view* invoices/payments (needs to know what's billed) but not create/delete them.
- **Project Manager** — operational owner of active jobs: full access to projects/expenses/subcontractor & agent assignments, approves estimates/change orders; *views* invoices/payments but doesn't create/delete billing records (that boundary belongs to Office/Accountant).
- **Accountant** — full access to money movement (invoices/payments/expenses/payables/tax settings/reports/audit log); cannot create/edit estimates or manage roles/company settings.
- **Subcontractor** — view-only on their own assignment/payment data (role check says "can view `subcontractor_payment` at all"; DB row-scoping says "only their own rows"); no write access anywhere.
- **Agent** — view-only on their own commission/reimbursement data, same row-scoping caveat as Subcontractor; no write access.

`ROLES`/`Role`/`Resource`/`PermissionAction`/`hasPermission`/`assertPermission` are exported from the service barrel (`lib/services/index.ts`) — the SQL migration's comment states explicitly that the DB constraint and the TypeScript matrix must be kept in sync by hand; there is no single source of truth spanning both today.

## 4. Multi-Company Isolation

Already true, not new work from this pass — restated here because "make everything company-aware" was asked as an explicit requirement and deserves its own checklist entry rather than being implicit:

- Every core service type (`AuditLogEntry`, `Transaction`, `Estimate`/`Invoice`/`Payment`/`Expense` inputs, etc. — `lib/services/types.ts`) carries `companyId`, not an optional/inferred field.
- `FilteringService`/every Layer 2 service's list methods take a `QueryScope` that includes `companyId` and is never optional.
- DB-level: every table has RLS scoped to `company_id = current_company_id()` (contractor-pwa's `20260713000000_company_rls_lockdown.sql` + the cleanup in `20260713000300`) — this was independently audited earlier for cross-company leaks (stacked permissive policies were the historical root cause, since fixed) and re-verified in `DATABASE_INTEGRITY_AUDIT.md`.
- What's genuinely still open: **multi-location/multi-branch** (item 5 below) is a different axis than multi-company and doesn't exist yet — today one company = one set of data, with no sub-division by location/branch.

## 5. Accounting + Tax Center

Built (2026-07-23), all as thin composition over `TransactionService`/`FinancialEngine` — none of it recomputes a financial fact, per "keep FinancialEngine as the single source of truth":

- **Chart of Accounts** (`chartOfAccountsService.ts`, Layer 0/2, pure data): a standard contractor chart (Cash, AR, AP, Agent Reimbursements Payable, Equity, Revenue, 6 expense accounts) plus `POSTING_RULES` — the exact double-entry debit/credit rule for every `TransactionType`, compile-time exhaustiveness-checked so a new transaction type can't ship without an accounting rule.
- **Double-entry General Ledger** (`generalLedgerService.ts`, Layer 3): maps `TransactionService.getCompanyLedger`/`getProjectLedger` through `POSTING_RULES` into real postings and a trial balance. `isBalanced` is a checked structural invariant (total debits == total credits), not an assertion — proven by test, including that it stays balanced after a soft-delete.
- **Accounts Receivable** (`accountsReceivableService.ts`): aging (current/1-30/31-60/61-90/90+) over `InvoiceService.listForCompany` + `PaymentService.getSummaryForInvoice`.
- **Accounts Payable** (`accountsPayableService.ts`): thin re-shaping of `FinancialEngine.getPayablesSummary`. Explicitly NOT aged by due date — subcontractor/agent assignments have no due-date field in this schema, so a fake aging bucket was not invented.
- **Bank Reconciliation** (`bankReconciliationService.ts`): a real matching algorithm — greedy, amount-exact + closest-date-within-tolerance, against `FinancialStatementsService.getCashFlow`'s lines (so "what counts as cash" is one definition, not re-derived). Accepts `BankStatementLine[]` as a plain input — there is no bank-feed/CSV-import connector in this codebase yet, so that ingestion is the caller's job.
- **CPA-ready Financial Statements** (`financialStatementsService.ts`): Profit & Loss, Balance Sheet (checked: Assets = Liabilities + Equity + Retained Earnings, where Retained Earnings is the period's own P&L net income — there is no period-closing/journal-entry process, so this is the standard unclosed-books convention, not a fudge), and Cash Flow (every posting touching the Cash account, signed).
- **Tax Center**: `TaxService.get1099Summary` (1099/W-9 management) and `getSettings`/`updateSettings` (Tax Settings, including `salesTaxRate`) already existed before this pass — not rebuilt. **Genuinely new**: none — Sales Tax reporting, Payroll Tax Preparation, Tax Reports beyond `getReadiness`, and Filing Exports are not implemented; Filing Exports specifically can now use the new `exportToCSV` utility (below) once a report is designed to feed it.

**IMPORTANT accrual-vs-cash note**: `ProfitAndLossStatement.totalRevenue` (accrual-basis, booked at invoice/change-order time) and `FinancialEngine.getCompanyFinancials().totalRevenue` (cash-basis, payments collected) are DIFFERENT numbers by design — they only converge once every invoice in a period is fully collected. `ExecutiveDashboard` (below) surfaces both; its own doc comment states explicitly which is which. Do not "fix" a UI that shows these disagreeing — that's correct.

## 6. Payroll + Multi-Location + Reports/Analytics

- **Payroll** (`payrollService.ts`): Payees (employee/contractor) + Pay Runs (draft → approved → paid) with computed net pay, Pay Stubs (`getPayStub`, a reshape of the run's own line, no new math), and Payroll Reports (`getPayrollReport`, totals by payee). Marking a run "paid" appends a real `payroll_expense` ledger transaction (new `TransactionType`, referencing the run via the new `payroll_run` `ReferenceType`) — proven by test to show up in `FinancialEngine.getCompanyFinancials` and the General Ledger, same as every other cost. **Explicitly NOT implemented**: real tax withholding calculation — `PayRunLine.withholdings` is caller-supplied, not computed, because federal/state/local withholding tables are a jurisdiction-dependent compliance problem, not an architecture one.
- **Multi-location** (`locationService.ts`): a real `Location`/branch entity, plus `Project.locationId` (additive field) and `QueryScope.locationId`. Location-based filtering is wired into exactly one report so far — `ReportingService.getProjectPerformanceReport` — proven by test to isolate one branch's projects; it is NOT wired into every Layer 2 service's `list()` yet (that's a mechanical follow-up once more than one report needs it, not done speculatively). **User assignment by location** is not implemented — there is no `User`/`Profile` entity in this service layer at all to assign a location to (auth/session is a documented stub elsewhere in this file).
- **Reports & Analytics** (`reportingService.ts`, extended): Executive Dashboard (KPI + P&L + AR + AP composed), Project Performance (batched `FinancialEngine.getFinancialsForProjects`, location-filterable), Sales Analytics (revenue by client via `FinancialEngine.getClientFinancials`, plus the existing revenue trend), Expense Analytics (cost-effect ledger transactions by type, positive magnitudes, deliberately excluding `payroll_expense` — see its own doc comment for why). KPI Dashboard, Financial Reports, P&L, Balance Sheet, Cash Flow are the sections above, composed together here for a dashboard consumer.
- **Export** (`exportService.ts`, Layer 0): `exportToCSV` — generic, framework-free, given any rows + an explicit column list. **PDF and Excel export are NOT implemented, and not faked** — both need a rendering/workbook library that belongs in the consuming application, not this headless service layer; every report above already returns the same tabular data those formats would render.

All of the above is proven by `tests/enterprise-platform.test.ts` (19 tests) — every assertion either checks a structural invariant (balance sheet balances, debits==credits, CSV escaping) or cross-checks against `FinancialEngine`/`TransactionService` directly, not just that the code path runs.

## What's still a stub

`AuditLogRepository` (the DB-access seam `createAuditService` depends on) has no concrete Supabase-backed implementation yet — same status as every service in this file (all are in-memory-proven, none has a real Supabase-backed implementation, per this repo's stated "architecture over implementation" sequencing). `useCurrentRole()` returns `null` unconditionally pending real auth/session wiring. The DB migrations are drafts, unapplied, following this repo's existing convention — review before running, same as every other migration in this project. Genuinely unstarted, not partially built: Sales Tax reporting, Payroll Tax Preparation/withholding, Filing Exports (beyond the generic CSV primitive), PDF/Excel rendering, User-to-location assignment, and location-filtering beyond the one report that has it.
