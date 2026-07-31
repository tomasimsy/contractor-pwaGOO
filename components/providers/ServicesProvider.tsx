"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createInMemoryServices, type InMemoryServices } from "@/lib/services/testing/inMemoryServices";
import { createServerAppServices } from "@/lib/services/server";
import { createEstimatePhotoService } from "@/lib/services/supabase/estimatePhotoService";
import { createRoofingAreaService } from "@/lib/services/supabase/roofingAreaService";
import { createSupabaseEstimateAreaLineItemService } from "@/lib/services/supabase/estimateAreaLineItemService";
import { createSupabaseExpenseService } from "@/lib/services/supabase/expenseService";
import { createFinancialEngine } from "@/lib/services";
import type { ClientService } from "@/lib/services/clientService";
import type { ProjectService } from "@/lib/services/projectService";
import type { EstimateService } from "@/lib/services/estimateService";
import type { EstimatePhotoService } from "@/lib/services/estimatePhotoService";
import type { RoofingAreaService } from "@/lib/services/roofingAreaService";
import type { EstimateAreaLineItemService } from "@/lib/services/estimateAreaLineItemService";
import type { ChangeOrderService } from "@/lib/services/changeOrderService";
import type { InvoiceService } from "@/lib/services/invoiceService";
import type { PaymentService } from "@/lib/services/paymentService";
import type { ExpenseService } from "@/lib/services/expenseService";
import type { SubcontractorService } from "@/lib/services/subcontractorService";
import type { AgentCommissionService } from "@/lib/services/agentCommissionService";
import type { FinancialEngine } from "@/lib/services/financialEngine";
import type { AuditService } from "@/lib/services";
import type { EstimateWorkflow } from "@/lib/services/estimateWorkflow";
import type { ChangeOrderWorkflow } from "@/lib/services/changeOrderWorkflow";
import { supabase } from "@/lib/supabase/client";

export interface AppServices extends InMemoryServices {
  clientService: ClientService;
  projectService: ProjectService;
  estimateService: EstimateService;
  estimatePhotoService: EstimatePhotoService;
  roofingAreaService: RoofingAreaService;
  estimateAreaLineItemService: EstimateAreaLineItemService;
  changeOrderService: ChangeOrderService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  expenseService: ExpenseService;
  subcontractorService: SubcontractorService;
  agentCommissionService: AgentCommissionService;
  financialEngine: FinancialEngine;
  auditService: AuditService;
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
 * `createInMemoryServices()` doubles — no real ledger table exists yet
 * (see subcontractorService.ts's file header for why assignment
 * balances no longer depend on it).
 *
 * FINANCIAL ENGINE — now fully real for every cost source it composes:
 * revenue, billed totals, approved change orders, expenses, and
 * subcontractor/agent assignment costs (via SubcontractorService.
 * getBalance/AgentCommissionService.getBalance, computed directly from
 * persisted rows, not the in-memory ledger) all reflect the live
 * database.
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
      expenseService, subcontractorService, agentCommissionService, estimateWorkflow, changeOrderWorkflow,
    } = server;

    const estimatePhotoService = createEstimatePhotoService(supabase);
    const roofingAreaService = createRoofingAreaService(supabase);
    const estimateAreaLineItemService = createSupabaseEstimateAreaLineItemService(supabase, inMemory.validationService);

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
    });

    return {
      ...inMemory,
      auditService,
      clientService,
      projectService,
      estimateService,
      estimatePhotoService,
      roofingAreaService,
      estimateAreaLineItemService,
      changeOrderService,
      invoiceService,
      paymentService,
      expenseService,
      subcontractorService,
      agentCommissionService,
      financialEngine,
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
