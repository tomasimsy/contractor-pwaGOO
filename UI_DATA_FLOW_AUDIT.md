# UI Financial Data-Flow Audit

Scope: does every UI page/card/panel show the right number from the right source, and
does it update after every financial mutation? `FinancialEngine`/service-layer math is
NOT re-verified here (see `COMPREHENSIVE_AUDIT_REPORT.md` for that) — this pass traces
**wiring**: fetch → mutate → refetch/propagate → render. No code was changed; this is
audit output only, per the brief ("do NOT rewrite anything first").

Method: read every financial-facing page/component and its data hook, traced every
mutation handler to see what it reloads, and grepped the whole `app/`+`components/` tree
for the state-management primitives this app could be using (`useSWR`, `useQuery`,
`QueryClient`, `revalidatePath`, `router.refresh`). No browser session was used — this is
static tracing, as instructed for the calculation audit; call out `Skill: run` if you want
live click-through confirmation of the findings below.

## 0. Architectural baseline (read this before the per-page findings)

**There is no client-side cache or query library anywhere in this app.** Confirmed by
grep: no `react-query`/`@tanstack/query`, no `swr`, no Redux/Zustand/Jotai, in
`package.json` or the source tree. Every data-showing component uses one of two
hand-rolled hooks — `useAsyncResource`/`useRefreshableResource`
([lib/hooks/useAsyncResource.ts](lib/hooks/useAsyncResource.ts)) — or a bespoke
`useState` + `useEffect(() => load(), [load])` pair. Both patterns fetch **once on
mount**, and only refetch when either (a) their dependency array changes, or (b) a
handler explicitly calls `reload()`/`refresh()`/its own `load()` again.

**This means:** there is no cross-page cache to invalidate, because there is no cache.
Navigating from Page A to Page B in this app unmounts A and mounts B fresh — B's
`useEffect` fires and fetches current data every time, with no stale Router Cache or
SWR cache to fight. So "does the Dashboard update after I add an expense on the Project
page" is really "does the Dashboard's own `useEffect` run again the next time you land on
it" — and the answer is yes, unconditionally, **for cross-page navigation**. The actual
risk in this architecture is entirely **within a single page that embeds multiple
mutating panels**: does mutating Panel A also trigger Panel B (and the page's own
summary state) to reload, since nothing does that automatically? That is where every
finding below actually lives.

`router.refresh()` appears in exactly 6 files, all post-create-and-redirect flows
(login, sign-estimate portal, invoice/estimate/project/change-order builders) — not used
as a same-page invalidation mechanism anywhere, and doesn't need to be given the above.

---

## 1. UI financial data-flow diagram

```
 User Action (button/form submit)
        │
        ▼
 Service call (e.g. paymentService.record())      ← Layer 2, writes the store/DB
        │
        ▼
 Component's own mutation handler
        │
        ├──► calls its OWN page/panel's load()/reload()/refresh()
        │         │
        │         ▼
        │    Re-fetches: FinancialEngine.getXFinancials() / entity list()
        │         │
        │         ▼
        │    setState(...) → re-render → displayed number updates
        │
        └──► calls onChanged?.() prop (if the mutation happened in a
             CHILD panel embedded in a bigger page)
                  │
                  ▼
             Parent's loadFinancials() (or full load()) re-fetches
             FinancialEngine for the page's own summary card
                  │
                  ▼
             setState(...) → re-render → parent's summary updates too

 Navigating to a DIFFERENT page/route:
        unmounts the old page → mounts the new one → its own useEffect
        fetches fresh data unconditionally (no cache exists to be stale)
```

The chain only breaks when a mutation handler exists **without** a matching
`load()`/`reload()` call, or when a child panel accepts an `onChanged` prop but never
calls it, or — the biggest finding below — when a section of a page was never wired to
fetch real data **at all**.

---

## 2. Every page showing financial data, and its source

