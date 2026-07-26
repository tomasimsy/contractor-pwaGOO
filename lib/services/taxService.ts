/**
 * Layer 3, not Layer 2 — moved up from the earlier draft, which had
 * TaxService as a Layer 2 entity service with a carved-out exception
 * to depend on FinancialEngine. That was the wrong fix: an "exception"
 * to a dependency rule is just the rule being wrong for this case. Tax
 * readiness/reporting is BY DEFINITION downstream of the fully composed
 * financial picture (FinancialEngine) — that makes it a peer of
 * ReconciliationService, not of the entity services that feed the
 * engine. Reclassifying it here means the dependency DAG (Layer 0 -> 1
 * -> 2 -> 3, strictly one direction) has zero exceptions instead of
 * one, which is the whole point of having the rule.
 *
 * This still mirrors contractor-pwa's own stated design principle
 * ("No separate calculations. All financial numbers come from
 * financialCalculations.ts," TAX_MODULE_ARCHITECTURE.md) — the one part
 * of the old architecture that was already correct in spirit, just not
 * structurally enforced. It owns its own tables directly (company_tax_
 * settings, subcontractor_tax_info, agent_tax_info, expense_receipts,
 * tax_audit_log) the same way any Layer 2 service owns its table — the
 * Layer 3 placement is about its CALL graph (depends on FinancialEngine),
 * not about it lacking data of its own.
 *
 * Ownership note from the live-system check performed earlier: those
 * five tables exist in contractor-pwa's migration files but were
 * confirmed NOT present in production (PGRST205 on every one, via
 * anon-key read test). Whoever implements this service must re-run
 * that migration (fixing its company_members-referencing RLS bug
 * first) before this service has real tables to talk to.
 */
import type { UUID, ValidationResult } from "./types";
import type { ProjectFinancials, CompanyFinancials } from "./types";

export interface TaxSettings {
  companyId: UUID;
  entityType: string;
  taxYear: number;
  accountingMethod: "cash" | "accrual";
  subcontractor1099Threshold: number;
  salesTaxRate: number | null;
}

export interface TaxReadiness {
  score: number; // 0-100
  checks: {
    revenueReconciled: boolean;
    expensesCategorized: boolean;
    paymentsMatched: boolean;
    contractorsReviewed: boolean;
  };
  warnings: {
    missingReceipts: number;
    uncategorizedExpenses: number;
    missingW9Info: number;
  };
}

export interface TaxService {
  getSettings(companyId: UUID): Promise<TaxSettings | null>;
  updateSettings(companyId: UUID, changes: Partial<TaxSettings>): Promise<TaxSettings>;

  /** Consumes FinancialEngine.getCompanyFinancials rather than
   * re-querying estimates/invoices/expenses itself — this is the one
   * dependency direction in the whole service layer that points
   * upward, and it's why TaxService's own doc comment above exists:
   * so nobody "fixes" this into a Layer 2 -> Layer 2 call by mistake. */
  getReadiness(companyId: UUID, taxYear: number): Promise<TaxReadiness>;

  get1099Summary(companyId: UUID, taxYear: number): Promise<Array<{
    subcontractorId: UUID;
    totalPaid: number;
    requires1099: boolean;
    w9Received: boolean;
  }>>;

  getAgentCompensationSummary(companyId: UUID, taxYear: number): Promise<Array<{
    agentId: UUID;
    totalCommissions: number;
    totalReimbursements: number;
  }>>;

  /** Flat-rate estimate only — same caveat contractor-pwa's own
   * calculateEstimatedTaxLiability carried ("the only calculation of
   * its kind... a rough, simplified federal tax estimate"), preserved
   * here rather than dressed up as more precise than it is. */
  estimateTaxLiability(financials: CompanyFinancials | ProjectFinancials, rate?: number): number;

  logAuditFinding(input: {
    companyId: UUID;
    auditType: string;
    severity: "info" | "warning" | "error";
    entityTable: string;
    entityId: UUID;
    message: string;
  }): Promise<void>;
}
