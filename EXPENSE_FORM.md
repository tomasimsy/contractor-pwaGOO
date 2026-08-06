# EXPENSE — core functionality

Behaviour of the expense record: what it collects, where it goes, and what it
affects. No UI description.

Verified against `lib/services/expenseService.ts`,
`lib/services/supabase/expenseService.ts`, `lib/hooks/useExpenses.ts`,
`components/expenses/ExpenseDialog.tsx`, `lib/services/financialEngine.ts`, and a
live read of 109 active expense rows.

---

## 1. The governing rule

> **ONE PAYMENT = ONE EXPENSE RECORD.**

Every project cost — materials, labour, a subcontractor payout, an agent
commission, a permit — is a row in `estimate_expenses`. There is no parallel
cost table and no second cost source.

`FinancialEngine` reads project cost from `ExpenseService` **and nowhere else**.
Before this, cost was assembled from ledger rows, which are append-only and
therefore structurally unable to honour a soft delete — a deleted expense kept
costing money forever. Reading source rows means `deleted_at is null` is the
only exclusion rule needed, applied once, in the service.

The ledger is still written for traceability but is never an input to a cost
calculation.

---

## 2. Workflow

```
1. Choose scope        project and/or estimate (see §9)
2. Classify            expenseType — one of 8
3. Amount + date       amount > 0, expenseDate
4. Who was PAID        payeeType + payeeId, or free-text vendor
5. Who FRONTED it      paidByType (+ paidById when not "company")
6. Settlement          isPaid, reimbursable (derived), paymentMethod
7. Save                ExpenseService.create() -> one row
                       (agent commissions: one row PER agent — see §10)
8. Later               update · markReimbursed · softDelete(reason)
```

Two entry paths, one destination:

| Path | Produces |
|---|---|
| General expense entry | one `estimate_expenses` row |
| Agent commission entry | **N rows** — one per selected agent |
| Subcontractor "Pay" action | one `estimate_expenses` row typed `subcontractor` |

The subcontractor payment path deliberately writes the *same* row shape, so
those costs appear in expense lists and in estimate/project/dashboard financials
automatically. There is no separate subcontractor-payment cost source.

---

## 3. Fields collected

From `ExpenseCreateInput`:

| Field | Required | Notes |
|---|---|---|
| `companyId` | **Required** | Tenant key |
| `projectId` | **Required (nullable)** | Must be passed; may be `null` — see §9 |
| `expenseType` | **Required** | One of 8 (§4) |
| `amount` | **Required** | Must be `> 0` |
| `expenseDate` | **Required** | Date the cost occurred |
| `estimateId` | Optional | Links the cost to one estimate |
| `changeOrderId` | Optional | Cost arising from a change order |
| `description` | Optional | |
| `notes` | Optional | |
| `vendor` | Optional | Free-text payee name; always populated for display so a list never shows a bare UUID |
| `payeeType` | Optional | `vendor` · `subcontractor` · `agent` · `employee` · `other` |
| `payeeId` | Optional | Null for `vendor`/`other` — there is no vendors table by design |
| `paidByType` | Optional | Defaults to `company` |
| `paidById` | Optional | Required by the entry layer when `paidByType !== "company"` |
| `paymentMethod` | Optional | |
| `isPaid` | Optional | Settled with the **payee** |
| `reimbursable` | Optional | **Derived when omitted** — see §6 |
| `receiptUrl` | Optional | Accepted but never written today — see §8 |

**Never set by a caller** (server-owned): `category`, `reimbursementStatus`,
`paidByAgentId`, `created_by`/`updated_by`, soft-delete columns.

---

## 4. Two classifications, one row

**`expenseType`** — the real classification, 8 values:

`materials` · `labor` · `subcontractor` · `agent_commission` · `permit` ·
`equipment` · `reimbursement` · `miscellaneous`

**`category`** — a coarse 3-value legacy projection (`material` / `labor` /
`other`) that the original `contractor-pwa` app still reads. **A database
trigger derives it from `expenseType` on every write.** Never write it directly;
the two cannot disagree.

Confirmed on live data — 32 `materials` → 32 `material`; 2 `labor` → 2 `labor`;
the remaining 75 (`subcontractor`, `agent_commission`, `miscellaneous`,
`equipment`) → 75 `other`.

`subcontractor` and `agent_commission` exist as types precisely so those modules
read these rows as their cost source instead of introducing a parallel
calculation.

---

## 5. Who paid vs who was paid

Two independent axes. Conflating them is a classic costing bug.

| Axis | Meaning | Values |
|---|---|---|
| `payeeType` / `payeeId` / `vendor` | who **received** the money | `vendor`, `subcontractor`, `agent`, `employee`, `other` |
| `paidByType` / `paidById` | who **fronted** it | `company`, `agent`, `subcontractor`, `employee`, `customer` |

A subcontractor expense fronted by an agent is `payeeType="subcontractor"`,
`paidByType="agent"` — **one cost to the project and one debt to the agent**.
`reimbursable` / `reimbursementStatus` track the debt half.

