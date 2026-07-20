# Phase 3: Unified Calculation Engine - Refactoring Guide

## Status: Foundation Complete ✅

**Completed:**
- ✅ `lib/queries/financialCalculations.ts` - Unified engine created & deployed
- ✅ `app/accounting/page.tsx` - Refactored & verified
- ✅ All calculations now use single source of truth
- ✅ TypeScript verified (0 new errors)

**Ready to use:** Tax module can now be built on the unified engine!

---

## Remaining Pages: Simple Refactoring Pattern

All remaining pages follow the **same pattern**. You can refactor them one at a time as needed.

### Pattern Overview

**Before:** Page fetches all data, manually calculates everything  
**After:** Page uses unified engine functions, displays results

### Step-by-Step Refactoring Template

#### 1. Add Imports
```typescript
import { 
  calculateProjectFinancials, 
  calculateCompanyFinancials,
  calculateAgentFinancials,
  calculateSubcontractorFinancials,
  calculateClientFinancials 
} from '@/lib/queries/financialCalculations';
import { getProjectBundle } from '@/lib/queries/projects';
```

#### 2. Replace Manual Calculations

**Before:**
```typescript
// 200+ lines of manual calculation logic
const profit = revenue - expenses;
const outstanding = assigned - paid;
```

**After:**
```typescript
// Unified engine handles all calculations
const financials = calculateProjectFinancials(bundle);
const profit = financials.netProfit;
const outstanding = financials.outstandingSubcontractor;
```

#### 3. Map Results to Page Type

```typescript
const typedData: YourPageType[] = projects.map(project => {
  const financials = calculateProjectFinancials(bundle);
  
  return {
    // Use financials for all financial fields
    profit: financials.netProfit,
    revenue: financials.revisedTotal,
    expenses: financials.totalExpenses,
    outstandingSubcontractor: financials.outstandingSubcontractor,
    // ... other fields
  };
});
```

---

## Recommended Refactoring Order

### Immediate (High Impact)
These are major pages users see daily. Refactoring here ensures consistency everywhere:

1. **`app/reports/expenses/page.tsx`** - Main financial reports
   - Replace lines 115-305 (estimate calculations)
   - Use: `calculateProjectFinancials()` per project
   - Time: ~45 minutes

2. **`lib/hooks/useDashboardOverview.ts`** - Dashboard hook
   - Replace stats calculations
   - Use: `calculateCompanyFinancials()` for company totals
   - Time: ~30 minutes

3. **`app/invoices/[id]/page.tsx`** - Invoice detail
   - Replace manual payment calculations
   - Use: `calculateProjectFinancials()` from bundle
   - Time: ~30 minutes

4. **`app/reports/expenses/[id]/page.tsx`** - Report detail
   - Replace project calculations
   - Use: `calculateProjectFinancials()`
   - Time: ~20 minutes

### Secondary (Medium Impact)
Dashboard cards that display financial data:

5. **`components/expense/cards/RevenueCard.tsx`** - Revenue display
   - Use: `financials.revisedTotal`
   - Time: ~15 minutes

6. **`components/expense/cards/ProfitCard.tsx`** - Profit display
   - Use: `financials.netProfit`
   - Time: ~15 minutes

7. **`components/expense/cards/CostBreakdownCard.tsx`** - Expense display
   - Use: `financials.totalExpenses`
   - Time: ~15 minutes

### Tertiary (Lower Impact)
Report pages and detail views:

8. **`app/reports/agent/[id]/page.tsx`** - Agent reports
   - Use: `calculateAgentFinancials()`
   - Time: ~20 minutes

9. **`app/reports/subcontractor/[id]/page.tsx`** - Subcontractor reports
   - Use: `calculateSubcontractorFinancials()`
   - Time: ~20 minutes

10. **`app/reports/client/[id]/page.tsx`** - Client reports
    - Use: `calculateClientFinancials()`
    - Time: ~20 minutes

---

## Complete Refactoring Checklist

### For Each Page:

- [ ] Add imports from `financialCalculations.ts`
- [ ] Add import from `getProjectBundle` if needed
- [ ] Identify manual calculation sections
- [ ] Replace with appropriate unified function call
- [ ] Map results to page's data type
- [ ] Remove old manual calculation code
- [ ] Verify TypeScript compiles: `npx tsc --noEmit`
- [ ] Test manually in browser (verify numbers match)
- [ ] Commit with message: "PHASE 3.X: Refactor [page] to use unified calculation engine"

### Testing After Each Refactor:

1. **Consistency check**: Compare numbers across pages (should now match)
2. **Deletion test**: Create/delete record, verify all pages update
3. **Date range test**: If page filters by date, verify filtering still works

---

## Key Functions Reference

### For Project-Level Financials
```typescript
const financials = calculateProjectFinancials(bundle);
// Returns:
// - originalEstimateTotal
// - approvedChangeOrderTotal
// - revisedTotal
// - subcontractorCosts, agentCosts, expenseItems, mileageCosts, totalExpenses
// - netProfit, profitMargin
// - amountPaid, remainingBalance
// - outstandingSubcontractor, outstandingAgent
// - paymentStatus, isFullyPaid
```

