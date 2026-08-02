/**
 * Layer 2 — owns `clients`, the same real table contractor-pwa uses
 * (see .env.local — this app shares that Supabase project). No
 * financial math lives here — a client's totals come from
 * FinancialEngine.getClientFinancials, which composes this service's
 * identity data with everything else, same division of labor as
 * ProjectService.
 */
import type { UUID, AuditedEntity, QueryScope } from "./types";

export interface Client extends AuditedEntity {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface CreateClientInput {
  companyId: UUID;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface ClientService {
  /** `includeDeleted` (default false) — same contract as
   * ProjectService.getById: a soft-deleted client is "not found" for
   * direct fetch/edit purposes, but pass `true` when this client is
   * looked up purely as context for a different, still-active
   * financial record (e.g. an invoice/estimate's "Bill To" name).
   * Financial history is permanent. */
  getById(clientId: UUID, includeDeleted?: boolean): Promise<Client | null>;
  list(scope: QueryScope): Promise<Client[]>;
  create(input: CreateClientInput): Promise<Client>;
  update(clientId: UUID, changes: Partial<Pick<Client, "name" | "email" | "phone" | "address">>): Promise<Client>;

  /** Required-reason enforcement via ValidationService.validateDeleteReason
   * — same discipline as ProjectService.softDelete. */
  softDelete(clientId: UUID, reason: string): Promise<void>;
  restore(clientId: UUID): Promise<void>;
}
