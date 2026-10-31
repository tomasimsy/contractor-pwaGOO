/**
 * Layer 2 — owns `properties`: a physical address a client owns.
 *
 * Owns identity and address only. It does not own money, jobs, or
 * estimates. A property's jobs are Projects with `propertyId` set;
 * a property's totals are composed from those projects elsewhere.
 *
 * Named "property", not "location": `locationService` already means the
 * company's own branch offices (`Project.locationId`).
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface Property extends AuditedEntity {
  clientId: UUID;
  /** Optional short label the office uses, e.g. "Lake house", "Rental on Elm". */
  nickname: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
}

export interface CreatePropertyInput {
  companyId: UUID;
  clientId: UUID;
  nickname?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
}

export type UpdatePropertyInput = Partial<Pick<Property, "nickname" | "street" | "city" | "state" | "zip" | "notes">>;

/** One line for a dropdown or a printed address. Blank parts are skipped,
 * so a property with only a street still reads correctly. */
export function formatPropertyAddress(p: Pick<Property, "nickname" | "street" | "city" | "state" | "zip">): string {
  const line2 = [p.city, p.state].filter((s) => s && s.trim()).join(", ");
  const parts = [p.street, line2, p.zip].filter((s) => s && s.trim());
  return parts.join(", ");
}

export interface PropertyService {
  /** `includeDeleted` (default false) — same contract as ClientService.getById. */
  getById(propertyId: UUID, includeDeleted?: boolean): Promise<Property | null>;
  /** Every active property for the scope's company, optionally for one client. */
  list(scope: QueryScope & { clientId?: UUID }): Promise<Property[]>;
  create(input: CreatePropertyInput): Promise<Property>;
  update(propertyId: UUID, changes: UpdatePropertyInput): Promise<Property>;
  /** Required-reason enforcement, same as ClientService.softDelete. Refused
   * while any active project still points at the property. */
  softDelete(propertyId: UUID, reason: string): Promise<void>;
  restore(propertyId: UUID): Promise<void>;
}