| Page | Financial data shown | Source |
|---|---|---|
| `/dashboard` | Revenue, payments, outstanding, expenses, net profit, margin, 12-mo chart | `useDashboardData` → `financialEngine.getCompanyFinancials` (×13 calls: 1 range + 12 months) |
| `/estimates` (list) | Total, status | Raw `estimateService.list()` — `total` is the estimate's own field, not a FinancialEngine call (correct: list pages don't need profit/revenue) |
| `/estimates/[id]` (`EstimateDetail.tsx`) | Estimate total, revised total (+ change orders), profit/cost breakdown, invoice list, payment totals per invoice | `financialEngine.getEstimateFinancials()` for the summary; `changeOrderService`/`invoiceService`/`paymentService` for the lists |
| `/estimates-roof/[id]` | Same as above, roofing variant | Same |
| `/invoices` (list) | Invoice `total`, derived `status` | Raw `invoiceService.listForCompany()` — `total`/`status` are the invoice's own (correctly-derived) fields |
| `/invoices/[id]` | Invoice total, paid, remaining, contract total, contract remaining, change-order revenue | `paymentService.getSummaryForInvoice`, plus **document-level** shared formulas (`calculateRevisedEstimateTotal`, `calculateRemainingBalance`) — not FinancialEngine directly, but the same Layer 0 functions FinancialEngine itself calls |
| `/invoice/[id]` (public, unauthenticated) | Invoice total, paid, balance due | Server-rendered from a Postgres RPC (`get_public_invoice`), using the same shared `financialCalculations.ts` functions — architecturally isolated from the service layer (see COMPREHENSIVE_AUDIT_REPORT.md §4.5) |
| `/projects/[id]` | Project-level revenue/cost/profit (`ProfitSummaryCard`), change-order revenue, expense totals | `financialEngine.getProjectFinancials()` for the summary card; `ProjectExpensesGroupedPanel` for expenses (own `calculateExpenseTotals` call, same shared formula) |
| `/expenses` (company register) | Total, company-paid, owed-back, unpaid | `calculateExpenseTotals()` applied to `expenseService.listForCompany()` — same shared Layer 0 formula, different filtered set (legitimate, matches its own doc comment) |
| `/subcontractors` | Per-subcontractor outstanding | **Just fixed** to source from `financialEngine.getPayablesSummary()` (was: per-assignment `getBalance()` calls, re-summed client-side) |
| `/agents` | Per-agent outstanding | Same, just fixed |
| `/payments` (company-wide) | `totalCollected` | `paymentService.listForInvoice()` fanned out per invoice, summed client-side — NOT FinancialEngine (see §4) |
| `/reports`, `/accounting`, `/tax-center`, `/analytics` | **None** | These are `PlaceholderPage` stubs — no data, no FinancialEngine call, "Coming soon" (see §4) |

---

## 3. Pages NOT using FinancialEngine

1. **`/reports`, `/accounting`, `/tax-center`, `/analytics`** — all four are literally
   `<PlaceholderPage />` (16 lines each, no data fetch of any kind). `ReportingService`,
   `FinancialStatementsService`, `AccountsReceivableService`/`AccountsPayableService`, and
   `FinancialEngine.getTaxSummary` all exist and are fully tested at the service layer
   (COMPREHENSIVE_AUDIT_REPORT.md), but **nothing in the UI calls any of them**. This
   means the audit brief's "confirm Reports/Accounting match Dashboard" cannot currently
   be tested in the browser — there is no Reports/Accounting page rendering numbers to
   compare against. This is the single biggest gap in the whole audit.
2. **`/payments` (company-wide list)** — `totalCollected` is a raw client-side `reduce()`
   over `paymentService.listForInvoice()` results, not `financialEngine.getCompanyFinancials().totalPaid`.
   Today the values happen to agree (no date filter, no exclusion difference), but this
   is duplicate math, not FinancialEngine.
3. **Invoice list/Estimate list pages** — display each row's own stored field
   (`invoice.total`, `estimate.total`), not a FinancialEngine call. This is **correct**,
   not a gap: a list of documents should show each document's own total, not a derived
   company aggregate — flagged here only so it's not mistaken for an oversight.
4. **Public invoice page** (`/invoice/[id]`) — architecturally cannot reach
   FinancialEngine (server-rendered, unauthenticated, RPC-based). Documented exception,
   not a new finding (see COMPREHENSIVE_AUDIT_REPORT.md).

---

## 4. Stale UI issues found

