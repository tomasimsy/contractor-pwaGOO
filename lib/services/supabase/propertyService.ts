/**
 * Real Supabase-backed PropertyService — targets the `properties` table
 * (migration 20261020000000_properties.sql). RLS is the multi-company
 * enforcement; every query is also scoped by companyId, same as
 * ClientService.
 *
 * Audit logging is left to the generic log_audit_change() trigger, the
 * same as clients and projects. Writing a second audit row here would
 * duplicate it.
 *
 * Soft delete is an explicit UPDATE with a required reason, and it is
 * refused while any active project still points at the property. A job
 * must never lose the address it was performed at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Property, PropertyService, CreatePropertyInput, UpdatePropertyInput } from "../propertyService";
import type { QueryScope, UUID } from "../types";
import type { ValidationService } from "../validationService";

interface PropertyRow {
  id: string;
  company_id: string;
  client_id: string;
  nickname: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    companyId: row.company_id,
    clientId: row.client_id,
    nickname: row.nickname,
    street: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabasePropertyService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): PropertyService {
  async function getById(propertyId: UUID, includeDeleted = false): Promise<Property | null> {
    let query = supabase.from("properties").select("*").eq("id", propertyId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Failed to load property: ${error.message}`);
    return data ? rowToProperty(data as PropertyRow) : null;
  }

  async function list(scope: QueryScope & { clientId?: UUID }): Promise<Property[]> {
    let query = supabase.from("properties").select("*").eq("company_id", scope.companyId);
    if (scope.clientId) query = query.eq("client_id", scope.clientId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`Failed to list properties: ${error.message}`);
    return (data as PropertyRow[]).map(rowToProperty);
  }

  async function create(input: CreatePropertyInput): Promise<Property> {
    const { data, error } = await supabase
      .from("properties")
      .insert({
        company_id: input.companyId,
        client_id: input.clientId,
        nickname: input.nickname ?? null,
        street: input.street ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create property: ${error.message}`);
    return rowToProperty(data as PropertyRow);
  }

  async function update(propertyId: UUID, changes: UpdatePropertyInput): Promise<Property> {
    const { data, error } = await supabase
      .from("properties")
      .update({
        ...(changes.nickname !== undefined && { nickname: changes.nickname }),
        ...(changes.street !== undefined && { street: changes.street }),
        ...(changes.city !== undefined && { city: changes.city }),
        ...(changes.state !== undefined && { state: changes.state }),
        ...(changes.zip !== undefined && { zip: changes.zip }),
        ...(changes.notes !== undefined && { notes: changes.notes }),
      })
      .eq("id", propertyId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update property: ${error.message}`);
    return rowToProperty(data as PropertyRow);
  }

  async function softDelete(propertyId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) {
      throw new Error(validation.issues?.[0]?.message ?? "A delete reason is required.");
    }

    const { count, error: countError } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .is("deleted_at", null);
    if (countError) throw new Error(`Failed to check property jobs: ${countError.message}`);
    if ((count ?? 0) > 0) {
      throw new Error("This property still has active jobs. Move or archive those jobs first.");
    }

    const actorId = await currentUserId();
    const { error } = await supabase
      .from("properties")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", propertyId);

    if (error) throw new Error(`Failed to delete property: ${error.message}`);
  }

  async function restore(propertyId: UUID): Promise<void> {
    const { error } = await supabase.from("properties").update({ deleted_at: null, deleted_by: null, delete_reason: null }).eq("id", propertyId);
    if (error) throw new Error(`Failed to restore property: ${error.message}`);
  }

  return { getById, list, create, update, softDelete, restore };
}
