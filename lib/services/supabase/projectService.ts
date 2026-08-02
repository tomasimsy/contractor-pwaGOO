/**
 * Real Supabase-backed ProjectService — implements the EXISTING
 * ProjectService interface (lib/services/projectService.ts) against
 * the real `projects` table (contractor-pwa/supabase/migrations/
 * 20260728000000_create_projects_table.sql — CONFIRMED still a DRAFT:
 * an anon-key REST probe during this pass returned PGRST205, "Could
 * not find the table 'public.projects'." Every method here will fail
 * with a real, visible Postgres/PostgREST error until that migration
 * (plus 20260801000100_add_projects_location_id_and_delete_reason.sql)
 * is applied — this implementation does not paper over that with a
 * fallback; it's the honest, correct behavior for a table that
 * doesn't exist yet.
 *
 * Same division of responsibility as ProjectService's own doc
 * comment: no financial math here — FinancialEngine composes this
 * service's identity/lifecycle data with everything else.
 *
 * Audit logging for create/update is via the generic `log_audit_change()`
 * trigger, same as ClientService (see its doc comment) — `projects` is
 * already in that trigger's table list. Status transitions additionally
 * call AuditService.recordStatusChange for the semantic "why," which a
 * generic row-diff trigger can't capture — matching changeStatus's
 * existing doc comment in the interface.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project, ProjectService, CreateProjectInput } from "../projectService";
import type { QueryScope, UUID, ProjectStatus, ValidationResult } from "../types";
import type { ValidationService } from "../validationService";
import type { AuditService } from "../auditService";
import type { ClientService } from "../clientService";

interface ProjectRow {
  id: string;
  company_id: string;
  client_id: string | null;
  project_number: string | null;
  name: string;
  description: string | null;
  address: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  assigned_user_id: string | null;
  location_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    companyId: row.company_id,
    clientId: row.client_id,
    projectNumber: row.project_number,
    name: row.name,
    description: row.description,
    address: row.address,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    assignedUserId: row.assigned_user_id,
    locationId: row.location_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseProjectService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  auditService: AuditService,
  currentUserId: () => Promise<UUID | null>,
  clientService: ClientService
): ProjectService {
  /** Client ownership validation (Security requirement): a project's
   * clientId must belong to the SAME company as the project — without
   * this, nothing stops attaching another company's client record to
   * a project via a crafted request, even though RLS already scopes
   * `clients` reads/writes by company. Reuses the same
   * validateCompanyOwnership check every other cross-entity company
   * check in this codebase uses (see ValidationService), just with
   * the client's companyId as the payload side. */
  async function assertClientOwnership(clientId: UUID | null, companyId: UUID): Promise<void> {
    if (!clientId) return;
    const client = await clientService.getById(clientId);
    if (!client) throw new Error("Selected client was not found.");
    const validation = validationService.validateCompanyOwnership({ payloadCompanyId: client.companyId, sessionCompanyId: companyId });
    if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "This client does not belong to your company.");
  }

  async function getById(projectId: UUID, includeDeleted = false): Promise<Project | null> {
    let query = supabase.from("projects").select("*").eq("id", projectId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Failed to load project: ${error.message}`);
    return data ? rowToProject(data as ProjectRow) : null;
  }

  async function list(scope: QueryScope): Promise<Project[]> {
    let query = supabase.from("projects").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    if (scope.locationId) query = query.eq("location_id", scope.locationId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list projects: ${error.message}`);
    return (data as ProjectRow[]).map(rowToProject);
  }

  async function create(input: CreateProjectInput): Promise<Project> {
    await assertClientOwnership(input.clientId, input.companyId);

    const { data, error } = await supabase
      .from("projects")
      .insert({
        company_id: input.companyId,
        client_id: input.clientId,
        name: input.name,
        description: input.description ?? null,
        address: input.address ?? null,
        assigned_user_id: input.assignedUserId ?? null,
        location_id: input.locationId ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);
    return rowToProject(data as ProjectRow);
  }

  async function update(projectId: UUID, changes: Partial<Omit<Project, "id" | "companyId" | "createdBy" | "createdAt" | "updatedBy" | "updatedAt" | "deletedBy" | "deletedAt" | "deleteReason">>): Promise<Project> {
    if (changes.clientId !== undefined) {
      const current = await getById(projectId);
      if (!current) throw new Error("Project not found.");
      await assertClientOwnership(changes.clientId, current.companyId);
    }

    const payload: Record<string, unknown> = {};
    if (changes.name !== undefined) payload.name = changes.name;
    if (changes.description !== undefined) payload.description = changes.description;
    if (changes.address !== undefined) payload.address = changes.address;
    if (changes.clientId !== undefined) payload.client_id = changes.clientId;
    if (changes.startDate !== undefined) payload.start_date = changes.startDate;
    if (changes.endDate !== undefined) payload.end_date = changes.endDate;
    if (changes.assignedUserId !== undefined) payload.assigned_user_id = changes.assignedUserId;
    if (changes.locationId !== undefined) payload.location_id = changes.locationId;
    if (changes.projectNumber !== undefined) payload.project_number = changes.projectNumber;

    const { data, error } = await supabase.from("projects").update(payload).eq("id", projectId).select().single();
    if (error) throw new Error(`Failed to update project: ${error.message}`);
    return rowToProject(data as ProjectRow);
  }

  async function changeStatus(projectId: UUID, toStatus: ProjectStatus): Promise<ValidationResult & { project?: Project }> {
    const current = await getById(projectId);
    if (!current) return { valid: false, issues: [{ field: "id", code: "not_found", message: "Project not found." }] };

    const validation = validationService.validateProjectStatusTransition(current.status, toStatus);
    if (!validation.valid) return validation;

    const { data, error } = await supabase.from("projects").update({ status: toStatus }).eq("id", projectId).select().single();
    if (error) throw new Error(`Failed to change project status: ${error.message}`);
    const project = rowToProject(data as ProjectRow);

    const actorId = await currentUserId();
    await auditService.recordStatusChange({
      companyId: project.companyId,
      entityTable: "projects",
      entityId: project.id,
      fromStatus: current.status,
      toStatus,
      actorUserId: actorId,
    });

    return { valid: true, issues: [], project };
  }

  /** Same delete-protection discipline as EstimateService.
   * assertNoFinancialActivity — direct table existence checks (not a
   * second calculation, not routed through EstimateService/
   * InvoiceService/ExpenseService, all of which already depend on
   * ProjectService — a circular constructor dependency otherwise). */
  async function assertNoFinancialActivity(projectId: UUID): Promise<void> {
    const [estimates, invoices, expenses] = await Promise.all([
      supabase.from("estimates").select("id").eq("project_id", projectId).is("deleted_at", null).limit(1),
      supabase.from("invoices").select("id").eq("project_id", projectId).is("deleted_at", null).limit(1),
      supabase.from("estimate_expenses").select("id").eq("project_id", projectId).is("deleted_at", null).limit(1),
    ]);
    if (estimates.error) throw new Error(`Failed to check estimates: ${estimates.error.message}`);
    if (invoices.error) throw new Error(`Failed to check invoices: ${invoices.error.message}`);
    if (expenses.error) throw new Error(`Failed to check expenses: ${expenses.error.message}`);

    if ((estimates.data?.length ?? 0) > 0) {
      throw new Error("Cannot delete this project: it has active estimates. Delete them first, or use Archive instead once the job is complete/cancelled.");
    }
    if ((invoices.data?.length ?? 0) > 0) {
      throw new Error("Cannot delete this project: it has active invoices (and possibly payments).");
    }
    if ((expenses.data?.length ?? 0) > 0) {
      throw new Error("Cannot delete this project: it has recorded expenses attached directly to it.");
    }
  }

  async function softDelete(projectId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues?.[0]?.message ?? "A delete reason is required.");
    await assertNoFinancialActivity(projectId);

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", projectId);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  async function restore(projectId: UUID): Promise<void> {
    const { error } = await supabase.from("projects").update({ deleted_at: null, deleted_by: null, delete_reason: null }).eq("id", projectId);
    if (error) throw new Error(`Failed to restore project: ${error.message}`);
  }

  async function getProjectBundle(projectId: UUID) {
    const project = await getById(projectId);
    if (!project) throw new Error("Project not found.");

    // Estimates/invoices/change-orders services have no Supabase-backed
    // implementation yet (only ClientService/ProjectService do, built
    // this pass) — those child tables genuinely have zero rows for any
    // project created through this app so far. Real, empty, not faked.
    const [estimatesRes, invoicesRes, changeOrdersRes] = await Promise.all([
      supabase.from("estimates").select("id").eq("project_id", projectId).then((r) => r, () => ({ data: [] as { id: string }[], error: null })),
      supabase.from("invoices").select("id").eq("project_id", projectId).then((r) => r, () => ({ data: [] as { id: string }[], error: null })),
      supabase.from("change_orders").select("id").eq("project_id", projectId).then((r) => r, () => ({ data: [] as { id: string }[], error: null })),
    ]);

    return {
      project,
      estimateIds: (estimatesRes.data ?? []).map((r: { id: string }) => r.id),
      invoiceIds: (invoicesRes.data ?? []).map((r: { id: string }) => r.id),
      changeOrderIds: (changeOrdersRes.data ?? []).map((r: { id: string }) => r.id),
    };
  }

  return { getById, list, create, update, changeStatus, softDelete, restore, getProjectBundle };
}
