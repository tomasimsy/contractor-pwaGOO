"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createInMemoryServices, type InMemoryServices } from "@/lib/services/testing/inMemoryServices";
import { createServerAppServices } from "@/lib/services/server";
import { createEstimatePhotoService } from "@/lib/services/supabase/estimatePhotoService";
import { createSupabaseExpenseReceiptService } from "@/lib/services/supabase/expenseReceiptService";
import { createRoofingAreaService } from "@/lib/services/supabase/roofingAreaService";
import { createRoofingAreaTemplateService } from "@/lib/services/supabase/roofingAreaTemplateService";
import { createSupabaseEstimateAreaLineItemService } from "@/lib/services/supabase/estimateAreaLineItemService";
import { createSupabaseExpenseService } from "@/lib/services/supabase/expenseService";
import { createSupabaseCompanyService } from "@/lib/services/supabase/companyService";
import { createSupabaseTeamAssignmentService } from "@/lib/services/supabase/teamAssignmentService";
import { createSupabaseBillScheduleService } from "@/lib/services/supabase/billScheduleService";
import { createAccountsReceivableService } from "@/lib/services/accountsReceivableService";
import { createAccountsPayableService } from "@/lib/services/accountsPayableService";
import { createSupabaseCompanyDocumentService } from "@/lib/services/supabase/companyDocumentService";
import { createSupabaseCompanyProfileService } from "@/lib/services/supabase/companyProfileService";
import { createCpaPackageService } from "@/lib/services/cpaPackageService";
import { createReconciliationCashFlowAdapter } from "@/lib/services/reconciliationCashFlowAdapter";
import { createBankReconciliationService } from "@/lib/services/bankReconciliationService";
import { createFinancialEngine } from "@/lib/services";
import type { ClientService } from "@/lib/services/clientService";
import type { ProjectService } from "@/lib/services/projectService";
import type { EstimateService } from "@/lib/services/estimateService";
import type { EstimatePhotoService } from "@/lib/services/estimatePhotoService";
import type { ExpenseReceiptService } from "@/lib/services/expenseReceiptService";
import type { RoofingAreaService } from "@/lib/services/roofingAreaService";
import type { PushSubscriptionService } from "@/lib/services/pushSubscriptionService";
import type { RoofingAreaTemplateService } from "@/lib/services/roofingAreaTemplateService";
import type { EstimateAreaLineItemService } from "@/lib/services/estimateAreaLineItemService";
import type { ChangeOrderService } from "@/lib/services/changeOrderService";
import type { InvoiceService } from "@/lib/services/invoiceService";
import type { PaymentService } from "@/lib/services/paymentService";
import type { ExpenseService } from "@/lib/services/expenseService";
import type { SubcontractorService } from "@/lib/services/subcontractorService";
import type { AgentCommissionService } from "@/lib/services/agentCommissionService";
import type { FinancialEngine } from "@/lib/services/financialEngine";
import type { CompanyService } from "@/lib/services/companyService";
import type { TeamAssignmentService } from "@/lib/services/teamAssignmentService";
import type { BillScheduleService } from "@/lib/services/billScheduleService";
import type { AccountsReceivableService } from "@/lib/services/accountsReceivableService";
import type { AccountsPayableService } from "@/lib/services/accountsPayableService";
import type { CompanyDocumentService } from "@/lib/services/companyDocumentService";
import type { CompanyProfileService } from "@/lib/services/companyProfileService";
import type { CpaPackageService } from "@/lib/services/cpaPackageService";
import type { BankReconciliationService } from "@/lib/services/bankReconciliationService";
import type { AuditService } from "@/lib/services";
import type { EstimateWorkflow } from "@/lib/services/estimateWorkflow";
import type { ChangeOrderWorkflow } from "@/lib/services/changeOrderWorkflow";
import { supabase } from "@/lib/supabase/client";

