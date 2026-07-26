# User Workflows

## The rule

> Every form must use services. Forms must not directly control business logic.

Enforced structurally, not by convention: `lib/services-context.tsx`'s `useServices()` is the *only* way any component reaches data or money. There is no Supabase import available to a form, and no calculation utility floating in `lib/utils/` for a form to reach for instead — every number a form shows or submits came from a service call. A form component may hold UI-only state (which field is focused, is a modal open, what's currently typed into an unsaved input) and may **sequence** service calls (create, then reload; create, then convert) — that sequencing is workflow orchestration, not business logic, and it lives in a `lib/hooks/use*.ts` hook, one per workflow, never inline in the `.tsx`.

## What was built

| Domain | Hook (orchestration) | Components (display + input) | Services called |
|---|---|---|---|
| **Estimate** | `useEstimateForm` | `EstimateForm` (items/pricing/markup/discount/deposit/tax), `SignaturePanel`, `ChangeOrdersPanel`, `ConvertToInvoiceButton` | `EstimateService`, `InvoiceService` |
| **Invoice** | `useInvoicePayments` | `InvoiceForm` (create/edit), `InvoicePaymentsPanel` (payments/partial/delete/balance) | `InvoiceService`, `PaymentService` |
| **Expense** | `useExpenses` | `ExpenseForm` (category/vendor/paid-by-company-or-agent), `ExpenseList` (edit/delete/restore) | `ExpenseService` |
| **Subcontractor** | `useSubcontractorAssignments` | `SubcontractorAssignmentPanel` (assign/cost-tracking/payments), `SubcontractorPayablesTable` | `SubcontractorService`, `FinancialEngine` |
| **Agent** | `useAgentAssignments` | `AgentAssignmentPanel` (commission/reimbursement/payments), `AgentPayablesTable` | `AgentCommissionService`, `ExpenseService`, `FinancialEngine` |

Every hook's own doc comment states explicitly what it does and does **not** compute — e.g. `useEstimateForm` never contains a markup/discount/tax formula; that's `EstimateService.recalculateTotal`. `useInvoicePayments` never computes a remaining balance; that's `PaymentService.getSummaryForInvoice`, the same call `FinancialEngine.getProjectFinancials` uses underneath. Grep any hook or component in this feature for `+`/`-`/`*` arithmetic on a dollar amount — there isn't any; the only arithmetic is index math on arrays (removing a line item, building a `Record` keyed by id).

## Deposit — a worked example of "no duplicate tracking"

The brief lists "Deposit" under Estimate. The naive implementation is a `deposit_paid` boolean cached on the estimate — exactly the duplicated-field pattern the whole rebuild exists to remove (contractor-pwa had this drift between `estimates.deposit_paid` and `invoices.deposit_paid`). Instead: `Estimate.depositAmount` is a **proposal term** only ("we require $X down"); `useEstimateForm.requestDeposit()` generates a real standalone invoice for that amount via `InvoiceService`, and collecting it is an ordinary `PaymentService.record()` call against that invoice — the exact same code path as any other payment. There is no second place "is the deposit paid" can disagree with the invoice's own balance, because there is no second place it's tracked.

## The propagation guarantee

> Every action must update: Database, Transaction ledger, Financial engine, Dashboard, Tax, Reports.

This is not something each workflow re-implements — it falls out of the layering already built:

```
Form calls a Layer 2 service method
        │
        ▼
Layer 2 service writes its own table AND appends to financial_transactions
(see TRANSACTION_LEDGER.md's event → ledger mapping — one call, both writes)
        │
        ▼
FinancialEngine reads the ledger (+ Layer 2 services) on every call —
never a cached/stale figure, always computed fresh from current data
        │
        ▼
Dashboard / Tax / Reports call FinancialEngine, never their own formula
(getProjectFinancials / getCompanyFinancials / getProfitSummary /
 getPayablesSummary / getTaxSummary)
```

Concretely, per workflow:

- **Record a customer payment** (`InvoicePaymentsPanel` → `PaymentService.record`) → `invoice_payments` row + `customer_payment` ledger row → next `getProjectFinancials`/`getCompanyFinancials` call reflects it (amountPaid, remainingBalance, totalRevenue) → Dashboard's revenue tile and Tax's taxable-revenue figure both change on their next read, from the same underlying number.
- **Record an expense paid by an agent** (`ExpenseForm` → `ExpenseService.create`) → `estimate_expenses` row + `material_expense`/`labor_expense`/`other_expense` ledger row + `agent_reimbursement_owed` ledger row → project cost and agent payables both move on their next `FinancialEngine`/`getPayablesSummary` call.
- **Approve a change order** (`ChangeOrdersPanel` → `EstimateService.approveChangeOrder`) → `change_orders` row updated + `change_order_approved` ledger row → `revisedTotal` (and therefore profit) changes on the next `getProjectFinancials` call.
- **Pay a subcontractor** (`SubcontractorAssignmentPanel` → `SubcontractorService.recordPayment`) → `subcontractor_payments` row + `subcontractor_payment` ledger row → `SubcontractorPayablesTable`'s outstanding figure (itself `FinancialEngine.getPayablesSummary`) reflects it immediately, not a separately-maintained running balance.

No workflow needed to "remember" to update Dashboard/Tax/Reports — they were never told about the individual event in the first place. They ask `FinancialEngine` a question fresh every time, and `FinancialEngine` answers from the ledger and the Layer 2 services, which the form's service call already updated. The only way to break this guarantee is to bypass a service and write to a table directly — which no form in this codebase has a way to do.

## What's still a stub

`ServicesProvider` (`lib/services-context.tsx`) needs real, Supabase-backed implementations wired in for each Layer 2 service — today only `FinancialEngine` and `FilteringService` have concrete implementations (`createFinancialEngine`, `createFilteringService`); the rest are interfaces the forms above are written against. `InvoiceService.updateLineItems` was added during this pass (the Edit workflow needs it and it didn't exist yet). No page-level routing was built (`app/projects/[id]/estimates/...` etc.) — these are components ready to be placed on pages, not yet wired into `app/`.
