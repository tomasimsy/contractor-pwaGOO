"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createInMemoryServices, type InMemoryServices } from "@/lib/services/testing/inMemoryServices";
import { createAuditService } from "@/lib/services";
import { createSupabaseAuditLogRepository } from "@/lib/services/supabase/auditLogRepository";
import { createSupabaseClientService } from "@/lib/services/supabase/clientService";
import { createSupabaseProjectService } from "@/lib/services/supabase/projectService";
import { createSupabaseEstimateService } from "@/lib/services/supabase/estimateService";
import { createSupabaseChangeOrderService } from "@/lib/services/supabase/changeOrderService";
import { createSupabaseInvoiceService } from "@/lib/services/supabase/invoiceService";
import { createSupabasePaymentService } from "@/lib/services/supabase/paymentService";
import { createSupabaseExpenseService } from "@/lib/services/supabase/expenseService";
import { createFinancialEngine } from "@/lib/services";
import type { ClientService } from "@/lib/services/clientService";
import type { ProjectService } from "@/lib/services/projectService";
import type { EstimateService } from "@/lib/services/estimateService";
import type { ChangeOrderService } from "@/lib/services/changeOrderService";
import type { InvoiceService } from "@/lib/services/invoiceService";
import type { PaymentService } from "@/lib/services/paymentService";
import type { ExpenseService } from "@/lib/services/expenseService";
import type { FinancialEngine } from "@/lib/services/financialEngine";
import type { AuditService } from "@/lib/services";
import { supabase } from "@/lib/supabase/client";

export interface AppServices extends InMemoryServices {
  clientService: ClientService;
  projectService: ProjectService;
  estimateService: EstimateService;
  changeOrderService: ChangeOrderService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  expenseService: ExpenseService;
  financialEngine: FinancialEngine;
  auditService: AuditService;
}

/**
 * The one place the app gets its service-layer instances — every
 * business page/component must call `useServices()`, never import a
 * service factory directly, so swapping the backing implementation
 * never means touching call sites.
 *
 * `clientService`, `projectService`, `estimateService`,
 * `changeOrderService`, and `auditService` are now REAL — Supabase-backed
 * (see lib/services/supabase/), targeting the actual `clients`/
 * `projects`/`estimates`+`estimate_items`/`change_orders`+
 * `change_order_line_items`/`audit_logs` tables in the shared Supabase
 * project (see .env.local). Every other service (invoice, payment,
 * expense, subcontractor, agent, financial engine, reconciliation,
 * payroll, accounting, reporting) is still `createInMemoryServices()`
 * — the documented placeholder from earlier passes, unchanged.
 *
 * FINANCIAL ENGINE — PARTIALLY REAL, AND HONEST ABOUT WHICH HALF.
 * `financialEngine` is now constructed against the REAL project,
 * estimate, change-order, invoice and expense services, so revenue,
 * billed totals, approved change orders and — as of the Expenses
 * module — every project COST figure reflect the live database.
 *
 * Its `subcontractorService`, `agentCommissionService` and
 * `transactionService` dependencies are still the in-memory doubles,
 * because those modules have not been built yet (Prompts 41/42). The
 * practical effect is bounded and knowable: subcontractor/agent
 * ASSIGNMENT costs read as zero, while expenses of type
 * "subcontractor"/"agent_commission" recorded through the Expenses
 * module DO count, because those come from ExpenseService. Nothing
 * silently reads stale in-memory data for a figure the real services
 * can answer.
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
    const auditLogRepository = createSupabaseAuditLogRepository(supabase);
    const auditService = createAuditService(auditLogRepository);
    const clientService = createSupabaseClientService(supabase, inMemory.validationService, currentUserId);
    const projectService = createSupabaseProjectService(supabase, inMemory.validationService, auditService, currentUserId, clientService);
    const estimateService = createSupabaseEstimateService(supabase, inMemory.validationService, auditService, currentUserId, projectService);
    const changeOrderService = createSupabaseChangeOrderService(
      supabase,
      inMemory.validationService,
      auditService,
      inMemory.transactionService,
      currentUserId,
      projectService,
      estimateService
    );

    const invoiceService = createSupabaseInvoiceService(
      supabase,
      inMemory.validationService,
      auditService,
      currentUserId,
      estimateService,
      changeOrderService
    );
    const paymentService = createSupabasePaymentService(supabase, inMemory.validationService, currentUserId);
    const expenseService = createSupabaseExpenseService(
      supabase,
      inMemory.validationService,
      currentUserId,
      estimateService
    );

    // Rebuilt over the real services rather than reusing
    // inMemory.financialEngine, which was closed over the in-memory
    // doubles and could therefore never see a live number. See the
    // header note for exactly which dependencies remain doubles.
    const financialEngine = createFinancialEngine({
      projectService,
      estimateService,
      changeOrderService,
      invoiceService,
      expenseService,
      subcontractorService: inMemory.subcontractorService,
      agentCommissionService: inMemory.agentCommissionService,
      transactionService: inMemory.transactionService,
      filteringService: inMemory.filteringService,
    });

    return {
      ...inMemory,
      auditService,
      clientService,
      projectService,
      estimateService,
      changeOrderService,
      invoiceService,
      paymentService,
      expenseService,
      financialEngine,
    };
  }, []);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within a ServicesProvider.");
  return ctx;
}