export interface AppServices extends InMemoryServices {
  clientService: ClientService;
  projectService: ProjectService;
  estimateService: EstimateService;
  estimatePhotoService: EstimatePhotoService;
  expenseReceiptService: ExpenseReceiptService;
  roofingAreaService: RoofingAreaService;
  roofingAreaTemplateService: RoofingAreaTemplateService;
  estimateAreaLineItemService: EstimateAreaLineItemService;
  changeOrderService: ChangeOrderService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  expenseService: ExpenseService;
  subcontractorService: SubcontractorService;
  agentCommissionService: AgentCommissionService;
  financialEngine: FinancialEngine;
  companyService: CompanyService;
  /** ADDITIVE — assignments only, no financial input. See the
   * interface: nothing in FinancialEngine reads it. */
  teamAssignmentService: TeamAssignmentService;
  /** Recurring bill TEMPLATES. Holds no cost — generating an occurrence
   * writes one ordinary expense via ExpenseService. */
  billScheduleService: BillScheduleService;
  /** Layer 3 re-shapers that add NO new financial fact — AR buckets
   * existing invoice balances, AP re-shapes getPayablesSummary. Both
   * already existed; they were simply never exposed. */
  accountsReceivableService: AccountsReceivableService;
  accountsPayableService: AccountsPayableService;
  companyDocumentService: CompanyDocumentService;
  /** Customer-facing brand identities (e.g. a dba operating under a
   * second name) — selected per estimate/invoice via their profile_id
   * column, layered on top of CompanySettings by lib/company.ts's
   * getCompanySettingsByCompanyId. Never duplicates company_id or any
   * financial data. */
  companyProfileService: CompanyProfileService;
  /** Cash-basis only — see cpaPackageService.ts's header for why this
   * is never given financialEngine. */
  cpaPackageService: CpaPackageService;
  /** Reads real payments/expenses (via reconciliationCashFlowAdapter),
   * never the abandoned in-memory ledger stack — see that adapter's
   * header. The matching algorithm itself is untouched. */
  bankReconciliationService: BankReconciliationService;
  auditService: AuditService;
  /** Staff devices subscribed to Web Push — see lib/push/sendPush.ts
   * (the "estimate signed" notification) and the enable/disable toggle
   * wherever notifications are turned on. */
  pushSubscriptionService: PushSubscriptionService;
  /** The single canonical estimate-signing workflow (sign/unsign) — see
   * lib/services/estimateWorkflow.ts. The portal reaches the exact same
   * function through app/api/portal/sign/route.ts, not a copy of it. */
  estimateWorkflow: EstimateWorkflow;
  /** The single canonical change-order-approval workflow — the portal
   * reaches it through app/api/portal/change-orders/[id]/approve/route.ts,
   * not a copy of it. See lib/services/changeOrderWorkflow.ts. */
  changeOrderWorkflow: ChangeOrderWorkflow;
}

/**
 * The one place the app gets its service-layer instances — every
 * business page/component must call `useServices()`, never import a
 * service factory directly, so swapping the backing implementation
 * never means touching call sites.
 *
 * `clientService`, `projectService`, `estimateService`,
 * `changeOrderService`, `auditService`, `invoiceService`,
 * `paymentService`, `expenseService`, `subcontractorService`, and
 * `agentCommissionService` are all REAL — Supabase-backed (see
 * lib/services/supabase/), targeting the actual `clients`/`projects`/
 * `estimates`+`estimate_items`/`change_orders`+`change_order_line_items`/
 * `audit_logs`/`subcontractors`+`estimate_subcontractors`+
 * `subcontractor_payments`/`agents`+`estimate_agents`+`agent_payments`
 * tables in the shared Supabase project (see .env.local). Only
 * `transactionService` and `filteringService` remain
 * `createInMemoryServices()` doubles — no real ledger table exists yet.
 * `transactionService` is still passed to `createFinancialEngine`
 * below purely for its type signature (`FinancialEngineDeps` requires
 * it) — as of the 2026-08-01 Dashboard audit fix, FinancialEngine no
 * longer calls it for any actual number (see financialEngine.ts's
 * `getRealizedCashFlows`/`getMileageCostForProjects` and
 * DASHBOARD_AUDIT_REPORT.md). Before that fix, Revenue and Payments
 * Received read from this in-memory ledger, which no real
 * PaymentService write ever reached — they were permanently ~$0 in
 * production regardless of real `invoice_payments` rows.
 *
 * FINANCIAL ENGINE — fully real for every figure it composes: revenue,
 * payments received, billed totals, approved change orders, expenses
 * (incl. mileage), and subcontractor/agent costs (via
 * PaymentService.getSummaryForInvoice / SubcontractorService.
 * getBalance+listPayments / AgentCommissionService.getBalance+
 * listPayments / ExpenseService, all computed directly from persisted
 * rows) all reflect the live database.
 */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const ServicesContext = createContext<AppServices | undefined>(undefined);

