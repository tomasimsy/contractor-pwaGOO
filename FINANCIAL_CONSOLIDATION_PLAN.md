# Financial Calculation Consolidation Plan

## Executive Summary

**Current State:** Financial calculations duplicated in 15+ locations  
**Target State:** Single source of truth in `lib/queries/financialCalculations.ts`  
**Scope:** 3 phases, ~8-10 hours total work  
**Risk:** Medium (refactoring core calculations) - mitigation: comprehensive testing at each phase

---

## Phase 1: Create Unified Calculation Engine

### 1.1 Create `lib/queries/financialCalculations.ts`

This module will consolidate ALL calculation logic:

```typescript
// Core financial types (unified across app)
export interface FinancialData {
  // Revenue
  originalEstimateTotal: number;
  approvedChangeOrderTotal: number;
  revisedTotal: number;
  
  // Expenses  
  subcontractorCosts: number;
  agentCosts: number;
  expenseItems: number;
  mileageCosts: number;
  totalExpenses: number;
  
  // Profit
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  
  // Payments
  invoicesTotal: number;
  amountPaid: number;
  remainingBalance: number;
  
  // Outstanding
  outstandingSubcontractor: number;
  outstandingAgent: number;
  
  // Status
  paymentStatus: "unpaid" | "partial" | "paid" | "overpaid";
  isFullyPaid: boolean;
}

export interface CompanyFinancialData {
  // Company-wide totals
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  
  // By type
  subcontractorPaid: number;
  agentPaid: number;
  outstandingSubcontractor: number;
  outstandingAgent: number;
  
  // Invoicing
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  
  // Projects
  completedProjects: number;
  activeProjects: number;
  totalProjects: number;
}

// Calculation functions (SINGLE SOURCE OF TRUTH)

/**
 * Calculate all financials for a single project/estimate
 * USED BY: Expense page, invoice detail, estimate detail, all PDFs
 */
export function calculateProjectFinancials(bundle: ProjectBundle): FinancialData

/**
 * Calculate company-wide financials for a time period
 * USED BY: Dashboard, statement, accounting, reports
 */
export function calculateCompanyFinancials(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<CompanyFinancialData>

/**
 * Calculate financials for specific projects
 * USED BY: Reports, analytics
 */
export function calculateProjectsFinancials(
  projects: EstimateRow[]
): Map<string, FinancialData>

/**
 * Calculate financials by client
 * USED BY: Client reports
 */
export function calculateClientFinancials(
  clientId: string,
  companyId: string
): Promise<ClientFinancialData>

/**
 * Calculate agent compensation & liability
 * USED BY: Agent reports, payables
 */
export function calculateAgentFinancials(
  agentId: string,
  companyId: string
): Promise<AgentFinancialData>

/**
 * Calculate subcontractor liability & 1099 tracking
 * USED BY: Subcontractor reports, payables
 */
export function calculateSubcontractorFinancials(
  subcontractorId: string,
  companyId: string
): Promise<SubcontractorFinancialData>
```

### 1.2 Merge Logic from Existing Functions

- Move `expenses.ts:summarizeFinancials()` → `calculateProjectFinancials()`
- Move `expenses.ts:getCompanyProjectFinancialSummaries()` → `calculateCompanyFinancials()`
- Move `analytics.ts:getCompanyProfitability()` logic → helper functions
- Keep all soft-delete filters and date range logic
- Add comprehensive JSDoc for every calculation

---

## Phase 2: Replace Page-Level Calculations

### 2.1 Update Each Page to Use Unified Engine

**Priority Order** (highest impact first):

1. **app/statement/page.tsx** - Uses unified `calculateCompanyFinancials()`
2. **app/accounting/page.tsx** - Uses unified engine
3. **app/reports/expenses/page.tsx** - Uses unified engine
4. **lib/hooks/useDashboardOverview.ts** - Uses unified engine
5. **app/invoices/[id]/page.tsx** - Uses `calculateProjectFinancials()`
6. **app/reports/expenses/[id]/page.tsx** - Uses unified engine
7. **app/estimates/[id]/page.tsx** - Uses unified engine
8. Dashboard cards - Use unified engine
9. Other pages/components

### 2.2 Example: Update statement/page.tsx

