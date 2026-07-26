/**
 * Layer 2 — payroll foundation: payees (employees, as distinct from
 * the subcontractors/agents SubcontractorService/AgentCommissionService
 * already handle) and pay runs.
 *
 * Explicitly NOT implemented here, and not faked: real tax withholding
 * calculation (federal/state/local, filing status, W-4 elections) is a
 * jurisdiction-dependent compliance problem, not an architecture
 * problem — `PayRunLine.withholdings` is a caller-supplied number in
 * this foundation, not something this service computes. A real payroll
 * build would either integrate a payroll-tax provider or implement
 * withholding tables per jurisdiction; that work is out of scope here
 * and documented as a gap in RELIABILITY.md, not silently assumed away.
 *
 * Contractor/agent payouts are deliberately NOT duplicated here —
 * SubcontractorService.recordPayment/AgentCommissionService.recordPayment
 * already are that, each writing its own ledger entry
 * (subcontractor_payment/agent_commission). This service is only for
 * W-2 employees, who have no equivalent service yet.
 */
import type { UUID, AuditedEntity, QueryScope, ISODate } from "./types";
import type { TransactionService } from "./transactionService";

export type PayeeType = "employee" | "contractor";
export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export interface Payee extends AuditedEntity {
  name: string;
  type: PayeeType;
  payFrequency: PayFrequency;
  /** Hourly or salaried — a per-pay-period base figure the pay run
   * starts from; overtime/bonuses/deductions are per-run adjustments,
   * not baked into this rate. */
  baseRate: number;
  rateType: "hourly" | "salary";
  isActive: boolean;
  locationId: UUID | null;
}

export interface PayRunLine {
  payeeId: UUID;
  hoursWorked: number | null; // null for salaried payees
  grossPay: number;
  /** Caller-supplied — see file header: this service does not compute
   * withholding amounts, only totals a run given what it's told. */
  withholdings: number;
  netPay: number;
}

export type PayRunStatus = "draft" | "approved" | "paid";

export interface PayRun extends AuditedEntity {
  payPeriodStart: ISODate;
  payPeriodEnd: ISODate;
  payDate: ISODate;
  status: PayRunStatus;
  lines: PayRunLine[];
  totalGross: number;
  totalWithholdings: number;
  totalNet: number;
}

export interface CreatePayeeInput {
  companyId: UUID;
  name: string;
  type: PayeeType;
  payFrequency: PayFrequency;
  baseRate: number;
  rateType: "hourly" | "salary";
  locationId?: UUID | null;
}

export interface CreatePayRunInput {
  companyId: UUID;
  payPeriodStart: ISODate;
  payPeriodEnd: ISODate;
  payDate: ISODate;
  lines: Omit<PayRunLine, "netPay">[];
}

/** One payee's line from a pay run, shaped for printing/emailing —
 * the "Pay Stubs" deliverable. Not a new calculation: every figure is
 * copied straight from the PayRunLine the run itself already computed. */
export interface PayStub {
  payeeId: UUID;
  payeeName: string;
  payPeriodStart: ISODate;
  payPeriodEnd: ISODate;
  payDate: ISODate;
  hoursWorked: number | null;
  grossPay: number;
  withholdings: number;
  netPay: number;
}

export interface PayrollReport {
  scope: QueryScope;
  totalGross: number;
  totalWithholdings: number;
  totalNet: number;
  runCount: number;
  byPayee: { payeeId: UUID; payeeName: string; totalGross: number; totalNet: number }[];
}

export interface PayrollService {
  getPayeeById(payeeId: UUID): Promise<Payee | null>;
  listPayees(scope: QueryScope): Promise<Payee[]>;
  createPayee(input: CreatePayeeInput): Promise<Payee>;
  deactivatePayee(payeeId: UUID): Promise<void>;

  getPayRunById(payRunId: UUID): Promise<PayRun | null>;
  listPayRuns(scope: QueryScope): Promise<PayRun[]>;

