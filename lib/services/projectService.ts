/**
 * Layer 2 — owns `projects`, the job/lifecycle container that
 * contractor-pwa never had (estimates played this role instead, which
 * is the core problem the schema redesign fixes). No financial math
 * lives here — profit/revenue/outstanding all come from FinancialEngine,
 * which composes this service's data with everything else. This
 * service only knows the project's own identity and lifecycle.
 */
import type { UUID, AuditedEntity, QueryScope, ProjectStatus, ValidationResult } from "./types";

export interface Project extends AuditedEntity {
  clientId: UUID | null;
  projectNumber: string | null;
  name: string;
  description: string | null;
  address: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  assignedUserId: UUID | null;
  /** Which branch/location this job belongs to — see LocationService.
   * Nullable: a single-location company (every company that exists
   * today) never needs to set this. Added for the multi-location
   * foundation; nothing enforces it references a real Location row
   * yet (that's ValidationService's job in a real implementation). */
  locationId: UUID | null;
}

export interface CreateProjectInput {
  companyId: UUID;
  clientId: UUID | null;
  name: string;
  description?: string;
  address?: string;
  assignedUserId?: UUID | null;
  locationId?: UUID | null;
}

export interface ProjectService {
  /** `includeDeleted` (default false): a soft-deleted project is
   * "not found" for direct fetch/edit/ownership-check purposes
   * (consistent with EstimateService/InvoiceService/ChangeOrderService's
   * getById, which all already filter deleted_at) — but pass `true`
   * when this project is being looked up purely as CONTEXT for a
   * different, still-active financial record (e.g. an invoice or
   * estimate's own detail page showing which project it belongs to).
   * Financial history is permanent: an invoice must never lose its
   * project's name just because the project was deleted later. */
  getById(projectId: UUID, includeDeleted?: boolean): Promise<Project | null>;
  list(scope: QueryScope): Promise<Project[]>;

  create(input: CreateProjectInput): Promise<Project>;
  update(projectId: UUID, changes: Partial<Omit<Project, keyof AuditedEntity>>): Promise<Project>;

  /** Goes through ValidationService.validateProjectStatusTransition and
   * AuditService.recordStatusChange — never a bare column update, so a
   * project can't silently jump from "draft" to "completed" with no
   * record of the intermediate states, the way estimates.status writes
   * happen today with no history at all. */
  changeStatus(projectId: UUID, toStatus: ProjectStatus): Promise<ValidationResult & { project?: Project }>;

  /** See EstimateService.softDelete's doc comment — same required-reason
   * enforcement via ValidationService.validateDeleteReason. */
  softDelete(projectId: UUID, reason: string): Promise<void>;
  restore(projectId: UUID): Promise<void>;

  /** All child entities in one call — the project-level equivalent of
   * contractor-pwa's getProjectBundle(estimateId), but keyed by the
   * job itself so it naturally covers multiple estimates/invoices per
   * project instead of assuming exactly one of each. Consumed almost
   * exclusively by FinancialEngine, not pages directly. */
  getProjectBundle(projectId: UUID): Promise<{
    project: Project;
    estimateIds: UUID[];
    invoiceIds: UUID[];
    changeOrderIds: UUID[];
  }>;
}