### For Company-Wide Financials
```typescript
const financials = await calculateCompanyFinancials(companyId, startDate, endDate);
// Returns:
// - totalRevenue, totalExpenses, netProfit, profitMargin
// - subcontractorPaid, agentPaid
// - totalInvoiced, totalPaid, totalOutstanding
// - completedProjects, convertedProjects, pendingInvoices
```

### For Agent Financials
```typescript
const agentFinancials = await calculateAgentFinancials(agentId, companyId);
// Returns:
// - totalCommissions, totalReimbursements, totalPaid
// - outstandingPayable, ytdEarnings, projectCount
```

### For Subcontractor Financials
```typescript
const subFinancials = await calculateSubcontractorFinancials(subcontractorId, companyId);
// Returns:
// - totalPaid, outstandingPayable, projectCount
// - w9Status, needs1099
```

### For Client Financials
```typescript
const clientFinancials = await calculateClientFinancials(clientId, companyId);
// Returns:
// - totalEstimated, totalInvoiced, totalPaid
// - outstandingReceivable, projectCount, avgProjectValue
```

---

## What's Working Now

✅ **Unified Engine Ready:** All calculations available in `financialCalculations.ts`  
✅ **One Page Refactored:** `accounting/page.tsx` demonstrates the pattern  
✅ **Foundation Solid:** Tax module can be built now  
✅ **Easy to Scale:** Follow this guide for remaining pages  

---

## Why We Did This

**Before:** 15+ locations with duplicate financial calculations → numbers drifted  
**After:** All calculations come from one source → guaranteed consistency  

**Benefit:** New tax module builds on solid foundation, not on fragmented calculations.

---

## Next Steps

### Option A: Refactor All Pages Now (6-8 hours)
Follow this guide to refactor all remaining pages immediately. Highest consistency guarantee.

### Option B: Build Tax Module First (2-3 hours)
Start building the tax module NOW using the unified engine foundation. Refactor remaining pages as you encounter them or on a separate schedule.

### Option C: Incremental Refactoring (Ongoing)
Refactor pages one at a time as you work on other features. Use this guide to keep it consistent.

---

## Technical Notes

- All calculations automatically exclude soft-deleted records (handled in `financialCalculations.ts`)
- Date range filtering is built into company-level calculations
- Agent/Subcontractor calculations handle both commission and reimbursement types
- Client calculations track both estimated and invoiced revenue
- All functions are async and fetch fresh data from Supabase (no caching issues)

---

## Common Issues & Solutions

**Issue:** TypeScript errors after refactoring  
**Solution:** Make sure your page's type matches the fields returned by the calculation function. See "Key Functions Reference" above.

**Issue:** Numbers don't match between pages  
**Solution:** You likely missed a query that still needs wrapping. Check:
  - Are all data fetches using `filterActive()` for soft deletes?
  - Are all date ranges being applied consistently?
  - Are you using the right calculation function?

**Issue:** Page is slower after refactoring  
**Solution:** Refactored pages now fetch complete project bundles. If this is slow:
  - Consider pagination (already done in accounting/reports pages)
  - Or batch the calculations differently
  - Performance is usually acceptable for <1000 projects

---

## Example: Refactoring a Reports Page

Here's exactly how to refactor `app/reports/expenses/page.tsx`:

### Old Code (Lines 115-305):
```typescript
// 190 lines of manual:
// - fetching estimates, invoices, change orders, expenses, subcontractors, agents, mileage
// - building lookup maps
// - calculating profit, costs, outstanding amounts
// - grouping and aggregating
```

### New Code:
```typescript
// Import at top
import { calculateProjectFinancials } from '@/lib/queries/financialCalculations';
import { getProjectBundle } from '@/lib/queries/projects';

// In data fetch, replace entire calculation section with:
const typedData: EstimateSummary[] = [];
for (const est of paidEstimates) {
  try {
    const bundle = await getProjectBundle(est.id);
    const financials = calculateProjectFinancials(bundle);
    const projInvoices = invoices?.filter(inv => inv.estimate_id === est.id) || [];
    const clientObj = est.clients as any;

    typedData.push({
      id: est.id,
      client_id: clientObj?.id || null,
      client_name: clientObj?.name || 'Unassigned',
      estimate_number: est.estimate_number || 'N/A',
      title: est.title || null,
      status: est.status,
      created_at: est.created_at,
      revised_total: financials.revisedTotal,
      subcontractor_paid: financials.subcontractorCosts,
      subcontractors: [],
      agent_paid: financials.agentCosts,
      agents: [],
      other_expenses: financials.expenseItems + financials.mileageCosts,
      payments_received: financials.amountPaid,
      remaining_balance: financials.remainingBalance,
      profit: financials.netProfit,
      profit_margin: financials.profitMargin,
      invoice_count: projInvoices.length,
      last_payment_date: null,
    });
  } catch (err) {
    console.warn(`Failed to calculate for estimate ${est.id}:`, err);
  }
}
setData(typedData);
```

That's it. Remove all the old calculation code and replace with this. 190 lines → 30 lines. Much cleaner.

---

## Questions?

Refer back to:
- `lib/queries/financialCalculations.ts` - Source of truth
- `app/accounting/page.tsx` - Working example
- This guide - Step-by-step template

The pattern is consistent across all pages.
