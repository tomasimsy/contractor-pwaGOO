# Tax Module Architecture

## Overview

The Tax Module is a complete tax workspace built on top of the unified financial calculation engine. It demonstrates that the data refactoring and reconciliation system works correctly by pulling financial data from the same sources used by Dashboard, Analytics, and Expenses pages.

**Core Principle**: No separate calculations. All financial numbers come from `lib/queries/financialCalculations.ts`.

## Architecture

### Single Source of Truth

```
lib/queries/financialCalculations.ts (Unified Engine)
    ↓
lib/queries/tax.ts (Tax Query Layer)
    ↓
app/tax/* (Tax UI Pages)
```

Every number in the Tax Module comes from the unified calculation engine:

1. **Revenue**: From `calculateCompanyFinancials().totalRevenue`
2. **Expenses**: From `calculateCompanyFinancials().totalExpenses`
3. **Profit**: From `calculateCompanyFinancials().netProfit`
4. **Subcontractor Costs**: From `calculateCompanyFinancials().subcontractorPaid`
5. **Agent Costs**: From `calculateCompanyFinancials().agentPaid`
6. **Outstanding Payables**: From `calculateCompanyFinancials().outstandingTotal`

### Data Flow

```
Supabase ──→ calculateCompanyFinancials()
            ├─ Fetches all estimates (non-deleted)
            ├─ Fetches all invoices (non-deleted)
            ├─ Fetches all payments (non-deleted)
            ├─ Calculates revenue, expenses, profit
            └─ Returns CompanyFinancials interface

Tax Query Layer (lib/queries/tax.ts)
            ├─ getTaxDashboard() calls calculateCompanyFinancials()
            ├─ calculateTaxReadiness() runs audits
            ├─ getSubcontractor1099Summary() uses payment data
            └─ getAgentCompensationSummary() uses compensation data

Tax Pages (app/tax/*)
            ├─ /tax - Main tax workspace with readiness score
            ├─ /tax/dashboard - Financial overview
            ├─ /tax/reports - CPA-ready reports
            ├─ /tax/audit - Data quality audit
            ├─ /tax/contractors - 1099 tracking
            └─ /tax/settings - Tax configuration
```

## Components

### 1. Database Tables (supabase/migrations/20260720_add_tax_configuration.sql)

**company_tax_settings**
- Entity type (LLC, S-Corp, etc.)
- Tax year and fiscal year configuration
- Accounting method (cash/accrual)
- Agent classification defaults
- 1099 reporting threshold
- Sales tax settings

**subcontractor_tax_info**
- W9 receipt tracking
- 1099 eligibility
- Legal name and EIN

**agent_tax_info**
- Classification (employee/contractor)
- Tax withholding percentage
- YTD tracking (commissions, reimbursements, withholding)

**expense_receipts**
- Links receipts to expenses
- Upload tracking

**tax_audit_log**
- Audit findings
- Resolution tracking

### 2. Query Module (lib/queries/tax.ts)

**Core Functions:**

- `getTaxSettings(companyId)` - Get tax configuration
- `updateTaxSettings(companyId, updates)` - Update tax settings
- `createTaxSettings(companyId, settings)` - Create initial settings
- `calculateTaxReadiness(companyId)` - Audit score (0-100%)
- `getTaxDashboard(companyId, startDate, endDate)` - Complete tax overview
- `getSubcontractor1099Summary(companyId, taxYear)` - 1099 tracking
- `getAgentCompensationSummary(companyId, taxYear)` - Agent compensation
- `runTaxAudit(companyId, taxYear)` - Data quality checks

**Tax Readiness Score Calculation:**

Score is based on 4 checks (25% each):
1. ✓ Revenue reconciled (has estimates)
2. ✓ Expenses categorized (all expenses have tax categories)
3. ✓ Payments matched (all payments linked to invoices)
4. ✓ Contractors reviewed (1099 contractors have W9 forms)

**Warnings Detected:**
- Missing receipts
- Uncategorized expenses
- Missing W9 information
- Unmatched payments

### 3. UI Pages

#### `/tax` - Tax Workspace Home
- Tax readiness score with circular progress
- Readiness checks (4-point audit)
- Warnings section
- Quick navigation links
- Current tax settings summary

#### `/tax/dashboard` - Financial Overview
- Income section (Gross Revenue, Collected Payments, Outstanding Receivables, Taxable Revenue)
- Expenses section (Total, Direct Costs, Subcontractor, Agent Commissions)
- Profitability section (Gross/Net Profit, Margin, Estimated Tax Liability)
- Outstanding Payables section
- **Data Source Verification badge**: Confirms data comes from unified engine

