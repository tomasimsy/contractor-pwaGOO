/**
 * The "which project does a new estimate belong to" rule —
 * lib/services/estimateCreationWorkflow.ts.
 *
 * Creating an estimate no longer requires picking a project by hand.
 * The project follows from the CLIENT: reuse their first open project,
 * or create exactly one "<Client> Project" and reuse it from then on.
 *
 * These tests run against the in-memory service stack, so they exercise
 * the real ProjectService/EstimateService contracts and the real
 * FinancialEngine on top of them — an auto-created project has to be a
 * fully ordinary project, not a special case.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { createInMemoryServices, createInMemoryStore, type InMemoryStore, type InMemoryServices } from "../lib/services/testing/inMemoryServices";
import { createEstimateForClient, resolveProjectForClient, defaultProjectName } from "../lib/services/estimateCreationWorkflow";

const COMPANY_ID = "estimate-autocreate-co";
const CLIENT_ID = "client-acme";
const CLIENT_NAME = "Acme Roofing";

let store: InMemoryStore;
let services: InMemoryServices;

beforeEach(() => {
  store = createInMemoryStore();
  services = createInMemoryServices(store);
});

const deps = () => ({ projectService: services.projectService, estimateService: services.estimateService });

const estimateInput = (unitPrice = 5000) => ({
  companyId: COMPANY_ID,
  clientId: CLIENT_ID,
  clientName: CLIENT_NAME,
  // The form requires a title; the workflow passes whatever it is given
  // straight through to EstimateService.create.
  title: "Roof replacement quote",
  lineItems: [{ category: "material" as const, name: "Scope", description: null, quantity: 1, unitPrice, taxable: false }],
  markup: 0,
  discount: 0,
  taxRate: 0,
});

describe("Estimate create: existing client WITH a project", () => {
  test("reuses the client's project instead of creating another", async () => {
    const existing = await services.projectService.create({
      companyId: COMPANY_ID, clientId: CLIENT_ID, name: "Acme — Warehouse Reroof",
    });

    const result = await createEstimateForClient(deps(), estimateInput());

    expect(result.projectCreated).toBe(false);
    expect(result.estimate.projectId).toBe(existing.id);
    // Nothing new was created.
    expect(await services.projectService.list({ companyId: COMPANY_ID })).toHaveLength(1);
  });

  test("an explicitly chosen project always wins over the client's default", async () => {
    await services.projectService.create({ companyId: COMPANY_ID, clientId: CLIENT_ID, name: "Default one" });
    const chosen = await services.projectService.create({ companyId: COMPANY_ID, clientId: CLIENT_ID, name: "The one the user picked" });

    const result = await createEstimateForClient(deps(), { ...estimateInput(), projectId: chosen.id });

    expect(result.estimate.projectId).toBe(chosen.id);
    expect(result.projectCreated).toBe(false);
  });

  test("another client's project is never borrowed", async () => {
    await services.projectService.create({ companyId: COMPANY_ID, clientId: "someone-else", name: "Not Acme's job" });

    const result = await createEstimateForClient(deps(), estimateInput());

    expect(result.projectCreated).toBe(true);
    expect(result.project?.clientId).toBe(CLIENT_ID);
  });

  test("a closed-out project is not reused — new work opens a new project", async () => {
    const old = await services.projectService.create({ companyId: COMPANY_ID, clientId: CLIENT_ID, name: "Last year's job" });
    // The legal path per ValidationService.PROJECT_TRANSITIONS.
    await services.projectService.changeStatus(old.id, "active");
    await services.projectService.changeStatus(old.id, "in_progress");
    const closed = await services.projectService.changeStatus(old.id, "completed");
    expect(closed.valid).toBe(true);

    const result = await createEstimateForClient(deps(), estimateInput());

    expect(result.projectCreated).toBe(true);
    expect(result.estimate.projectId).not.toBe(old.id);
  });
});

describe("Estimate create: existing client WITHOUT a project", () => {
  test("the first estimate auto-creates one '<Client> Project'", async () => {
    expect(await services.projectService.list({ companyId: COMPANY_ID })).toHaveLength(0);

    const result = await createEstimateForClient(deps(), estimateInput());

    expect(result.projectCreated).toBe(true);
    expect(result.project?.name).toBe("Acme Roofing Project");
    expect(defaultProjectName(CLIENT_NAME)).toBe("Acme Roofing Project");

    // Populated exactly like a manual creation: company, client, name,
    // and the service's own defaults for everything else.
    expect(result.project).toMatchObject({
      companyId: COMPANY_ID,
      clientId: CLIENT_ID,
      status: "draft",
      description: null,
      address: null,
    });
    expect(result.estimate.projectId).toBe(result.project!.id);
    expect(result.estimate.title).toBe("Roof replacement quote");
  });

  test("only ONE default project is auto-created per client, however many estimates follow", async () => {
    const first = await createEstimateForClient(deps(), estimateInput(1000));
    const second = await createEstimateForClient(deps(), estimateInput(2000));
    const third = await createEstimateForClient(deps(), estimateInput(3000));

    expect(first.projectCreated).toBe(true);
    expect(second.projectCreated).toBe(false);
    expect(third.projectCreated).toBe(false);

    // All three estimates share the one project.
    expect(second.estimate.projectId).toBe(first.estimate.projectId);
    expect(third.estimate.projectId).toBe(first.estimate.projectId);

    const projects = await services.projectService.list({ companyId: COMPANY_ID });
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Acme Roofing Project");
  });

  test("two different clients each get their own project", async () => {
    await createEstimateForClient(deps(), estimateInput());
    await createEstimateForClient(deps(), { ...estimateInput(), clientId: "client-beta", clientName: "Beta Builders" });

    const projects = await services.projectService.list({ companyId: COMPANY_ID });
    expect(projects.map((p) => p.name).sort()).toEqual(["Acme Roofing Project", "Beta Builders Project"]);
  });

  test("resolveProjectForClient is stable: it returns the same project every time", async () => {
    const a = await resolveProjectForClient(services.projectService, { companyId: COMPANY_ID, clientId: CLIENT_ID, clientName: CLIENT_NAME });
    const b = await resolveProjectForClient(services.projectService, { companyId: COMPANY_ID, clientId: CLIENT_ID, clientName: CLIENT_NAME });

    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.project.id).toBe(a.project.id);
  });

  test("with neither a project nor a client, it refuses rather than inventing one", async () => {
    await expect(
      createEstimateForClient(deps(), { ...estimateInput(), clientId: null, clientName: null })
    ).rejects.toThrow(/either a project or a client/);
    expect(await services.projectService.list({ companyId: COMPANY_ID })).toHaveLength(0);
  });
});

describe("Estimate create: navigation", () => {
  test("a new estimate redirects to its DETAIL page, not /edit", async () => {
    const result = await createEstimateForClient(deps(), estimateInput());

    expect(result.redirectTo).toBe(`/estimates/${result.estimate.id}`);
    expect(result.redirectTo).not.toMatch(/\/edit$/);
  });

  test("the roofing V2 route keeps its own base path", async () => {
    const result = await createEstimateForClient(deps(), estimateInput(), "/estimates-roof");

    expect(result.redirectTo).toBe(`/estimates-roof/${result.estimate.id}`);
  });
});

describe("Auto-created projects are ordinary projects", () => {
  test("financials, relationships and filtering all work on one", async () => {
    const { estimate, project } = await createEstimateForClient(deps(), estimateInput(10000));
    expect(project).not.toBeNull();

    // The normal downstream lifecycle runs against it unchanged.
    await services.estimateService.changeStatus(estimate.id, "sent");
    await services.estimateService.changeStatus(estimate.id, "approved");
    const invoice = await services.invoiceService.createFromEstimate(estimate.id, { issueDate: "2026-01-01", dueDate: "2026-01-31" });
    await services.invoiceService.changeStatus(invoice.id, "sent");
    await services.expenseService.create({
      companyId: COMPANY_ID, projectId: project!.id, expenseType: "materials", amount: 2500, expenseDate: "2026-01-05",
    });

    const financials = await services.financialEngine.getProjectFinancials(project!.id);
    expect(financials.invoicesTotal).toBe(10000);
    expect(financials.totalExpenses).toBe(2500);
    expect(financials.netProfit).toBe(7500);

    // Relationships resolve both ways.
    const bundle = await services.projectService.getProjectBundle(project!.id);
    expect(bundle.estimateIds).toContain(estimate.id);
    expect(bundle.invoiceIds).toContain(invoice.id);
    expect(await services.estimateService.listForProject(project!.id)).toHaveLength(1);

    // It appears in the ordinary company-scoped list — nothing hides it.
    const listed = await services.projectService.list({ companyId: COMPANY_ID });
    expect(listed.map((p) => p.id)).toContain(project!.id);
  });

  test("it stays company-scoped: another company never sees or reuses it", async () => {
    await createEstimateForClient(deps(), estimateInput());
    const other = await createEstimateForClient(deps(), { ...estimateInput(), companyId: "other-co" });

    expect(await services.projectService.list({ companyId: "other-co" })).toHaveLength(1);
    expect(other.projectCreated).toBe(true);
    const mine = await services.projectService.list({ companyId: COMPANY_ID });
    expect(mine).toHaveLength(1);
    expect(mine[0].id).not.toBe(other.project!.id);
  });
});
