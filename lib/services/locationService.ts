/**
 * Layer 2 — company locations/branches, the multi-location axis
 * orthogonal to companyId (one company, many locations). This is the
 * foundational entity itself; nothing else in the service layer
 * filters by locationId yet (see QueryScope.locationId's doc comment
 * in types.ts) — that wiring (adding locationId to Project/Expense/
 * etc. and having FilteringService respect it) is the next step once
 * a real build assigns projects/employees to a location, not part of
 * this foundation.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface Location extends AuditedEntity {
  name: string;
  address: string | null;
  isActive: boolean;
  /** The location every new project/employee defaults to when a
   * company has only one — lets a single-location company (the only
   * kind that exists in the app today) adopt this model with zero
   * required data entry, and a multi-location one designate a home
   * base explicitly. Exactly one location per company should be
   * primary; enforcing that invariant is ValidationService's job in a
   * real implementation, not documented further here. */
  isPrimary: boolean;
}

export interface CreateLocationInput {
  companyId: UUID;
  name: string;
  address?: string;
  isPrimary?: boolean;
}

export interface LocationService {
  getById(locationId: UUID): Promise<Location | null>;
  list(scope: QueryScope): Promise<Location[]>;
  create(input: CreateLocationInput): Promise<Location>;
  update(locationId: UUID, changes: Partial<Pick<Location, "name" | "address" | "isActive" | "isPrimary">>): Promise<Location>;
  softDelete(locationId: UUID, reason: string): Promise<void>;
  restore(locationId: UUID): Promise<void>;
}

/** Reference implementation for the in-memory test harness — same
 * pattern as createInMemoryPayrollService, kept in this file rather
 * than growing inMemoryServices.ts further. */
export function createInMemoryLocationService(store: { locations: Map<UUID, Location> }): LocationService {
  function requireExists(locationId: UUID): Location {
    const location = store.locations.get(locationId);
    if (!location) throw new Error("Location not found.");
    return location;
  }

  async function getById(locationId: UUID): Promise<Location | null> {
    return store.locations.get(locationId) ?? null;
  }

  async function list(scope: QueryScope): Promise<Location[]> {
    return Array.from(store.locations.values()).filter(
      (l) => l.companyId === scope.companyId && (scope.includeDeleted || l.deletedAt == null)
    );
  }

  async function create(input: CreateLocationInput): Promise<Location> {
    const now = new Date().toISOString();
    const location: Location = {
      id: crypto.randomUUID(),
      companyId: input.companyId,
      name: input.name,
      address: input.address ?? null,
      isActive: true,
      isPrimary: input.isPrimary ?? false,
      createdBy: null,
      createdAt: now,
      updatedBy: null,
      updatedAt: now,
      deletedBy: null,
      deletedAt: null,
      deleteReason: null,
    };
    store.locations.set(location.id, location);
    return location;
  }

  async function update(locationId: UUID, changes: Partial<Pick<Location, "name" | "address" | "isActive" | "isPrimary">>): Promise<Location> {
    const location = requireExists(locationId);
    Object.assign(location, changes, { updatedAt: new Date().toISOString() });
    return location;
  }

  async function softDelete(locationId: UUID, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error("A delete reason is required.");
    const location = requireExists(locationId);
    location.deletedAt = new Date().toISOString();
    location.deleteReason = reason;
  }

  async function restore(locationId: UUID): Promise<void> {
    const location = requireExists(locationId);
    location.deletedAt = null;
    location.deleteReason = null;
  }

  return { getById, list, create, update, softDelete, restore };
}