**Before:**
```typescript
const subPaymentsByAssignment = new Map<string, number>();
subPayments.forEach(p => {
  const assignmentId = p.estimate_subcontractor_id;
  if (assignmentId) {
    subPaymentsByAssignment.set(assignmentId, (subPaymentsByAssignment.get(assignmentId) || 0) + (p.amount || 0));
  }
});
const outstandingSubcontractor = estSubs.reduce((sum, s) => sum + ((s.amount || 0) - (subPaymentsByAssignment.get(s.id) || 0)), 0);
```

**After:**
```typescript
const financials = await calculateCompanyFinancials(companyId, startDate, endDate);
const outstandingSubcontractor = financials.outstandingSubcontractor;
```

---

## Phase 3: Verify Consistency

### 3.1 Create Consistency Tests

```typescript
// Tests that should PASS after consolidation
describe('Financial Consistency', () => {
  test('dashboard profit = statement profit = reports profit', async () => {
    const dashboard = await getDashboardOverview(companyId);
    const statement = await calculateCompanyFinancials(companyId, month);
    const reports = await getReportsFinancials(companyId, month);
    
    expect(dashboard.netProfit).toBe(statement.netProfit);
    expect(statement.netProfit).toBe(reports.netProfit);
  });
  
  test('project profit same on all pages', async () => {
    const expense = await getProjectBundle(estimateId); // Expense page
    const report = await getProjectReportData(estimateId); // Reports page
    const invoice = await getInvoiceData(invoiceId); // Invoice page
    
    const profitE = calculateProjectFinancials(expense).netProfit;
    const profitR = calculateProjectFinancials(report).netProfit;
    const profitI = calculateProjectFinancials(invoice).netProfit;
    
    expect(profitE).toBe(profitR);
    expect(profitR).toBe(profitI);
  });
  
  test('deleted records excluded from all calculations', async () => {
    // Create, calculate, delete, recalculate
    // Verify all pages show updated amounts
  });
});
```

### 3.2 Verification Checklist

- [ ] Dashboard profit matches statement profit
- [ ] Reports profit matches statement profit
- [ ] Project detail profit matches all pages
- [ ] Invoice calculations use unified engine
- [ ] Deleted expenses decrease totals everywhere
- [ ] Deleted payments increase outstanding everywhere
- [ ] Time ranges filter correctly everywhere
- [ ] All soft-delete filters applied consistently
- [ ] TypeScript compiles (0 new errors)
- [ ] All existing tests pass

---

## Implementation Strategy

### What NOT to Do
- Don't change database schema
- Don't modify existing API endpoints (yet)
- Don't break existing pages during migration

### What TO Do
1. Create new unified module in parallel
2. Update one page at a time
3. Test each page after update
4. Verify numbers match with old code (temporarily run both)
5. Once verified, remove old code

### Git Strategy
- Create feature branch: `consolidate-financial-calculations`
- Commit per-phase: Phase 1 (new module), Phase 2A (first 3 pages), Phase 2B (remaining pages), Phase 3 (tests)
- Small reviewable commits
- PR with comprehensive testing

---

## Benefits After Consolidation

✅ Single source of truth for all financial calculations  
✅ Deleted data automatically excluded everywhere  
✅ Time range filters applied consistently  
✅ Bug fixes apply to all pages automatically  
✅ Tax module can build on solid foundation  
✅ Future features won't introduce calculation drift  
✅ Eliminates 90% of data integrity issues  
✅ Creates testable financial calculation layer  

---

## Estimated Effort

- Phase 1 (New module): 2-3 hours
- Phase 2 (Replace calculations): 3-4 hours  
- Phase 3 (Testing & verification): 1-2 hours
- **Total: 6-9 hours**

---

## Critical Success Factors

1. **Every page must use unified engine** - No exceptions for "quick calculations"
2. **All calculations in one module** - Don't spread logic across multiple files
3. **Comprehensive testing** - Verify numbers match across all pages
4. **No performance regressions** - Monitor query performance
5. **Complete soft-delete handling** - Filters applied to all queries

---

## Next Steps

1. ✅ Audit complete (THIS PHASE)
2. ⏳ Create `financialCalculations.ts` (NEXT PHASE)
3. ⏳ Migrate page calculations (NEXT PHASE)
4. ⏳ Verify consistency (NEXT PHASE)
5. ⏳ Build tax module on consolidated foundation (FUTURE)