### 4a. CRITICAL — Project Detail page's Invoices, Payments, Subcontractors, and Agents sections are hardcoded placeholders, wired to nothing
**File:** [app/(app)/projects/[id]/page.tsx:278-303](<app/(app)/projects/[id]/page.tsx#L278>)

```tsx
<Section title="Invoices" icon={Receipt}>
  <EmptyState title="No invoices yet" description="..." />
</Section>
<Section title="Payments" icon={Wallet}>
  <EmptyState title="No payments recorded" description="..." />
</Section>
...
<Section title="Subcontractors" icon={HardHat}>
  <EmptyState title="None assigned" description="..." />
</Section>
<Section title="Agents" icon={HardHat}>
  <EmptyState title="None assigned" description="..." />
</Section>
```

These four sections render a **fixed, unconditional** `EmptyState` — there is no
`invoices`/`payments`/`subAssignments`/`agentAssignments` state on this page at all (the
page's `useState` declarations only cover `project`, `client`, `estimates`,
`changeOrders`, `activity`, `financials`). A project with 10 invoices and $50,000 in
payments still shows "No invoices yet" / "No payments recorded" here — this is not a
staleness bug (staleness implies it was once correct), it never fetched real data in the
first place. `ProfitSummaryCard` (which DOES correctly show `financials.invoicesTotal`
etc. via `financialEngine.getProjectFinancials()`) is the only place on this page where
invoice/payment money is actually visible, as a number with no supporting list.

**Impact:** the user's specified test scenario ("does the UI update everywhere") cannot
be verified for invoices/subcontractors/agents from the Project Detail page — there's
nothing there to update. A user has no way to see "which invoices does this project have"
or "which subcontractors are assigned" without leaving the project page (Subcontractors/
Agents have their own company-wide roster pages; Invoices does not have a per-project
drill-down at all outside the Estimate Detail page's own invoice list).

### 4b. CRITICAL — There is no working UI to create, delete, or restore an expense anywhere in the app
**Files:** [components/expenses/ProjectExpensesGroupedPanel.tsx](components/expenses/ProjectExpensesGroupedPanel.tsx), [app/(app)/expenses/page.tsx](<app/(app)/expenses/page.tsx>)

Grepped the entire `app/`+`components/` tree for `expenseService.create(`,
`expenseService.softDelete(`, `expenseService.restore(`, `expenseService.markReimbursed(`
— **zero matches**. Both places that display expenses are read-only:
- `ProjectExpensesGroupedPanel.tsx`'s "Record expense" button is a literal stub:
  ```tsx
  onClick={() => { /* TODO: open create dialog */ }}
  ```
- The company-wide `/expenses` register has no action buttons at all — it's a pure
  read-only list/filter/search view.

**Impact:** the audit brief's "Add expense / Delete expense / Restore expense" scenarios
cannot be performed through the UI at all today — not "doesn't refresh correctly," but
"the button doesn't do anything." `ExpenseService.create/softDelete/restore` are fully
built and tested at the service layer (confirmed in the previous audit pass), so this is
purely a missing UI surface, not a service gap.

Also notable: `ProjectExpensesGroupedPanel` accepts an `onChanged` prop
(`onChanged?: () => Promise<void> | void`) and the Project page correctly wires it to
`loadFinancials` — but since nothing inside the panel ever calls a mutation, `onChanged`
is **never invoked**. It's correctly wired to a callback that has nothing to trigger it.

### 4c. `AccountsReceivableService`/`AccountsPayableService`/`ReportingService`/`FinancialStatementsService` are fully built, fully tested, and entirely unused in the UI
Not a "staleness" bug either — see §3.1. Listed again here because it's the direct cause
of "Reports/Accounting must match Dashboard" being untestable in the browser today.

---

## 5. Missing refresh/invalidation problems

Beyond §4's "never wired at all" findings, tracing every mutation handler that DOES exist
found the propagation chain intact everywhere else checked:

| Mutation | Handler location | Refreshes | Verdict |
|---|---|---|---|
| Record/delete customer payment (Invoice detail) | `InvoicePaymentsPanel` → `onChanged={load}` | Full invoice page reload (invoice, project, payments, summary, activity) | ✅ correct |
| Record/delete customer payment (Estimate detail) | `InvoicePaymentsPanel` → `onChanged={async () => { await load(); await loadFinancials(); }}` | Invoice list on the estimate page AND `getEstimateFinancials` | ✅ correct |
| Approve/void/delete change order (Estimate detail) | inline handlers → `await load(); await loadFinancials();` | Both the change-order list and the financial summary | ✅ correct |
| Subcontractor assignment/payment (`SubcontractorAssignmentPanel`) | `onChanged?.()` called after `assign`, `recordPayment`, `markFinal` | Parent's `loadFinancials` (Estimate detail) or nothing (Project detail — see §5a) | ⚠️ see below |
| Agent commission/reimbursement (`AgentAssignmentPanel`) | `onChanged?.()` called after assign/record/reimburse | Same as above | ⚠️ see below |
| Void/delete invoice (Invoice detail) | `handleStatus`/`handleDelete` → `await load()` | Full page reload | ✅ correct |
| Estimate line-item edit / status change | inline → `await load(); await loadFinancials();` | ✅ correct |

### 5a. Subcontractor/Agent panels' `onChanged` is wired on the Estimate page but the Project Detail page never renders these panels at all
Traced where `SubcontractorAssignmentPanel`/`AgentAssignmentPanel` are actually mounted:
only inside `SubAgentTabsPanel`, which is only rendered on the **Estimate Detail** page
(`components/estimates/EstimateDetail.tsx:561`). The **Project Detail** page's own
"Subcontractors"/"Agents" sections are the hardcoded placeholders from §4a — so recording
a subcontractor payment on the Estimate page correctly refreshes that estimate's
`EstimateFinancials`, but there is no equivalent surface on the Project page to refresh,
and `getProjectFinancials`'s own subcontractor/agent costs (aggregated across the whole
project, not just one estimate) are never shown updating anywhere in response to this
action except indirectly, the next time the Project page is (re)mounted.

**This is not a bug in the propagation chain — it's the same "nothing to refresh"
problem as §4a**, just from the mutation side instead of the display side.

### 5b. No polling/realtime/cross-tab sync — by design, not a defect
The Dashboard (and every page) only refetches on mount or explicit `refresh()`. If a user
keeps a Dashboard tab open in the background and performs a mutation in a second tab,
the first tab will not update until navigated away from and back to, or manually
refreshed. Given there is no websocket/polling infrastructure anywhere in this codebase,
this is consistent with the rest of the architecture, not an isolated gap — noted for
completeness since the brief asked about "stale data" explicitly, but not ranked as a fix
below (would be a new feature — realtime sync — not a data-flow bug).

---

## 6. Incorrect displayed numbers found

None found beyond what the previous audit pass already fixed (`isRevenueInvoice`
duplication, AR-aging void/cancelled bug, `EstimateDetail`'s inline payment sum,
Subcontractors/Agents pages' re-summed balances — all already applied). Everywhere a
number IS actually wired to real data (§2), it traces back to `FinancialEngine` or a
shared Layer 0 formula correctly. The "incorrect numbers" in this pass are all
**absence** of numbers (§4), not wrong ones.

---

## 7. Search for UI calculations — display-only vs. duplicate vs. stale

Re-ran the `reduce()`/`sum`/`total`/`balance` grep from the previous audit, re-checked
against the fixes already applied:

| Location | Verdict |
|---|---|
| `EstimateForm.tsx`, `InvoiceBuilder.tsx`, `ChangeOrderForm.tsx`, `LineItemEditor.tsx` — line-item subtotal previews while editing | **Valid display-only** — document-level, same Layer 0 formula, before save |
| `app/(app)/payments/page.tsx:83` `totalCollected` | **Duplicate, not FinancialEngine** — see §3.2. Low risk today (no date filter divergence yet), same class of issue already fixed for Subcontractors/Agents pages; not yet applied here |
| `app/(app)/subcontractors/page.tsx`, `app/(app)/agents/page.tsx` | **Fixed** in the previous pass — now source from `getPayablesSummary` |
| `EstimateDetail.tsx` per-invoice paid total | **Fixed** in the previous pass — now calls `getSummaryForInvoice` |
| `app/invoice/[id]/page.tsx` (public) `amountPaid` | **Documented architectural exception** — cannot reach the service layer; not newly found |
| `ProjectExpensesGroupedPanel.tsx`, `app/(app)/expenses/page.tsx` `calculateExpenseTotals(...)` calls | **Valid** — the one shared Layer 0 formula, applied to different filtered expense sets, exactly per each file's own doc comment |
| `financialStatementsService.ts`, `reportingService.ts`, `accountsReceivableService.ts`, `payrollService.ts` | **Valid** — compose `FinancialEngine`/`TransactionService` results, confirmed in the previous audit pass; currently unreachable from any page (§3) |

No NEW duplicate calculation was found in this pass beyond the one already known
(`/payments` page's `totalCollected`).

---

## 8. Recommended fixes, ranked by priority

1. **Build a real Expense create/delete/restore UI** (§4b). This is the highest-priority
   item in this entire audit: `ExpenseService` is fully built and tested, but there is
   currently no way to record, delete, or restore an expense anywhere in the product.
   Minimal version: replace `ProjectExpensesGroupedPanel`'s `/* TODO */` button with a
   real create form (mirroring `SubcontractorAssignmentPanel`'s inline-form pattern), add
   delete/restore actions per row, and call the already-wired `onChanged?.()` after each
   — the propagation chain to `loadFinancials` is already correctly in place and waiting.
2. **Wire the Project Detail page's Invoices/Payments/Subcontractors/Agents sections to
   real data** (§4a). At minimum: `invoiceService.listForProject(projectId)` for
   Invoices, a payments-per-invoice fan-out (or a new `listForProject`-style method) for
   Payments, and `subcontractorService`/`agentCommissionService`
   `listAssignments({ projectId })` + `getBalance` (or `getPayablesSummary`) for the other
   two — replacing the four hardcoded `EmptyState`s.
3. **Route `/payments`'s `totalCollected` through `FinancialEngine`** (§3.2/§7) — same
   fix already applied to Subcontractors/Agents; lowest risk of the three since values
   agree today, but same duplicate-math class of issue.
4. **Build real Reports/Accounting/Tax Center/Analytics pages** on top of the already-
   built, already-tested `ReportingService`/`FinancialStatementsService`/
   `AccountsReceivableService`/`FinancialEngine.getTaxSummary` (§3.1). Larger scope than
   the other three — flagged as lower-priority only because it's a "build a new page"
   task rather than a "fix broken wiring" task, not because it matters less; it's the
   reason the brief's Reports/Accounting cross-check can't be run today.

None of these were applied — per the brief, this pass is audit-only.
