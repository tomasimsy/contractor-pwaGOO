import { describe, it, expect } from "vitest";
import { resolveProjectForClient } from "@/lib/services/estimateCreationWorkflow";
import type { Project, ProjectService } from "@/lib/services/projectService";
import type { Property } from "@/lib/services/propertyService";

const COMPANY = "company-1";
const CLIENT = "client-1";

function project(id: string, propertyId: string | null, createdAt: string): Project {
  return {
    id, companyId: COMPANY, clientId: CLIENT, projectNumber: null, name: `Job ${id}`,
    description: null, address: null, status: "active", startDate: null, endDate: null,
    assignedUserId: null, locationId: null, propertyId,
    createdBy: null, createdAt, updatedBy: null, updatedAt: createdAt,
    deletedBy: null, deletedAt: null, deleteReason: null,
  };
}

function property(id: string, street: string): Property {
  return {
    id, companyId: COMPANY, clientId: CLIENT, nickname: null, street, city: "Austin", state: "TX", zip: "78701", notes: null,
    createdBy: null, createdAt: "2026-01-01", updatedBy: null, updatedAt: "2026-01-01",
    deletedBy: null, deletedAt: null, deleteReason: null,
  };
}

function fakeProjectService(existing: Project[]) {
  const created: Array<Parameters<ProjectService["create"]>[0]> = [];
  const service = {
    list: async () => existing,
    create: async (input: Parameters<ProjectService["create"]>[0]) => {
      created.push(input);
      return project("new", input.propertyId ?? null, "2026-10-20");
    },
  } as unknown as ProjectService;
  return { service, created };
}

describe("resolveProjectForClient with properties", () => {
  it("reuses the client's oldest open job when no property is given (unchanged behavior)", async () => {
    const { service } = fakeProjectService([project("a", "house-a", "2026-01-02"), project("b", null, "2026-01-01")]);
    const result = await resolveProjectForClient(service, { companyId: COMPANY, clientId: CLIENT, clientName: "Ann" });
    expect(result.created).toBe(false);
    expect(result.project.id).toBe("b");
  });

  it("never attaches an estimate for house B to a job for house A", async () => {
    const { service, created } = fakeProjectService([project("a", "house-a", "2026-01-01")]);
    const result = await resolveProjectForClient(service, {
      companyId: COMPANY, clientId: CLIENT, clientName: "Ann", property: property("house-b", "2 Oak St"),
    });
    expect(result.created).toBe(true);
    expect(created[0].propertyId).toBe("house-b");
    expect(created[0].address).toContain("2 Oak St");
  });

  it("reuses the open job for the same house", async () => {
    const { service, created } = fakeProjectService([project("a", "house-a", "2026-01-01"), project("b", "house-b", "2026-01-02")]);
    const result = await resolveProjectForClient(service, {
      companyId: COMPANY, clientId: CLIENT, clientName: "Ann", property: property("house-b", "2 Oak St"),
    });
    expect(result.created).toBe(false);
    expect(result.project.id).toBe("b");
    expect(created).toHaveLength(0);
  });
});
