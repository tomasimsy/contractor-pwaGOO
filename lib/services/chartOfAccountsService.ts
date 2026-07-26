/**
 * Layer 2 — the chart of accounts. Pure data, same pattern as
 * SchemaRegistry/permissions.ts: the account list and the mapping from
 * every TransactionType to its double-entry posting rule are DATA
 * registered here, not a branch inside GeneralLedgerService. Adding a
 * new TransactionType means adding a row to POSTING_RULES (and the
 * compiler enforces it — see the exhaustiveness check at the bottom of
 * this file), not touching ledger-posting logic.
 *
 * This is the accounting foundation's Layer 0/2 piece: it does not
 * read or write anything itself (no Supabase import, no I/O) — it is
 * looked up by GeneralLedgerService, which is what actually turns
 * TransactionService's ledger rows into postings.
 */
import type { TransactionType } from "./types";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

/** Which side of the ledger increases this account's balance — the
 * textbook accounting-equation fact (assets/expenses: debit-normal;
 * liabilities/equity/revenue: credit-normal) that TrialBalance math
 * depends on to know whether "more debits than credits" means a
 * growing or shrinking balance for a given account. */
export type NormalBalance = "debit" | "credit";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
}

const NORMAL_BALANCE: Record<AccountType, NormalBalance> = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  equity: "credit",
  revenue: "credit",
};

function account(code: string, name: string, type: AccountType): Account {
  return { code, name, type, normalBalance: NORMAL_BALANCE[type] };
}

/** A minimal, standard contractor chart of accounts — enough to post
 * every existing TransactionType somewhere real. Deliberately not
 * configurable per company yet (see RELIABILITY.md's accounting
 * section) — a real build would let a company add accounts; this is
 * the fixed foundation everything else maps onto first. */
export const ACCOUNTS: Account[] = [
  account("1000", "Cash", "asset"),
  account("1100", "Accounts Receivable", "asset"),
  account("2000", "Accounts Payable", "liability"),
  account("2100", "Agent Reimbursements Payable", "liability"),
  account("3000", "Owner's Equity", "equity"),
  account("4000", "Revenue", "revenue"),
  account("5000", "Material Expense", "expense"),
  account("5100", "Labor Expense", "expense"),
  account("5200", "Other Expense", "expense"),
  account("5300", "Mileage Expense", "expense"),
  account("5400", "Subcontractor Cost", "expense"),
  account("5500", "Agent Commission Expense", "expense"),
  account("5600", "Payroll Expense", "expense"),
];

const ACCOUNTS_BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a]));

export function getAccount(code: string): Account | undefined {
  return ACCOUNTS_BY_CODE.get(code);
}

/** The debit/credit account for one ledger event type — the actual
 * double-entry rule. Every entry here must balance the accounting
 * equation the way the underlying TransactionType actually affects the
 * business: e.g. `invoice_issued` debits Accounts Receivable (an asset
 * increases — the customer now owes us) and credits Revenue (revenue
 * increases), which is the standard accrual-basis entry for billing a
 * customer, matching TRANSACTION_TYPE_META's existing "revenue,
 * booked at accrual" documentation for that type. */
export const POSTING_RULES: Record<TransactionType, { debit: string; credit: string }> = {
  invoice_issued: { debit: "1100", credit: "4000" }, // AR up, Revenue up
  change_order_approved: { debit: "1100", credit: "4000" }, // AR up, Revenue up
  customer_payment: { debit: "1000", credit: "1100" }, // Cash up, AR down
  material_expense: { debit: "5000", credit: "1000" }, // Expense up, Cash down
  labor_expense: { debit: "5100", credit: "1000" },
  other_expense: { debit: "5200", credit: "1000" },
  mileage_expense: { debit: "5300", credit: "1000" },
  subcontractor_payment: { debit: "5400", credit: "1000" }, // Cost up, Cash down
  agent_commission: { debit: "5500", credit: "1000" }, // Cost up, Cash down
  payroll_expense: { debit: "5600", credit: "1000" }, // Cost up, Cash down
  agent_reimbursement_owed: { debit: "5200", credit: "2100" }, // Expense recognized, liability booked
  agent_reimbursement_paid: { debit: "2100", credit: "1000" }, // Liability settled, Cash down
  // No natural document — books straight to equity as a manual
  // correction unless/until a real chart lets a bookkeeper pick the
  // account, same "loose write, needs a reason" status as
  // TransactionService.recordAdjustment itself.
  adjustment: { debit: "3000", credit: "1000" },
};

// Exhaustiveness check: if a new TransactionType is ever added to
// types.ts without a matching row above, this line fails to compile —
// the same guarantee TRANSACTION_TYPE_META already gives for effect/
// sign, extended to double-entry posting rules.
const _exhaustive: Record<TransactionType, unknown> = POSTING_RULES;
void _exhaustive;
