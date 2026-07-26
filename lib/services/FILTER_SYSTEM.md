# Global Filter System

## The problem this replaces

Without this, "filter by X" gets implemented once per page — a status dropdown here, a date-range picker there, an amount-range input somewhere else, each wired to its own hand-written query. That's the same disease as contractor-pwa's 15+ duplicated profit calculations, just one layer up: page-specific FILTER logic instead of page-specific CALCULATION logic. This system is the single implementation every page/service uses instead.

## Flow

```
Database
   │
   ▼
Filter Service   (schemaRegistry.ts + filteringService.ts)
   │
   ▼
Financial Engine (financialEngine.ts)
   │
   ▼
Dashboard / Tax / Reports
```

A page builds a `Filter` (a plain data value — see `types.ts`) and passes it to `FinancialEngine`. `FinancialEngine` never interprets it — it hands it straight to `FilteringService.execute("projects", scope, filter)`, which validates and resolves it against `SchemaRegistry`, then delegates to whichever Layer 2 service registered itself as the executor for that entity. No page writes a query. No page knows what a `deleted_at` column is called on any given table.

## Two pieces, two jobs

**`schemaRegistry.ts` — data, not logic.** A description of every entity: its columns (name + type: uuid/string/number/boolean/date/datetime/enum), its relationships to other entities (name, target, cardinality, foreign key), and whether it's company-scoped. `SchemaRegistry.register(schema)` is the *only* extension point — "the list above is only examples, support future database growth" is satisfied by this being data you register, not code you write. A brand-new table is filterable everywhere the moment it has an `EntitySchema` and a `QueryExecutor`; nothing else in the codebase changes.

Registered today: `companies`, `users`, `customers`, `projects`, `estimates`, `change_orders`, `invoices`, `payments`, `expenses`, `vendors`, `subcontractors`, `subcontractor_assignments`, `agents`, `agent_assignments`, `financial_transactions` — every entity named in the brief, plus the relationships between them (`invoices.customer`, `expenses.paidByAgent`, `projects.estimates`, etc.), so a filter can already reach across tables ("projects where customer.name contains 'Smith'") without any new code.

**`filteringService.ts` — the engine.** Schema-aware, not entity-aware: nothing in its logic mentions "invoice" or "subcontractor." Given an entity name and a `Filter`, it:
1. **Validates** every condition's path against `SchemaRegistry` (unknown field, wrong operator for a column's type, invalid enum value — all rejected before ever touching data, never silently returning zero rows for the wrong reason).
2. **Canonicalizes** the filter — recursively sorts conditions into one stable order and computes a `cacheKey`. This is what makes "the same filter must always produce the same results" literally true: two `Filter` values that are semantically identical (built in different order, by different code) canonicalize to byte-identical `ResolvedFilter`s.
3. **Executes** by delegating to the `QueryExecutor` a Layer 2 service registered for that entity — `FilteringService` never queries a database itself.

## The filter grammar

```ts
type Filter = {
  op: "and" | "or";
  conditions: Array<
    { path: string; operator: FilterOperator; value?: unknown } // a leaf condition
    | Filter                                                     // a nested group
  >;
};
```

`path` is a dot path resolved by `SchemaRegistry` — `"status"` (direct column) or `"customer.name"` / `"project.customer.name"` (across relationships). One type, works for company, user, project, customer, estimate, invoice, payment, expense, agent, subcontractor, vendor, category, status, dates, amount ranges, and any relationship between them — because none of those are special-cased; they're all just paths and operators over whatever `SchemaRegistry` knows.

Example — "active or in-progress projects for one customer, over $10k, created this quarter":
```ts
{
  op: "and",
  conditions: [
    { op: "or", conditions: [
      { path: "status", operator: "eq", value: "active" },
      { path: "status", operator: "eq", value: "in_progress" },
    ]},
    { path: "customer.id", operator: "eq", value: customerId },
    { path: "estimates.total", operator: "gt", value: 10000 },
    { path: "created_at", operator: "between", value: [quarterStart, quarterEnd] },
  ],
}
```

## Determinism, concretely

`FilterCondition.value` must always be a concrete, already-resolved value — never a relative expression like "last 30 days." A caller wanting that resolves it to concrete ISO dates *once*, before building the `Filter`. `FilteringService` never reads the wall clock and never re-interprets a value; `execute()` is a pure function of `(entity, scope, ResolvedFilter)`. Two calls with the identical `Filter` value produce identical results unless the underlying data itself changed between calls — which is a data change, never the filter behaving differently.

## How `FinancialEngine` uses it

Every company-scoped method (`getCompanyFinancials`, `getProfitSummary`, `getPayablesSummary`, `getTaxSummary`) takes an optional `filter?: Filter` alongside its `QueryScope`. Internally, `resolveProjectIds(scope, filter)` is the one place a `Filter` enters the engine: it resolves to the matching project id set via `FilteringService.execute("projects", scope, filter)`, and every subsequent number (ledger sums, invoice totals, payables lines, project-status counts) is restricted to that same set — never a partial application where revenue is filtered but cost isn't.

## What a new table costs to make filterable

1. Call `SchemaRegistry.register({...})` with its columns/relationships.
2. Have its owning Layer 2 service implement `QueryExecutor<T>` (one `query(scope, resolvedFilter)` method) and call `FilteringService.registerExecutor(executor)` once at startup.

That's it — no change to `FilteringService`, `FinancialEngine`, or any page.
