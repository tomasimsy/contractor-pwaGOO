/**
 * Real Supabase-backed ClientService — targets the `clients` table
 * contractor-pwa already uses in production (same project; see
 * .env.local). RLS (company_id = current_company_id()) is the actual
 * multi-company enforcement; every query here is additionally scoped
 * by companyId as defense-in-depth, matching contractor-pwa's own
 * documented convention for this exact table.
 *
 * Audit logging for create/update/delete is NOT done here — the
 * generic `log_audit_change()` trigger
 * (contractor-pwa/supabase/migrations/20260729000000_audit_logs_table.sql)
 * already lists `clients` in its table array, so every insert/update/
 * delete on this table is logged automatically once that migration is
 * applied. Writing a duplicate audit row from the app layer would be
 * exactly the "parallel logic" this build is required to avoid.
 *
 * Soft delete is an explicit UPDATE (deleted_at/deleted_by/delete_reason),
 * not a bare DELETE relying on the DB trigger to intercept it — a raw
 * DELETE statement has no way to carry a reason string, so the trigger
 * could never record one even if it ran. This matches the fact that no
 * existing contractor-pwa query path writes delete_reason today either
 * (grepped — zero writers); this service is the first that does.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, ClientService, CreateClientInput } from "../clientService";
import type { QueryScope, UUID } from "../types";
import type { ValidationService } from "../validationService";

interface ClientRow {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseClientService(supabase: SupabaseClient, validationService: ValidationService, currentUserId: () => Promise<UUID | null>): ClientService {
  async function getById(clientId: UUID, includeDeleted = false): Promise<Client | null> {
    let query = supabase.from("clients").select("*").eq("id", clientId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Failed to load client: ${error.message}`);
    return data ? rowToClient(data as ClientRow) : null;
  }

  async function list(scope: QueryScope): Promise<Client[]> {
    let query = supabase.from("clients").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list clients: ${error.message}`);
    return (data as ClientRow[]).map(rowToClient);
  }

  async function create(input: CreateClientInput): Promise<Client> {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        company_id: input.companyId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create client: ${error.message}`);
    return rowToClient(data as ClientRow);
  }

  async function update(clientId: UUID, changes: Partial<Pick<Client, "name" | "email" | "phone" | "address">>): Promise<Client> {
    const { data, error } = await supabase
      .from("clients")
      .update({
        ...(changes.name !== undefined && { name: changes.name }),
        ...(changes.email !== undefined && { email: changes.email }),
        ...(changes.phone !== undefined && { phone: changes.phone }),
        ...(changes.address !== undefined && { address: changes.address }),
      })
      .eq("id", clientId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update client: ${error.message}`);
    return rowToClient(data as ClientRow);
  }

  async function softDelete(clientId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) {
      throw new Error(validation.issues?.[0]?.message ?? "A delete reason is required.");
    }

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("clients")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", clientId);

    if (error) throw new Error(`Failed to delete client: ${error.message}`);
  }

  async function restore(clientId: UUID): Promise<void> {
    const { error } = await supabase.from("clients").update({ deleted_at: null, deleted_by: null, delete_reason: null }).eq("id", clientId);
    if (error) throw new Error(`Failed to restore client: ${error.message}`);
  }

  return { getById, list, create, update, softDelete, restore };
}