  /** Computes netPay per line (grossPay - withholdings) and the run's
   * totals — the one piece of arithmetic this service does own,
   * because it's a pure sum, not a financial-effect calculation
   * FinancialEngine would otherwise need to own. Starts in "draft." */
  createPayRun(input: CreatePayRunInput): Promise<PayRun>;

  /** draft -> approved -> paid, one direction only, matching the
   * lifecycle-transition discipline ProjectService/EstimateService
   * already use (via ValidationService) rather than a bare status
   * column write. Marking a run "paid" is the point a real
   * implementation would append a transaction per payee (a new
   * TransactionType this foundation doesn't add yet — see
   * RELIABILITY.md) to the existing ledger, so payroll cash-out shows
   * up in FinancialEngine's company financials same as every other
   * cost; not implemented in this foundation pass.
   */
  approvePayRun(payRunId: UUID): Promise<PayRun>;

  /** Marks the run paid AND appends one "payroll_expense" ledger
   * transaction (referencing this pay run, referenceType
   * "payroll_run") for the run's totalNet — so payroll cash-out shows
   * up in FinancialEngine's company financials, GeneralLedgerService's
   * trial balance, and every report built on either, same as every
   * other cost. This is the one place this service touches the shared
   * ledger; everything else here is payroll-only bookkeeping. */
  markPayRunPaid(payRunId: UUID): Promise<PayRun>;

  /** One payee's printable stub from an already-computed run — no new
   * math, just the run's own line reshaped. */
  getPayStub(payRunId: UUID, payeeId: UUID): Promise<PayStub | null>;

  /** Payroll Reports — totals across every pay run in scope, broken
   * out by payee. */
  getPayrollReport(scope: QueryScope): Promise<PayrollReport>;
}

/** Reference implementation used by the in-memory test harness (and a
 * real starting point for a future Supabase-backed one) — same "plain
 * Maps + a service function" pattern every other Layer 2 service in
 * lib/services/testing/inMemoryServices.ts uses, kept in this file
 * rather than that one so payroll's ~150 lines don't grow an already
 * 1300+ line file further. */
