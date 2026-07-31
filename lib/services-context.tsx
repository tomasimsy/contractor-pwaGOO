"use client";

/**
 * The ONE seam between React and the service layer. Every form/page in
 * this app reads services from here via `useServices()` — never by
 * importing a service file directly, never by calling Supabase, never
 * by reimplementing a calculation. This is what makes "forms must not
 * directly control business logic" enforceable rather than a style
 * guideline: there is no other way for a component to touch data or
 * money math.
 *
 * `ServicesProvider` is given concrete implementations once each
 * Layer 2 service has one (today only FinancialEngine and
 * FilteringService are implemented — see financialEngine.ts,
 * filteringService.ts). Until a given service has a real
 * Supabase-backed implementation, wiring it here is a one-line change;
 * no consumer of `useServices()` needs to change when that happens,
 * because they only ever depend on the interface.
 */
import { createContext, useContext, type ReactNode } from "react";
import type {
  ProjectService,
  EstimateService,
  ChangeOrderService,
  InvoiceService,
  PaymentService,
  ExpenseService,
  SubcontractorService,
  AgentCommissionService,
  TaxService,
  FinancialEngine,
  TransactionService,
  FilteringService,
  ValidationService,
  AuditService,
  ReconciliationService,
  RoofingAreaService,
} from "./services";

export interface Services {
  projectService: ProjectService;
  estimateService: EstimateService;
  changeOrderService: ChangeOrderService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  expenseService: ExpenseService;
  subcontractorService: SubcontractorService;
  agentCommissionService: AgentCommissionService;
  taxService: TaxService;
  financialEngine: FinancialEngine;
  transactionService: TransactionService;
  filteringService: FilteringService;
  validationService: ValidationService;
  auditService: AuditService;
  reconciliationService: ReconciliationService;
  roofingAreaService: RoofingAreaService;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

/** The only way any component reaches a service. Throws loudly if a
 * component tries to render outside `ServicesProvider` — a silent
 * fallback (e.g. returning stub services) would let a form quietly do
 * nothing instead of surfacing the wiring mistake immediately. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error("useServices() called outside <ServicesProvider>. Every page that touches data/money must be wrapped in the provider — see app/layout.tsx.");
  }
  return services;
}