#### `/tax/reports` - CPA-Ready Reports
Organized by report type:
- Financial Statements (P&L, Trial Balance)
- Income Reports (Revenue Summary, Payment Summary)
- Expense Reports (Expense Summary, Vendor Report)
- Contractor Reports (1099 Summary, W9 Status)
- Agent Reports (Compensation Summary, Annual Earnings)

Each report is designed for CPA use, not IRS form generation.

#### `/tax/audit` - Tax Audit Scanner
- Summary cards (Issues Found, Errors, Warnings)
- Issue list with severity levels
- Quick actions to navigate to problem areas
- All-clear state when data is clean

#### `/tax/contractors` - 1099 & Agent Tracking
- Subcontractor 1099 summary table
  - Total paid
  - Assignment count
  - 1099 eligibility
  - W9 status (✓/⚠)
- Agent compensation table
  - Commissions
  - Reimbursements
  - Total compensation
  - Grand totals

#### `/tax/settings` - Tax Configuration
- Business entity type selector
- Tax year and fiscal year configuration
- Accounting method (cash/accrual)
- State selection
- EIN and business name
- Agent classification defaults
- 1099 reporting threshold ($600 default)
- Sales tax settings

## Verification of Unified System

Every Tax page displays this verification badge:

> "All numbers on this dashboard come from the unified financial calculation engine used by Dashboard, Analytics, and Expenses pages. Numbers are identical across all views."

This ensures:

✅ **Same calculation engine** - All pages use `calculateCompanyFinancials()` or `calculateProjectFinancials()`
✅ **Same data source** - All queries filter deleted_at and is_deleted consistently
✅ **No duplicate logic** - Tax calculations are NOT in the Tax module
✅ **Audit trail** - Changes to the calculation engine automatically fix all pages
✅ **CPA ready** - Numbers are reconciled and verified

## Tax Readiness Scoring

The readiness score helps the business owner prepare year-round:

### Score 0-25%: Missing Foundations
- Suggestion: Review tax settings first
- Action: Configure entity type, fiscal year, accounting method

### Score 26-50%: Data Collection in Progress
- Suggestion: Ensure all transactions are recorded
- Action: Add missing categorizations and receipts

### Score 51-75%: Mostly Ready
- Suggestion: Complete missing documentation
- Action: Collect remaining receipts, verify contractor forms

### Score 76-100%: Tax Ready
- Status: Ready to generate CPA package
- Action: Run tax audit, generate reports, send to CPA

## Integration Points

The Tax Module connects to existing features:

1. **Estimates** - Used to calculate revenue
2. **Invoices** - Track what's billed and paid
3. **Expenses** - Categorized and tracked for deductions
4. **Subcontractors** - 1099 tracking and payments
5. **Agents** - Commission and compensation tracking
6. **Mileage** - Deductible vehicle expenses
7. **Change Orders** - Affects revised revenue total

## Data Consistency Rules

All Tax queries follow these rules:

1. **Soft delete awareness** - Always filter `is_deleted = false` or `deleted_at IS NULL`
2. **Company scoping** - All queries filtered by `company_id`
3. **Unified calculations** - Use functions from financialCalculations.ts
4. **Date range filtering** - Respect tax year configuration
5. **RLS policies** - All tables have company_id-based RLS

## Using the Tax Module

### For Business Owners

1. **Configure Tax Settings** - Set entity type, fiscal year, accounting method
2. **Monitor Readiness Score** - Check /tax for current status
3. **Address Warnings** - Run audit scanner and resolve issues
4. **Generate Reports** - Create CPA-ready reports before tax season
5. **Send to CPA** - Export reports and supporting documents

### For CPAs

1. Review Financial Overview for total revenue, expenses, profit
2. Pull specific reports (P&L, Revenue Summary, Expense Summary)
3. Verify 1099 tracking matches payments
4. Check audit log for data quality issues
5. Use numbers for tax return preparation

## Testing the Unified System

To verify the Tax Module is correctly connected:

1. Go to Dashboard and note revenue/expense/profit totals
2. Go to /analytics and verify same numbers
3. Go to /tax/dashboard and confirm matching numbers
4. If any number differs, it indicates a bug in the unified engine, not the display

The Tax Module is PROOF that the refactored financial system works correctly.

## Future Enhancements

1. PDF export of reports
2. Direct CPA package generation
3. Automatic quarterly estimates
4. IRS form pre-population (1099-NEC, Schedule C)
5. State sales tax reports
6. Multi-year comparisons
7. Tax projection tool
8. Depreciation schedule tracking
9. Home office deduction calculator
10. Estimated tax payment reminders