export function createInMemoryPayrollService(
  store: { payees: Map<UUID, Payee>; payRuns: Map<UUID, PayRun> },
  transactionService: TransactionService
): PayrollService {
  function requireExists<T>(value: T | undefined, what: string): T {
    if (!value) throw new Error(`${what} not found.`);
    return value;
  }

  async function getPayeeById(payeeId: UUID): Promise<Payee | null> {
    return store.payees.get(payeeId) ?? null;
  }

  async function listPayees(scope: QueryScope): Promise<Payee[]> {
    return Array.from(store.payees.values()).filter(
      (p) => p.companyId === scope.companyId && (scope.includeDeleted || p.deletedAt == null)
    );
  }

  async function createPayee(input: CreatePayeeInput): Promise<Payee> {
    const now = new Date().toISOString();
    const payee: Payee = {
      id: crypto.randomUUID(),
      companyId: input.companyId,
      name: input.name,
      type: input.type,
      payFrequency: input.payFrequency,
      baseRate: input.baseRate,
      rateType: input.rateType,
      isActive: true,
      locationId: input.locationId ?? null,
      createdBy: null,
      createdAt: now,
      updatedBy: null,
      updatedAt: now,
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.payees.set(payee.id, payee);
    return payee;
  }

  async function deactivatePayee(payeeId: UUID): Promise<void> {
    const payee = requireExists(store.payees.get(payeeId), "Payee");
    payee.isActive = false;
    payee.updatedAt = new Date().toISOString();
  }

  async function getPayRunById(payRunId: UUID): Promise<PayRun | null> {
    return store.payRuns.get(payRunId) ?? null;
  }

  async function listPayRuns(scope: QueryScope): Promise<PayRun[]> {
    return Array.from(store.payRuns.values()).filter(
      (r) => r.companyId === scope.companyId && (scope.includeDeleted || r.deletedAt == null)
    );
  }

  async function createPayRun(input: CreatePayRunInput): Promise<PayRun> {
    const now = new Date().toISOString();
    const lines: PayRunLine[] = input.lines.map((line) => ({ ...line, netPay: line.grossPay - line.withholdings }));
    const payRun: PayRun = {
      id: crypto.randomUUID(),
      companyId: input.companyId,
      payPeriodStart: input.payPeriodStart,
      payPeriodEnd: input.payPeriodEnd,
      payDate: input.payDate,
      status: "draft",
      lines,
      totalGross: lines.reduce((sum, l) => sum + l.grossPay, 0),
      totalWithholdings: lines.reduce((sum, l) => sum + l.withholdings, 0),
      totalNet: lines.reduce((sum, l) => sum + l.netPay, 0),
      createdBy: null,
      createdAt: now,
      updatedBy: null,
      updatedAt: now,
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.payRuns.set(payRun.id, payRun);
    return payRun;
  }

  async function approvePayRun(payRunId: UUID): Promise<PayRun> {
    const payRun = requireExists(store.payRuns.get(payRunId), "Pay run");
    if (payRun.status !== "draft") {
      throw new Error(`Cannot approve a pay run in status "${payRun.status}" — only "draft" runs can be approved.`);
    }
    payRun.status = "approved";
    payRun.updatedAt = new Date().toISOString();
    return payRun;
  }

  async function markPayRunPaid(payRunId: UUID): Promise<PayRun> {
    const payRun = requireExists(store.payRuns.get(payRunId), "Pay run");
    if (payRun.status !== "approved") {
      throw new Error(`Cannot mark a pay run "paid" from status "${payRun.status}" — it must be "approved" first.`);
    }
    payRun.status = "paid";
    payRun.updatedAt = new Date().toISOString();

    await transactionService.append({
      companyId: payRun.companyId,
      projectId: null, // payroll is a company-level cost, not tied to one project
      type: "payroll_expense",
      amount: payRun.totalNet,
      referenceId: payRun.id,
      referenceType: "payroll_run",
      createdBy: null,
      transactionDate: payRun.payDate,
      notes: `Pay run ${payRun.payPeriodStart} to ${payRun.payPeriodEnd}`,
    });

    return payRun;
  }

  async function getPayStub(payRunId: UUID, payeeId: UUID): Promise<PayStub | null> {
    const payRun = store.payRuns.get(payRunId);
    if (!payRun) return null;
    const line = payRun.lines.find((l) => l.payeeId === payeeId);
    if (!line) return null;
    const payee = store.payees.get(payeeId);
    return {
      payeeId,
      payeeName: payee?.name ?? "Unknown payee",
      payPeriodStart: payRun.payPeriodStart,
      payPeriodEnd: payRun.payPeriodEnd,
      payDate: payRun.payDate,
      hoursWorked: line.hoursWorked,
      grossPay: line.grossPay,
      withholdings: line.withholdings,
      netPay: line.netPay,
    };
  }

  async function getPayrollReport(scope: QueryScope): Promise<PayrollReport> {
    const runs = await listPayRuns(scope);
    const byPayeeMap = new Map<UUID, { payeeName: string; totalGross: number; totalNet: number }>();
    for (const run of runs) {
      for (const line of run.lines) {
        const payee = store.payees.get(line.payeeId);
        const existing = byPayeeMap.get(line.payeeId) ?? { payeeName: payee?.name ?? "Unknown payee", totalGross: 0, totalNet: 0 };
        existing.totalGross += line.grossPay;
        existing.totalNet += line.netPay;
        byPayeeMap.set(line.payeeId, existing);
      }
    }

    return {
      scope,
      totalGross: runs.reduce((sum, r) => sum + r.totalGross, 0),
      totalWithholdings: runs.reduce((sum, r) => sum + r.totalWithholdings, 0),
      totalNet: runs.reduce((sum, r) => sum + r.totalNet, 0),
      runCount: runs.length,
      byPayee: Array.from(byPayeeMap.entries()).map(([payeeId, v]) => ({ payeeId, ...v })),
    };
  }

  return {
    getPayeeById,
    listPayees,
    createPayee,
    deactivatePayee,
    getPayRunById,
    listPayRuns,
    createPayRun,
    approvePayRun,
    markPayRunPaid,
    getPayStub,
    getPayrollReport,
  };
}
