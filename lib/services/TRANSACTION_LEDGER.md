# Transaction Ledger System

## Schema — `financial_transactions`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `company_id` | uuid | tenant scope |
| `project_id` | uuid, nullable | null only for company-level adjustments with no single project |
| `type` | `TransactionType` (closed union, see below) | never a free-text string |
| `amount` | numeric | always stored **positive** — sign comes from `TRANSACTION_TYPE_META[type].sign`, never from the row |
| `reference_id` | uuid | the record this row is *about* |
| `reference_type` | `ReferenceType` (closed union) | what kind of record `reference_id` points at |
| `created_by` | uuid, nullable | who/what caused it (null for system-generated backfills) |
| `created_at` | timestamptz | when it was recorded |

One deliberate addition beyond the requested field list: `notes` (nullable), needed only because `recordAdjustment` has no source document to explain itself the way every other row does.

**No `updated_at`/`deleted_at`/`updated_by`/`deleted_by`.** A ledger row is an immutable historical fact, not a mutable record. Correcting a mistake means appending a new offsetting row that references the original — never editing or deleting it. This is what makes "every financial action must be traceable" still true *after* a mistake is found and fixed: both the mistake and its correction remain in the ledger.

## Event → ledger mapping (every financial action, made concrete)

| Business event | Layer 2 service call | Ledger row created | Effect |
|---|---|---|---|
| Invoice created | `InvoiceService.createFromEstimate` / `createStandalone` | `invoice_issued` | **+ Revenue** |
| Change order approved | `EstimateService.approveChangeOrder` | `change_order_approved` | **+ Revenue** |
| Customer payment received | `PaymentService.record` | `customer_payment` | **+ Cash in** |
| Expense recorded (material/labor/other) | `ExpenseService.create` | `material_expense` / `labor_expense` / `other_expense` | **− Cost** |
| Mileage trip recorded | `ExpenseService.recordMileageTrip` | `mileage_expense` | **− Cost** |
| Expense paid by an agent | `ExpenseService.create` (with `paidByAgentId`) | *also* `agent_reimbursement_owed`, referencing the expense | **− Liability** |
| Subcontractor paid | `SubcontractorService.recordPayment` | `subcontractor_payment` | **− Cost** |
| Agent commission paid | `AgentCommissionService.recordPayment` (type: commission) | `agent_commission` | **− Cost** |
| Agent reimbursement paid | `AgentCommissionService.recordPayment` (type: reimbursement) | `agent_reimbursement_paid`, referencing the *same expense* the `_owed` row referenced | **− Cash out**, settles the liability |
| Manual correction (bank fee, write-off) | `TransactionService.recordAdjustment` | `adjustment` | sign given by caller |

Two rows for one expense-by-agent event (`other_expense` + `agent_reimbursement_owed`) is intentional, not a bug: "the project got $200 more expensive" and "the company now owes an agent $200" are two different financial facts that happen to occur at the same moment. Collapsing them into one row would make it impossible to answer "is this liability still outstanding" independently of "did the cost happen."

**Owed vs. paid, why two rows and not one mutable balance:** `agent_reimbursement_owed` and `agent_reimbursement_paid` are separate, both referencing the same expense. `TransactionService.getReimbursementBalance(expenseId)` nets them (`owed − paid`). This is the same pattern as `getAssignmentBalance` for subcontractor/agent commission — the ledger never stores a running balance, only immutable events; every balance is a query, not a column.

## Every write goes through `append()`

Layer 2 services call `TransactionService.append(input)` in the same write as their own source row — not a DB trigger in this design (contractor-pwa's SQL-trigger-mirror approach is still valid as an implementation detail once this is wired to Postgres, but the *service-layer contract* is `append()`, so the same interface works whether the actual write happens via an ORM transaction, an RPC, or a trigger). `TransactionService.recordAdjustment()` is the only method exposed for a fact with **no** source document.

## How each consumer uses it

- **Dashboard** — `FinancialEngine.getProfitSummary()` / `getProjectFinancials()`, which read the ledger via `getProjectLedger`/`getCompanyLedger` and `getTotalByType`/`getTotalByEffect`. Never queries `financial_transactions` directly.
- **Tax** — `TaxService.getReadiness()` → `FinancialEngine.getTaxSummary()`, which sums `customer_payment` (taxable revenue, cash-basis) against deductible expense types and `_paid` (not `_owed`) cost types.
- **Reports / Analytics** — `FinancialEngine.getFinancialsForProjects()` / `getClientFinancials()`, same ledger reads, batched.
- **Auditing** — `TransactionService.getAuditTrail(referenceType, referenceId)`: every ledger row about one record, in order — "show me everything that happened because of this expense/invoice/payment." This is the literal implementation of "every financial action must be traceable."
- **Reconciliation** — `ReconciliationService.reconcileLedgerAgainstSources()` confirms every source row (invoice, payment, expense, etc.) has exactly the ledger row(s) it should, and that every `agent_reimbursement_owed` eventually nets to zero outstanding.
- **Historical reporting** — the ledger is append-only and dated, so "what did this project's financials look like as of any past date" is a `WHERE created_at <= X` filter over immutable rows, not a reconstruction from mutable current-state tables.

## What changed from the first draft of this ledger

The original design had `direction`/`category`/`source_table`/`source_id` and was mirror-write-only for every type. This version:
- Renamed to the requested `type`/`reference_id`/`reference_type`.
- Added `invoice_issued` and `change_order_approved` as **revenue-at-creation** events — the original design only booked revenue at cash receipt (`customer_payment`), which under-modeled the brief's explicit "Invoice created: + Revenue" example.
- Split `agent_reimbursement` into `agent_reimbursement_owed` (liability) and `agent_reimbursement_paid` (cash out) — the original had one `agent_reimbursement` category that conflated "we owe this" with "we paid this," which the brief's "Agent reimbursement: − Liability" example specifically calls out as a distinct financial fact from a cost.
- Dropped the mutable audit columns (`updated_by`/`deleted_at`/etc.) in favor of true immutability — a ledger correcting itself by editing history was never a good idea; `recordAdjustment` is the sanctioned correction path.
