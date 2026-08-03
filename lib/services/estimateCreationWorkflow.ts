/**
 * THE canonical "create an estimate" workflow — the single place that
 * decides which project a new estimate belongs to.
 *
 * ============================================================
 * WHY THIS FILE EXISTS
 * ============================================================
 * Picking a project used to be the user's problem: /estimates/new
 * refused to save until one was selected, so quoting a brand-new client
 * meant creating a project first, by hand, purely to satisfy a foreign
 * key. This workflow makes the project follow from the CLIENT instead:
 *
 *   1. Reuse the client's first open project if they have one.
 *   2. Otherwise create ONE named "<Client> Project" and reuse it from
 *      then on.
 *
 * Written as a workflow (same shape as estimateWorkflow.ts) rather than
 * inline in EstimateForm so the rule is testable without a DOM and can
 * be reused by any future caller — an import, an API route, a mobile
 * client — without that caller re-deciding what "the client's project"
 * means.
 *
 * ============================================================
 * WHAT THIS FILE DOES *NOT* DO
 * ============================================================
 * - No schema changes. There is no "is_default_project" column and no
 *   new table; the client's project is simply the oldest open one, so
 *   nothing has to be migrated or backfilled.
 * - No direct table writes and no duplicated logic. Every step is an
 *   existing Layer 2 call (ProjectService.list/create,
 *   EstimateService.create). Auto-creation goes through exactly the
 *   same ProjectService.create that ProjectForm uses, with the same
 *   fields, so an auto-created project is indistinguishable from a
 *   hand-made one to every downstream consumer — FinancialEngine,
 *   reports, filtering, /projects.
 * - No change to Project CRUD, its pages, or its validations.
 */
import type { UUID } from "./types";
import type { Project, ProjectService } from "./projectService";
import type { Estimate, EstimateService } from "./estimateService";

/** EstimateService.create's input. Declared structurally here because
 * that service takes its input inline and exports no named type; this
 * mirrors it exactly rather than widening or re-deciding any field. */
type CreateEstimateInput = Parameters<EstimateService["create"]>[0];

/**
 * Statuses that mean "this job is finished or abandoned." A project in
 * one of these is NOT reused for a new estimate: quoting new work for a
 * client whose last job was completed or cancelled should open fresh
 * work, not re-open closed books. Everything else — draft, active,
 * in_progress, on_hold — counts as open.
 *
 * Note `draft` is open, and load-bearing: ProjectService.create makes
 * projects in "draft", so treating draft as closed would auto-create a
 * second project on the client's second estimate.
 */
const CLOSED_PROJECT_STATUSES = new Set(["completed", "cancelled", "archived"]);

export function isOpenProject(project: Project): boolean {
  return !CLOSED_PROJECT_STATUSES.has(project.status);
}

/** The name an auto-created project gets. Exported so tests and any
 * future caller assert against the rule rather than a copied string. */
export function defaultProjectName(clientName: string): string {
  return `${clientName} Project`;
}

/**
 * The client's project: their oldest open one, or a newly created
 * "<Client> Project" if they have none.
 *
 * Deliberately OLDEST-first (not newest, not list order): the result
 * has to be stable across calls, or the second estimate for a client
 * could land on a different project than the first. ProjectService.list
 * already excludes soft-deleted projects, so a deleted project is never
 * resurrected as a home for new work.
 *
 * Concurrency: two estimates saved for the same brand-new client at the
 * exact same instant can both find nothing and both create a project.
 * That is accepted rather than fixed with a unique constraint, because
 * a constraint would be a schema change, and the failure mode is a
 * duplicate project row — visible and mergeable by hand — not lost or
 * double-counted money.
 */
export async function resolveProjectForClient(
  projectService: ProjectService,
  input: { companyId: UUID; clientId: UUID; clientName: string }
): Promise<{ project: Project; created: boolean }> {
  const projects = await projectService.list({ companyId: input.companyId });
  const existing = projects
    .filter((p) => p.clientId === input.clientId && isOpenProject(p))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  if (existing) return { project: existing, created: false };

  // Same call, same fields, same defaults as ProjectForm's manual
  // create — description/address are simply left unset, exactly as they
  // are when a user submits that form with those inputs blank.
  const project = await projectService.create({
    companyId: input.companyId,
    clientId: input.clientId,
    name: defaultProjectName(input.clientName),
  });
  return { project, created: true };
}

export interface CreateEstimateWorkflowInput extends Omit<CreateEstimateInput, "projectId"> {
  /** Optional. When absent, the project is resolved from `clientId`
   * (reused if one exists, created if not). When present it is used
   * verbatim — an explicitly chosen project always wins. */
  projectId?: UUID | null;
  /** Required only when a project has to be created, to name it. */
  clientName?: string | null;
}

export interface CreateEstimateWorkflowResult {
  estimate: Estimate;
  project: Project | null;
  /** True when this save auto-created the project. */
  projectCreated: boolean;
  /** Where the caller should navigate. A newly created estimate goes to
   * its DETAIL page, never straight into /edit — the user just finished
   * entering it, so the next useful screen is the one that shows what
   * they made. Returned from the workflow (rather than assembled at the
   * call site) so the destination is covered by tests without needing
   * to render the form. */
  redirectTo: string;
}

/**
 * Create an estimate, resolving its project first when one wasn't
 * chosen. Ordering matters: the project must exist before the estimate
 * references it, and the estimate is created with the SAME
 * EstimateService.create every other caller uses — this workflow adds
 * the project decision and nothing else.
 */
export async function createEstimateForClient(
  deps: { projectService: ProjectService; estimateService: EstimateService },
  input: CreateEstimateWorkflowInput,
  basePath = "/estimates"
): Promise<CreateEstimateWorkflowResult> {
  const { projectId, clientName, ...estimateInput } = input;

  let project: Project | null = null;
  let projectCreated = false;
  let resolvedProjectId = projectId ?? null;

  if (!resolvedProjectId) {
    if (!estimateInput.clientId) {
      throw new Error("An estimate needs either a project or a client to belong to.");
    }
    const resolved = await resolveProjectForClient(deps.projectService, {
      companyId: estimateInput.companyId,
      clientId: estimateInput.clientId,
      clientName: clientName?.trim() || "Client",
    });
    project = resolved.project;
    projectCreated = resolved.created;
    resolvedProjectId = resolved.project.id;
  }

  const estimate = await deps.estimateService.create({
    ...estimateInput,
    projectId: resolvedProjectId,
  });

  return { estimate, project, projectCreated, redirectTo: `${basePath}/${estimate.id}` };
}