`paidByAgentId` is a legacy mirror of `paidById` when `paidByType === "agent"`,
maintained for the original app and never read as authoritative here.

Live distribution: `paid_by` = `company` ×103, `agent` ×6.

---

## 6. Validation

There are **no expense rules in `ValidationService`** — validation is inline in
the service plus the entry layer.

**Service-enforced (authoritative):**

| Rule | Where |
|---|---|
| `amount > 0` | `create()` and `update()` both throw |
| Delete reason required | `softDelete()` via `validationService.validateDeleteReason` |
| Cannot delete once reimbursement is **settled** | `assertNoFinancialActivity()` — blocks only `reimbursementStatus === "reimbursed"` |
| `markReimbursed` requires `reimbursable` | throws "This expense is not reimbursable." |
| `paidByType` defaults to `company` | `create()` |
| `reimbursable` defaults to `paidByType !== "company"` when omitted | `create()` |

A **pending** reimbursement is deliberately *not* blocked from deletion —
deleting a wrongly-recorded expense before anyone has been paid back is a normal
correction and must keep working.

**Entry-layer only (not enforced by the service):**

- at least one agent selected, and a commission percentage chosen
- per-agent commission amount `> 0`
- `paidById` present when `paidByType !== "company"`
- a *warning* (overridable) when total commission exceeds remaining profit

Because these are not service-enforced, any non-UI caller can bypass them.

---

## 7. Save / update / delete flow

**Create**
1. Reject `amount <= 0`.
2. Default `paidByType` to `company`; derive `reimbursable` if omitted.
3. Insert into `estimate_expenses` with `company_id`, `project_id`,
   `created_by`, `updated_by`.
4. Trigger derives `category`; trigger writes `audit_logs`.

**No explicit audit call is made.** `audit_logs` is trigger-driven and rejects
direct inserts, so a service-level write could only fail — and was redundant,
since the trigger already records create/update/delete with the correct actor.

**Update** — reject `amount <= 0`, load existing, apply partial changes, stamp
`updated_by`. Only supplied keys are written.

**Delete** — soft only. Requires a reason; blocked if the reimbursement was
settled; sets `deleted_at` / `deleted_by` / `delete_reason`.

**Restore** — clears those three columns.

**Reimburse** — `markReimbursed()` sets `reimbursementStatus = "reimbursed"`.
The Agent and Subcontractor modules call **this** when recording a payout rather
than tracking reimbursement themselves.

A deleted expense leaves every calculation because `listForProject` /
`getTotalsForProject` filter it — not because any caller remembers to.

---

## 8. Receipt handling — **not implemented**

The schema anticipates receipts; nothing captures them.

| Artifact | State |
|---|---|
| `estimate_expenses.receipt_url` | column exists — **0 of 109 rows populated** |
| `estimate_expenses.receipt_storage_path` | column exists — **0 populated** |
| `estimate_expenses.receipt_file_name` | column exists — **0 populated** |
| `expense_receipts` table | exists — **0 rows** |
| `ExpenseCreateInput.receiptUrl` | accepted by the interface |
| Write path | **none** — the only code assigning `receiptUrl` is the in-memory test double |

`expense_receipts` appears in application code only as a table `TaxService` is
documented as owning. There is no upload route, no storage bucket wiring, and
no reader.

Treat receipts as **unbuilt**, not partially built.

---

## 9. Estimate / project linking

Both `projectId` and `estimateId` are nullable, and cost resolution accounts for
that.

`listForProject(projectId)` resolves **two** ways and unions them:

```
project_id = :projectId
  OR estimate_id IN (every estimate of that project, including deleted ones)
```

Deleted estimates are deliberately included: without that, an expense vanished
from cost the moment its parent estimate was deleted — found during the
deletion-safety audit.

`listForEstimate(estimateId)` matches on `estimate_id` only.
`listForCompany(companyId)` matches on `company_id` only.

**Consequence:** a row with **both** ids null is reachable only by
`listForCompany`. See §12.

---

## 10. Subcontractor and agent handling

Both are ordinary expense rows, distinguished by `expenseType`.

**Subcontractor** — the assignment panel's "Pay" action writes an
`estimate_expenses` row typed `subcontractor`, tagged with the payee. Contracted
/ paid / outstanding figures come from `FinancialEngine.getPayeeBalances`, which
reads those same rows, keyed by **payee** (one payee, one balance) rather than
by assignment.

**Agent commission** — the amount is proposed by
`financialEngine.calculateAgentCommissionSplit(remainingProfit, commissionPercent, agentCount)`
and is **manually overridable**; the override wins when set.

Selecting N agents writes **N separate rows**, one per agent, each with:

- `expenseType: "agent_commission"`
- `payeeType: "agent"`, `payeeId` = that agent
- `paidByType: "company"`, `reimbursable: false`

Commissions are modelled as company-paid, so they create no reimbursement debt.
Live data: 29 `agent_commission` rows, all `payee_type = "agent"`.

