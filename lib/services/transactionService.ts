/**
 * Layer 1 — the financial_transactions ledger. Every financial action
 * in the app creates exactly one row here; this service is the only
 * way anything reads or writes that ledger.
 *
 * ============================================================
 * EVENT -> LEDGER MAPPING (the "every financial action must be
 * traceable" requirement, made concrete)
 * ============================================================
 *   InvoiceService.createFromEstimate/createStandalone -> "invoice_issued"        (+Revenue)
 *   EstimateService.changeStatus(co, "approved")        -> "change_order_approved" (+Revenue)
 *   PaymentService.record                               -> "customer_payment"      (+Cash)
 *   ExpenseService.create (category: material)           -> "material_expense"      (-Cost)
 *   ExpenseService.create (category: labor)               -> "labor_expense"         (-Cost)
 *   ExpenseService.create (category: other)               -> "other_expense"         (-Cost)
 *   ExpenseService.recordMileageTrip                     -> "mileage_expense"       (-Cost)
 *   ExpenseService.create (paidByAgentId set)             -> ALSO "agent_reimbursement_owed" (-Liability)
 *   SubcontractorService.recordPayment                    -> "subcontractor_payment" (-Cost)
 *   AgentCommissionService.recordPayment(type: commission) -> "agent_commission"      (-Cost)
 *   AgentCommissionService.recordPayment(type: reimbursement) -> "agent_reimbursement_paid" (-Cash, settles the _owed liability)
 *   TransactionService.recordAdjustment (this service, manual)  -> "adjustment"       (sign given by caller)
 *
 * Every row on the left is written by the Layer 2 service that owns
 * the underlying table, in the same write transaction as the source
 * row — not by this service, and not by a page. This service is
 * responsible for the SHAPE of what gets written (append(), below) and
 * for every read; it is not responsible for deciding WHEN to write,
 * because that decision belongs to whichever service just changed a
 * business fact.
 *
 * The only entry point a Layer 2 service (or a DB mirror trigger, once
 * this schema is wired to Postgres) is meant to call to WRITE is
 * append() — every business event maps 1:1 to one append() call with a
 * fixed type + referenceType. recordAdjustment() is the only method a
 * human/caller can invoke directly to create a row with no source
 * document, and it is intentionally the only "loose" write on this
 * service — see its own doc comment.
 */
import type {
  UUID,
  ISODate,
  QueryScope,
  Transaction,
  TransactionType,
  TransactionEffect,
  ReferenceType,
  TransactionAdjustmentInput,
} from "./types";

/** The input every Layer 2 service passes to append() when it writes a
 * new business fact — everything except `id`/`createdAt`, which the
 * ledger assigns. */
export interface AppendTransactionInput {
  companyId: UUID;
  projectId: UUID | null;
  type: TransactionType;
  amount: number; // always positive; sign comes from TRANSACTION_TYPE_META, never from the caller
  referenceId: UUID;
  referenceType: ReferenceType;
  createdBy: UUID | null;
  // The business date this event actually occurred on (the source
  // record's own payment_date/expense_date/issue_date) — see
  // Transaction.transactionDate's doc comment for why this must never
  // just be "whenever this row happens to be inserted."
  transactionDate: ISODate;
  notes?: string | null;
}

export interface TransactionService {
  /** All ledger rows for one project, newest first, EXCLUDING any row
   * whose source record (looked up by referenceType/referenceId) is
   * currently soft-deleted. This is the concrete mechanism behind
   * "deleted records must never affect calculations": the ledger row
   * itself is never deleted (immutability is still true — see
   * TRANSACTION_LEDGER.md), but a deleted invoice's "invoice_issued"
   * row, or a deleted expense's cost row, must not be summed into any
   * figure FinancialEngine returns. The implementation joins each
   * ledger row's (referenceType, referenceId) against that table's own
   * deleted_at/is_deleted column at read time — this is why
   * ReconciliationService.reconcileLedgerAgainstSources includes an
   * explicit check that no ACTIVE calculation ever includes a
   * soft-deleted source's row (see that service's doc comment).
   * getAuditTrail(), by contrast, deliberately does NOT apply this
   * filter — the audit trail must show a deleted record's history too. */
  getProjectLedger(projectId: UUID): Promise<Transaction[]>;

  /** Same exclusion rule as getProjectLedger, company-wide — the read
   * path behind FinancialEngine.getCompanyFinancials/getTaxSummary and
   * every report/analytics page. */
  getCompanyLedger(scope: QueryScope): Promise<Transaction[]>;

  /** Sum of one type, scoped by project or company+range — the
   * primitive FinancialEngine composes rather than each caller
   * re-summing raw rows. */
  getTotalByType(scope: QueryScope, type: TransactionType): Promise<number>;

  /** Sum across every type sharing one accounting effect (e.g. every
   * "cost"-effect row) — used for the coarse Dashboard/Analytics tiles
   * that want "total cost" without caring which of the 6 cost types it
   * came from. */
  getTotalByEffect(scope: QueryScope, effect: TransactionEffect): Promise<number>;

  /** "Assigned vs paid" balance for one subcontractor/agent assignment
   * row — the single implementation of the max(assigned, paid)-
   * committed / assigned-minus-paid-outstanding logic that
   * FinancialEngine, SubcontractorService, and AgentCommissionService
   * all need. */
  getAssignmentBalance(assignmentId: UUID): Promise<{
    assigned: number;
    paid: number;
    committed: number; // max(assigned, paid)
    outstanding: number; // assigned - paid, floored at 0
  }>;

  /** Liability owed vs. settled for one expense that was paid by an
   * agent — nets every "agent_reimbursement_owed" row (referencing the
   * expense) against every "agent_reimbursement_paid" row that SETTLES
   * it. The two don't share a referenceId: "owed" references the
   * expense, "paid" references the agent payment itself (so an
   * individual reimbursement payment can be soft-deleted independent
   * of the expense — see AgentCommissionService.softDelete), and the
   * link between them is each payment's own `reimbursesExpenseId`
   * field. Without this, "owed" and "paid" being two separate ledger
   * rows (rather than one mutable balance) would have no way to answer
   * "how much of this specific reimbursement is still outstanding." */
  getReimbursementBalance(expenseId: UUID): Promise<{ owed: number; paid: number; outstanding: number }>;

  /** THE traceability primitive: every ledger row that references a
   * given source record, in order. "Show me everything that happened
   * because of this expense/invoice/payment" — the concrete answer to
   * "every financial action must be traceable," and the read path
   * ReconciliationService and any admin audit view use. */
  getAuditTrail(referenceType: ReferenceType, referenceId: UUID): Promise<Transaction[]>;

  /** THE single entry point every Layer 2 service calls to record a
   * financial fact it just created (see the file-level mapping table).
   * Not exposed to pages — only Layer 2 services and DB-level mirror
   * triggers call this, in the same write as the source row, so the
   * ledger can never observably lag behind or disagree with it. */
  append(input: AppendTransactionInput): Promise<Transaction>;

  /** THE ONLY WRITE METHOD EXPOSED FOR A FACT WITH NO SOURCE DOCUMENT.
   * A bank fee, a write-off, a bookkeeper's reconciling entry has
   * nothing to mirror from append() — before this method, there was no
   * way to represent that in the ledger at all. Requires a reason and
   * an actor; there is no source table for AuditService to infer
   * provenance from, so the caller must supply it. If a new
   * transaction TYPE is ever needed that has its own natural source
   * document, that's a sign of a new TransactionType + append() call
   * site, not a second loose-write method here. */
  recordAdjustment(input: TransactionAdjustmentInput): Promise<Transaction>;
}
