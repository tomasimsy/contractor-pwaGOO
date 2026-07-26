"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createInMemoryServices, type InMemoryServices } from "@/lib/services/testing/inMemoryServices";
import { createAuditService } from "@/lib/services";
import { createSupabaseAuditLogRepository } from "@/lib/services/supabase/auditLogRepository";
import { createSupabaseClientService } from "@/lib/services/supabase/clientService";
import { createSupabaseProjectService } from "@/lib/services/supabase/projectService";
import { createSupabaseEstimateService } from "@/lib/services/supabase/estimateService";
import { createSupabaseChangeOrderService } from "@/lib/services/supabase/changeOrderService";
import type { ClientService } from "@/lib/services/clientService";
import type { ProjectService } from "@/lib/services/projectService";
import type { EstimateService } from "@/lib/services/estimateService";
import type { ChangeOrderService } from "@/lib/services/changeOrderService";
import type { AuditService } from "@/lib/services";
import { supabase } from "@/lib/supabase/client";

export interface AppServices extends InMemoryServices {
  clientService: ClientService;
  projectService: ProjectService;
  estimateService: EstimateService;
  changeOrderService: ChangeOrderService;
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
 * NOTE: `inMemory.financialEngine` was built by createInMemoryServices()
 * against ITS OWN in-memory projectService/estimateService/
 * changeOrderService closures, not the real ones constructed below —
 * a pre-existing gap from before this pass (FinancialEngine has never
 * been rewired to the real services as they've come online). Pages
 * that need "approved change orders affect the total shown" therefore
 * compute that derived figure directly (changeOrderService.
 * listApprovedChangeOrders + financialCalculations.
 * calculateChangeOrderRevenue — the same formula FinancialEngine
 * itself uses) rather than calling financialEngine.getProjectFinancials,
 * which would silently read stale in-memory data. Rewiring
 * FinancialEngine to the real services is a separate, larger
 * cross-cutting change, not part of adding this module.
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

    return { ...inMemory, auditService, clientService, projectService, estimateService, changeOrderService };
  }, []);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within a ServicesProvider.");
  return ctx;
}
