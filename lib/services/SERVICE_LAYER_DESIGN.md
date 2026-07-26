# Business Service Layer — Design

## The rule this exists to enforce

> Pages display information, collect input, and call services. Pages never calculate.

```
WRONG   Dashboard page fetches estimates/invoices/expenses and reduces() them into a profit number.
CORRECT Dashboard page calls financialEngine.getProjectFinancials(projectId) and renders the result.
```

This is not a style preference — it's the direct fix for the single biggest problem found auditing `contractor-pwa`: `FINANCIAL_CONSOLIDATION_PLAN.md` documented the same profit/revenue/outstanding-balance math independently written in **15+ page-level locations**, each with its own soft-delete filtering (or lack of it), so numbers silently drifted between Dashboard, Statement, Reports, Invoice detail, and Tax pages. That system had no enforced boundary — `lib/queries/financialCalculations.ts` was the right idea, adopted inconsistently, and any component could still reach past it straight to Supabase. This design makes that boundary structural: **services are the only code allowed to import the data layer for business tables; components/pages only import services.**

## Layering

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3 — Orchestration (composes Layer 1 + Layer 2)         │
│   FinancialEngine · ReconciliationService · TaxService        │
├─────────────────────────────────────────────────────────────┤
│ Layer 2 — Domain entity services (own one table/aggregate)   │
│   ProjectService · EstimateService · InvoiceService          │
│   PaymentService · ExpenseService · SubcontractorService      │
│   AgentCommissionService                                     │
├─────────────────────────────────────────────────────────────┤
│ Layer 1 — Cross-cutting primitives (no domain knowledge)     │
│   TransactionService · FilteringService                       │
├─────────────────────────────────────────────────────────────┤
│ Layer 0 — Foundation (used by everything above)              │
│   ValidationService · AuditService                            │
└─────────────────────────────────────────────────────────────┘
```

**Dependency rule:** a service may only import from its own layer or below, with **zero exceptions.** `FinancialEngine` may call `ProjectService` and `TransactionService`; `ProjectService` must never call `FinancialEngine` back. This prevents the circular, whoever-gets-there-first coupling that made the old codebase's calculation logic impossible to trust — every function's dependencies are a strict DAG, so there's exactly one place any given number can originate.

`TaxService` lives in Layer 3, not Layer 2, precisely because of this rule: an earlier draft placed it in Layer 2 with a carved-out exception allowing it alone to call `FinancialEngine`. An exception to a dependency rule is a sign the rule was drawn in the wrong place, not a case to special-case — tax readiness is by definition downstream of the fully composed financial picture, making it a peer of `ReconciliationService`, not of the entity services that feed the engine. Reclassifying it removes the exception entirely rather than documenting around it.

`TransactionService` (Layer 1) has exactly one write method, `recordAdjustment()`, for the one case with no source table to mirror from (a bank fee, a write-off, a manual reconciling entry) — every other transaction category is still trigger-mirrored and read-only from the service's perspective. See the file's doc comment for why this is narrow (requires a reason and an actor) rather than a general-purpose write path.

**Pages/components** sit above Layer 3 and may only call Layer 2 (for CRUD + display data) and Layer 3 (for anything computed). They never call Layer 0/1 directly, and never query Supabase directly for a business table.

## Where each old duplication now lives

| Old location (contractor-pwa) | Now owned by |
|---|---|
| `financialCalculations.ts: calculateProjectFinancials` (assigned-vs-paid floor, revenue/cost/profit) | `FinancialEngine.getProjectFinancials()` |
| `financialCalculations.ts: calculateCompanyFinancials` (period cash-basis rollup) | `FinancialEngine.getCompanyFinancials()` |
| `financialCalculations.ts: calculateAgentFinancials` / `calculateSubcontractorFinancials` | `AgentCommissionService` / `SubcontractorService`, exposed through `FinancialEngine` for cross-entity views |
| Ad hoc `.eq("is_deleted", false)` / `.is("deleted_at", null)` scattered per query | `FilteringService.active()` — the only place a soft-delete filter is written |
| `resolveProjectTotal`, `calculateRevisedTotal`, `derivePaymentStatus` (lib/utils/calculations.ts) | `financialCalculations.ts` (Layer 0 — see below): `calculateDocumentTotal`, `derivePaymentStatus`, `calculateCommittedCostBalance`, etc. Exposed as `FinancialService` methods for pages; imported directly by Layer 2 services (an allowed Layer 2 -> Layer 0 dependency) so no service reimplements its own copy. |
| Tax readiness scoring, 1099/W9 checks (lib/queries/tax.ts) | `TaxService` (Layer 3), consuming `FinancialEngine` output rather than re-deriving revenue/expense itself |
| Manual "assigned vs paid" reduce() per page for payouts | `TransactionService.getAssignmentBalance()` (single ledger-balance primitive both `SubcontractorService` and `AgentCommissionService` call) |
| No way to record a bank fee/write-off/reconciling entry at all | `TransactionService.recordAdjustment()` (new) — the one narrow, audited write path onto an otherwise mirror-only ledger |
| Nothing — no equivalent existed | `ReconciliationService` (new): the thing that would have caught the 15-location drift *before* shipping |
| Nothing — no equivalent existed | `ValidationService` (new): centralizes the input rules currently duplicated/inconsistent across forms (payment amount ≤ remaining balance, required fields, status-transition legality) |
| Nothing enforced — audit columns added late, by trigger, as a retrofit | `AuditService` (new): application-level companion to the DB triggers — read path for "who changed what," not just write-path columns |

## Service index

| Service | Layer | Owns | Depends on |
|---|---|---|---|
| [ValidationService](./validationService.ts) | 0 | Input/business-rule validation, no I/O | — |
| [AuditService](./auditService.ts) | 0 | Change history read/query | — |
| [FilteringService](./filteringService.ts) | 1 | THE global filter engine (schema-aware, generic over every registered entity — see [FILTER_SYSTEM.md](./FILTER_SYSTEM.md) and [schemaRegistry.ts](./schemaRegistry.ts)); also still owns soft-delete/date-range/company-scope predicates | ValidationService, SchemaRegistry |
| [TransactionService](./transactionService.ts) | 1 | `financial_transactions` ledger — read-only for mirrored categories; `recordAdjustment()` is its sole write method | FilteringService, AuditService (for adjustment provenance) |
| [ProjectService](./projectService.ts) | 2 | `projects` | ValidationService, AuditService |
| [EstimateService](./estimateService.ts) | 2 | `estimates`, `estimate_items` | ValidationService, ProjectService |
| [ChangeOrderService](./changeOrderService.ts) | 2 | `change_orders` | ValidationService, TransactionService |
| [InvoiceService](./invoiceService.ts) | 2 | `invoices`, `invoice_items` | ValidationService, EstimateService |
| [PaymentService](./paymentService.ts) | 2 | `invoice_payments` | ValidationService, InvoiceService, TransactionService |
| [ExpenseService](./expenseService.ts) | 2 | `estimate_expenses`, `mileage_trips` | ValidationService, TransactionService |
| [SubcontractorService](./subcontractorService.ts) | 2 | `subcontractors`, `estimate_subcontractors`, `subcontractor_payments` | ValidationService, TransactionService |
| [AgentCommissionService](./agentCommissionService.ts) | 2 | `agents`, `estimate_agents`, `agent_payments` | ValidationService, TransactionService |
| [FinancialEngine](./financialEngine.ts) | 3 | Nothing directly — pure composition | All Layer 2 + TransactionService + FilteringService |
| [ReconciliationService](./reconciliationService.ts) | 3 | Nothing directly — cross-checks | FinancialEngine, TransactionService |
| [TaxService](./taxService.ts) | 3 | `company_tax_settings`, `subcontractor_tax_info`, `agent_tax_info`, `expense_receipts`, `tax_audit_log` | ValidationService, FinancialEngine — a normal downward dependency now, not an exception |

`index.ts` barrel-exports the public service instances; nothing outside `lib/services/` imports an individual service file directly.

## FinancialEngine — implemented, not just an interface

Unlike every other service in this directory (contract-only so far), `financialEngine.ts` has a real implementation: `createFinancialEngine(deps)`, dependency-injected against the Layer 2 service *interfaces* (testable with mocks before any of them have a Supabase-backed implementation). It provides the five outputs the brief calls for:

- `getProjectFinancials(projectId)` — the full project picture (project-centered, per the brief: "calculate primarily at the project level, not the estimate level")
- `getCompanyFinancials(scope)` — period, cash-basis company rollup
- `getProfitSummary(scope)` — narrow profit-only view, project OR company scope
- `getPayablesSummary(scope)` — who's owed money, subcontractor + agent, line-by-line
- `getTaxSummary(scope, rate?)` — cash-basis taxable revenue, deductible expenses, approved costs, estimated liability

Revenue is assembled from three normalized sources, never `estimates.total`: `InvoiceService.listForProject` (billed), the `financial_transactions` ledger's `customer_payment` category (collected), and `ChangeOrderService.listApprovedChangeOrders` (contract growth). Costs are assembled from four: the ledger's expense/mileage categories, subcontractor committed cost, agent commission committed cost, and reimbursements (agent + subcontractor, cash-actual, not committed — there's no "assigned" figure for a reimbursement to floor against).

Getting here required a few small additions to Layer 2 contracts that the original design was missing: `SubcontractorService.listAssignments(scope)` / `AgentCommissionService.listAssignments(scope)` (FinancialEngine has to enumerate assignments to compute committed cost and payables lines — nothing exposed that before), and `InvoiceService.listForCompany(scope)` (company-level revenue needs invoices across every project, not just one).

**Change orders were originally EstimateService methods, then extracted into their own `ChangeOrderService`** (`changeOrderService.ts`) during the service-layer completion pass: a change order has its own approval workflow, its own ledger event, and its own CRUD — modeling it as EstimateService methods conflated two distinct lifecycle documents under one service. The extraction was a move, not a rewrite: `createChangeOrder`/`approveChangeOrder`/`listApprovedChangeOrders`'s logic is unchanged, `FinancialEngineDeps` gained a `changeOrderService` field alongside its existing `estimateService` field, and every caller (the ledger event mapping, `ChangeOrdersPanel.tsx`, the test suite) was updated to the new service — nothing was duplicated.

## Compile-time cost-model guard

`ProjectFinancials`'s cost fields (`subcontractorCosts`, `agentCosts`, `outstandingSubcontractor`, `outstandingAgent`, `outstandingTotal`) are typed `CommittedCost`; `CompanyFinancials`'s (`totalRevenue`, `subcontractorPaid`, `agentPaid`) are typed `RealizedCost` — both branded `number` types defined in `types.ts`. This turns "don't mix the two cost models" from a doc comment someone can miss into something the compiler rejects: a `CommittedCost` cannot be assigned where a `RealizedCost` is expected, or added/subtracted against one, even though both are plain numbers at runtime. Only `FinancialEngine`'s implementation may construct either brand.
