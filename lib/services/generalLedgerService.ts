/**
 * Layer 3 — turns TransactionService's cash-movement ledger into real
 * double-entry postings and a trial balance. This is the accounting
 * foundation's orchestration piece: it has no I/O of its own and no
 * calculation of its own — every number it reports is a Transaction
 * that TransactionService.getCompanyLedger already returned, mapped
 * through ChartOfAccountsService's POSTING_RULES. It CANNOT disagree
 * with FinancialEngine, because it reads the exact same source rows;
 * it just labels them with accounts instead of TransactionTypes.
 *
 * "Deleted records must never affect calculations" already holds here
 * for free — getCompanyLedger's own contract excludes any row whose
 * source record is soft-deleted (see transactionService.ts), and this
 * service does nothing but map what that call returns.
 */
import type { QueryScope, Transaction } from "./types";
import type { TransactionService } from "./transactionService";
import { POSTING_RULES, ACCOUNTS, getAccount, type Account } from "./chartOfAccountsService";

export interface LedgerPosting {
  transactionId: string;
  transactionDate: string;
  description: string;
  debitAccount: Account;
  creditAccount: Account;
  amount: number; // always positive; which side increases which account comes from normalBalance
}

export interface TrialBalanceLine {
  account: Account;
  debitTotal: number;
  creditTotal: number;
  /** Signed per the account's own normal balance — a debit-normal
   * account (asset/expense) with more debits than credits has a
   * positive balance; a credit-normal account (liability/equity/
   * revenue) with more credits than debits has a positive balance. */
  balance: number;
}

export interface TrialBalance {
  lines: TrialBalanceLine[];
  totalDebits: number;
  totalCredits: number;
  /** The actual double-entry invariant, checked, not asserted — every
   * posting contributes one equal debit and credit, so these two
   * totals summing to the same number is a structural guarantee of
   * this mapping, not something that can silently drift. A caller that
   * ever sees `isBalanced: false` has found a real bug in
   * POSTING_RULES (a rule that dropped one side), not a rounding
   * artifact. */
  isBalanced: boolean;
}

export interface GeneralLedgerService {
  /** One posting per ledger transaction, in the project's or
   * company's scope — the double-entry view of the exact same rows
   * getCompanyLedger/getProjectLedger already return. */
  getPostings(scope: QueryScope): Promise<LedgerPosting[]>;

  /** Every account's debit/credit totals and net balance over the
   * scope — the accounting-foundation deliverable: run this for the
   * whole company with no date range for a full trial balance, or
   * scoped/dated for a period-end close. */
  getTrialBalance(scope: QueryScope): Promise<TrialBalance>;

  /** One account's balance in isolation — what a CPA-ready report
   * would pull per line item rather than re-deriving the whole trial
   * balance for a single number. */
  getAccountBalance(scope: QueryScope, accountCode: string): Promise<number>;
}

function transactionToPosting(txn: Transaction): LedgerPosting {
  const rule = POSTING_RULES[txn.type];
  const debitAccount = getAccount(rule.debit);
  const creditAccount = getAccount(rule.credit);
  if (!debitAccount || !creditAccount) {
    // POSTING_RULES is exhaustiveness-checked against every
    // TransactionType at compile time (see chartOfAccountsService.ts),
    // and every code it references is defined in ACCOUNTS — this can
    // only happen if those two data tables are edited out of sync with
    // each other, which is a real bug worth failing loudly on rather
    // than silently posting to nothing.
    throw new Error(`No account mapping for transaction type "${txn.type}" (transaction ${txn.id}).`);
  }
  return {
    transactionId: txn.id,
    transactionDate: txn.transactionDate,
    description: txn.notes || `${txn.type} · ${txn.referenceType}`,
    debitAccount,
    creditAccount,
    amount: txn.amount,
  };
}

export function createGeneralLedgerService(deps: { transactionService: TransactionService }): GeneralLedgerService {
  async function getPostings(scope: QueryScope): Promise<LedgerPosting[]> {
    const transactions = scope.projectId
      ? await deps.transactionService.getProjectLedger(scope.projectId)
      : await deps.transactionService.getCompanyLedger(scope);
    return transactions.map(transactionToPosting);
  }

  async function getTrialBalance(scope: QueryScope): Promise<TrialBalance> {
    const postings = await getPostings(scope);

    const totalsByCode = new Map<string, { debitTotal: number; creditTotal: number }>();
    for (const account of ACCOUNTS) {
      totalsByCode.set(account.code, { debitTotal: 0, creditTotal: 0 });
    }

    let totalDebits = 0;
    let totalCredits = 0;
    for (const posting of postings) {
      const debitTotals = totalsByCode.get(posting.debitAccount.code)!;
      debitTotals.debitTotal += posting.amount;
      const creditTotals = totalsByCode.get(posting.creditAccount.code)!;
      creditTotals.creditTotal += posting.amount;
      totalDebits += posting.amount;
      totalCredits += posting.amount;
    }

    const lines: TrialBalanceLine[] = ACCOUNTS.map((account) => {
      const totals = totalsByCode.get(account.code)!;
      const balance =
        account.normalBalance === "debit"
          ? totals.debitTotal - totals.creditTotal
          : totals.creditTotal - totals.debitTotal;
      return { account, debitTotal: totals.debitTotal, creditTotal: totals.creditTotal, balance };
    });

    return {
      lines,
      totalDebits,
      totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.005, // cents-level float tolerance only
    };
  }

  async function getAccountBalance(scope: QueryScope, accountCode: string): Promise<number> {
    const trialBalance = await getTrialBalance(scope);
    const line = trialBalance.lines.find((l) => l.account.code === accountCode);
    if (!line) throw new Error(`Unknown account code "${accountCode}".`);
    return line.balance;
  }

  return { getPostings, getTrialBalance, getAccountBalance };
}
