/**
 * Server-side service construction — the SAME wiring
 * components/providers/ServicesProvider.tsx uses for the browser,
 * parameterized by whatever SupabaseClient and actor resolver the
 * caller provides instead of the browser's session client.
 *
 * Exists so a server-only route (app/api/portal/sign/route.ts today;
 * any future portal action tomorrow — see estimateWorkflow.ts's header)
 * can construct real services against a service-role client WITHOUT a
 * second copy of "how estimateService/invoiceService/paymentService get
 * built and in what order." There is exactly one such construction
 * recipe; ServicesProvider and this file both call it.
 *
 * SECURITY: this function does not care what SupabaseClient it's given
 * — it is the CALLER's job to ensure that client is either (a) the
 * normal anon/session client (safe everywhere), or (b) a service-role
 * client, which must NEVER be constructed anywhere except inside a
 * server-only route that has already run its own authorization check
 * (token validation, etc.) before calling this function. See
 * app/api/portal/sign/route.ts for the one place that currently does
 * (b).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuditService } from "./auditService";
import { createSupabaseAuditLogRepository } from "./supabase/auditLogRepository";
import { createSupabaseClientService } from "./supabase/clientService";
import { createSupabaseProjectService } from "./supabase/projectService";
import { createSupabaseEstimateService } from "./supabase/estimateService";
import { createSupabaseChangeOrderService } from "./supabase/changeOrderService";
import { createSupabaseInvoiceService } from "./supabase/invoiceService";
import { createSupabasePaymentService } from "./supabase/paymentService";
import { createRoofingAreaService } from "./supabase/roofingAreaService";
import { createSupabaseEstimateAreaLineItemService } from "./supabase/estimateAreaLineItemService";
import { createSupabaseSubcontractorService } from "./supabase/subcontractorService";
import { createSupabaseAgentCommissionService } from "./supabase/agentCommissionService";
import { createSupabaseExpenseService } from "./supabase/expenseService";
import { createInMemoryServices } from "./testing/inMemoryServices";
import { createEstimateWorkflow, type EstimateWorkflow } from "./estimateWorkflow";
import { createChangeOrderWorkflow, type ChangeOrderWorkflow } from "./changeOrderWorkflow";
import { createCpaPackageService, type CpaPackageService } from "./cpaPackageService";
import type { ClientService } from "./clientService";
import type { ProjectService } from "./projectService";
import type { EstimateService } from "./estimateService";
import type { ChangeOrderService } from "./changeOrderService";
import type { InvoiceService } from "./invoiceService";
import type { PaymentService } from "./paymentService";
import type { AuditService } from "./auditService";
import type { SubcontractorService } from "./subcontractorService";
import type { AgentCommissionService } from "./agentCommissionService";
import type { ExpenseService } from "./expenseService";

export interface ServerAppServices {
  clientService: ClientService;
  projectService: ProjectService;
  estimateService: EstimateService;
  changeOrderService: ChangeOrderService;
  invoiceService: InvoiceService;
  paymentService: PaymentService;
  auditService: AuditService;
  subcontractorService: SubcontractorService;
  agentCommissionService: AgentCommissionService;
  expenseService: ExpenseService;
  estimateWorkflow: EstimateWorkflow;
  changeOrderWorkflow: ChangeOrderWorkflow;
  cpaPackageService: CpaPackageService;
}

/**
 * `currentUserId` should resolve to `null` for a truly anonymous
 * action (the portal route has no staff user to attribute) — every
 * downstream service already accepts a null actor for exactly this
 * case (see AuditService.recordStatusChange's `actorUserId: UUID | null`).
 */
export function createServerAppServices(
  supabase: SupabaseClient,
  currentUserId: () => Promise<string | null> = async () => null
): ServerAppServices {
  // validationService/transactionService are still in-memory everywhere
  // in this app (no Supabase-backed implementation exists for either) —
  // same as ServicesProvider.tsx's `inMemory.validationService`/
  // `inMemory.transactionService`. transactionService is only used here
  // as ChangeOrderService's ledger-side-effect dependency; nothing this
  // workflow reads depends on it persisting.
  const inMemory = createInMemoryServices();
  const validationService = inMemory.validationService;
  const transactionService = inMemory.transactionService;

  const auditLogRepository = createSupabaseAuditLogRepository(supabase);
  const auditService = createAuditService(auditLogRepository);

  const clientService = createSupabaseClientService(supabase, validationService, currentUserId);
  const projectService = createSupabaseProjectService(supabase, validationService, auditService, currentUserId, clientService);
  const estimateService = createSupabaseEstimateService(supabase, validationService, auditService, currentUserId, projectService);
  const changeOrderService = createSupabaseChangeOrderService(
    supabase,
    validationService,
    auditService,
    transactionService,
    currentUserId,
    projectService,
    estimateService
  );
  const roofingAreaService = createRoofingAreaService(supabase);
  const estimateAreaLineItemService = createSupabaseEstimateAreaLineItemService(supabase, validationService);
  const invoiceService = createSupabaseInvoiceService(
    supabase,
    validationService,
    auditService,
    currentUserId,
    estimateService,
    changeOrderService
  );
  const paymentService = createSupabasePaymentService(supabase, validationService, currentUserId);
  const expenseService = createSupabaseExpenseService(supabase, validationService, currentUserId, estimateService);
  const subcontractorService = createSupabaseSubcontractorService(supabase, validationService, currentUserId, transactionService);
  const agentCommissionService = createSupabaseAgentCommissionService(supabase, validationService, currentUserId, transactionService, expenseService);

  const estimateWorkflow = createEstimateWorkflow({ estimateService, invoiceService, paymentService, projectService });
  const changeOrderWorkflow = createChangeOrderWorkflow({ changeOrderService, estimateService, invoiceService });
  // Cash-basis only — see cpaPackageService.ts's header for why this is
  // never given financialEngine.
  const cpaPackageService = createCpaPackageService({ expenseService, paymentService, invoiceService, projectService, clientService });

  return {
    clientService,
    projectService,
    estimateService,
    changeOrderService,
    invoiceService,
    paymentService,
    auditService,
    subcontractorService,
    agentCommissionService,
    expenseService,
    estimateWorkflow,
    changeOrderWorkflow,
    cpaPackageService,
  };
}