---

## 11. FinancialEngine impact

**Project scope** (`getProjectFinancials`) — expense cost comes from
`ExpenseService.getTotalsForProject`, which returns:

| Figure | Meaning |
|---|---|
| `total` | every active expense |
| `byType` | per `expenseType` |
| `companyPaid` | cost the company fronted |
| `outstandingReimbursements` | fronted by someone else, unsettled — a liability |
| `unpaid` | owed to the payee |

**The critical invariant:**

```ts
const subcontractorCosts   = expenseTotals.byType.subcontractor ?? 0;
const agentCommissionCosts = expenseTotals.byType.agent_commission ?? 0;
```

`subcontractorCosts` and `agentCosts` are **subsets of `total`, never addends**.
Adding them to the expense total double-counts every subcontractor and agent
cost.

**Two cost models, deliberately:**

| Scope | Model |
|---|---|
| Project | **Committed** — `max(assigned, paid)` per assignment; an assignment is a real cost the moment it is made |
| Company / period | **Cash basis** — money actually paid inside the range, by transaction date |

Reimbursements are cash-actual only; there is no "assigned" figure to floor
against.

Expenses therefore flow into project profit, company P&L, payee balances,
payables, tax summaries and the dashboard — all through the engine, never by a
page summing rows.

---

## 12. Current limitations

**18 active expenses totalling $10,808.46 are orphaned.** They have **both**
`project_id` and `estimate_id` null, so `listForProject` and `listForEstimate`
cannot reach them; only `listForCompany` can. They therefore count in
company-level totals but in **no** project or estimate. 17 are
`agent_commission`, 1 is `subcontractor`, spanning 2 companies, created
2026-05-22 → 2026-07-26. Nothing prevents creating more: `projectId` is
type-required but explicitly nullable, and `estimateId` is optional.

**The interface comment understates this.** It says "one live expense is
attached to an estimate with no project_id" — that is accurate for the single
*resolvable* row (null project, has estimate), but does not mention the 18
unreachable ones.

**Mileage is on the interface but not wired.** `listMileageForProject()` returns
`[]` and `recordMileageTrip()` **throws** "Mileage tracking is not wired to the
database yet." `mileage_trips` exists with no live rows. Returning empty rather
than throwing keeps `getBudgetComparison` and `FinancialEngine` working.

**Receipts are unbuilt** (§8) — three columns and a table, zero write paths.

**`tax` and `tax_category` columns are unused** — 0 of 109 rows populated, and
neither is referenced in application code. Expense amounts are tax-inclusive by
default with no separate tax handling.

**44 of 109 rows have a null `payee_type`** — legacy rows predating the
structured payee. They still cost money correctly (amount and type are set) but
cannot be attributed to a payee, so they are invisible to `getPayeeBalances`.

**Entry-layer validation is not enforced by the service** (§6). Agent selection,
commission percentage, per-agent amount and `paidById` presence are checked only
at entry; a script or future caller can write rows violating all of them.

**`getBudgetComparison` compares on the coarse 3-value `category`**, not
`expenseType`, because estimate line items have no finer classification to
compare against.

**No bulk operations** — no bulk import, bulk edit, or bulk delete.

**No recurring expenses** — each is entered individually.

**Multi-agent commission entry is not atomic.** N rows are written in a loop; a
mid-loop failure leaves some agents' commissions saved and others not, reported
as "Could not save all commissions."


## Reimbursement Workflow

### Purpose

Reimbursement tracks when an employee, agent, subcontractor, or other person personally fronts money for a project expense and the company later pays them back.

Reimbursement is not a separate expense. The original expense remains the single source of truth for project cost.

Person pays personally         ↓ Create expense         ↓ Expense marked reimbursable         ↓ Company owes person         ↓ Company pays person         ↓ Expense marked reimbursed

### Expense Creation

When creating an expense:

paidByType != company         ↓ reimbursable = true         ↓ reimbursementStatus = pending

Example:

Vendor: Home Depot  Amount: $240  Paid by: Employee  Reimbursable: Yes

The project cost is immediately:

Project Cost += $240

The reimbursement is tracked separately as a liability.

### Reimbursement Settlement

A reimbursement is completed when the company actually pays the person back.

Settlement should:

- record that reimbursement occurred
- update reimbursement status
- preserve the original expense
- not create another expense row

Example:

Expense: Home Depot $240  Paid by: Mike  Status: Pending Reimbursement  ↓  Company pays Mike  ↓  Status: Reimbursed

### Financial Rules

Do not model reimbursement as:

Expense + reimbursement expense

because that double-counts project costs.

Correct:

Original expense: $240 project cost  Reimbursement: $240 liability settlement

FinancialEngine continues to use the original expense row as the cost source.

### Required Workflow Views

The expense module should support:

- All expenses
- Pending reimbursements
- Completed reimbursements

Managers/admins need a way to identify outstanding reimbursements and mark them as paid using the existing reimbursement status flow.

No new expense tables or duplicate cost calculations should be introduced.