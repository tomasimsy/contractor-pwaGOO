# Dashboard (`/dashboard`) — Complete Audit

Static trace only — no code was changed. Every claim below is backed by a file/line
reference read during this pass.

## Executive summary

**One root cause explains almost every wrong/missing/non-updating number on this
Dashboard**: `FinancialEngine`'s `transactionService` dependency is wired to the
**in-memory test double** in the real (production) app, not a real table — and the real
`PaymentService`/mileage-tracking code path **never writes to it at all**. Revenue and
Payments Received are not "sometimes wrong" — they are **structurally incapable of ever
being correct** in production, and this has nothing to do with refresh/caching/hooks.
That's Issue #1 below; everything else is secondary.

---

## Data-flow trace, metric by metric

All eight metrics come from exactly one call: [app/(app)/dashboard/page.tsx](<app/(app)/dashboard/page.tsx>)
→ [lib/hooks/useDashboardData.ts](lib/hooks/useDashboardData.ts) → `financialEngine.getCompanyFinancials({companyId, dateRange})`,
except the three count tiles, which come from separate raw list calls. `financialEngine`
itself is constructed in [components/providers/ServicesProvider.tsx:110-121](components/providers/ServicesProvider.tsx#L110).

### Revenue (`financials.totalRevenue`)
1. **Value comes from:** `CompanyFinancials.totalRevenue`
2. **Service:** `FinancialEngine.getCompanyFinancials` → [lib/services/financialEngine.ts:559](lib/services/financialEngine.ts#L559): `asRealizedCost(sumByType(ledger, ["customer_payment"]))`
3. **Table queried:** none real. `ledger` = `transactionService.getCompanyLedger(scope)` at line 539 — `transactionService` is `inMemory.transactionService` (ServicesProvider.tsx:118), an in-process JS array (`store.ledger`, [inMemoryServices.ts:206](lib/services/testing/inMemoryServices.ts#L206)), never a Supabase table.
4. **Filters applied:** company/project/date-range filters ARE correctly applied *to the in-memory array* — irrelevant, because the array is (almost always) empty.
5. **Correct?** **No.**
6. **Why:** `PaymentService` in production is constructed as `createSupabasePaymentService(supabase, validationService, currentUserId)` — [lib/services/server.ts:106](lib/services/server.ts#L106) — with **no `transactionService` parameter at all**. Grepped every real (`lib/services/supabase/*.ts`) service for `transactionService.append(`: only `changeOrderService.ts`, `subcontractorService.ts`, `agentCommissionService.ts` call it. `paymentService.ts` never does. So no customer payment, ever recorded through the real UI, appends a `customer_payment` row to any ledger the Dashboard reads. Compounding this: `inMemory.transactionService`'s backing store is created fresh via `useMemo(() => {...}, [])` in `ServicesProvider` — a brand-new empty array on every page load/tab — so even the three services that DO append to it lose everything on refresh.
7. **Matches business logic elsewhere?** **No.** `EstimateFinancials.amountPaid` (Estimate Detail page) is computed from `paymentService.getSummaryForInvoice()` — the real `invoice_payments` table — and is correct. The same real payment shows up correctly on the Estimate/Invoice detail pages and is invisible to the Dashboard.
8. **Root cause class:** incorrect FinancialEngine wiring (a service dependency pointed at a stub instead of a real table) — not a query bug, not a missing refresh.

### Payments Received (`financials.totalPaid`)
Same root cause. [financialEngine.ts:600](lib/services/financialEngine.ts#L600): `const totalPaid = totalRevenue; // same normalized source (ledger)`. It's a literal alias of the broken value above — always 0 (or whatever stale in-session ledger total happens to exist), never the real sum of `invoice_payments`.

### Outstanding Invoices (`financials.totalOutstanding`)
[financialEngine.ts:601](lib/services/financialEngine.ts#L601): `totalOutstanding = totalInvoiced - totalPaid`. `totalInvoiced` is correct (real `invoices` table, `isRevenueInvoice`-filtered — fixed in the prior audit pass). `totalPaid` is the broken value above. **Result: Outstanding is systematically inflated by exactly however much has actually been collected**, since the subtraction always uses ~$0 for payments received.

### Expenses (`financials.totalExpenses`)
1. **Source:** `expenseItems + mileageCosts + subcontractorPaid + agentCommissionPaid` ([financialEngine.ts:595](lib/services/financialEngine.ts#L595))
2. **`expenseItems`**: real — `expenseService.listForCompany(companyId)` → Supabase `estimate_expenses` table, `.eq("company_id", ...).is("deleted_at", null)` ([supabase/expenseService.ts:223-232](lib/services/supabase/expenseService.ts#L223)), then filtered in JS by `isPaid && withinRange(expenseDate, ...)`. **Correct**, matches Dashboard/Reports business rule (cash-basis, period-scoped).
3. **`mileageCosts`**: `sumByType(ledger, ["mileage_expense"])` — same broken in-memory ledger as Revenue. No real code path appends `mileage_expense` transactions in production at all (confirmed: not one of the three services that write to the ledger). **Always 0**, silently, regardless of any mileage actually logged.
4. **`subcontractorPaid`/`agentCommissionPaid`**: ledger-sourced too, but these three services (`subcontractorService`, `agentCommissionService`, `changeOrderService`) DO write to the shared ledger instance in production. **Correct only within the current browser tab/session**, and **reset to 0 on every page reload** (fresh `useMemo` store).
5. **Correct?** **Partially.** The real-expense component (usually the largest share) is right; mileage is permanently missing; subcontractor/agent cash-paid figures work only until the next reload.
6. **Matches business logic elsewhere?** No — `ProjectFinancials.subcontractorCosts`/`agentCosts` (Project Detail's `ProfitSummaryCard`) are computed from `subcontractorService.getBalance()`/`agentCommissionService.getBalance()` directly against **persisted assignment rows**, not the ledger (confirmed in each service's own doc comment: "committed cost... computed DIRECTLY from persisted rows, NOT `transactionService.getAssignmentBalance`... would report a stale/zero balance the moment a session restarts"). The company-level figure and the project-level figure use two different, inconsistent sourcing strategies for conceptually the same money.

### Net Profit / Profit Margin
`netProfit = totalRevenue - totalExpenses` ([financialEngine.ts:596](lib/services/financialEngine.ts#L596)); margin is `netProfit / totalRevenue * 100`. Both inherit every error above — since `totalRevenue` is ~0, **margin is frequently `NaN`-adjacent or wildly wrong** (guarded to `0` only when `totalRevenue <= 0`, per the ternary), and `netProfit` is understated/overstated depending on how much of `totalExpenses` happened to survive the current session's in-memory ledger.

### Pending Estimates / Signed Estimates (`useDashboardData.ts:65-66`)
1. **Source:** `estimates.filter(e => e.status === "draft"|"sent"|"viewed")` / `"approved"|"converted_to_invoice"`, where `estimates = estimateService.list({companyId})`.
2. **Table:** real Supabase `estimates`, `.eq("company_id", ...).is("deleted_at", null)` (confirmed in a prior audit pass).
3. **Filters:** company + soft-delete only — **no date-range filter**, even though the Dashboard has a date-range picker that visibly affects every other tile.
4. **Correct?** Arithmetically yes — a plain status count over real data.
5. **Consistency issue (not a bug, but worth flagging):** changing the Dashboard's date preset (`this_month`, `this_quarter`, etc.) has **zero effect** on these two tiles while visibly changing Revenue/Expenses/Profit next to them. A user picking "Last Month" and seeing "Pending Estimates: 12" may reasonably assume that 12 is scoped to last month; it's actually all-time. Low severity, but a real "does it match the business logic used elsewhere" gap — no other page conditionally scopes a count like this without a visible cue.

### Active Projects (`useDashboardData.ts:67`)
`projects.filter(p => p.status === "active" || "in_progress")`, `projects = projectService.list({companyId})` → real `projects` table, `.eq("company_id",...).is("deleted_at", null)`. **Correct**, same no-date-range caveat as above.

---

## Cross-check against the actual tables

| Metric | Table(s) it SHOULD reconcile against | Does it? |
|---|---|---|
| Revenue / Payments Received | `invoice_payments` (sum of active rows) | **No** — reads an empty/ephemeral in-memory array instead |
| Outstanding | `invoices.total` − `invoice_payments` | **No** — inherits the Payments Received bug |
| Expenses | `estimate_expenses` (+ mileage, + sub/agent payments) | **Partially** — `estimate_expenses` reconciles; mileage never does; sub/agent payments reconcile only within a session |
| Net Profit / Margin | derived from the above | **No** — compounds every upstream error |
| Pending/Signed Estimates | `estimates.status` | **Yes** |
| Active Projects | `projects.status` | **Yes** |

I did not need a live database to prove the Revenue/Payments/Expenses divergence — it's
provable from the wiring alone: the only object capable of holding a "customer payment"
or "mileage expense" ledger row in production is recreated empty on every
`ServicesProvider` mount, and the one real service that *would* record customer payments
has no reference to it. No amount of real `invoice_payments` rows can ever reach this
calculation.

---

## Mutation audit — does each action refresh the Dashboard correctly?

Every action below correctly triggers its OWN page's reload (verified in the prior UI
data-flow audit). The question here is narrower: **once the Dashboard itself is
(re)loaded, does it reflect that mutation?**

| Action | Does the underlying number even exist in FinancialEngine's inputs? | Dashboard reflects it after reload? |
|---|---|---|
| Record customer payment | **No** (see Revenue/Payments above) | **No — never**, not even after a hard refresh |
| Add expense | Yes (real `estimate_expenses` query) | Yes |
| Delete/restore expense | Yes (`deleted_at` filter) | Yes |
| Add subcontractor payment | Yes, but ledger-sourced | Only until next page reload |
| Add agent commission | Yes (assignment itself, via `getPayablesSummary`-style real query) — but `agentCommissionCosts`'s dashboard contribution (`agentCommissionPaid`) is ledger-sourced | Only until next page reload |
| Add reimbursement | Ledger-sourced (`agent_reimbursement_paid`) | Only until next page reload |
| Approve change order | Ledger-sourced (`change_order_approved` isn't even one of the types `getCompanyFinancials` sums — it sums `customer_payment`/`subcontractor_payment`/`agent_commission`/`agent_reimbursement_paid`/`mileage_expense` only) | **No effect on Dashboard totals at all** (correctly, since change orders are revenue at the PROJECT level via `getProjectFinancials`, not counted in `getCompanyFinancials`'s ledger sums — this part is actually fine, just easy to mistake for another instance of the bug) |
| Edit estimate | Doesn't affect Dashboard (estimates aren't revenue) — correct, matches business rule | N/A, correct |
| Convert estimate → invoice | New invoice → `totalInvoiced` updates correctly (real query) | Yes for Outstanding's numerator; still wrong for the payments-received subtraction |
| Void invoice | `isRevenueInvoice` filter correctly excludes it from `totalInvoiced` (fixed in prior pass) | Yes |
| Sign estimate | No financial effect (correct — signing isn't a revenue event) | N/A, correct |

No hook/component-level "missing refresh" bug was found in this pass — `useDashboardData`
does call `getCompanyFinancials` fresh on every mount and on `refresh()`. The data it
gets back is simply wrong at the source for three of the eight metrics.

---

## Issues found

### Issue 1 — CRITICAL
- **File:** [components/providers/ServicesProvider.tsx:117-118](components/providers/ServicesProvider.tsx#L117); [lib/services/server.ts:106](lib/services/server.ts#L106)
- **Function:** `ServicesProvider`'s `financialEngine = createFinancialEngine({ ..., transactionService: inMemory.transactionService })`; `createServerAppServices`'s `paymentService = createSupabasePaymentService(supabase, validationService, currentUserId)`
- **Root cause:** `FinancialEngine.getCompanyFinancials`/`getProjectFinancials` source `totalRevenue`/`totalPaid`/`amountPaid`/`mileageCosts` from `transactionService`'s ledger, which in production is the in-memory test double — and the real `PaymentService` has no dependency on it, so it never writes a `customer_payment` row there. No mileage-recording code path writes `mileage_expense` there either.
- **Why the displayed value is incorrect:** Dashboard's Revenue and Payments Received are structurally guaranteed to under-report actual collected cash (frequently to exactly $0), and Outstanding is inflated by the same amount, in every environment, for every company, permanently — not intermittently.
- **Recommended fix:** Change `getCompanyFinancials`'s revenue/payments-received sourcing to compose from real data the same way `getEstimateFinancials` already correctly does — e.g. `paymentService.getSummaryForInvoice()` per invoice (or a new `PaymentService.listForCompany`-style aggregate, if one is added) instead of `transactionService.getCompanyLedger`. Same for `getProjectFinancials`'s `amountPaid`. Mileage should be sourced from `ExpenseService`'s own mileage tracking (it already owns `mileage_trips` per its file header) instead of the ledger. This is a `FinancialEngine` logic change — flagging per the brief's "recommend," not applying it, since you asked for a report only.
- **Priority: Critical**

### Issue 2 — HIGH
- **File:** [lib/services/financialEngine.ts:560](lib/services/financialEngine.ts#L560) (`subcontractorPaid`), :567 (`agentCommissionPaid`), :566 (`agentReimbursementsSettled`)
- **Function:** `getCompanyFinancials`
- **Root cause:** Even the three ledger entries that ARE written in production (change order approval, subcontractor payment, agent commission/reimbursement) live in a store created fresh per `ServicesProvider` mount (`useMemo(() => { const inMemory = createInMemoryServices(); ... }, [])` — [ServicesProvider.tsx:88](components/providers/ServicesProvider.tsx#L88)).
- **Why incorrect:** these three Dashboard-adjacent figures reset to $0 on every browser refresh/new tab, regardless of how much real, persisted subcontractor/agent activity exists in the database.
- **Recommended fix:** Same direction as Issue 1 — source these from the real, persisted `subcontractorService.getBalance()`/`agentCommissionService.getBalance()` calls `FinancialEngine` already trusts elsewhere (`getPayablesSummary`, `getProjectFinancials`), instead of the ledger, for anything that must survive a page reload.
- **Priority: High** (same class of bug as #1, narrower blast radius — it's "wrong after reload," not "always wrong")

### Issue 3 — MEDIUM
- **File:** [lib/services/financialEngine.ts:549](lib/services/financialEngine.ts#L549) (`mileageCosts` in `getCompanyFinancials`); same pattern likely in `getProjectFinancials`
- **Root cause:** no real service call ever appends a `mileage_expense` ledger row in production.
- **Why incorrect:** mileage cost silently contributes $0 to Expenses/Profit regardless of actual mileage logged, if a mileage-recording feature exists or is added later expecting this to work.
- **Recommended fix:** confirm whether `ExpenseService`'s `mileage_trips` table is actually written to anywhere yet; if so, source `mileageCosts` from it directly, same fix shape as Issue 1.
- **Priority: Medium** (lower confidence this is user-visible today — flagging because it's the same wiring bug, not because I confirmed mileage entry is a live feature)

### Issue 4 — LOW
- **File:** [lib/hooks/useDashboardData.ts:65-67](lib/hooks/useDashboardData.ts#L65)
- **Root cause:** Pending Estimates / Signed Estimates / Active Projects counts are computed over the FULL, un-dated `estimateService.list()`/`projectService.list()` results, while every other tile on the same page is scoped to the selected date-range preset.
- **Why it could read as "incorrect":** a user changing the date filter sees these three tiles never move, which can look like a stuck/non-updating bug even though the counts themselves are accurate for "all time."
- **Recommended fix:** either scope these three to the selected date range too (via `createdAt`/`updatedAt`), or add a visible "(all time)" label so the inconsistency reads as intentional.
- **Priority: Low**

### Issue 5 — LOW (documented, not newly found)
`totalOutstanding`'s inflation (Issue 1's downstream effect) and the Estimate-Detail-vs-Dashboard inconsistency for `amountPaid` sourcing are the same root cause as Issue 1, listed separately in earlier sections only to make the trace complete per-metric — not a second bug to fix.

---

## Ranked priority + minimum fix set

1. **Issue 1 (Critical)** — re-source `getCompanyFinancials`'s `totalRevenue`/`totalPaid` and `getProjectFinancials`'s `amountPaid` from real payment data (`PaymentService`), not the in-memory ledger. This alone fixes Revenue, Payments Received, and most of Outstanding/Net Profit/Margin.
2. **Issue 2 (High)** — re-source `subcontractorPaid`/`agentCommissionPaid`/`agentReimbursementsSettled` in `getCompanyFinancials` from the real, persisted balance calls (`getBalance()`) the rest of the engine already uses, instead of the ledger — removes the "resets on reload" behavior.
3. **Issue 3 (Medium)** — confirm/fix `mileageCosts` sourcing once mileage tracking's real backing is confirmed.
4. **Issue 4 (Low)** — either scope the three count tiles to the date range or label them as all-time, for UI consistency.

**Minimum set to make every currently-displayed Dashboard number accurate:** Issues 1 and
2 (both are the same underlying "FinancialEngine reads from `transactionService`'s ledger
instead of real tables" defect, split only by how visible the wrongness is). Issue 3 is
the same defect class but lower-confidence impact. Issue 4 is a UI-consistency
nice-to-have, not a correctness bug.

No code was changed in this pass, per the brief.