export function ServicesProvider({ children }: { children: ReactNode }) {
  // useMemo, not module scope — a fresh in-memory store per provider
  // mount (each browser tab/session); the real services below are
  // stateless clients over the shared Supabase project, not per-mount
  // state, but are constructed alongside for a single stable object.
  const services = useMemo<AppServices>(() => {
    const inMemory = createInMemoryServices();
    // Same construction recipe app/api/portal/sign/route.ts uses (with
    // a service-role client instead of this browser session client) —
    // see lib/services/server.ts's header for why this must be the one
    // shared wiring path rather than a second copy of it here.
    const server = createServerAppServices(supabase, currentUserId);
    const {
      auditService, clientService, projectService, estimateService, changeOrderService, invoiceService, paymentService,
      expenseService, subcontractorService, agentCommissionService, estimateWorkflow, changeOrderWorkflow, pushSubscriptionService,
    } = server;

    const estimatePhotoService = createEstimatePhotoService(supabase);
    const expenseReceiptService = createSupabaseExpenseReceiptService(supabase);
    const roofingAreaService = createRoofingAreaService(supabase);
    const roofingAreaTemplateService = createRoofingAreaTemplateService(supabase);
    const estimateAreaLineItemService = createSupabaseEstimateAreaLineItemService(supabase, inMemory.validationService);
    const companyService = createSupabaseCompanyService(supabase, currentUserId);
    const teamAssignmentService = createSupabaseTeamAssignmentService(supabase, inMemory.validationService, currentUserId);
    const billScheduleService = createSupabaseBillScheduleService(supabase, expenseService, inMemory.validationService, currentUserId);
    const accountsReceivableService = createAccountsReceivableService({ invoiceService, paymentService });
    const companyDocumentService = createSupabaseCompanyDocumentService(supabase, inMemory.validationService, currentUserId);
    const companyProfileService = createSupabaseCompanyProfileService(supabase, inMemory.validationService, currentUserId);

    // Rebuilt over the real services rather than reusing
    // inMemory.financialEngine, which was closed over the in-memory
    // doubles and could therefore never see a live number.
    // subcontractorService/agentCommissionService are now real too
    // (Prompts 42/43) — every project/estimate cost figure reflects the
    // live database, not just invoice/expense figures as before.
    const financialEngine = createFinancialEngine({
      projectService,
      estimateService,
      changeOrderService,
      invoiceService,
      paymentService,
      expenseService,
      subcontractorService,
      agentCommissionService,
      transactionService: inMemory.transactionService,
      filteringService: inMemory.filteringService,
      teamAssignmentService,
    });
    // After financialEngine — AP is a re-shape of getPayablesSummary.
    const accountsPayableService = createAccountsPayableService({ financialEngine });
    // Deliberately NOT given financialEngine — see cpaPackageService.ts's
    // header: the CPA package is cash-basis only and must never blend
    // FinancialEngine's committed-cost model into a report a CPA relies
    // on for what was actually paid.
    const cpaPackageService = createCpaPackageService({ expenseService, paymentService, invoiceService, projectService, clientService });
    const reconciliationCashFlowAdapter = createReconciliationCashFlowAdapter({ paymentService, expenseService });
    const bankReconciliationService = createBankReconciliationService({ financialStatementsService: reconciliationCashFlowAdapter });

    return {
      ...inMemory,
      auditService,
      clientService,
      projectService,
      estimateService,
      estimatePhotoService,
      expenseReceiptService,
      roofingAreaService,
      roofingAreaTemplateService,
      estimateAreaLineItemService,
      changeOrderService,
      invoiceService,
      paymentService,
      expenseService,
      subcontractorService,
      agentCommissionService,
      financialEngine,
      companyService,
      teamAssignmentService,
      billScheduleService,
      accountsReceivableService,
      accountsPayableService,
      companyDocumentService,
      companyProfileService,
      cpaPackageService,
      bankReconciliationService,
      pushSubscriptionService,
      estimateWorkflow,
      changeOrderWorkflow,
    };
  }, []);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within a ServicesProvider.");
  return ctx;
}
