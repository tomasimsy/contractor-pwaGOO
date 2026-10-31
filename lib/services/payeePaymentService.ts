/**
 * Layer 2 — payments to people: employees and team members.
 *
 * Owns the payment records (`payee_payments`). What is owed is calculated by
 * computePayees (payeeOwed.ts) from the same sources the job totals use, so the
 * payments page and the job figures cannot disagree.
 */
import type { PayeeRow } from "./payeeOwed";

export interface RecordPaymentInput {
  /** The person's row key from load(): "employee:<id>" or "team:<profileId>". */
  payeeKey: string;
  /** Required for team members: the job the payment is for. */
  estimateId?: string | null;
  amount: number;
  paidOn: string;
  method: string;
  reference?: string | null;
  notes?: string | null;
  /** The pay period this payment covers (inclusive). */
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface PayeePaymentService {
  /** Everyone with pay, with earned lines, paid, owed, and history. Earned pay counts up to throughDate (the pay period end) when given. */
  load(throughDate?: string): Promise<PayeeRow[]>;
  /** Pays back every pending reimbursement for a person, and marks those expenses reimbursed. */
  recordReimbursement(input: { payeeKey: string; paidOn: string; method: string; reference?: string | null }): Promise<void>;
  /** One payment per person. With no amount it covers the whole balance, including reimbursements;
   * a smaller amount pays wages only, job by job. */
  recordFullPayment(input: { payeeKey: string; paidOn: string; method: string; reference?: string | null; periodStart?: string | null; periodEnd?: string | null; amount?: number | null }): Promise<void>;
  /** Records a payment. Refuses an amount above what is owed. */
  recordPayment(input: RecordPaymentInput): Promise<void>;
  /** A correction after a period is paid: adds to (or takes away from) what is owed. Needs a reason. */
  recordAdjustment(input: { payeeKey: string; amount: number; reason: string; paidOn: string }): Promise<void>;
  /** Reverses a payment with a reason. The row stays in the history. */
  reversePayment(paymentId: string, reason: string): Promise<void>;
}

/** One wage payment to an employee: cash that left the company as pay
 * (reimbursement parts and corrections excluded). Employee wages are not
 * expense rows, so company-wide profit and the year-end package read them
 * from here. */
export interface EmployeeWagePayment {
  employeeId: string;
  employeeName: string;
  amount: number;
  paidOn: string;
  /** The job, when the whole payment was for one; null for mixed or no job. */
  estimateId: string | null;
}

/** Reads every live employee wage payment for a company. */
export type ListEmployeeWages = (companyId: string) => Promise<EmployeeWagePayment[]>;

